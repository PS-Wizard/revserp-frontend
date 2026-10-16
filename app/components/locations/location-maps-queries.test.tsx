import { describe, expect, test, afterEach } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { LocationMapsQueriesPanel } from "~/components/locations/location-maps-queries"
import { LocationWorkspaceProvider } from "~/lib/location-workspace"
import type { LocalSeoLocation } from "~/lib/local-seo-api"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  fetchCalls.length = 0
  document.body.innerHTML = ""
})

const RECORDS = [
  {
    id: "q-1",
    text: "coffee roastery downtown",
    ordinal: 0,
    enabled: true,
    kind: "map",
    source: "generated",
    origin: "service",
    landmark_id: null,
  },
  {
    id: "q-2",
    text: "late night espresso",
    ordinal: 1,
    enabled: false,
    kind: "map",
    source: "manual",
    origin: "service",
    landmark_id: null,
  },
  {
    id: "q-3",
    text: "best roastery",
    ordinal: 0,
    enabled: true,
    kind: "ai_question",
    source: "generated",
    origin: "service",
    landmark_id: null,
  },
]

function installFetch(
  opts: { recordsError?: number; status?: string; stayPendingAfterQueue?: boolean } = {}
) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })
    if (url.endsWith("/maps-queries/status") && method === "GET") {
      // Once queued, the job stays active so the progress label is stable.
      const queued = fetchCalls.some(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith("/maps-queries/regenerate")
      )
      if (opts.stayPendingAfterQueue && queued) {
        return Response.json({ status: "pending" })
      }
      return Response.json({ status: opts.status ?? "idle" })
    }
    if (url.endsWith("/maps-queries/regenerate") && method === "POST") {
      return Response.json({ status: "pending" })
    }
    if (url.endsWith("/locations/l-1/queries")) {
      if (method === "GET") {
        if (opts.recordsError) {
          return new Response(JSON.stringify({ error: "boom" }), {
            status: opts.recordsError,
          })
        }
        return Response.json(RECORDS)
      }
      if (method === "PUT") {
        const drafts = body as Array<Record<string, unknown>>
        return Response.json(
          drafts.map((draft, index) => ({
            id: draft.id ?? `q-new-${index}`,
            text: draft.text,
            ordinal: index,
            enabled: draft.enabled,
            kind: draft.kind,
            source: draft.source,
            origin: "service",
            landmark_id: null,
          }))
        )
      }
    }
    throw new Error(`unexpected ${method} ${url}`)
  }) as typeof fetch
}

function tree(canManage: boolean): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return (
    <QueryClientProvider client={client}>
      <LocationWorkspaceProvider
        workspace={{
          projectId: "p-1",
          location: { id: "l-1" } as LocalSeoLocation,
          canManage,
          websiteScope: null,
          websiteScopeRevisions: [],
        }}
      >
        <LocationMapsQueriesPanel projectId="p-1" locationId="l-1" />
      </LocationWorkspaceProvider>
    </QueryClientProvider>
  )
}

async function renderPanel(canManage = true) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  await act(async () => {
    root.render(tree(canManage))
    await flushTestDom()
  })
  return {
    host,
    unmount: () => act(() => root.unmount()),
  }
}

/** Bounded wait for React Query reads to settle in the test DOM. */
async function waitFor(
  host: HTMLElement,
  predicate: (host: HTMLElement) => boolean
) {
  for (let attempt = 0; attempt < 50; attempt++) {
    await act(async () => {
      await flushTestDom()
    })
    if (predicate(host)) return
  }
  throw new Error("timed out waiting for panel content")
}

function buttons(host: HTMLElement, text: string) {
  return [...host.querySelectorAll("button")].filter((entry) =>
    entry.textContent?.includes(text)
  )
}

function setInputValue(input: HTMLInputElement, value: string) {
  // This happy-dom build lacks React-detected input support, so onChange only
  // fires through React's keydown polyfill path: focus first, then change value.
  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
}

