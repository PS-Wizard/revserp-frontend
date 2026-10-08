import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot } from "react-dom/client"
import {
  QueryClient,
  QueryClientProvider,
  environmentManager,
} from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { LocationWorkspaceProvider } from "~/lib/location-workspace"
import { LocationVisibilityView } from "~/components/locations/location-visibility-view"
import {
  describeLocationMapsCellStatus,
  selectLocationMapsNewRunRadiusM,
} from "~/components/locations/location-visibility-maps"
import {
  describeLocalSeoRunGate,
  type LocalSeoRunGate,
} from "~/components/local-seo-run-controls"
import {
  localSeoLatestRunQueryKey,
  localSeoLocationQueryKey,
  localSeoMapsBudgetQueryKey,
  localSeoRunCost,
  validateLocalSeoQueries,
  type LocalSeoCell,
  type LocalSeoLocation,
  type LocalSeoLocationQueryRecord,
  type LocalSeoMapsBudget,
  type LocalSeoPointDetails,
  type LocalSeoRun,
} from "~/lib/local-seo-api"
import {
  describeRunHistoryOption,
  locationMapsRunSummaryOfRun,
  locationSavedRadiusM,
  normalizeRunHistoryWindow,
  type LocationMapsRunHistoryItem,
} from "~/components/locations/location-maps-run-history"

installTestDom()

const PROJECT = "proj-1"
const LOCATION = "loc-1"

function mapQuery(
  text: string,
  overrides: Partial<LocalSeoLocationQueryRecord> = {}
): LocalSeoLocationQueryRecord {
  return {
    id: `q-${text}`,
    text,
    ordinal: 0,
    enabled: true,
    kind: "map",
    source: "manual",
    origin: "service",
    landmark_id: null,
    ...overrides,
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

const POINT_SECTORS = [
  "NW",
  "N",
  "NE",
  "W",
  "centre",
  "E",
  "SW",
  "S",
  "SE",
] as const
const POINT_RINGS = [
  "corner",
  "edge",
  "corner",
  "edge",
  "centre",
  "edge",
  "corner",
  "edge",
  "corner",
] as const

function makeCell(
  pointIndex: number,
  queryIndex: number,
  overrides: Partial<LocalSeoCell> = {}
): LocalSeoCell {
  return {
    query_index: queryIndex,
    point_index: pointIndex,
    latitude: 27.7,
    longitude: 85.3,
    distance_m: 1200,
    ring: POINT_RINGS[pointIndex],
    sector: POINT_SECTORS[pointIndex],
    call_status: "success_nonempty",
    match_status: "found",
    rank: 3,
    credits: 3,
    credit_known: true,
    error: null,
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

function makeBudget(
  overrides: Partial<LocalSeoMapsBudget> = {}
): LocalSeoMapsBudget {
  return {
    remaining_credits: 500,
    reserved_credits: 0,
    spent_credits: 0,
    available_credits: 365,
    ...overrides,
  }
}

function makeHistoryItem(
  overrides: Partial<LocationMapsRunHistoryItem> = {}
): LocationMapsRunHistoryItem {
  return {
    id: "run-1",
    status: "completed",
    radius_m: 5000,
    expected_credits: 27,
    credits_used: 27,
    query_count: 1,
    grid_point_count: 9,
    total_cells: 9,
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  }
}


function seedClient(options: {
  location?: LocalSeoLocation
  run?: LocalSeoRun | null
  budget?: LocalSeoMapsBudget | null
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const location = options.location ?? makeLocation()
  client.setQueryData(localSeoLocationQueryKey(PROJECT, LOCATION), location)
  client.setQueryData(
    localSeoLatestRunQueryKey(PROJECT, LOCATION),
    options.run ?? null
  )
  if (options.budget !== null) {
    client.setQueryData(
      localSeoMapsBudgetQueryKey(PROJECT),
      options.budget ?? makeBudget()
    )
  }
  return client
}

function renderStatic(
  client: QueryClient,
  initialAuditId?: string,
  mode?: "maps" | "ai"
) {
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LocationVisibilityView
          projectId={PROJECT}
          locationId={LOCATION}
          initialAuditId={initialAuditId}
          mode={mode}
        />
      </QueryClientProvider>
    )
  } finally {
    client.clear()
  }
}

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

type MapsScenario = {
  locations: Record<string, LocalSeoLocation>
  latest: Record<string, LocalSeoRun | null>
  runs: Record<string, LocalSeoRun>
  history: LocationMapsRunHistoryItem[]
  budgets?: Record<string, LocalSeoMapsBudget>
  failRuns?: string[]
  pointDetails?: Record<string, LocalSeoPointDetails>
}

function installVisibilityFetch(scenario: MapsScenario) {
  ;(globalThis as Record<string, unknown>).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })
    if (method === "POST" && /\/locations\/[^/]+\/runs$/.test(url)) {
      return Response.json({
        id: "run-9",
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
    if (url.includes("/competitors")) {
      // The merged page reads stored competitor rollups (whole run and
      // per point) from the same frozen run; the old snapshots predate them.

      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })
    }
    if (url.includes("/points/")) {
      const match = url.match(/locations\/([^/]+)\/runs\/([^/]+)\/points\/(\d+)/)
      const key = match ? `${match[2]}:${match[3]}` : ""
      if (
        (match && scenario.failRuns?.includes(match[2])) ||
        !scenario.pointDetails?.[key]
      ) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        })
      }
      return Response.json(scenario.pointDetails[key])
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
      const found = scenario.runs[runMatch[1]]
      if (!found) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        })
      }
      return Response.json(found)
    }
    if (url.includes("/maps-budget")) {
      const match = url.match(/projects\/([^/]+)\/maps-budget/)
      return Response.json(
        (match && scenario.budgets?.[match[1]]) ?? makeBudget()
      )
    }
    if (url.includes("/ai-audits")) return Response.json({ ai_audits: [] })
    const locMatch = url.match(/\/locations\/([^/?]+)$/)
    if (locMatch && scenario.locations[locMatch[1]]) {
      return Response.json(scenario.locations[locMatch[1]])
    }
    if (url.includes("/locations")) return Response.json([])
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

