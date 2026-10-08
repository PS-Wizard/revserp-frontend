import { describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { StaticRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { installTestDom } from "~/lib/dom-test-setup"
import {
  describeLocalSeoReportRunState,
  LocalSeoMapLookupEvidence,
  LocalSeoMapReportContent,
  LocalSeoPointResultsPanel,
  LocalSeoRunCompetitorsCard,
  type LocalSeoMapReportTab,
} from "~/components/local-seo-map-report"
import type {
  LocalSeoCell,
  LocalSeoListingLookup,
  LocalSeoLocation,
  LocalSeoPointDetails,
  LocalSeoRunCompetitor,
  LocalSeoRunCompetitors,
  LocalSeoPointPlace,
  LocalSeoPointQuery,
  LocalSeoRun,
} from "~/lib/local-seo-api"

function makeLocation(
  overrides: Partial<LocalSeoLocation> = {}
): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: "proj-1",
    name: "Roastery",
    place_id: "ChIJ1",
    address: "Main St",
    locality: "Downtown",
    localities: [],
    services: [],
    latitude: 27.7,
    longitude: 85.3,
    queries: [],
    ...overrides,
  }
}

function makeCell(overrides: Partial<LocalSeoCell> = {}): LocalSeoCell {
  return {
    query_index: 0,
    point_index: 0,
    latitude: 27.7,
    longitude: 85.3,
    distance_m: 0,
    ring: "corner",
    sector: "NW",
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
    location_id: "loc-1",
    status: "completed",
    radius_m: 5000,
    expected_credits: 135,
    credits_used: 135,
    retry_credits: 0,
    queries: ["coffee", "tea"],
    cells: [],
    ...overrides,
  }
}

function renderReport({
  tab,
  location = makeLocation(),
  latestRun = null,
  runPending = false,
  runError = null,
  lookup = null,
  lookupPending = false,
  focusedPointIndex = null,
  onClearPointFocus,
  onSelectPoint,
  pointDetails = null,
  pointDetailsPending = false,
  pointDetailsError = null,
  competitors = null,
  competitorsPending = false,
  competitorsError = null,
  pointCompetitors = null,
  pointCompetitorsPending = false,
  pointCompetitorsError = null,
  onSelectCompetitorScope,
  onShowAllCompetitors,
}: {
  tab: LocalSeoMapReportTab
  location?: LocalSeoLocation
  latestRun?: LocalSeoRun | null
  runPending?: boolean
  runError?: string | null
  lookup?: LocalSeoListingLookup | null
  lookupPending?: boolean
  focusedPointIndex?: number | null
  onClearPointFocus?: () => void
  onSelectPoint?: (pointIndex: number) => void
  pointDetails?: LocalSeoPointDetails | null
  pointDetailsPending?: boolean
  pointDetailsError?: string | null
  competitors?: LocalSeoRunCompetitors | null
  competitorsPending?: boolean
  competitorsError?: string | null
  pointCompetitors?: LocalSeoRunCompetitors | null
  pointCompetitorsPending?: boolean
  pointCompetitorsError?: string | null
  onSelectCompetitorScope?: (pointIndex: number | null) => void
  onShowAllCompetitors?: () => void
}) {
  const client = new QueryClient()
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <StaticRouter location="/app">
        <LocalSeoMapReportContent
          projectId="proj-1"
          location={location}
          latestRun={latestRun}
          runPending={runPending}
          runError={runError}
          lookup={lookup}
          lookupPending={lookupPending}
          focusedPointIndex={focusedPointIndex}
          onClearPointFocus={onClearPointFocus}
          onSelectPoint={onSelectPoint}
          pointDetails={pointDetails}
          pointDetailsPending={pointDetailsPending}
          pointDetailsError={pointDetailsError}
          competitors={competitors}
          competitorsPending={competitorsPending}
          competitorsError={competitorsError}
          pointCompetitors={pointCompetitors}
          pointCompetitorsPending={pointCompetitorsPending}
          pointCompetitorsError={pointCompetitorsError}
          onSelectCompetitorScope={onSelectCompetitorScope}
          onShowAllCompetitors={onShowAllCompetitors}
          tab={tab}
        />
      </StaticRouter>
    </QueryClientProvider>
  )
  client.clear()
  return html
}

describe("map lookup evidence", () => {
  test("reads the row's own expected cost, not a constant", () => {
    const html = renderToStaticMarkup(
      <LocalSeoMapLookupEvidence
        lookup={{
          id: "lookup-old",
          status: "completed",
          expected_credits: 1,
          credits_used: 1,
          reserved_credits: 0,
          credit_known: true,
          error: null,
          candidates: [],
        }}
      />
    )
    expect(html).toContain("expected 1 credit")
  })

  test("names reused evidence and unconfirmed charges", () => {
    const html = renderToStaticMarkup(
      <LocalSeoMapLookupEvidence
        lookup={{
          id: "lookup-new",
          status: "uncertain",
          expected_credits: 3,
          credits_used: 0,
          reserved_credits: 3,
          credit_known: false,
          error: null,
          candidates: [],
          deduplicated: true,
        }}
      />
    )
    expect(html).toContain("no new charge")
    expect(html).toContain("unconfirmed")
  })

  test("uncertain copy never implies automatic settlement", () => {
    const html = renderToStaticMarkup(
      <LocalSeoMapLookupEvidence
        lookup={{
          id: "lookup-uncertain",
          status: "uncertain",
          expected_credits: 3,
          credits_used: 0,
          reserved_credits: 3,
          credit_known: false,
          error: null,
          candidates: [],
        }}
      />
    )
    expect(html.toLowerCase().includes("settle automatically")).toBe(false)
    expect(html).toContain("nothing was retried automatically")
  })
})

