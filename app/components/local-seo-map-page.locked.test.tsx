import { afterEach, describe, expect, test } from "bun:test"
import "~/lib/dom-test-install"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { LocalSeoMapPage } from "~/components/local-seo-map-page"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import type {
  LocalSeoLocation,
  LocalSeoLocationQueryRecord,
  LocalSeoMapsBudget,
  LocalSeoRun,
} from "~/lib/local-seo-api"
import type { LocationMapsRunHistoryItem } from "~/components/locations/location-maps-run-history"

installTestDom()

const PROJECT = "proj-1"

function mapQuery(text: string): LocalSeoLocationQueryRecord {
  return {
    id: `q-${text}`,
    text,
    ordinal: 0,
    enabled: true,
    kind: "map" as const,
    source: "manual" as const,
    origin: "service" as const,
    landmark_id: null,
  }
}

function makeLocation(
  id: string,
  overrides: Partial<LocalSeoLocation> = {}
): LocalSeoLocation {
  return {
    id,
    project_id: PROJECT,
    name: id === "loc-b" ? "Bakery" : "Roastery",
    place_id: "ChIJ1",
    address: "Main St",
    locality: "Downtown",
    localities: [],
    services: [],
    latitude: 27.7,
    longitude: 85.3,
    queries: [mapQuery("coffee")],
    ...overrides,
  }
}

function makeRun(
  id: string,
  overrides: Partial<LocalSeoRun> = {}
): LocalSeoRun {
  return {
    id,
    location_id: "loc-a",
    status: "completed",
    radius_m: 5000,
    expected_credits: 27,
    credits_used: 27,
    retry_credits: 0,
    queries: ["coffee"],
    cells: [],
    ...overrides,
  }
}

function historyItem(
  id: string,
  status: LocalSeoRun["status"]
): LocationMapsRunHistoryItem {
  return {
    id,
    status,
    radius_m: 5000,
    expected_credits: 27,
    credits_used: 27,
    query_count: 1,
    grid_point_count: 9,
    total_cells: 9,
    created_at: "2026-10-01T00:00:00Z",
  }
}

type FetchCall = { url: string; method: string; body: string | null }
const fetchCalls: FetchCall[] = []
const realFetch = globalThis.fetch

function installFetch(scenario: {
  locations: Record<string, LocalSeoLocation>
  latest: Record<string, LocalSeoRun | null>
  history: LocationMapsRunHistoryItem[]
  failRuns?: string[]
}) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const isRequestObject =
      typeof input !== "string" && "method" in input && "url" in input
    const url =
      typeof input === "string"
        ? input
        : String(isRequestObject ? (input as Request).url : input.toString())
    const method =
      init?.method ??
      (isRequestObject ? String((input as Request).method) : "GET")
    fetchCalls.push({
      url,
      method,
      body: typeof init?.body === "string" ? init.body : null,
    })
    if (method === "POST" && /\/locations\/[^/]+\/runs$/.test(url)) {
      return Response.json({
        id: "run-new",
        status: "queued",
        expected_credits: 27,
      })
    }
    if (url.includes("/runs/latest")) {
      const match = url.match(/locations\/([^/]+)\/runs\/latest/)
      const run = match ? scenario.latest[match[1]] : null
      if (!run) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        })
      }
      return Response.json(run)
    }
    if (url.includes("/runs?")) {
      return Response.json({
        total: scenario.history.length,
        runs: scenario.history,
      })
    }
    const runMatch = url.match(/\/runs\/([^/?]+)$/)
    if (runMatch) {
      if (scenario.failRuns?.includes(runMatch[1])) {
        return new Response(JSON.stringify({ error: "saved run missing" }), {
          status: 500,
        })
      }
      const found = scenario.history.find((item) => item.id === runMatch[1])
      if (!found) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        })
      }
      return Response.json(makeRun(found.id, { status: found.status }))
    }
    if (url.includes("/maps-budget")) {
      return Response.json({
        remaining_credits: 500,
        reserved_credits: 0,
        spent_credits: 0,
        available_credits: 365,
      } satisfies LocalSeoMapsBudget)
    }
    const locMatch = url.match(/\/locations\/([^/?]+)$/)
    if (locMatch && scenario.locations[locMatch[1]]) {
      return Response.json(scenario.locations[locMatch[1]])
    }
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
    })
  }) as typeof fetch
}

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  globalThis.fetch = realFetch
  fetchCalls.length = 0
  document.body.innerHTML = ""
})

