import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { StaticRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import {
  describeLocalSeoReportRunState,
  LocalSeoMapLookupEvidence,
  LocalSeoMapReportContent,
  type LocalSeoMapReportTab,
} from "~/components/local-seo-map-report"
import type {
  LocalSeoCell,
  LocalSeoListingLookup,
  LocalSeoLocation,
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
  const cells = [
    makeCell({ query_index: 0, point_index: 0, sector: "NW", rank: 4 }),
    makeCell({
      query_index: 1,
      point_index: 0,
      sector: "NW",
      call_status: "success_empty",
      match_status: "absent",
      rank: null,
    }),
    makeCell({
      query_index: 2,
      point_index: 0,
      sector: "NW",
      call_status: "request_failed",
      match_status: "unknown",
      rank: null,
    }),
    makeCell({
      query_index: 3,
      point_index: 0,
      sector: "NW",
      call_status: "pending",
      match_status: "unknown",
      rank: null,
    }),
  ]

  test("lists each saved query's result at the focused point from the frozen run", () => {
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({
        queries: ["coffee", "tea", "matcha", "cocoa"],
        cells,
      }),
      location: makeLocation(),
      focusedPointIndex: 0,
      onClearPointFocus: () => {},
    })
    expect(html).toContain("Point A · North-west")
    expect(html).toContain("coffee")
    expect(html).toContain("matcha")
    expect(html).toContain("#4")
    expect(html).toContain("Not found")
    expect(html).toContain("Failed")
    expect(html).toContain("Unknown")
    expect(html).toContain('aria-label="Clear point A"')
    expect(html.includes("live-only")).toBe(false)
  })

  test("says so plainly when the frozen run has no cell for the point", () => {
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({ queries: ["coffee"], cells: [] }),
      focusedPointIndex: 4,
      onClearPointFocus: () => {},
    })
    expect(html).toContain("Point E · Centre")
    expect(html).toContain("No samples recorded for this point")
  })

  test("no point card is rendered without a focus", () => {
    const html = renderReport({
      tab: "overview",
      latestRun: makeRun({ queries: ["coffee"], cells }),
    })
    expect(html.includes("Point A · North-west")).toBe(false)
  })
})
