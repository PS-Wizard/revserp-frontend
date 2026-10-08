import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { LocationMapsCompetitorsPage } from "~/components/locations/location-maps-competitors-page"
import { LocationVisibilityView } from "~/components/locations/location-visibility-view"
import { LocationWorkspaceView } from "~/components/locations/location-workspace-view"
import { LocationWorkspaceProvider } from "~/lib/location-workspace"
import {
  LOCAL_SEO_POINT_COUNT,
  localSeoLatestRunQueryKey,
  localSeoLocationQueryKey,
  localSeoRunCompetitorsQueryKey,
  localSeoRunPointCompetitorsQueryKey,
  type LocalSeoCell,
  type LocalSeoLocation,
  type LocalSeoRun,
  type LocalSeoRunCompetitors,
  type LocalSeoRunCompetitor,
} from "~/lib/local-seo-api"

installTestDom()

const PROJECT = "proj-1"
const LOCATION = "loc-1"

const SECTORS = ["NW", "N", "NE", "W", "centre", "E", "SW", "S", "SE"] as const

function makeLocation(): LocalSeoLocation {
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
    queries: [],
  }
}

function makeCells(): LocalSeoCell[] {
  return Array.from({ length: LOCAL_SEO_POINT_COUNT }, (_, pointIndex) => ({
    query_index: 0,
    point_index: pointIndex,
    latitude: 27.7 + pointIndex * 0.001,
    longitude: 85.3 + pointIndex * 0.001,
    distance_m: pointIndex * 100,
    ring: pointIndex === 4 ? "centre" : pointIndex % 2 === 0 ? "corner" : "edge",
    sector: SECTORS[pointIndex],
    call_status: "success_nonempty",
    match_status: "found",
    rank: 3,
    credits: 3,
    credit_known: true,
    error: null,
  }))
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
    cells: makeCells(),
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

function seedClient(client: QueryClient, run: LocalSeoRun) {
  client.setQueryData(
    localSeoLocationQueryKey(PROJECT, LOCATION),
    makeLocation()
  )
  client.setQueryData(localSeoLatestRunQueryKey(PROJECT, LOCATION), run)
  client.setQueryData(
    localSeoRunCompetitorsQueryKey(
      PROJECT,
      LOCATION,
      run.id,
      run.status,
      run.completed_cells ?? null
    ),
    makeCompetitors({ run_id: run.id })
  )
}

function renderPage(run: LocalSeoRun) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  seedClient(client, run)
  try {
    return renderToStaticMarkup(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <LocationMapsCompetitorsPage projectId={PROJECT} locationId={LOCATION} />
        </QueryClientProvider>
      </MemoryRouter>
    )
  } finally {
    client.clear()
  }
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("combined local maps and competitors page", () => {
  test("one run picker, one map, nine grid cards, competitors with an All points filter", () => {
    const html = renderPage(makeRun())
    expect(html.match(/aria-label="Selected run"/g)).toHaveLength(1)
    expect(html.match(/Map of the sampled location/g)).toHaveLength(1)
    expect(html).toContain("h-[55vh]")
    expect(html.includes("h-[80vh]")).toBe(false)
    expect(html.includes("Focus point")).toBe(false)
    expect(html.includes("focused</button>")).toBe(false)
    expect(html).toContain("Nine-point grid results")
    expect(html).toContain("Competitor scope")
    expect(html).toContain("All points")
    expect(html).toContain("Latest · completed")
    expect(html).toContain("5.0 km radius")
  })

  test("no duplicate history picker", () => {
    const html = renderPage(makeRun())
    expect(html.match(/aria-label="Selected run"/g)).toHaveLength(1)
  })

  test("old local competitors navigation renders the combined page", () => {
    const run = makeRun()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    seedClient(client, run)
    const workspace = {
      projectId: PROJECT,
      location: makeLocation(),
      canManage: true,
      websiteScope: null,
      websiteScopeRevisions: [],
    }
    try {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <LocationWorkspaceProvider workspace={workspace}>
              <LocationWorkspaceView
                view="competitors"
                visibilityMode="maps"
                auditTab="overview"
                currentCrawlId={null}
                onAuditTabChange={() => undefined}
              />
            </LocationWorkspaceProvider>
          </QueryClientProvider>
        </MemoryRouter>
      )
      expect(html).toContain("Nine-point grid results")
      expect(html).toContain("All points")
      expect(html.match(/aria-label="Selected run"/g)).toHaveLength(1)
    } finally {
      client.clear()
    }
  })

  test("maps visibility mode renders the combined page", () => {
    const run = makeRun()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    seedClient(client, run)
    try {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <LocationVisibilityView
              projectId={PROJECT}
              locationId={LOCATION}
              mode="maps"
            />
          </QueryClientProvider>
        </MemoryRouter>
      )
      expect(html).toContain("Nine-point grid results")
      expect(html).toContain("All points")
    } finally {
      client.clear()
    }
  })
})