describe("report run state", () => {
  test("pending never reads as no run", () => {
    expect(
      describeLocalSeoReportRunState({
        runPending: true,
        runError: null,
        latestRun: null,
      })
    ).toBe("pending")
  })

  test("errors never read as no run", () => {
    expect(
      describeLocalSeoReportRunState({
        runPending: false,
        runError: "Could not load the latest run",
        latestRun: null,
      })
    ).toBe("error")
  })

  test("empty only when settled with no run", () => {
    expect(
      describeLocalSeoReportRunState({
        runPending: false,
        runError: null,
        latestRun: null,
      })
    ).toBe("empty")
  })

  test("ready when a run exists", () => {
    expect(
      describeLocalSeoReportRunState({
        runPending: false,
        runError: null,
        latestRun: makeRun(),
      })
    ).toBe("ready")
  })
})

describe("report content overview", () => {
  const cells = [
    makeCell({ point_index: 4, ring: "centre", sector: "centre", rank: 1 }),
    makeCell({ point_index: 0, ring: "corner", sector: "NW", rank: 3 }),
    makeCell({
      point_index: 1,
      ring: "edge",
      sector: "N",
      call_status: "success_empty",
      match_status: "absent",
      rank: null,
    }),
    makeCell({
      point_index: 2,
      ring: "edge",
      sector: "NE",
      call_status: "request_failed",
      match_status: "unknown",
      rank: null,
    }),
  ]

  test("summarizes the frozen run without embedding a second map", () => {
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({ queries: ["coffee"], cells }),
    })
    expect(html).toContain("5.0 km")
    // Found-only mean over the two ranked cells: (1 + 3) / 2.
    expect(html).toContain("2.0")
    expect(html).toContain("2 found")
    expect(html).toContain("1 absent")
    expect(html).toContain("1 failed")
    expect(html).toContain("Nine-point visibility board")
    expect(html).toContain("North-west sampled point: mean rank 3.0")
    expect(html).toContain("Business centre sampled point: mean rank 1.0")
    expect(html).toContain("North sampled point: mean rank Absent")
    expect(html).toContain("A · NW")
    expect(html).toContain("E · Centre")
    expect(html).toContain(
      "A NW · B N · C NE · D W · E Centre · F E · G SW · H S · I SE"
    )
    expect(html.includes("Recorded sampling map")).toBe(false)
    expect(html.includes("reconstructed visual guides")).toBe(false)
  })

  test("loading, error, and empty states stay distinct", () => {
    expect(renderReport({ tab: "overview", runPending: true })).toContain(
      'data-slot="skeleton"'
    )
    expect(
      renderReport({
        tab: "overview",
        runError: "Could not load the latest run",
      })
    ).toContain("Could not load the latest run")
    expect(renderReport({ tab: "overview" })).toContain("No runs yet")
  })

  test("no sheet, dialog, or backdrop is rendered", () => {
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({ queries: ["coffee"], cells }),
    })
    expect(html.includes('role="dialog"')).toBe(false)
    expect(html.includes("backdrop")).toBe(false)
    expect(html.includes('data-slot="sheet-content"')).toBe(false)
  })
})

describe("report content listing", () => {
  test("shows identity, recorded lookup cost, and an explicit free unbind", () => {
    const html = renderReport({
      tab: "listing",
      lookup: {
        id: "lookup-1",
        status: "completed",
        expected_credits: 1,
        credits_used: 1,
        reserved_credits: 0,
        credit_known: true,
        error: null,
        candidates: [],
      },
    })
    expect(html).toContain("Bound")
    expect(html).toContain("ChIJ1")
    expect(html).toContain("expected 1 credit")
    expect(html).toContain("Unbind listing · Free")
    expect(html).toContain("27.70000")
  })

  test("unbound locations never offer unbind and read as place-less", () => {
    const html = renderReport({
      tab: "listing",
      location: makeLocation({ place_id: null }),
    })
    expect(html).toContain("Unbound")
    expect(html).toContain("None")
    expect(html.includes("Unbind listing")).toBe(false)
  })
})