function press(el: Element | null | undefined) {
  if (!el) throw new Error("press target missing")
  const target = el as HTMLElement
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
  }
  target.dispatchEvent(new PointerEvent("pointerdown", init))
  target.dispatchEvent(new MouseEvent("mousedown", init))
  target.focus?.()
  target.dispatchEvent(new PointerEvent("pointerup", init))
  target.dispatchEvent(new MouseEvent("mouseup", init))
  target.dispatchEvent(new MouseEvent("click", init))
}

function buttonByText(scope: ParentNode, text: string) {
  const found = [...scope.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text)
  )
  if (!found) throw new Error(`button "${text}" not found`)
  return found as HTMLButtonElement
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

describe("maps cost and gate", () => {
  function sevenQueryLocation() {
    return makeLocation({
      queries: Array.from({ length: 7 }, (_, index) =>
        mapQuery(`saved-${index}`)
      ),
    })
  }

  test("prices every enabled query with no upper cap", () => {
    expect(localSeoRunCost(makeLocation())).toBe(27)
    expect(localSeoRunCost(sevenQueryLocation())).toBe(189)
  })

  function gateBase(): LocalSeoRunGate {
    return {
      bound: true,
      isRemote: false,
      queryError: null,
      radiusError: null,
      runReadState: "ready",
      runStatus: "completed",
      reservedCredits: 0,
      unconfirmedCalls: 0,
      budgetState: "ready",
      availableCredits: 365,
      cost: 189,
    }
  }

  test("allows more than five queries when the allowance covers them", () => {
    expect(describeLocalSeoRunGate(gateBase())).toEqual({
      canStart: true,
      reason: null,
    })
  })

  test("blocks empty queries, unbound listings, and short allowances", () => {
    const base = gateBase()
    expect(
      describeLocalSeoRunGate({
        ...base,
        queryError: validateLocalSeoQueries([]),
      }).reason
    ).toContain("At least 1")
    expect(describeLocalSeoRunGate({ ...base, bound: false }).reason).toContain(
      "Bind a Google listing"
    )
    expect(
      describeLocalSeoRunGate({ ...base, availableCredits: 100 }).reason
    ).toContain("Not enough Maps allowance")
  })
})