describe("combined page shared point selection", () => {
  function installPageFetch(run: LocalSeoRun) {
    const original = globalThis.fetch
    ;(globalThis as Record<string, unknown>).fetch = (async (
      input: string | URL | Request
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.includes("/points/") && url.includes("/competitors")) {
        return Response.json(makeCompetitors({ run_id: run.id, point_index: 4 }))
      }
      if (url.includes("/competitors")) {
        return Response.json(makeCompetitors({ run_id: run.id }))
      }
      if (url.includes("/runs/latest")) return Response.json(run)
      if (url.includes(`/locations/${LOCATION}`) && !url.includes("/runs")) {
        return Response.json(makeLocation())
      }
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })
    }) as typeof fetch
    return () => {
      globalThis.fetch = original
    }
  }

  test("competitor selector focuses the matching grid card", async () => {
    const run = makeRun()
    const restoreFetch = installPageFetch(run)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    seedClient(client, run)
    client.setQueryData(
      localSeoRunPointCompetitorsQueryKey(
        PROJECT,
        LOCATION,
        run.id,
        4,
        run.status,
        run.completed_cells ?? null
      ),
      makeCompetitors({ run_id: run.id, point_index: 4 })
    )
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <QueryClientProvider client={client}>
              <LocationMapsCompetitorsPage
                projectId={PROJECT}
                locationId={LOCATION}
              />
            </QueryClientProvider>
          </MemoryRouter>
        )
        await flushTestDom()
        await flushTestDom()
      })
      expect(document.body.textContent).toContain("Whole run competitors")
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
      expect(document.body.textContent).toContain("Point E competitors")
      expect(scope.value).toBe("4")
      const focusedCard = container.querySelector(
        '[aria-label="Nine-point grid results"] > .ring-2'
      )
      expect(focusedCard === null).toBe(false)
      expect(document.body.textContent?.includes("Focus point")).toBe(false)
      await act(async () => {
        scope.value = "whole"
        scope.dispatchEvent(new Event("change", { bubbles: true }))
        await flushTestDom()
        await flushTestDom()
      })
      expect(document.body.textContent).toContain("Whole run competitors")
    } finally {
      root.unmount()
      client.clear()
      restoreFetch()
    }
})
})

describe("combined page shared run", () => {
  test("history pick drives the map section, grid, and competitors from one saved run", async () => {
    const latest = makeRun()
    const saved = makeRun({ id: "run-2", queries: ["tea"] })
    const runsById: Record<string, LocalSeoRun> = {
      [latest.id]: latest,
      [saved.id]: saved,
    }
    const fetchCalls: string[] = []
    const original = globalThis.fetch
    ;(globalThis as Record<string, unknown>).fetch = (async (
      input: string | URL | Request
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      fetchCalls.push(url)
      if (url.includes("/points/") && url.includes("/competitors")) {
        const runId = url.includes(saved.id) ? saved.id : latest.id
        return Response.json(
          makeCompetitors({ run_id: runId, point_index: 4 })
        )
      }
      if (url.includes("/competitors")) {
        const runId = url.includes(saved.id) ? saved.id : latest.id
        return Response.json(makeCompetitors({ run_id: runId }))
      }
      if (url.includes("/runs/latest")) return Response.json(latest)
      const singleMatch = url.match(/\/runs\/([^/?]+)/)
      if (singleMatch && runsById[singleMatch[1]]) {
        return Response.json(runsById[singleMatch[1]])
      }
      if (url.includes("/locations/") && url.includes("/runs?")) {
        return Response.json({
          total: 2,
          runs: [
            {
              id: saved.id,
              status: saved.status,
              radius_m: saved.radius_m,
              expected_credits: saved.expected_credits,
              credits_used: saved.credits_used,
              query_count: saved.queries.length,
              grid_point_count: LOCAL_SEO_POINT_COUNT,
              total_cells: saved.queries.length * LOCAL_SEO_POINT_COUNT,
              created_at: "2026-01-02T00:00:00Z",
            },
            {
              id: latest.id,
              status: latest.status,
              radius_m: latest.radius_m,
              expected_credits: latest.expected_credits,
              credits_used: latest.credits_used,
              query_count: latest.queries.length,
              grid_point_count: LOCAL_SEO_POINT_COUNT,
              total_cells: latest.queries.length * LOCAL_SEO_POINT_COUNT,
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
        })
      }
      if (url.includes(`/locations/${LOCATION}`)) {
        return Response.json(makeLocation())
      }
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })
    }) as typeof fetch
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    seedClient(client, latest)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <QueryClientProvider client={client}>
              <LocationMapsCompetitorsPage
                projectId={PROJECT}
                locationId={LOCATION}
              />
            </QueryClientProvider>
          </MemoryRouter>
        )
        await flushTestDom()
        await flushTestDom()
      })
      expect(document.body.textContent).toContain("5.0 km radius")
      const picker = container.querySelector(
        'select[aria-label="Selected run"]'
      ) as HTMLSelectElement | null
      if (!picker) throw new Error("run picker missing")
      for (let i = 0; i < 40; i++) {
        const hasSaved = Array.from(picker.options).some(
          (option) => option.value === saved.id
        )
        if (hasSaved) break
        await act(async () => {
          await flushTestDom()
        })
      }
      expect(
        Array.from(picker.options).map((option) => option.value)
      ).toContain(saved.id)
      await act(async () => {
        picker.value = saved.id
        picker.dispatchEvent(new Event("change", { bubbles: true }))
        await flushTestDom()
        await flushTestDom()
      })
      for (let i = 0; i < 40; i++) {
        if (document.body.textContent?.includes("tea")) break
        await act(async () => {
          await flushTestDom()
        })
      }
      expect(document.body.textContent).toContain("tea")
      expect(document.body.textContent?.includes("coffee")).toBe(false)
      expect(
        fetchCalls.some((url) => url.includes(`/runs/${saved.id}/competitors`))
      ).toBe(true)
      expect(container.querySelectorAll('select[aria-label="Selected run"]').length).toBe(1)
    } finally {
      root.unmount()
      client.clear()
      globalThis.fetch = original
    }
  })
})
