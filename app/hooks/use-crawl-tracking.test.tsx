import { afterEach, beforeEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"

import { useCrawlTracking } from "./use-crawl-tracking"
import { projectSetupQueryKey } from "./use-project-setup"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import type {
  OrganizationEventFrame,
  ProjectSetupResponse,
} from "~/lib/api.types"

installTestDom()
const realFetch = globalThis.fetch
let root: Root | null = null
let host: HTMLDivElement | null = null
let client: QueryClient | null = null

type ToastKind = "success" | "error" | "warning" | "loading"
type ToastRecord = { kind: ToastKind; message: unknown; options: Record<string, unknown> }
const toastCalls: ToastRecord[] = []
const dismissCalls: unknown[] = []
const setupFetchUrls: string[] = []
let restoreToast: () => void = () => {}

beforeEach(() => {
  toastCalls.length = 0
  dismissCalls.length = 0
  setupFetchUrls.length = 0
  setupGate = null
  const originals = {
    success: toast.success,
    error: toast.error,
    warning: toast.warning,
    loading: toast.loading,
    dismiss: toast.dismiss,
  }
  const capture =
    (kind: ToastKind) => (message: unknown, options?: Record<string, unknown>) => {
      toastCalls.push({ kind, message, options: options ?? {} })
      return toastCalls.length
    }
  toast.success = capture("success") as typeof toast.success
  toast.error = capture("error") as typeof toast.error
  toast.warning = capture("warning") as typeof toast.warning
  toast.loading = capture("loading") as typeof toast.loading
  toast.dismiss = ((id?: string | number) => {
    dismissCalls.push(id)
  }) as typeof toast.dismiss
  restoreToast = () => {
    toast.success = originals.success
    toast.error = originals.error
    toast.warning = originals.warning
    toast.loading = originals.loading
    toast.dismiss = originals.dismiss
  }
})

afterEach(async () => {
  restoreToast()
  await act(async () => {
    root?.unmount()
    await flushTestDom()
  })
  host?.remove()
  client?.clear()
  root = null
  host = null
  client = null
  seen = null
  globalThis.fetch = realFetch
})

type Seen = ReturnType<typeof useCrawlTracking>
let seen: Seen | null = null
const revalidates: number[] = []

function Probe({ orgId }: { orgId: string }) {
  seen = useCrawlTracking({
    orgId,
    projectNameById: new Map([["proj-1", "Demo"]]),
    goToCrawl: () => {},
    revalidate: () => {
      revalidates.push(1)
    },
  })
  return null
}

async function mountHook(orgId = "org-1") {
  globalThis.fetch = baseStub as typeof fetch
  revalidates.length = 0
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client!}>
        <Probe orgId={orgId} />
      </QueryClientProvider>,
    )
    await flushTestDom()
  })
}

function setupRow(overrides: Partial<ProjectSetupResponse> = {}): ProjectSetupResponse {
  return {
    id: "setup-1",
    organization_id: "org-1",
    project_id: "proj-1",
    requested_by_user_id: "user-1",
    status: "visibility",
    crawl_id: "crawl-1",
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
    ...overrides,
  }
}

async function baseStub(input: string | URL | Request) {
  const url = String(input)
  if (url.includes("/crawls/active")) return Response.json({ crawls: [] })
  throw new Error(`unexpected request ${url}`)
}

function stubSetupFetch(setup: ProjectSetupResponse | null | "error") {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes("/crawls/active")) return Response.json({ crawls: [] })
    if (url.includes("/projects/proj-1/setup")) {
      setupFetchUrls.push(url)
      if (setup === "error") {
        return new Response('{"message":"boom"}', {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (!setup) {
        return new Response('{"message":"none"}', {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      return Response.json(setup)
    }
    throw new Error(`unexpected request ${url}`)
  }) as typeof fetch
}

let setupGate: {
  resolve: (response: Response) => void
  reject: (reason: unknown) => void
} | null = null

function stubDeferredSetupFetch() {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input)
    if (url.includes("/crawls/active")) return Promise.resolve(Response.json({ crawls: [] }))
    if (url.includes("/projects/proj-1/setup")) {
      setupFetchUrls.push(url)
      return new Promise<Response>((resolve, reject) => {
        setupGate = { resolve, reject }
      })
    }
    return Promise.reject(new Error(`unexpected request ${url}`))
  }) as typeof fetch
}
function crawlFrame(
  type: string,
  resourceId: string,
  payload: Record<string, unknown>,
): OrganizationEventFrame {
  return {
    type,
    organization_id: "org-1",
    project_id: "proj-1",
    resource_id: resourceId,
    payload,
    created_at: "",
  }
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
}

function successes(message: string) {
  return toastCalls.filter((call) => call.kind === "success" && call.message === message)
}

test("setup crawl success is suppressed and its loading toast dismissed", async () => {
  await mountHook()
  stubSetupFetch(setupRow())
  client!.setQueryData(projectSetupQueryKey("proj-1"), setupRow())
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.progress", "crawl-1", { status: "running", source: "manual" }))
    await flushTestDom()
  })
  expect(toastCalls.some((call) => call.kind === "loading" && call.options.id === "crawl-1")).toBe(true)
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete")).toEqual([])
  expect(dismissCalls).toContain("crawl-1")
  expect(revalidates.length > 0).toBe(true)
})