describe("report content run", () => {
  test("shows frozen credits and mismatch warnings without starting anything", () => {
    const html = renderReport({
      tab: "run",
      latestRun: makeRun({
        queries: ["coffee", "tea"],
        radius_m: 5000,
        expected_credits: 135,
        credits_used: 135,
        reserved_credits: 20,
        target_place_id: "ChIJ-other",
        unconfirmed_calls: 2,
      }),
    })
    expect(html).toContain("Frozen queries: coffee · tea")
    expect(html).toContain("Radius: 5000 m")
    expect(html).toContain("Expected 135 · confirmed 135 · 20 held credits")
    expect(html).toContain("different listing")
    expect(html).toContain("2 unresolved charges")
  })
})

describe("unknown status stays free", () => {
  test("unknown status reads never trigger a provider call", async () => {
    const calls: string[] = []
    const originalFetch = globalThis.fetch
    ;(globalThis as Record<string, unknown>).fetch = (...args: unknown[]) => {
      calls.push(String(args[0]))
      throw new Error("network must stay idle")
    }
    try {
      const { gridFeatureCollection } = await import("~/lib/local-seo-grid-geo")
      const overlay = gridFeatureCollection(
        [
          {
            point_index: 4,
            call_status: "success_nonempty",
            match_status: "unknown",
            rank: null,
          },
        ],
        [85.3, 27.7],
        5000
      )
      expect(overlay.features.length === 9).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(calls).toEqual([])
  })
})

describe("report content focused point", () => {
  function makeQuery(
    overrides: Partial<LocalSeoPointQuery> = {}
  ): LocalSeoPointQuery {
    return {
      query_index: 0,
      query: "coffee",
      call_status: "success_nonempty",
      match_status: "found",
      rank: 1,
      error: null,
      places: [],
      ...overrides,
    }
  }

  function makePlace(
    overrides: Partial<LocalSeoPointPlace> = {}
  ): LocalSeoPointPlace {
    return {
      position: 1,
      title: "Blue Bottle",
      address: "1 Main St",
      place_id: "ChIJ-a",
      rating: null,
      rating_count: null,
      is_target: false,
      ...overrides,
    }
  }

  function makeDetails(
    overrides: Partial<LocalSeoPointDetails> = {}
  ): LocalSeoPointDetails {
    return {
      run_id: "run-1",
      point_index: 0,
      target_place_id: "ChIJ-target",
      queries: [],
      ...overrides,
    }
  }

  function renderFocusedPoint(
    details: LocalSeoPointDetails | null,
    overrides: Partial<Parameters<typeof renderReport>[0]> = {}
  ) {
    return renderReport({
      tab: "overview",
      latestRun: makeRun({ queries: ["coffee"] }),
      focusedPointIndex: 0,
      onClearPointFocus: () => {},
      pointDetails: details,
      ...overrides,
    })
  }

  test("renders every frozen query with its ranked places in provider order", () => {
    const html = renderFocusedPoint(
      makeDetails({
        queries: [
          makeQuery({
            query_index: 0,
            query: "coffee",
            rank: 1,
            places: [
              makePlace({ position: 2, title: "Second Cup", place_id: "ChIJ-2" }),
              makePlace({ position: 1, title: "First Cup", place_id: "ChIJ-1" }),
              makePlace({ position: 3, title: "Third Cup", place_id: "ChIJ-3" }),
            ],
          }),
          makeQuery({ query_index: 1, query: "tea", rank: 4 }),
        ],
      })
    )
    expect(html).toContain("Point A · North-west")
    expect(html).toContain("coffee")
    expect(html).toContain("tea")
    expect(html).toContain("#1")
    expect(html).toContain("#4")
    expect(html.indexOf("Second Cup") < html.indexOf("First Cup")).toBe(
      true
    )
    expect(html.indexOf("First Cup") < html.indexOf("Third Cup")).toBe(
      true
    )
    expect(html).toContain('aria-label="Clear point A"')
  })

  test("marks the frozen target and keeps same-name businesses with different ids apart", () => {
    const html = renderFocusedPoint(
      makeDetails({
        target_place_id: "ChIJ-frozen",
        queries: [
          makeQuery({
            places: [
              makePlace({
                title: "Blue Bottle",
                place_id: "ChIJ-frozen",
                is_target: true,
              }),
              makePlace({ title: "Blue Bottle", place_id: "ChIJ-other" }),
            ],
          }),
        ],
      })
    )
    expect(html.split("Blue Bottle").length - 1).toBe(2)
    expect(html.split("Your business").length - 1).toBe(1)
    expect(html).toContain("ChIJ-frozen")
  })

  test("keeps id-less entries visible and unmarked", () => {
    const html = renderFocusedPoint(
      makeDetails({
        queries: [
          makeQuery({
            places: [makePlace({ title: "Nameless Kiosk", place_id: null })],
          }),
        ],
      })
    )
    expect(html).toContain("Nameless Kiosk")
    expect(html.includes("Your business")).toBe(false)
  })

  test("shows the stored request_failed error instead of an empty list", () => {
    const html = renderFocusedPoint(
      makeDetails({
        queries: [
          makeQuery({
            call_status: "request_failed",
            match_status: "unknown",
            rank: null,
            error: "Serper rejected the request.",
          }),
        ],
      })
    )
    expect(html).toContain("Serper rejected the request.")
    expect(html.includes("The provider returned nothing here.")).toBe(false)
  })

  test("success_empty uses the exact provider-empty copy", () => {
    const html = renderFocusedPoint(
      makeDetails({
        queries: [
          makeQuery({
            call_status: "success_empty",
            match_status: "absent",
            rank: null,
          }),
        ],
      })
    )
    expect(html).toContain("The provider returned nothing here.")
  })

  test("success_nonempty absence lists the places and says the business is missing", () => {
    const html = renderFocusedPoint(
      makeDetails({
        queries: [
          makeQuery({
            match_status: "absent",
            rank: null,
            places: [makePlace({ title: "Rival Roasters" })],
          }),
        ],
      })
    )
    expect(html).toContain("Rival Roasters")
    expect(html).toContain("Your business is not in this list.")
  })

  test("a pending query shows no response instead of an empty result", () => {
    const html = renderFocusedPoint(
      makeDetails({
        queries: [
          makeQuery({
            call_status: "pending",
            match_status: "unknown",
            rank: null,
          }),
        ],
      })
    )
    expect(html).toContain("No response yet.")
  })

  test("an undecodable stored payload surfaces the evidence error, not an empty list", () => {
    const html = renderFocusedPoint(
      makeDetails({
        queries: [
          makeQuery({
            error: "Stored provider results could not be read.",
            places: [],
          }),
        ],
      })
    )
    expect(html).toContain("Stored provider results could not be read.")
    expect(html.includes("The provider returned nothing here.")).toBe(false)
  })

  test("loading shows a skeleton and a fetch error shows its message", () => {
    const loading = renderFocusedPoint(null, { pointDetailsPending: true })
    expect(loading).toContain('data-slot="skeleton"')
    const failed = renderFocusedPoint(null, {
      pointDetailsError: "Could not load point results",
    })
    expect(failed).toContain("Could not load point results")
  })

  test("marks the run's frozen target even after the location is rebound", () => {
    const html = renderFocusedPoint(
      makeDetails({
        target_place_id: "ChIJ-old",
        queries: [
          makeQuery({
            places: [
              makePlace({
                title: "Old Roastery",
                place_id: "ChIJ-old",
                is_target: true,
              }),
              makePlace({ title: "New Roastery", place_id: "ChIJ-new" }),
            ],
          }),
        ],
      }),
      { location: makeLocation({ place_id: "ChIJ-new" }) }
    )
    expect(html).toContain("ChIJ-old")
    expect(html.split("Your business").length - 1).toBe(1)
  })

  test("changing the focused point swaps the evidence for that point", () => {
    const atA = renderFocusedPoint(
      makeDetails({
        point_index: 0,
        queries: [makeQuery({ query: "coffee" })],
      })
    )
    const atE = renderFocusedPoint(
      makeDetails({
        point_index: 4,
        queries: [makeQuery({ query: "matcha" })],
      }),
      { focusedPointIndex: 4 }
    )
    expect(atA).toContain("Point A · North-west")
    expect(atA).toContain("coffee")
    expect(atA.includes("matcha")).toBe(false)
    expect(atE).toContain("Point E · Centre")
    expect(atE).toContain("matcha")
    expect(atE.includes("Point A · North-west")).toBe(false)
  })

  test("no point panel is rendered without a focus", () => {
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({ queries: ["coffee"] }),
    })
    expect(html.includes("Point A · North-west")).toBe(false)
  })
})
describe("report competitors", () => {
  function makeCompetitor(
    overrides: Partial<LocalSeoRunCompetitor> = {},
  ): LocalSeoRunCompetitor {
    return {
      place_id: "ChIJ-a",
      title: "Rival Roasters",
      address: "1 Main St",
      query_points_seen: 5,
      best_rank: 2,
      same_brand_domain: false,
      query_indexes: [0],
      ...overrides,
    }
  }

  function makeCompetitors(
    overrides: Partial<LocalSeoRunCompetitors> = {},
  ): LocalSeoRunCompetitors {
    return {
      run_id: "run-1",
      target_place_id: "ChIJ-target",
      queries: ["coffee", "tea"],
      point_index: null,
      total_query_points: 20,
      contributing_query_points: 18,
      failed_query_points: 1,
      pending_query_points: 1,
      unreadable_query_points: 0,
      idless_entries: 0,
      competitors: [],
      ...overrides,
    }
  }

  function renderCard(props: {
    data?: LocalSeoRunCompetitors | null
    pending?: boolean
    error?: string | null
    locationName?: string | null
    pointIndex?: number | null
  }) {
    return renderToStaticMarkup(
      <LocalSeoRunCompetitorsCard
        data={props.data ?? null}
        pending={props.pending ?? false}
        error={props.error ?? null}
        locationName={props.locationName ?? null}
        pointIndex={props.pointIndex ?? null}
      />,
    )
  }

  test("states coverage against the total, never a bare point count", () => {
    const html = renderCard({
      data: makeCompetitors({
        competitors: [makeCompetitor()],
        idless_entries: 0,
      }),
    })
    expect(html).toContain("Results from 18 of 20 query-points")
    expect(html).toContain("1 failed")
    expect(html).toContain("1 pending")
    expect(html).toContain("No entries omitted without an ID.")
    expect(html).toContain("in 5 of 20 query-points")
    expect(html.includes("of 9")).toBe(false)
  })

  test("keeps backend order, shows seen-once rows, and keeps same names ID-separated", () => {
    const html = renderCard({
      data: makeCompetitors({
        total_query_points: 20,
        contributing_query_points: 20,
        failed_query_points: 0,
        pending_query_points: 0,
        competitors: [
          makeCompetitor({
            place_id: "ChIJ-first",
            title: "Same Name",
            query_points_seen: 8,
            best_rank: 3,
            query_indexes: [0],
          }),
          makeCompetitor({
            place_id: "ChIJ-second",
            title: "Same Name",
            query_points_seen: 1,
            best_rank: null,
            query_indexes: [1],
          }),
        ],
      }),
    })
    expect(html.split("Same Name").length - 1).toBe(2)
    expect(html).toContain("in 1 of 20 query-points")
    expect(html).toContain("No recorded rank")
    expect(html).toContain("coffee")
    expect(html).toContain("tea")
    expect(html.indexOf("Same Name") < html.lastIndexOf("Same Name")).toBe(true)
  })

  test("ranks show only positive best positions with full wrapping names", () => {
    const html = renderCard({
      data: makeCompetitors({
        competitors: [
          makeCompetitor({
            title: "A Very Long Business Name That Must Wrap Fully",
            address: "A Very Long Street Address That Must Wrap Fully",
            best_rank: 1,
          }),
        ],
      }),
    })
    expect(html).toContain("A Very Long Business Name That Must Wrap Fully")
    expect(html).toContain("A Very Long Street Address That Must Wrap Fully")
    expect(html).toContain("#1")
    expect(html.includes("truncate")).toBe(false)
  })

  test("empty, error, and pending states stay distinct", () => {
    const empty = renderCard({ data: makeCompetitors({ competitors: [] }) })
    expect(empty).toContain("No competitors recorded in the stored results.")
    const failed = renderCard({ error: "Could not load competitors" })
    expect(failed).toContain("Could not load competitors")
    expect(failed.includes("No competitors recorded")).toBe(false)
    const pending = renderCard({ pending: true })
    expect(pending).toContain('data-slot="skeleton"')
    expect(pending.includes("No competitors recorded")).toBe(false)
  })

  test("all failed never reads as complete coverage", () => {
    const html = renderCard({
      data: makeCompetitors({
        total_query_points: 10,
        contributing_query_points: 0,
        failed_query_points: 10,
        pending_query_points: 0,
        unreadable_query_points: 0,
        competitors: [],
        idless_entries: 3,
      }),
    })
    expect(html).toContain("Results from 0 of 10 query-points")
    expect(html).toContain("10 failed")
    expect(html).toContain("coverage is incomplete")
    expect(html).toContain("3 entries omitted without an ID")
    expect(html.toLowerCase().includes("complete coverage")).toBe(false)
  })

  test("overview never renders whole-run competitors", () => {
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({ queries: ["coffee"] }),
      competitors: makeCompetitors({ competitors: [makeCompetitor()] }),
    } as Parameters<typeof renderReport>[0])
    expect(html.includes("Rival Roasters")).toBe(false)
    expect(html.includes("Whole run competitors")).toBe(false)
    expect(html.includes("Point F competitors")).toBe(false)
  })

  test("competitors tab renders one whole-run card with global copy", () => {
    const html = renderReport({
      tab: "competitors",
      latestRun: makeRun({ queries: ["coffee", "tea"] }),
      focusedPointIndex: null,
      competitors: makeCompetitors({ competitors: [makeCompetitor()] }),
    } as Parameters<typeof renderReport>[0])
    expect(html).toContain("Whole run competitors")
    expect(html).toContain("Combined across all saved queries and map points")
    expect(html).toContain("Rival Roasters")
    expect(html).toContain("in 5 of 20 query-points")
    expect(html.includes("Point F competitors")).toBe(false)
  })

  test("point scope renders its own heading, copy, and frequency", () => {
    const point = makeCompetitors({
      point_index: 5,
      queries: ["coffee", "tea"],
      total_query_points: 2,
      contributing_query_points: 2,
      failed_query_points: 0,
      pending_query_points: 0,
      unreadable_query_points: 0,
      competitors: [
        makeCompetitor({
          place_id: "ChIJ-point",
          title: "Point Rival",
          query_points_seen: 2,
          query_indexes: [0, 1],
        }),
      ],
    })
    const html = renderReport({
      tab: "competitors",
      latestRun: makeRun({ queries: ["coffee", "tea"] }),
      focusedPointIndex: 5,
      competitors: makeCompetitors({ competitors: [makeCompetitor()] }),
      pointCompetitors: point,
    } as Parameters<typeof renderReport>[0])
    expect(html).toContain("Point F competitors")
    expect(html).toContain("Combined only this point")
    expect(html).toContain("Point Rival")
    expect(html).toContain("Seen in 2 of 2 queries at Point F")
    expect(html.includes("Rival Roasters")).toBe(false)
    expect(html.includes("Whole run competitors")).toBe(false)
  })

  test("swapping from point A to point F swaps rows without leaking", () => {
    const atA = renderReport({
      tab: "competitors",
      latestRun: makeRun({ queries: ["coffee"] }),
      focusedPointIndex: 0,
      pointCompetitors: makeCompetitors({
        point_index: 0,
        competitors: [makeCompetitor({ place_id: "ChIJ-a", title: "Alpha Cafe" })],
      }),
    } as Parameters<typeof renderReport>[0])
    const atF = renderReport({
      tab: "competitors",
      latestRun: makeRun({ queries: ["coffee"] }),
      focusedPointIndex: 5,
      pointCompetitors: makeCompetitors({
        point_index: 5,
        competitors: [makeCompetitor({ place_id: "ChIJ-f", title: "Foxtrot Cafe" })],
      }),
    } as Parameters<typeof renderReport>[0])
    expect(atA).toContain("Point A competitors")
    expect(atA).toContain("Alpha Cafe")
    expect(atA.includes("Foxtrot Cafe")).toBe(false)
    expect(atF).toContain("Point F competitors")
    expect(atF).toContain("Foxtrot Cafe")
    expect(atF.includes("Alpha Cafe")).toBe(false)
    expect(atF.includes("Rival Roasters")).toBe(false)
  })

  test("point pending and error never render global rows", () => {
    const global = makeCompetitors({ competitors: [makeCompetitor()] })
    const pending = renderReport({
      tab: "competitors",
      latestRun: makeRun({ queries: ["coffee"] }),
      focusedPointIndex: 5,
      competitors: global,
      pointCompetitors: null,
      pointCompetitorsPending: true,
    } as Parameters<typeof renderReport>[0])
    expect(pending).toContain("Point F competitors")
    expect(pending.includes("Rival Roasters")).toBe(false)
    const failed = renderReport({
      tab: "competitors",
      latestRun: makeRun({ queries: ["coffee"] }),
      focusedPointIndex: 5,
      competitors: global,
      pointCompetitorsError: "Could not load competitors",
    } as Parameters<typeof renderReport>[0])
    expect(failed).toContain("Point F competitors")
    expect(failed).toContain("Could not load competitors")
    expect(failed.includes("Rival Roasters")).toBe(false)
  })

  test("scope selector offers whole run plus points A to I", () => {
    installTestDom()
    const seen: Array<number | null> = []
    const { createRoot: createRoot2 } = require("react-dom/client") as typeof import("react-dom/client")
    const { act: act2 } = require("react") as typeof import("react")
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot2(host)
    const client = new QueryClient()
    act2(() => {
      root.render(
        <QueryClientProvider client={client}>
          <StaticRouter location="/app">
            <LocalSeoMapReportContent
              projectId="proj-1"
              location={makeLocation()}
              latestRun={makeRun({ queries: ["coffee"] })}
              runPending={false}
              lookup={null}
              lookupPending={false}
              tab="competitors"
              focusedPointIndex={5}
              onSelectCompetitorScope={(index) => seen.push(index)}
              competitors={makeCompetitors()}
              pointCompetitors={makeCompetitors({ point_index: 5 })}
            />
          </StaticRouter>,
        </QueryClientProvider>,
      )
    })
    const select = host.querySelector('select[aria-label="Competitor scope"]') as HTMLSelectElement | null
    expect(select === null).toBe(false)
    const options = Array.from(select!.querySelectorAll("option")).map((option) => option.textContent)
    expect(options[0]).toBe("Whole run")
    expect(options).toContain("Point A")
    expect(options).toContain("Point F")
    expect(options).toContain("Point I")
    expect(options.length).toBe(10)
    expect(select!.value).toBe("5")
    act2(() => {
      select!.value = "0"
      select!.dispatchEvent(new Event("change", { bubbles: true }))
    })
    act2(() => root.unmount())
    host.remove()
    client.clear()
  })

  test("selector callback receives point A, point F, and whole run", () => {
    installTestDom()
    const seen: Array<number | null> = []
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const client = new QueryClient()
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <StaticRouter location="/app">
            <LocalSeoMapReportContent
              projectId="proj-1"
              location={makeLocation()}
              latestRun={makeRun({ queries: ["coffee"] })}
              runPending={false}
              lookup={null}
              lookupPending={false}
              tab="competitors"
              focusedPointIndex={5}
              onSelectCompetitorScope={(index) => seen.push(index)}
              competitors={makeCompetitors()}
              pointCompetitors={makeCompetitors({ point_index: 5 })}
            />
          </StaticRouter>,
        </QueryClientProvider>,
      )
    })
    const select = host.querySelector('select[aria-label="Competitor scope"]') as HTMLSelectElement | null
    expect(select === null).toBe(false)
    const fireChange = (value: string) => {
      act(() => {
        if (!select) return
        select.value = value
        select.dispatchEvent(new Event("change", { bubbles: true }))
      })
    }
    fireChange("0")
    fireChange("5")
    fireChange("whole")
    expect(seen).toEqual([0, 5, null])
    act(() => root.unmount())
    host.remove()
    client.clear()
  })

  test("marks the shared website host without branch claims", () => {
    const html = renderCard({
      data: makeCompetitors({
        competitors: [makeCompetitor({ same_brand_domain: true })],
      }),
    })
    expect(html).toContain("Same website host")
    expect(html).toContain(
      "Same website host does not identify all company branches."
    )
    expect(html.includes("Your branch")).toBe(false)
    expect(html.toLowerCase().includes("same company")).toBe(false)
    const plain = renderCard({
      data: makeCompetitors({
        competitors: [makeCompetitor({ same_brand_domain: false })],
      }),
    })
    expect(plain.includes("Same website host")).toBe(false)
  })
  test("groups title-prefix branches without fuzzy matching", () => {
    const html = renderCard({
      locationName: "Sunrise Dental, Main Street",
      data: makeCompetitors({
        competitors: [
          makeCompetitor({
            place_id: "ChIJ-north",
            title: "Sunrise Dental North",
            query_points_seen: 8,
          }),
          makeCompetitor({
            place_id: "ChIJ-reliable",
            title: "Reliable Plumbing",
            query_points_seen: 7,
          }),
          makeCompetitor({
            place_id: "ChIJ-south",
            title: "Sunrise Dental South",
            query_points_seen: 6,
          }),
          makeCompetitor({
            place_id: "ChIJ-sunset",
            title: "Sunset Smiles",
            query_points_seen: 5,
          }),
          makeCompetitor({
            place_id: "ChIJ-national",
            title: "National Storage",
            query_points_seen: 4,
          }),
        ],
      }),
    })
    expect(html).toContain("Likely your branches (2)")
    expect(html).toContain("Competitors (3)")
    expect(html).toContain("not verified ownership")
    expect(
      html.indexOf("Sunrise Dental North") <
        html.indexOf("Sunrise Dental South"),
    ).toBe(true)
    expect(
      html.indexOf("Reliable Plumbing") < html.indexOf("National Storage"),
    ).toBe(true)
    expect(html.indexOf("Sunset Smiles") > html.indexOf("Competitors (3)")).toBe(
      true,
    )
    for (const title of [
      "Sunrise Dental North",
      "Reliable Plumbing",
      "Sunrise Dental South",
      "Sunset Smiles",
      "National Storage",
    ]) {
      expect(html).toContain(title)
    }
  })

  test("an unrelated title on the same website host still groups as likely", () => {
    const html = renderCard({
      locationName: "Sunrise Dental, Main Street",
      data: makeCompetitors({
        competitors: [
          makeCompetitor({
            title: "Totally Different Co",
            same_brand_domain: true,
          }),
          makeCompetitor({ title: "Reliable Plumbing" }),
        ],
      }),
    })
    expect(html).toContain("Likely your branches (1)")
    expect(html).toContain("Competitors (1)")
    expect(html.indexOf("Totally Different Co") < html.indexOf("Competitors (1)")).toBe(
      true,
    )
  })

  test("a location name without a valid brand keeps every row ungrouped", () => {
    for (const locationName of ["Solo", "", " , Main Street"]) {
      const html = renderCard({
        locationName,
        data: makeCompetitors({
          competitors: [
            makeCompetitor({
              title: "Sunrise Dental North",
              same_brand_domain: true,
            }),
            makeCompetitor({ title: "Reliable Plumbing" }),
          ],
        }),
      })
      expect(html.includes("Likely your branches")).toBe(false)
      expect(html).toContain("Sunrise Dental North")
      expect(html).toContain("Reliable Plumbing")
    }
  })

  test("multiword names without commas and comma-separated single-token brands can group", () => {
    for (const locationName of ["Sunrise Dental", "Sunrise Dental, Main Street", "Sunrise, Main Street"]) {
      const html = renderCard({
        locationName,
        data: makeCompetitors({
          competitors: [
            makeCompetitor({ place_id: "branch", title: "Sunrise Dental North" }),
            makeCompetitor({ place_id: "sun", title: "Sun Sunrise Dental" }),
            makeCompetitor({ place_id: "reliable", title: "Reliable Sunrise Dental" }),
            makeCompetitor({ place_id: "national", title: "National Storage" }),
          ],
        }),
      })
      expect(html).toContain("Likely your branches (1)")
      expect(html).toContain("Competitors (3)")
    }
  })
})