describe("maps cards helpers", () => {
  test("new-run radius prefers the saved creation radius over any run", () => {
    const saved = Object.assign(makeLocation(), { radius_m: 2500 })
    expect(
      selectLocationMapsNewRunRadiusM(saved, makeRun({ radius_m: 8000 }))
    ).toBe(2500)
    expect(
      selectLocationMapsNewRunRadiusM(makeLocation(), makeRun({ radius_m: 8000 }))
    ).toBe(8000)
    expect(selectLocationMapsNewRunRadiusM(makeLocation(), null)).toBe(5000)
  })

  test("cell states stay distinct and never invent a zero rank", () => {
    expect(
      describeLocationMapsCellStatus(makeCell(0, 0, { call_status: "pending" }))
    ).toBe("Pending")
    expect(
      describeLocationMapsCellStatus(
        makeCell(0, 0, { call_status: "request_failed" })
      )
    ).toBe("Failed")
    expect(
      describeLocationMapsCellStatus(
        makeCell(0, 0, { call_status: "success_empty" })
      )
    ).toBe("No results")
    expect(describeLocationMapsCellStatus(makeCell(0, 0, { rank: 3 }))).toBe(
      "#3"
    )
    expect(
      describeLocationMapsCellStatus(
        makeCell(0, 0, {
          call_status: "success_nonempty",
          match_status: "absent",
          rank: null,
        })
      )
    ).toBe("Not found")
    expect(
      describeLocationMapsCellStatus(
        makeCell(0, 0, {
          call_status: "success_nonempty",
          match_status: "unknown",
          rank: null,
        })
      )
    ).toBe("Unknown")
  })
})

describe("maps cards content", () => {
  function ninePointRun(): LocalSeoRun {
    return makeRun({
      cells: Array.from({ length: 9 }, (_, pointIndex) =>
        makeCell(pointIndex, 0)
      ),
    })
  }

  test("maps mode renders nine point cards in a 3x3 grid with no map canvas", () => {
    const html = renderStatic(seedClient({ run: ninePointRun() }), undefined, "maps")
    expect(html).toContain("Nine-point grid results")
    for (const letter of ["A", "B", "C", "D", "E", "F", "G", "H", "I"]) {
      expect(html).toContain(`Point ${letter}`)
    }
    expect(html).toContain("lg:grid-cols-3")
    expect(html.includes("<canvas")).toBe(false)
    expect(html.includes("maplibre")).toBe(false)
    expect(html.includes("New location")).toBe(false)
  })

  test("cards show the frozen score and coverage from stored cells", () => {
    const html = renderStatic(seedClient({ run: ninePointRun() }), undefined, "maps")
    expect(html).toContain("Avg. rank \u22483.0")
    expect(html).toContain("Ranks are approximate")
    expect(html).toContain("1/1 found · 0 absent · 0 unknown")
    expect(html).toContain('title="coffee"')
    expect(html).toContain("5.0 km")
  })

  test("empty points stay honest instead of borrowing a zero score", () => {
    const html = renderStatic(seedClient({ run: makeRun() }), undefined, "maps")
    expect(html).toContain("Not sampled")
  })

  test("shows the empty state with no runs yet", () => {
    const html = renderStatic(seedClient({ run: null }))
    expect(html).toContain("No runs yet for this location")
  })

  test("unbound locations show no run content", () => {
    const html = renderStatic(
      seedClient({ location: makeLocation({ place_id: null }), run: null })
    )
    expect(html).toContain("Bind a Google listing")
    expect(html.includes("Start run")).toBe(false)
    expect(html.includes("Latest recorded run")).toBe(false)
  })

  test("deep-linked audit starts on the AI tab", () => {
    const html = renderStatic(seedClient({ run: null }), "audit-1")
    expect(html).toContain("LLM Visibility")
  })

  test("explicit mode wins over the audit deep link", () => {
    const html = renderStatic(
      seedClient({ run: makeRun({ cells: [makeCell(0, 0)] }) }),
      "audit-1",
      "maps"
    )
    expect(html.includes("LLM Visibility")).toBe(false)
    expect(html).toContain("Nine-point grid results")
  })
})

