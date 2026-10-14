import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { installTestDom } from "~/lib/dom-test-setup"
import type { OnboardingState } from "~/lib/onboarding-state"
import {
  onboardingQueryKey,
  useOnboardingState,
} from "./use-onboarding-state"

installTestDom()

let root: Root | null = null
let host: HTMLDivElement | null = null
let putBodies: unknown[] = []
const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function stubOnboardingFetch(initial: OnboardingState) {
  putBodies = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("/me/onboarding")) {
      return jsonResponse(initial)
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch
}

function stubOnboardingPut(canonical: (body: unknown) => OnboardingState) {
  const previous = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/me/onboarding") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body))
      putBodies.push(body)
      // completed_at is server-owned: never accepted on writes.
      expect(body.completed_at).toBeUndefined()
      return jsonResponse(canonical(body))
    }
    return (previous as typeof fetch)(input, init)
  }) as typeof fetch
}

type Hook = ReturnType<typeof useOnboardingState>
let seen: Hook | null = null

/** First PUT stays deferred until released; later PUTs resolve at once. */
function stubSequencedOnboardingPut() {
  const releasers: Array<() => void> = []
  let calls = 0
  const previous = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/me/onboarding") && init?.method === "PUT") {
      calls += 1
      const body = JSON.parse(String(init.body))
      putBodies.push(body)
      expect(body.completed_at).toBeUndefined()
      if (calls === 1) {
        await new Promise<void>((resolve) => {
          releasers.push(resolve)
        })
      }
      return jsonResponse({ ...body, version: 1 })
    }
    return (previous as typeof fetch)(input, init)
  }) as typeof fetch
  return () => {
    releasers.forEach((release) => release())
  }
}

async function waitForOnboarding() {
  await act(async () => {
    for (let i = 0; i < 100 && !seen?.onboarding; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  })
  expect(seen?.onboarding === null || seen?.onboarding === undefined).toBe(false)
}

function Probe() {
  seen = useOnboardingState({ orgId: "org-1", userId: "user-1" })
  return null
}

function renderProbe() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )
  })
  return client
}

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  seen = null
  document.body.innerHTML = ""
  globalThis.fetch = originalFetch
})

const FRESH: OnboardingState = {
  version: 1,
  status: "not_started",
  checkpoint: "new_project",
}

