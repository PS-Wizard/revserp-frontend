import { afterEach, describe, expect, test } from "bun:test"
import "~/lib/dom-test-install"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { LocationCompetitorsView } from "~/components/locations/location-competitors-view"
import {
  localSeoLatestRunQueryKey,
  localSeoLocationQueryKey,
  localSeoRunCompetitorsQueryKey,
  type LocalSeoLocation,
  type LocalSeoLocationQueryRecord,
  type LocalSeoRun,
  type LocalSeoRunCompetitors,
  type LocalSeoRunCompetitor,
} from "~/lib/local-seo-api"

installTestDom()

const PROJECT = "proj-1"
const LOCATION = "loc-1"

function mapQuery(text: string): LocalSeoLocationQueryRecord {
  return {
    id: `q-${text}`,
    text,
    ordinal: 0,
    enabled: true,
    kind: "map",
    source: "manual",
    origin: "service",
    landmark_id: null,
  }
}

function makeLocation(
  overrides: Partial<LocalSeoLocation> = {}
): LocalSeoLocation {
  return {
    id: LOCATION,
    project_id: PROJECT,
    name: "Roastery",
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

function makeRun(overrides: Partial<LocalSeoRun> = {}): LocalSeoRun {
  return {
    id: "run-1",
    location_id: LOCATION,
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

function makeCompetitor(
  overrides: Partial<LocalSeoRunCompetitor> = {}
): LocalSeoRunCompetitor {
  return {
    place_id: "ChIJ-competitor",
    title: "Rival Roasters",
    address: "Side St",
    query_points_seen: 9,
    best_rank: 1,
    average_position: 2.5,
    same_brand_domain: false,
    query_indexes: [0],
    ...overrides,
  }
}

function makeCompetitors(
  overrides: Partial<LocalSeoRunCompetitors> = {}
): LocalSeoRunCompetitors {
  return {
    run_id: "run-1",
    target_place_id: "ChIJ1",
    queries: ["coffee"],
    point_index: null,
    total_query_points: 9,
    contributing_query_points: 9,
    failed_query_points: 0,
    pending_query_points: 0,
    unreadable_query_points: 0,
    idless_entries: 0,
    competitors: [makeCompetitor()],
    ...overrides,
  }
}

function renderStatic(options: {
  location?: LocalSeoLocation
  run?: LocalSeoRun | null
  competitors?: LocalSeoRunCompetitors | null
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const location = options.location ?? makeLocation()
  const run = options.run === undefined ? makeRun() : options.run
  client.setQueryData(localSeoLocationQueryKey(PROJECT, LOCATION), location)
  client.setQueryData(localSeoLatestRunQueryKey(PROJECT, LOCATION), run)
  if (run && options.competitors) {
    client.setQueryData(
      localSeoRunCompetitorsQueryKey(
        PROJECT,
        LOCATION,
        run.id,
        run.status,
        run.completed_cells ?? null
      ),
      options.competitors
    )
  }
  try {
    return renderToStaticMarkup(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <LocationCompetitorsView projectId={PROJECT} locationId={LOCATION} />
        </QueryClientProvider>
      </MemoryRouter>
    )
  } finally {
    client.clear()
  }
}

type FetchCall = { url: string; method: string }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

function installCompetitorsFetch() {
  ;(globalThis as Record<string, unknown>).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    fetchCalls.push({ url, method })
    if (url.includes("/points/") && url.includes("/competitors")) {
      return Response.json(makeCompetitors({ point_index: 4 }))
    }
    if (url.includes("/competitors")) return Response.json(makeCompetitors())
    if (url.includes("/runs/latest")) return Response.json(makeRun())
    if (url.includes(`/locations/${LOCATION}`)) {
      return Response.json(makeLocation())
    }
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
    })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = originalFetch
  fetchCalls.length = 0
  document.body.innerHTML = ""
})

async function flushUntil(check: () => boolean) {
  for (let i = 0; i < 40; i++) {
    if (check()) return
    await act(async () => {
      await flushTestDom()
    })
  }
  throw new Error("condition never became true")
}

describe("location competitors", () => {
  test("renders stored listings grouped by exact place ID", () => {
    const html = renderStatic({ competitors: makeCompetitors() })
    expect(html).toContain("Rival Roasters")
    expect(html).toContain("Whole run competitors")
    expect(html).toContain("Competitor scope")
  })

  test("empty state links to the same location Maps test without autorunning", () => {
    const html = renderStatic({ run: null })
    expect(html).toContain("No runs yet for this location")
    expect(html).toContain("Open Maps test")
    expect(html).toContain(`location=${LOCATION}`)
    expect(html).toContain("visibility=maps")
  })

  test("unbound locations explain that competitors need a listing", () => {
    const html = renderStatic({
      location: makeLocation({ place_id: null }),
      run: null,
    })
    expect(html).toContain("Bind a Google listing")
  })

  test("mount and scope switch only read stored snapshots", async () => {
    installCompetitorsFetch()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <LocationCompetitorsView projectId={PROJECT} locationId={LOCATION} />
          </QueryClientProvider>
        </MemoryRouter>
      )
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("Rival Roasters")
    )
    const scope = container.querySelector(
      'select[aria-label="Competitor scope"]'
    ) as HTMLSelectElement | null
    if (!scope) throw new Error("competitor scope select missing")
    await act(async () => {
      scope.value = "4"
      scope.dispatchEvent(new Event("change", { bubbles: true }))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("Point E competitors")
    )
    expect(fetchCalls.length > 0).toBe(true)
    expect(fetchCalls.filter((call) => call.method !== "GET")).toEqual([])
    root.unmount()
    client.clear()
  })

  test("empty CTA routes to the Maps test without starting a run", async () => {
    const emptyFetch = globalThis.fetch
    ;(globalThis as Record<string, unknown>).fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      const method = (init?.method ?? "GET").toUpperCase()
      fetchCalls.push({ url, method })
      if (url.includes("/runs/latest")) {
        return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
      }
      if (url.includes(`/locations/${LOCATION}`)) return Response.json(makeLocation())
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
    }) as typeof fetch
    try {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <LocationCompetitorsView projectId={PROJECT} locationId={LOCATION} />
          </QueryClientProvider>
        </MemoryRouter>
      )
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("Open Maps test")
    )
    const cta = container.querySelector('a[href*="visibility=maps"]')
    if (!cta) throw new Error("maps test CTA missing")
    expect(cta.getAttribute("href")).toContain(`location=${LOCATION}`)
    await act(async () => {
      cta.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      await flushTestDom()
    })
    expect(fetchCalls.filter((call) => call.method !== "GET")).toEqual([])
    root.unmount()
    client.clear()
    } finally {
      globalThis.fetch = emptyFetch
    }
  })
})