describe("stored snapshots only", () => {
  function baseScenario(): MapsScenario {
    const run = makeRun({
      cells: Array.from({ length: 9 }, (_, pointIndex) =>
        makeCell(pointIndex, 0)
      ),
    })
    return {
      locations: { [LOCATION]: makeLocation() },
      latest: { [LOCATION]: run },
      runs: { "run-1": run },
      history: [makeHistoryItem()],
    }
  }

  async function mountVisibility(locationId = LOCATION) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <LocationVisibilityView
            projectId={PROJECT}
            locationId={locationId}
          />
        </QueryClientProvider>
      )
      await flushTestDom()
    })
    return { root, container, client }
  }

  test("mount renders nine cards and never POSTs", async () => {
    installVisibilityFetch(baseScenario())
    const { root, container, client } = await mountVisibility()
    await flushUntil(
      () =>
        container.querySelector('[aria-label="Nine-point grid results"]') !== null
    )
    expect(
      container.querySelectorAll('[aria-label="Nine-point grid results"] > *')
        .length
    ).toBe(9)
    expect(container.querySelector("canvas")).toBe(null)
    expect(fetchCalls.length > 0).toBe(true)
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    root.unmount()
    client.clear()
  })

  test("mode switch to AI never POSTs", async () => {
    installVisibilityFetch(baseScenario())
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <LocationVisibilityView
            projectId={PROJECT}
            locationId={LOCATION}
            mode="maps"
          />
        </QueryClientProvider>
      )
      await flushTestDom()
    })
    await flushUntil(
      () =>
        container.querySelector('[aria-label="Nine-point grid results"]') !== null
    )
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <LocationVisibilityView
            projectId={PROJECT}
            locationId={LOCATION}
            mode="ai"
          />
        </QueryClientProvider>
      )
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("LLM Visibility")
    )
    expect(fetchCalls.length > 0).toBe(true)
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    root.unmount()
    client.clear()
  })

  test("explicit Start posts the frozen estimate once", async () => {
    installVisibilityFetch(baseScenario())
    const { root, container, client } = await mountVisibility()
    await flushUntil(() => {
      const candidate = [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("Start run")
      ) as HTMLButtonElement | undefined
      return candidate !== undefined && !candidate.disabled
    })
    await act(async () => {
      press(buttonByText(container, "Start run"))
      await flushTestDom()
      await flushTestDom()
    })
    const posts = fetchCalls.filter((call) => call.method === "POST")
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toContain(`/locations/${LOCATION}/runs`)
    expect(posts[0].body).toEqual({ radius_m: 5000, expected_credits: 27 })
    root.unmount()
    client.clear()
  })
})

describe("run history helpers", () => {
  test("pagination windows clamp to the backend bounds", () => {
    expect(normalizeRunHistoryWindow(20, 0)).toEqual({ limit: 20, offset: 0 })
    expect(normalizeRunHistoryWindow(0, -5)).toEqual({
      limit: 1,
      offset: 0,
    })
    expect(normalizeRunHistoryWindow(500, 3)).toEqual({
      limit: 100,
      offset: 3,
    })
    expect(normalizeRunHistoryWindow(NaN, NaN)).toEqual({
      limit: 20,
      offset: 0,
    })
  })

  test("saved radius reads the stored column and ignores junk", () => {
    const saved = Object.assign(makeLocation(), { radius_m: 3000 })
    expect(locationSavedRadiusM(saved)).toBe(3000)
    expect(locationSavedRadiusM(makeLocation())).toBe(null)
    const junk = Object.assign(makeLocation(), { radius_m: "far" })
    expect(locationSavedRadiusM(junk)).toBe(null)
  })

  test("run summaries project the frozen shape", () => {
    const summary = locationMapsRunSummaryOfRun(
      makeRun({ queries: ["a", "b"] })
    )
    expect(summary.query_count).toBe(2)
    expect(summary.total_cells).toBe(18)
    expect(summary.status).toBe("completed")
  })

  test("history options read as stored metadata", () => {
    expect(
      describeRunHistoryOption({
        status: "failed",
        query_count: 2,
        radius_m: 3000,
        created_at: "2026-09-01T00:00:00Z",
      })
    ).toContain("failed · 2 queries · 3.0 km")
  })
})