function press(el: Element | null | undefined) {
  if (!el) throw new Error("press target missing")
  const target = el as HTMLElement
  const init = { bubbles: true, cancelable: true, composed: true, button: 0 }
  target.dispatchEvent(new PointerEvent("pointerdown", init))
  target.dispatchEvent(new MouseEvent("mousedown", init))
  target.focus?.()
  target.dispatchEvent(new PointerEvent("pointerup", init))
  target.dispatchEvent(new MouseEvent("mouseup", init))
  target.dispatchEvent(new MouseEvent("click", init))
}

async function flushUntil(check: () => boolean) {
  for (let i = 0; i < 40; i++) {
    if (check()) return
    await act(async () => {
      await flushTestDom()
    })
  }
  throw new Error("condition never became true")
}

async function mountLocked(locationId: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <LocalSeoMapPage projectId={PROJECT} lockedLocationId={locationId} />
      </QueryClientProvider>
    )
    await flushTestDom()
  })
}

async function openTab(name: string) {
  await flushUntil(() => {
    const detail = host!.querySelector("#local-seo-map-detail")
    return (
      detail !== null &&
      [...detail.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === name
      )
    )
  })
  const detail = host!.querySelector("#local-seo-map-detail")!
  const tab = [...detail.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === name
  )
  await act(async () => {
    press(tab)
    await flushTestDom()
    await flushTestDom()
  })
}

async function openRunTab() {
  await openTab("Run")
}

async function openOverviewTab() {
  await openTab("Overview")
}

const SCENARIO = () => ({
  locations: { "loc-a": makeLocation("loc-a") },
  latest: { "loc-a": makeRun("run-1") } as Record<string, LocalSeoRun | null>,
  history: [historyItem("run-1", "completed"), historyItem("run-0", "failed")],
})