test("later manual crawl on the same project keeps its success", async () => {
  await mountHook()
  stubSetupFetch(setupRow())
  client!.setQueryData(projectSetupQueryKey("proj-1"), setupRow())
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-2", { status: "completed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  const done = successes("Crawl complete")
  expect(done.length).toBe(1)
  expect(done[0]!.options.id).toBe("crawl-2")
})

test("competitor crawls keep notices without a setup fetch", async () => {
  await mountHook()
  stubSetupFetch(setupRow())
  await act(async () => {
    seen!.handleCrawlEvent(
      crawlFrame("crawl.completed", "comp-1", { status: "completed", source: "competitor", competitor_label: "Rival" }),
    )
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Competitor crawl complete").length).toBe(1)
  expect(setupFetchUrls).toEqual([])
})

test("auto crawls keep notices", async () => {
  await mountHook()
  stubSetupFetch(setupRow())
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-9", { status: "completed", source: "auto" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete").length).toBe(1)
})

test("setup crawl failure still shows its error", async () => {
  await mountHook()
  stubSetupFetch(setupRow())
  client!.setQueryData(projectSetupQueryKey("proj-1"), setupRow())
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.failed", "crawl-1", { status: "failed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(toastCalls.filter((call) => call.kind === "error" && call.message === "Crawl failed").length).toBe(1)
})

test("cold cache matching setup suppresses with one canonical fetch", async () => {
  await mountHook()
  stubSetupFetch(setupRow())
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete")).toEqual([])
  expect(dismissCalls).toContain("crawl-1")
  expect(setupFetchUrls.length).toBe(1)
})

test("completed setup row still matches its crawl id after reload", async () => {
  await mountHook()
  stubSetupFetch(setupRow({ status: "completed" }))
  client!.setQueryData(projectSetupQueryKey("proj-1"), setupRow({ status: "completed" }))
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete")).toEqual([])
  expect(dismissCalls).toContain("crawl-1")
})

test("missing setup row and lookup failure fail open to success", async () => {
  await mountHook()
  stubSetupFetch(null)
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete").length).toBe(1)
  await settle()
  globalThis.fetch = realFetch
  stubSetupFetch("error")
  toastCalls.length = 0
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-3", { status: "completed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete").length).toBe(1)
})

test("org mismatch never suppresses", async () => {
  await mountHook()
  stubSetupFetch(setupRow({ organization_id: "org-9" }))
  client!.setQueryData(projectSetupQueryKey("proj-1"), setupRow({ organization_id: "org-9" }))
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete").length).toBe(1)
})

test("org switch drops suppressed ids back to scoped matching", async () => {
  await mountHook("org-1")
  stubSetupFetch(setupRow())
  client!.setQueryData(projectSetupQueryKey("proj-1"), setupRow())
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete")).toEqual([])
  toastCalls.length = 0
  dismissCalls.length = 0
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client!}>
        <Probe orgId="org-2" />
      </QueryClientProvider>,
    )
    await flushTestDom()
  })
  await act(async () => {
    seen!.handleCrawlEvent(crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" }))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete").length).toBe(1)
})

test("replayed setup completion stays dismissed without a new success", async () => {
  await mountHook()
  stubSetupFetch(setupRow())
  client!.setQueryData(projectSetupQueryKey("proj-1"), setupRow())
  const done = () => crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" })
  await act(async () => {
    seen!.handleCrawlEvent(done())
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  await act(async () => {
    seen!.handleCrawlEvent(done())
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete")).toEqual([])
  expect(dismissCalls.filter((id) => id === "crawl-1").length >= 1).toBe(true)
})

test("stale setup resolve after org switch creates no toast", async () => {
  await mountHook("org-1")
  stubDeferredSetupFetch()
  const done = () =>
    crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" })
  await act(async () => {
    seen!.handleCrawlEvent(done())
    await flushTestDom()
    await flushTestDom()
  })
  expect(setupGate === null).toBe(false)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client!}>
        <Probe orgId="org-2" />
      </QueryClientProvider>,
    )
    await flushTestDom()
  })
  await act(async () => {
    setupGate!.resolve(Response.json(setupRow()))
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete")).toEqual([])
  expect(dismissCalls).toEqual([])
  await act(async () => {
    seen!.handleCrawlEvent(done())
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete").length).toBe(1)
})

test("unmounted setup lookup rejection stays silent", async () => {
  await mountHook()
  stubDeferredSetupFetch()
  await act(async () => {
    seen!.handleCrawlEvent(
      crawlFrame("crawl.completed", "crawl-1", { status: "completed", source: "manual" })
    )
    await flushTestDom()
  })
  await act(async () => {
    root?.unmount()
    root = null
    await flushTestDom()
  })
  await act(async () => {
    setupGate!.reject(
      new Response('{"message":"boom"}', {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    )
    for (let i = 0; i < 10; i++) await flushTestDom()
  })
  expect(successes("Crawl complete")).toEqual([])
  expect(dismissCalls).toEqual([])
})