describe("run history content", () => {
  async function mountVisibility() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <LocationVisibilityView projectId={PROJECT} locationId={LOCATION} />
        </QueryClientProvider>
      )
      await flushTestDom()
    })
    return { root, container, client }
  }

  function scenario(): MapsScenario {
    const run = makeRun()
    return {
      locations: { [LOCATION]: makeLocation() },
      latest: { [LOCATION]: run },
      runs: { "run-1": run },
      history: [
        makeHistoryItem(),
        makeHistoryItem({
          id: "run-0",
          status: "failed",
          radius_m: 3000,
          query_count: 2,
          total_cells: 18,
          created_at: "2026-09-01T00:00:00Z",
          error: "provider outage",
        }),
      ],
    }
  }

  test("picker lists every stored run newest first without POSTing", async () => {
    installVisibilityFetch(scenario())
    const { root, container, client } = await mountVisibility()
    await flushUntil(
      () =>
        container.querySelector('select[aria-label="Selected run"]') !== null
    )
    const select = container.querySelector(
      'select[aria-label="Selected run"]'
    ) as HTMLSelectElement
    expect(select.textContent).toContain("completed · 1 query · 5.0 km")
    expect(select.textContent).toContain("failed")
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    root.unmount()
    client.clear()
  })

  test("selecting an old run shows its frozen snapshot, never reruns", async () => {
    const old = makeRun({
      id: "run-0",
      status: "failed",
      radius_m: 3000,
      queries: ["espresso", "pastry"],
      error: "provider outage",
    })
    installVisibilityFetch({ ...scenario(), runs: { "run-1": makeRun(), "run-0": old } })
    const { root, container, client } = await mountVisibility()
    await flushUntil(
      () =>
        container.querySelector('select[aria-label="Selected run"]') !== null
    )
    const select = container.querySelector(
      'select[aria-label="Selected run"]'
    ) as HTMLSelectElement
    await act(async () => {
      select.value = "run-0"
      select.dispatchEvent(new Event("change", { bubbles: true }))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("3.0 km radius")
    )
    expect(document.body.textContent).toContain("3.0 km")
    expect(document.body.textContent?.includes("Saved run failed")).toBe(false)
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    expect(
      fetchCalls.some(
        (call) => call.method === "GET" && call.url.includes("/runs/run-0")
      )
    ).toBe(true)
    root.unmount()
    client.clear()
  })

  test("latest active run blocks a new start while an old run is selected", async () => {
    const latest = makeRun({ id: "run-9", status: "running", radius_m: 5000 })
    const old = makeRun({
      id: "run-0",
      status: "failed",
      radius_m: 3000,
      queries: ["espresso", "pastry"],
      error: "provider outage",
    })
    installVisibilityFetch({
      locations: { [LOCATION]: makeLocation() },
      latest: { [LOCATION]: latest },
      runs: { "run-9": latest, "run-0": old },
      history: [
        makeHistoryItem({ id: "run-9", status: "running" }),
        makeHistoryItem({
          id: "run-0",
          status: "failed",
          radius_m: 3000,
          query_count: 2,
          total_cells: 18,
          created_at: "2026-09-01T00:00:00Z",
          error: "provider outage",
        }),
      ],
    })
    const { root, container, client } = await mountVisibility()
    await flushUntil(
      () =>
        container.querySelector('select[aria-label="Selected run"]') !== null
    )
    const select = container.querySelector(
      'select[aria-label="Selected run"]'
    ) as HTMLSelectElement
    await act(async () => {
      select.value = "run-0"
      select.dispatchEvent(new Event("change", { bubbles: true }))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("3.0 km radius")
    )
    const start = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Start run")
    ) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(document.body.textContent).toContain("already queued or running")
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    root.unmount()
    client.clear()
  })

  test("seven queries price in full with no cap", async () => {
    const location = makeLocation({
      queries: Array.from({ length: 7 }, (_, index) =>
        mapQuery(`saved-${index}`)
      ),
    })
    const run = makeRun()
    installVisibilityFetch({
      locations: { [LOCATION]: location },
      latest: { [LOCATION]: run },
      runs: { "run-1": run },
      history: [makeHistoryItem()],
    })
    const { root, client } = await mountVisibility()
    await flushUntil(
      () =>
        document.body.textContent?.includes("Start run · 189 credits") ?? false
    )
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    root.unmount()
    client.clear()
  })

  test("stored creation radius seeds the first new run", async () => {
    const location = Object.assign(makeLocation(), { radius_m: 2500 })
    installVisibilityFetch({
      locations: { [LOCATION]: location },
      latest: { [LOCATION]: null },
      runs: {},
      history: [],
    })
    const { root, container, client } = await mountVisibility()
    await flushUntil(
      () =>
        [...document.querySelectorAll("button")].some((button) =>
          button.title.includes("2.5 km radius")
        )
    )
    const start = [...container.querySelectorAll("button")].find((button) =>
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
          call.method === "POST" && call.url.endsWith(`/locations/${LOCATION}/runs`)
      )
    )
    const posted = fetchCalls.find(
      (call) =>
        call.method === "POST" && call.url.endsWith(`/locations/${LOCATION}/runs`)
    )!
    expect(posted.body).toEqual({ radius_m: 2500, expected_credits: 27 })
    root.unmount()
    client.clear()
  })

  test("missing historical run errors without substituting the latest", async () => {
    const latest = makeRun({ id: "run-9", radius_m: 5000 })
    installVisibilityFetch({
      locations: { [LOCATION]: makeLocation() },
      latest: { [LOCATION]: latest },
      runs: { "run-9": latest },
      history: [
        makeHistoryItem({ id: "run-9" }),
        makeHistoryItem({ id: "run-8", status: "failed" }),
      ],
      failRuns: ["run-8"],
    })
    const { root, container, client } = await mountVisibility()
    await flushUntil(
      () =>
        container.querySelector('select[aria-label="Selected run"]') !== null
    )
    const select = container.querySelector(
      'select[aria-label="Selected run"]'
    ) as HTMLSelectElement
    await act(async () => {
      select.value = "run-8"
      select.dispatchEvent(new Event("change", { bubbles: true }))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("saved run missing")
    )
    expect(document.body.textContent).toContain("Saved run unavailable.")
    expect(
      container.querySelector('[aria-label="Nine-point grid results"]')
    ).toBe(null)
    expect(document.body.textContent?.includes("No runs yet for this location")).toBe(
      false
    )
    expect(document.body.textContent).toContain("Call outcomes")
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)
    root.unmount()
    client.clear()
  })

  test("started session run polls from queued to completed without reselecting", async () => {
    environmentManager.setIsServer(() => false)
    const scenario: MapsScenario = {
      locations: { [LOCATION]: makeLocation() },
      latest: { [LOCATION]: null },
      runs: {
        "run-9": makeRun({
          id: "run-9",
          status: "queued",
          cells: [],
        }),
      },
      history: [],
    }
    installVisibilityFetch(scenario)
    const { root, container, client } = await mountVisibility()
    await flushUntil(() => {
      const candidate = [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Start run")
      ) as HTMLButtonElement | undefined
      return candidate !== undefined && !candidate.disabled
    })
    await act(async () => {
      press(buttonByText(container, "Start run"))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      container.querySelector('[aria-label="Nine-point grid results"]') !== null
    )
    expect(
      container.querySelector('[aria-label="Nine-point grid results"]') !== null
    ).toBe(true)
    scenario.runs["run-9"] = makeRun({
      id: "run-9",
      status: "completed",
      cells: [makeCell(0, 0, { rank: 3 })],
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("Avg. rank \u22483.0") ?? false
    )
    expect(document.body.textContent).toContain("1/1 found")
    expect(fetchCalls.filter((call) => call.method === "POST")).toHaveLength(1)
    environmentManager.setIsServer(() => true)
    root.unmount()
    client.clear()
  })

  test("read-only viewers get no paid start", async () => {
    const run = makeRun({ cells: [makeCell(0, 0, { rank: 3 })] })
    installVisibilityFetch({
      locations: { [LOCATION]: makeLocation() },
      latest: { [LOCATION]: run },
      runs: { "run-1": run },
      history: [makeHistoryItem()],
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <LocationWorkspaceProvider
            workspace={{
              projectId: PROJECT,
              location: makeLocation(),
              canManage: false,
              websiteScope: null,
              websiteScopeRevisions: [],
            }}
          >
            <LocationVisibilityView projectId={PROJECT} locationId={LOCATION} />
          </LocationWorkspaceProvider>,
        </QueryClientProvider>,
      )
      await flushTestDom()
    })
    await flushUntil(() =>
      container.querySelector('[aria-label="Nine-point grid results"]') !== null
    )
    expect(document.body.textContent).toContain(
      "Only organization owners can start a Maps run."
    )
    expect(document.body.textContent?.includes("Start run")).toBe(false)
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    root.unmount()
    client.clear()
  })

  test("location switch isolates stored runs per location", async () => {
    const otherId = "loc-b"
    const other = makeLocation({
      id: otherId,
      project_id: PROJECT,
      name: "Bakery",
    })
    installVisibilityFetch({
      locations: { [LOCATION]: makeLocation(), [otherId]: other },
      latest: { [LOCATION]: makeRun(), [otherId]: null },
      runs: { "run-1": makeRun() },
      history: [makeHistoryItem()],
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <LocationVisibilityView projectId={PROJECT} locationId={otherId} />
        </QueryClientProvider>
      )
      await flushTestDom()
    })
    await flushUntil(
      () => document.body.textContent?.includes("No runs yet for this location") ?? false
    )
    expect(document.body.textContent?.includes("Roastery")).toBe(false)
    expect(container.querySelector('[aria-label="Nine-point grid results"]')).toBe(null)
    expect(
      fetchCalls.some((call) => call.url.includes(`/locations/${otherId}/`))
    ).toBe(true)
    expect(
      fetchCalls.some((call) => call.url.includes(`/locations/${LOCATION}/`))
    ).toBe(false)
    root.unmount()
    client.clear()
  })
})