describe("locked map page", () => {
  test("lock loads only its location, hides picker add and AI query tabs", async () => {
    installFetch(SCENARIO())
    await mountLocked("loc-a")
    await flushUntil(() => host?.textContent?.includes("Roastery") ?? false)
    const html = host!.innerHTML
    expect(html.includes("New location")).toBe(false)
    expect(html.includes(">AI<")).toBe(false)
    expect(html.includes(">Queries<")).toBe(false)
    expect(html.includes(">Listing<")).toBe(false)
    expect(html).toContain(">Overview<")
    expect(html).toContain(">Run<")
    expect(fetchCalls.some((call) => call.url.endsWith("/locations"))).toBe(
      false
    )
    expect(
      fetchCalls.some((call) => call.url.includes("/locations/loc-a"))
    ).toBe(true)
    expect(fetchCalls.filter((call) => call.method !== "GET")).toEqual([])
  })

  test("history selection shows the frozen radius and data", async () => {
    installFetch(SCENARIO())
    await mountLocked("loc-a")
    await openRunTab()
    await flushUntil(
      () => host!.querySelector('select[aria-label="Selected run"]') !== null
    )
    const select = host!.querySelector(
      'select[aria-label="Selected run"]'
    ) as HTMLSelectElement
    await act(async () => {
      select.value = "run-0"
      select.dispatchEvent(new Event("change", { bubbles: true }))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() => host?.textContent?.includes("5 km radius") ?? false)
    expect(fetchCalls.filter((call) => call.method !== "GET")).toEqual([])
  })

  test("latest active run blocks a new start while an old run is selected", async () => {
    installFetch({
      locations: { "loc-a": makeLocation("loc-a") },
      latest: {
        "loc-a": makeRun("run-9", { status: "running", radius_m: 5000 }),
      },
      history: [
        historyItem("run-9", "running"),
        historyItem("run-0", "failed"),
      ],
    })
    await mountLocked("loc-a")
    await openRunTab()
    await flushUntil(
      () => host!.querySelector('select[aria-label="Selected run"]') !== null
    )
    const select = host!.querySelector(
      'select[aria-label="Selected run"]'
    ) as HTMLSelectElement
    await act(async () => {
      select.value = "run-0"
      select.dispatchEvent(new Event("change", { bubbles: true }))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() => {
      const candidate = [...host!.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Start run")
      ) as HTMLButtonElement | undefined
      return candidate !== undefined && candidate.disabled
    })
    expect(host?.textContent?.includes("already queued or running")).toBe(true)
  })

  test("seven queries price in full with no cap", async () => {
    installFetch({
      locations: {
        "loc-a": makeLocation("loc-a", {
          queries: Array.from({ length: 7 }, (_, index) =>
            mapQuery(`saved-${index}`)
          ),
        }),
      },
      latest: { "loc-a": makeRun("run-1") },
      history: [historyItem("run-1", "completed")],
    })
    await mountLocked("loc-a")
    await openRunTab()
    await flushUntil(
      () => host?.textContent?.includes("Start run · 189 credits") ?? false
    )
  })

  test("lock follows the root location id per mount", async () => {
    installFetch({
      locations: { "loc-b": makeLocation("loc-b") },
      latest: { "loc-b": null },
      history: [],
    })
    await mountLocked("loc-b")
    await flushUntil(() => host?.textContent?.includes("Bakery") ?? false)
    expect(host?.textContent?.includes("Roastery")).toBe(false)
    expect(
      fetchCalls.some((call) => call.url.includes("/locations/loc-b"))
    ).toBe(true)
  })

  test("saved location radius seeds the frozen run inputs with no latest run", async () => {
    installFetch({
      locations: {
        "loc-a": makeLocation("loc-a", {
          radius_m: 2500,
        }),
      },
      latest: { "loc-a": null },
      history: [],
    })
    await mountLocked("loc-a")
    await openRunTab()
    await flushUntil(
      () => host?.textContent?.includes("2.5 km") ?? false
    )
    const start = [...host!.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start run")
    ) as HTMLButtonElement
    expect(start.disabled).toBe(false)
    await act(async () => {
      press(start)
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      fetchCalls.some(
        (call) =>
          call.method === "POST" && call.url.endsWith("/locations/loc-a/runs")
      )
    )
    const posted = fetchCalls.find(
      (call) =>
        call.method === "POST" && call.url.endsWith("/locations/loc-a/runs")
    )!
    expect(JSON.parse(posted.body!).radius_m).toBe(2500)
    expect(JSON.parse(posted.body!).expected_credits).toBe(27)
  })

  test("failed historical fetch substitutes no latest frozen radius or results", async () => {
    installFetch({
      locations: { "loc-a": makeLocation("loc-a") },
      latest: {
        "loc-a": makeRun("run-9", {
          status: "completed",
          radius_m: 5000,
        }),
      },
      history: [
        historyItem("run-9", "completed"),
        historyItem("run-8", "failed"),
      ],
      failRuns: ["run-8"],
    })
    await mountLocked("loc-a")
    await openRunTab()
    await flushUntil(
      () => host!.querySelector('select[aria-label="Selected run"]') !== null
    )
    const select = host!.querySelector(
      'select[aria-label="Selected run"]'
    ) as HTMLSelectElement
    await act(async () => {
      select.value = "run-8"
      select.dispatchEvent(new Event("change", { bubbles: true }))
      await flushTestDom()
      await flushTestDom()
    })
    const start = [...host!.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start run")
    ) as HTMLButtonElement
    expect(start.disabled).toBe(false)
    await openOverviewTab()
    await flushUntil(
      () => host?.textContent?.includes("saved run missing") ?? false
    )
    expect(host?.textContent?.includes("5 km radius")).toBe(false)
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)
  })
})