describe("board point selection", () => {
  test("clicking a board cell selects that point index", () => {
    installTestDom()
    const client = new QueryClient()
    const seen: number[] = []
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <StaticRouter location="/app">
            <LocalSeoMapReportContent
              projectId="proj-1"
              location={makeLocation()}
              latestRun={makeRun({ queries: ["coffee"] })}
              runPending={false}
              lookup={null}
              lookupPending={false}
              tab="overview"
              focusedPointIndex={null}
              onSelectPoint={(index) => seen.push(index)}
            />
          </StaticRouter>,
        </QueryClientProvider>
      )
    })
    const button = host.querySelector(
      'button[aria-label*="Business centre"]'
    ) as HTMLButtonElement | null
    expect(button === null).toBe(false)
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(seen).toEqual([4])
    act(() => root.unmount())
    host.remove()
    client.clear()
  })

  test("the board precedes the point panel and marks the focused cell", () => {
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({ queries: ["coffee"] }),
      focusedPointIndex: 4,
      onClearPointFocus: () => {},
    })
    expect(
      html.indexOf("Nine-point visibility board") < html.indexOf("Point E · Centre")
    ).toBe(true)
    expect(html).toContain('aria-pressed="true"')
  })
})

describe("stored result counts in the report", () => {
  test("per-query target rank shows places length with a returned label", () => {
    const places = Array.from({ length: 20 }, (_, index) => ({
      position: index + 1,
      title: `Place ${index + 1}`,
      address: "Main St",
      place_id: `ChIJ-${index + 1}`,
      rating: null,
      rating_count: null,
      is_target: index + 1 === 7,
    }))
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({ queries: ["coffee"] }),
      focusedPointIndex: 0,
      onClearPointFocus: () => {},
      pointDetails: {
        run_id: "run-1",
        point_index: 0,
        target_place_id: "ChIJ-7",
        queries: [
          {
            query_index: 0,
            query: "coffee",
            call_status: "success_nonempty",
            match_status: "found",
            rank: 7,
            error: null,
            places,
          },
        ],
      },
    })
    expect(html).toContain("#7/20 returned")
  })

  test("legend spells the returned-count scope", () => {
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({
        queries: ["coffee"],
        cells: [makeCell({ point_index: 4, ring: "centre", sector: "centre", rank: 1, result_count: 20 })],
      }),
    })
    expect(html).toContain("Rank is the found-only mean")
    expect(html).toContain("returned results per successful query")
    expect(html).toContain("not distinct competitors")
    expect(html).toContain("20 returned results per successful query")
  })
})