describe("location maps queries panel", () => {
  test("edits save map rows only with ids kept", async () => {
    installFetch()
    const { host, unmount } = await renderPanel()
    try {
      await waitFor(
        host,
        (entry) =>
          entry.querySelectorAll('input[aria-label="Map query text"]')
            .length === 2
      )
      const inputs = [
        ...host.querySelectorAll('input[aria-label="Map query text"]'),
      ] as HTMLInputElement[]
      await act(async () => {
        setInputValue(inputs[0]!, "  coffee roastery  ")
        await flushTestDom()
      })
      await act(async () => {
        buttons(host, "Save queries")[0]?.click()
        await flushTestDom()
      })
      await waitFor(host, () =>
        fetchCalls.some(
          (call) => call.method === "PUT" && call.url.endsWith("/queries")
        )
      )
      const put = fetchCalls.find((call) => call.method === "PUT")
      const drafts = put?.body as Array<Record<string, unknown>>
      // Map rows only: the backend preserves non-map records server-side.
      expect(drafts.length).toBe(2)
      expect(drafts[0]?.id).toBe("q-1")
      expect(drafts[0]?.text).toBe("coffee roastery")
      expect(drafts[0]?.kind).toBe("map")
      expect(drafts[0]?.source).toBe("generated")
      expect(drafts[1]?.id).toBe("q-2")
      expect(drafts.some((draft) => draft.kind !== "map")).toBe(false)
    } finally {
      unmount()
    }
  })

  test("manual rows are added without an id", async () => {
    installFetch()
    const { host, unmount } = await renderPanel()
    try {
      await waitFor(
        host,
        (entry) =>
          entry.querySelectorAll('input[aria-label="Map query text"]')
            .length === 2
      )
      const adder = host.querySelector(
        'input[aria-label="New manual map query"]'
      ) as HTMLInputElement
      await act(async () => {
        setInputValue(adder, "cold brew catering")
        await flushTestDom()
      })
      await act(async () => {
        buttons(host, "Add")[0]?.click()
        await flushTestDom()
      })
      await waitFor(
        host,
        (entry) =>
          entry.querySelectorAll('input[aria-label="Map query text"]')
            .length === 3
      )
      await act(async () => {
        buttons(host, "Save queries")[0]?.click()
        await flushTestDom()
      })
      await waitFor(host, () =>
        fetchCalls.some((call) => call.method === "PUT")
      )
      const put = fetchCalls.filter((call) => call.method === "PUT").at(-1)
      const drafts = put?.body as Array<Record<string, unknown>>
      const added = drafts.find((draft) => draft.text === "cold brew catering")
      expect(added?.kind).toBe("map")
      expect(added?.source).toBe("manual")
      expect(added !== undefined && "id" in added).toBe(false)
    } finally {
      unmount()
    }
  })

  test("unsaved edits warn and block regeneration", async () => {
    installFetch()
    const { host, unmount } = await renderPanel()
    try {
      await waitFor(
        host,
        (entry) =>
          entry.querySelectorAll('input[aria-label="Map query text"]')
            .length === 2
      )
      const inputs = [
        ...host.querySelectorAll('input[aria-label="Map query text"]'),
      ] as HTMLInputElement[]
      await act(async () => {
        setInputValue(inputs[0]!, "changed query")
        await flushTestDom()
      })
      await waitFor(host, (entry) =>
        entry.innerHTML.includes("last saved set")
      )
      const regen = buttons(host, "Regenerate")[0]
      expect(regen?.disabled).toBe(true)
      expect(
        fetchCalls.some((call) =>
          call.url.endsWith("/maps-queries/regenerate")
        )
      ).toBe(false)
    } finally {
      unmount()
    }
  })

  test("regenerate queues a job and shows progress", async () => {
    installFetch({ stayPendingAfterQueue: true })
    const { host, unmount } = await renderPanel()
    try {
      await waitFor(
        host,
        (entry) =>
          entry.querySelectorAll('input[aria-label="Map query text"]')
            .length === 2
      )
      await act(async () => {
        buttons(host, "Regenerate")[0]?.click()
        await flushTestDom()
      })
      await waitFor(host, (entry) =>
        entry.innerHTML.includes("Regenerating")
      )
      expect(
        fetchCalls.some(
          (call) =>
            call.method === "POST" &&
            call.url.endsWith("/maps-queries/regenerate")
        )
      ).toBe(true)
    } finally {
      unmount()
    }
  })

  test("failed records read surfaces an error, never a loader", async () => {
    installFetch({ recordsError: 500 })
    const { host, unmount } = await renderPanel()
    try {
      // The mock error body carries its own message: assert the error UI,
      // not the fallback copy.
      await waitFor(
        host,
        (entry) => entry.querySelector('[role="alert"]') !== null
      )
      expect(host.innerHTML.includes("Loading map queries")).toBe(false)
      expect(buttons(host, "Try again").length).toBe(1)
    } finally {
      unmount()
    }
  })

  test("read-only without manage permission", async () => {
    installFetch()
    const { host, unmount } = await renderPanel(false)
    try {
      await waitFor(
        host,
        (entry) =>
          entry.querySelectorAll('input[aria-label="Map query text"]')
            .length === 2
      )
      expect(host.innerHTML).toContain("Only workspace managers")
      expect(
        (buttons(host, "Save queries")[0] as HTMLButtonElement | undefined)
          ?.disabled
      ).toBe(true)
    } finally {
      unmount()
    }
  })
})