describe("location competitors shell", () => {
  test("cards show the average observed position with coverage, never queries or best rank", () => {
    const html = renderStatic({
      competitors: makeCompetitors({
        queries: ["coffee", "tea"],
        competitors: [
          makeCompetitor({
            place_id: "ChIJ-a",
            title: "Alpha",
            query_points_seen: 9,
            best_rank: 1,
            average_position: 2.5,
            average_result_count: 20,
          }),
          makeCompetitor({
            place_id: "ChIJ-b",
            title: "Beta",
            query_points_seen: 3,
            best_rank: null,
            average_position: null,
          }),
        ],
      }),
    })
    expect(html).toContain("Avg. position 2.5")
    expect(html).toContain("No observed position")
    expect(html).toContain("Appeared in 9 of 9 searches")
    expect(html).toContain("Appeared in 3 of 9 searches")
    expect(html).toContain("Result lists averaged 20 businesses")
    expect(html.includes("of 60 competitors")).toBe(false)
    expect(html.includes("Best #")).toBe(false)
    expect(html.includes("Peak")).toBe(false)
    expect(html).toContain("Frozen queries: coffee")
    expect(html.split("coffee")).toHaveLength(2)
    expect(html.includes("tea")).toBe(false)
  })

  test("cards sort by ascending average, then appearances", () => {
    const html = renderStatic({
      competitors: makeCompetitors({
        competitors: [
          makeCompetitor({
            place_id: "ChIJ-worst",
            title: "Worst",
            query_points_seen: 9,
            best_rank: 1,
            average_position: 8,
          }),
          makeCompetitor({
            place_id: "ChIJ-unseen",
            title: "Unseen",
            query_points_seen: 1,
            best_rank: null,
            average_position: null,
          }),
          makeCompetitor({
            place_id: "ChIJ-best",
            title: "Best",
            query_points_seen: 2,
            best_rank: 5,
            average_position: 1.5,
          }),
        ],
      }),
    })
    const best = html.indexOf("Best")
    const worst = html.indexOf("Worst")
    const unseen = html.indexOf("Unseen")
    expect(best > -1 && worst > -1 && unseen > -1).toBe(true)
    expect(best < worst && worst < unseen).toBe(true)
  })

  test("renders no local heading; the navbar owns context", () => {
    const html = renderStatic({ competitors: makeCompetitors() })
    expect(html.includes("<h2")).toBe(false)
    expect(html).toContain("Rival Roasters")
    expect(html).toContain("Competitor scope")
  })
})