describe("onboarding saves", () => {
  test("rapid checkpoints serialize and the latest wins", async () => {
    stubOnboardingFetch(FRESH)
    const client = renderProbe()
    stubOnboardingPut(
      (body) => ({ ...(body as OnboardingState), version: 1 }) as OnboardingState,
    )
    await waitForOnboarding()
    expect(seen?.onboarding?.checkpoint).toBe("new_project")

    await act(async () => {
      await Promise.all([
        seen?.saveOnboardingCheckpoint("overview"),
        seen?.saveOnboardingCheckpoint("score_cards"),
      ])
    })
    expect(putBodies.map((body) => (body as { checkpoint: string }).checkpoint)).toEqual([
      "overview",
      "score_cards",
    ])
    const cached = client.getQueryData(
      onboardingQueryKey("org-1", "user-1"),
    ) as OnboardingState
    expect(cached.checkpoint).toBe("score_cards")
    expect(cached.status).toBe("in_progress")
  })

  test("a stale backward save never regresses the checkpoint", async () => {
    stubOnboardingFetch({ ...FRESH, status: "in_progress", checkpoint: "issue_table" })
    renderProbe()
    stubOnboardingPut(
      (body) => ({ ...(body as OnboardingState), version: 1 }) as OnboardingState,
    )
    await waitForOnboarding()
    await act(async () => {
      await seen?.saveOnboardingCheckpoint("bucket_scores")
    })
    expect(
      (putBodies[0] as { checkpoint: string }).checkpoint,
    ).toBe("issue_table")
  })

  test("queued saves bail after unmount instead of running late", async () => {
    stubOnboardingFetch(FRESH)
    renderProbe()
    stubOnboardingPut(
      (body) => ({ ...(body as OnboardingState), version: 1 }) as OnboardingState,
    )
    await waitForOnboarding()
    const putsBefore = putBodies.length
    await act(async () => {
      root?.unmount()
      root = null
    })
    const settled = await act(async () => {
      return seen?.saveOnboardingCheckpoint("overview")
    })
    expect(settled).toBeNull()
    expect(putBodies.length).toBe(putsBefore)
  })

  test("rapid stale enqueues merge against pending state", async () => {
    stubOnboardingFetch({ ...FRESH, status: "in_progress", checkpoint: "issue_table" })
    renderProbe()
    stubOnboardingPut(
      (body) => ({ ...(body as OnboardingState), version: 1 }) as OnboardingState,
    )
    await waitForOnboarding()
    await act(async () => {
      await Promise.all([
        seen?.saveOnboardingCheckpoint("bucket_scores"),
        seen?.saveOnboardingCheckpoint("bucket_scores"),
      ])
    })
    expect(putBodies.map((body) => (body as { checkpoint: string }).checkpoint)).toEqual([
      "issue_table",
      "issue_table",
    ])
  })

  test("a resolving older body never erases a newer queued write", async () => {
    stubOnboardingFetch({ ...FRESH, status: "in_progress", checkpoint: "overview" })
    renderProbe()
    await waitForOnboarding()
    const releaseFirst = stubSequencedOnboardingPut()
    let first: Promise<unknown> | undefined
    let second: Promise<unknown> | undefined
    await act(async () => {
      first = seen?.saveOnboardingCheckpoint("score_cards")
      second = seen?.saveOnboardingCheckpoint("bucket_scores")
    })
    releaseFirst()
    await act(async () => {
      await Promise.all([first, second])
    })
    await act(async () => {
      await seen?.saveOnboardingCheckpoint("overview")
    })
    expect(
      putBodies.map((body) => (body as { checkpoint: string }).checkpoint),
    ).toEqual(["score_cards", "bucket_scores", "bucket_scores"])
  })

  test("pending binds survive skip and completion", async () => {
    stubOnboardingFetch(FRESH)
    renderProbe()
    stubOnboardingPut(
      (body) => ({ ...(body as OnboardingState), version: 1 }) as OnboardingState,
    )
    await waitForOnboarding()
    await act(async () => {
      const bound = seen?.saveOnboardingCheckpoint("project_details", {
        projectId: "proj-9",
      })
      const skipped = seen?.skipOnboardingTour()
      await Promise.all([bound, skipped])
    })
    expect(putBodies[1]).toEqual({
      version: 1,
      status: "skipped",
      checkpoint: "project_details",
      project_id: "proj-9",
    })
  })

  test("pending binds survive completion", async () => {
    stubOnboardingFetch(FRESH)
    renderProbe()
    stubOnboardingPut((body) => {
      const write = body as OnboardingState
      return { ...write, completed_at: new Date(0).toISOString() }
    })
    await waitForOnboarding()
    await act(async () => {
      const bound = seen?.saveOnboardingCheckpoint("overview", {
        projectId: "proj-9",
        crawlId: "crawl-9",
      })
      const done = seen?.completeOnboardingTour()
      await Promise.all([bound, done])
    })
    expect(putBodies[1]).toEqual({
      version: 1,
      status: "completed",
      checkpoint: "finish",
      project_id: "proj-9",
      crawl_id: "crawl-9",
    })
  })

  test("dismiss marks skipped and finish marks completed", async () => {
    stubOnboardingFetch({ ...FRESH, status: "in_progress", checkpoint: "overview" })
    renderProbe()
    stubOnboardingPut((body) => {
      const write = body as OnboardingState
      return write.status === "completed"
        ? { ...write, completed_at: new Date().toISOString() }
        : write
    })
    await waitForOnboarding()
    await act(async () => {
      await seen?.skipOnboardingTour()
    })
    expect((putBodies[0] as OnboardingState).status).toBe("skipped")
    expect((putBodies[0] as OnboardingState).checkpoint).toBe("overview")

    await act(async () => {
      await seen?.completeOnboardingTour()
    })
    expect((putBodies[1] as OnboardingState).status).toBe("completed")
    expect((putBodies[1] as OnboardingState).checkpoint).toBe("finish")
  })
})