describe("query accordions", () => {
  function accordionScenario(): MapsScenario {
    const run = makeRun({
      queries: ["coffee", "pastry", "cake", "tea"],
      cells: [
        makeCell(0, 0, { rank: 3 }),
        makeCell(0, 1, {
          call_status: "success_nonempty",
          match_status: "absent",
          rank: null,
        }),
        makeCell(0, 2, {
          call_status: "pending",
          match_status: "unknown",
          rank: null,
        }),
        makeCell(0, 3, {
          call_status: "request_failed",
          match_status: "unknown",
          rank: null,
          error: null,
        }),
        ...Array.from({ length: 8 }, (_, offset) =>
          makeCell(offset + 1, 0, { rank: 2 })
        ),
      ],
    })
    return {
      locations: { [LOCATION]: makeLocation() },
      latest: { [LOCATION]: run },
      runs: { "run-1": run },
      history: [makeHistoryItem({ query_count: 4, total_cells: 36 })],
      pointDetails: {
        "run-1:0": {
          run_id: "run-1",
          point_index: 0,
          target_place_id: "ChIJ1",
          queries: [
            {
              query_index: 0,
              query: "coffee",
              call_status: "success_nonempty",
              match_status: "found",
              rank: 3,
              error: null,
              places: [
                {
                  position: 1,
                  title: "Rival Roasters",
                  address: "Side St",
                  place_id: "ChIJ-rival",
                  rating: 4.5,
                  rating_count: 120,
                  is_target: false,
                },
                {
                  position: 3,
                  title: "Roastery",
                  address: "Main St",
                  place_id: "ChIJ1",
                  rating: 4.8,
                  rating_count: 200,
                  is_target: true,
                },
              ],
            },
            {
              query_index: 1,
              query: "pastry",
              call_status: "success_nonempty",
              match_status: "absent",
              rank: null,
              error: null,
              places: [
                {
                  position: 1,
                  title: "Rival Roasters",
                  address: "Side St",
                  place_id: "ChIJ-rival",
                  rating: null,
                  rating_count: null,
                  is_target: false,
                },
              ],
            },
            {
              query_index: 2,
              query: "cake",
              call_status: "pending",
              match_status: "unknown",
              rank: null,
              error: null,
              places: [],
            },
            {
              query_index: 3,
              query: "tea",
              call_status: "request_failed",
              match_status: "unknown",
              rank: null,
              error: null,
              places: [],
            },
          ],
        },
      },
    }
  }

  async function mountVisibility() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <LocationVisibilityView projectId={PROJECT} locationId={LOCATION} />
        </QueryClientProvider>
      )
      await flushTestDom()
    })
    return { root, container, client }
  }

  function queryButton(container: ParentNode, label: string) {
    const found = [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === label
    )
    if (!found) throw new Error(`query accordion "${label}" not found`)
    return found as HTMLButtonElement
  }

  test("rows show stored ranks with honest pending and failure states", async () => {
    installVisibilityFetch(accordionScenario())
    const { root, container, client } = await mountVisibility()
    await flushUntil(
      () =>
        container.querySelector('[aria-label="coffee results at point A"]') !==
        null
    )
    const rows = document.body.textContent ?? ""
    expect(rows).toContain("#3")
    expect(rows).toContain("Not found")
    expect(rows).toContain("Pending")
    expect(rows).toContain("Failed")
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    root.unmount()
    client.clear()
  })

  test("expanding a row reads stored evidence once and never POSTs", async () => {
    installVisibilityFetch(accordionScenario())
    const { root, container, client } = await mountVisibility()
    await flushUntil(
      () =>
        container.querySelector('[aria-label="coffee results at point A"]') !==
        null
    )
    await act(async () => {
      press(queryButton(container, "coffee results at point A"))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("Rival Roasters")
    )
    expect(document.body.textContent).toContain("Roastery")
    const pointReads = fetchCalls.filter((call) =>
      call.url.includes("/points/0")
    )
    expect(pointReads).toHaveLength(1)
    expect(pointReads[0].method).toBe("GET")
    await act(async () => {
      press(queryButton(container, "pastry results at point A"))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("Your business is not in this list")
    )
    expect(
      fetchCalls.filter((call) => call.url.includes("/points/0"))
    ).toHaveLength(1)
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    root.unmount()
    client.clear()
  })

  test("pending and failed queries report honest stored diagnostics", async () => {
    installVisibilityFetch(accordionScenario())
    const { root, container, client } = await mountVisibility()
    await flushUntil(
      () =>
        container.querySelector('[aria-label="cake results at point A"]') !==
        null
    )
    await act(async () => {
      press(queryButton(container, "cake results at point A"))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("No response yet")
    )
    await act(async () => {
      press(queryButton(container, "tea results at point A"))
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() =>
      document.body.textContent?.includes("no specific cause was stored")
    )
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])
    root.unmount()
    client.clear()
  })
})

describe("visibility mode panels", () => {
  function renderMode(
    mode?: "maps" | "ai",
    initialAuditId?: string
  ) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    try {
      return renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <LocationVisibilityView
            projectId="proj-1"
            locationId="loc-1"
            initialAuditId={initialAuditId}
            mode={mode}
          />
        </QueryClientProvider>
      )
    } finally {
      client.clear()
    }
  }

  test("maps mode renders cards without a nested tab shell", () => {
    const html = renderMode("maps")
    expect(html.includes('role="tablist"')).toBe(false)
    expect(html.includes(">Maps<")).toBe(false)
    expect(html.includes("<canvas")).toBe(false)
  })

  test("ai mode reuses the existing AI visibility view", () => {
    const html = renderMode("ai")
    expect(html).toContain("LLM Visibility")
    expect(html.includes('role="tablist"')).toBe(false)
  })

  test("mode defaults to audit deep links, else maps", () => {
    expect(renderMode(undefined, "audit-1")).toContain("LLM Visibility")
    expect(renderMode(undefined).includes("LLM Visibility")).toBe(false)
  })
})