describe("saved run failure and progress", () => {
  test("failed run shows the underlying saved error", () => {
    const html = renderReport({
      tab: "run",
      latestRun: makeRun({
        status: "failed",
        error: "provider quota exhausted",
      }),
    })
    expect(html).toContain("Saved run failed: provider quota exhausted")
    expect(html.includes("Retry")).toBe(false)
    expect(html.includes("try again")).toBe(false)
  })

  test("running run shows saved cell progress without rewriting history", () => {
    const html = renderReport({
      tab: "run",
      latestRun: makeRun({
        status: "running",
        completed_cells: 12,
        total_cells: 45,
      }),
    })
    expect(html).toContain("Run in progress")
    expect(html).toContain("resolving cells 12 of 45")
    expect(html).toContain("Frozen queries: coffee · tea")
  })

  test("queued run without counts still states the hold", () => {
    const html = renderReport({
      tab: "run",
      latestRun: makeRun({ status: "queued" }),
    })
    expect(html).toContain("Run queued")
    expect(html).toContain("Credits stay reserved")
  })
})

describe("failed point cell errors", () => {
  function renderPointPanel(
    queries: Array<{
      query_index: number
      query: string
      call_status: "request_failed"
      match_status: "absent"
      rank: number | null
      error: string | null
    }>
  ) {
    return renderToStaticMarkup(
      <LocalSeoPointResultsPanel
        pointIndex={4}
        details={{
          run_id: "run-1",
          point_index: 4,
          target_place_id: "ChIJ1",
          queries: queries.map((entry) => ({ ...entry, places: [] })),
        }}
        pending={false}
        error={null}
      />
    )
  }

  test("selecting a failed cell shows its stored provider error", () => {
    const html = renderPointPanel([
      {
        query_index: 0,
        query: "coffee",
        call_status: "request_failed",
        match_status: "absent",
        rank: null,
        error: "provider quota exhausted for this call",
      },
    ])
    expect(html).toContain("provider quota exhausted for this call")
  })

  test("failed cell without a stored cause reports it clearly", () => {
    for (const error of [null, "request failed"]) {
      const html = renderPointPanel([
        {
          query_index: 0,
          query: "coffee",
          call_status: "request_failed",
          match_status: "absent",
          rank: null,
          error,
        },
      ])
      expect(html).toContain(
        "no specific cause was stored for this query"
      )
      expect(html.includes("request failed;")).toBe(false)
    }
  })

  test("saved inspection performs no network calls", () => {
    const calls: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = ((input: string | URL | Request) => {
      calls.push(typeof input === "string" ? input : input.toString())
      throw new Error("no network during saved inspection")
    }) as typeof fetch
    try {
      renderPointPanel([
        {
          query_index: 0,
          query: "coffee",
          call_status: "request_failed",
          match_status: "absent",
          rank: null,
          error: "provider quota exhausted for this call",
        },
      ])
    } finally {
      globalThis.fetch = realFetch
    }
    expect(calls).toEqual([])
  })
})
