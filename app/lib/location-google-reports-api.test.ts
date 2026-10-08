import { afterEach, describe, expect, test } from "bun:test"

import {
  describeLocationReportCoverage,
  fetchLocationAnalyticsRealtime,
  fetchLocationAnalyticsReportOverview,
  fetchLocationGscReportOverview,
  locationAnalyticsReportOverviewKey,
  locationGscReportOverviewKey,
  locationReportQueryString,
  postLocationAnalyticsReportRefresh,
  postLocationGscReportRefresh,
} from "~/lib/location-google-reports-api"

type FetchCall = { url: string; method: string; body: unknown }
const calls: FetchCall[] = []
const realFetch = globalThis.fetch

function mockFetch(payload: unknown, status = 200) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    calls.push({ url, method: init?.method ?? "GET", body })
    return new Response(status === 204 ? null : JSON.stringify(payload), {
      status,
    })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  calls.length = 0
})

const SCOPE = { revision: 2, url: "https://example.com/shop/", match: "subtree" }

function gscOverviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    location_id: "loc-1",
    source: "project",
    google_connection_id: "conn-1",
    google_account_email: "owner@example.com",
    site_url: "https://example.com/",
    scope_applied: true,
    scope: SCOPE,
    coverage: "branch",
    cached: true,
    configured: true,
    overview: {
      history_days: 180,
      windows: {
        "180": {
          range: {
            current_start: "2026-01-01",
            current_end: "2026-01-07",
            previous_start: "2025-12-25",
            previous_end: "2025-12-31",
          },
          summary: {
            clicks: { current: 10, previous: 8 },
            impressions: { current: 100, previous: 90 },
            ctr: { current: 0.1, previous: 0.09 },
            position: { current: 5, previous: 6 },
          },
          trend: [],
          top_queries: [],
          top_pages: [],
          country_breakdown: [],
          device_breakdown: [],
          opportunities: {
            low_ctr_queries: [],
            striking_distance_queries: [],
            question_queries: [],
          },
        },
      },
    },
    ...overrides,
  }
}

describe("location google report paths and keys", () => {
  test("scope revision pins cache keys and query strings", () => {
    expect(
      locationReportQueryString({ scopeRevision: 2, pageFilter: false })
    ).toBe("?scope_revision=2")
    expect(
      locationReportQueryString({ scopeRevision: 2, pageFilter: true })
    ).toBe("?scope_revision=2&page_filter=true")
    expect(
      locationReportQueryString({ scopeRevision: null, pageFilter: false })
    ).toBe("")
    const key = locationGscReportOverviewKey("p1", "l1", {
      scopeRevision: 2,
      pageFilter: true,
    })
    expect(key).toEqual([
      "location-google-report",
      "p1",
      "l1",
      "gsc",
      "overview",
      2,
      true,
    ])
    expect(
      locationAnalyticsReportOverviewKey("p1", "l1", {
        scopeRevision: 3,
        pageFilter: false,
      })
    ).toContain(3)
  })

  test("coverage labels never invent branch proof", () => {
    expect(describeLocationReportCoverage("branch")).toBe("Branch coverage")
    expect(describeLocationReportCoverage("property-wide")).toBe(
      "Property-wide"
    )
  })
})

describe("gsc location reports", () => {
  test("cached overview hit normalizes source, scope, and coverage", async () => {
    mockFetch(gscOverviewPayload())
    const report = await fetchLocationGscReportOverview("p1", "l1", {
      scopeRevision: 2,
      pageFilter: false,
    })
    expect(calls[0]?.method).toBe("GET")
    expect(calls[0]?.url).toContain(
      "/projects/p1/locations/l1/gsc/report/overview?scope_revision=2"
    )
    expect(report.cached).toBe(true)
    expect(report.configured).toBe(true)
    expect(report.source).toBe("project")
    expect(report.coverage).toBe("branch")
    expect(report.scope?.revision).toBe(2)
    expect(report.googleAccountEmail).toBe("owner@example.com")
    expect(report.overview?.history_days).toBe(180)
  })

  test("cache miss and unconfigured shapes stay data-free", async () => {
    mockFetch({
      configured: true,
      cached: false,
      reason: "location_google_report_not_refreshed",
      source: "project",
      site_url: "https://example.com/",
    })
    const miss = await fetchLocationGscReportOverview("p1", "l1", {
      scopeRevision: 2,
      pageFilter: false,
    })
    expect(miss.cached).toBe(false)
    expect(miss.configured).toBe(true)
    expect(miss.overview).toBeNull()

    mockFetch({
      configured: false,
      reason: "location_website_scope_not_set",
      source: "project",
    })
    const unconfigured = await fetchLocationGscReportOverview("p1", "l1", {
      scopeRevision: null,
      pageFilter: false,
    })
    expect(unconfigured.configured).toBe(false)
    expect(unconfigured.overview).toBeNull()
  })

  test("refresh posts and returns overview plus one queries page", async () => {
    mockFetch({
      ...gscOverviewPayload(),
      cached: true,
      queries: {
        rows: [{ query: "coffee", clicks: 3, impressions: 30, ctr: 0.1, position: 4 }],
        days: 28,
        limit: 100,
        offset: 0,
        has_more: false,
        start_date: "2026-01-01",
        end_date: "2026-01-28",
      },
    })
    const result = await postLocationGscReportRefresh(
      "p1",
      "l1",
      { scopeRevision: 2, pageFilter: false },
      { limit: 100, search: "coffee" }
    )
    expect(calls[0]?.method).toBe("POST")
    expect(calls[0]?.url).toContain("/projects/p1/locations/l1/gsc/report/refresh")
    expect(calls[0]?.url).toContain("search=coffee")
    expect(result.report.cached).toBe(true)
    expect(result.queries?.rows).toHaveLength(1)
  })

})

describe("analytics location reports", () => {
  function analyticsPayload(overrides: Record<string, unknown> = {}) {
    return {
      location_id: "loc-1",
      source: "location",
      google_connection_id: "conn-1",
      google_account_email: "owner@example.com",
      property_id: "123",
      property_display_name: "Shop",
      scope_applied: false,
      scope: null,
      coverage: "property-wide",
      cached: true,
      configured: true,
      overview: {
        history_days: 28,
        window_days: 28,
        range: {
          current_start: "2026-01-01",
          current_end: "2026-01-28",
          previous_start: "2025-12-04",
          previous_end: "2025-12-31",
        },
        summary: {
          active_users: { current: 7, previous: 5 },
          sessions: { current: 9, previous: 6 },
          engagement_rate: { current: 0.5, previous: 0.4 },
          key_events: { current: 1, previous: 0 },
        },
        trend: [
          {
            date: "2026-01-27",
            active_users: 3,
            sessions: 4,
            engagement_rate: 0.5,
            key_events: 1,
          },
          {
            date: "2026-01-28",
            active_users: 4,
            sessions: 5,
            engagement_rate: 0.5,
            key_events: 0,
          },
        ],
        landing_pages: [
          {
            label: "/shop",
            active_users: 7,
            sessions: 9,
            engagement_rate: 0.5,
            key_events: 1,
          },
        ],
        channels: [],
        sources: [],
        countries: [],
        devices: [],
      },
      ...overrides,
    }
  }

  test("cached overview hit labels the dedicated property", async () => {
    mockFetch(analyticsPayload())
    const report = await fetchLocationAnalyticsReportOverview("p1", "l1", {
      scopeRevision: null,
      pageFilter: false,
    })
    expect(calls[0]?.method).toBe("GET")
    expect(calls[0]?.url).toContain(
      "/projects/p1/locations/l1/analytics/report/overview"
    )
    expect(calls[0]?.url.includes("scope_revision")).toBe(false)
    expect(report.coverage).toBe("property-wide")
    expect(report.propertyDisplayName).toBe("Shop")
    expect(report.overview?.trend).toHaveLength(2)
  })

  test("refresh posts without query params by default", async () => {
    mockFetch(analyticsPayload())
    await postLocationAnalyticsReportRefresh("p1", "l1", {
      scopeRevision: null,
      pageFilter: false,
    })
    expect(calls[0]?.method).toBe("POST")
    expect(calls[0]?.url).toContain("/analytics/report/refresh")
  })

  test("realtime reports live counts and scoped unsupported states", async () => {
    mockFetch({
      location_id: "loc-1",
      source: "location",
      property_id: "123",
      coverage: "property-wide",
      supported: true,
      active_users: 7,
    })
    const live = await fetchLocationAnalyticsRealtime("p1", "l1", {
      scopeRevision: null,
      pageFilter: false,
    })
    expect(calls[0]?.method).toBe("GET")
    expect(calls[0]?.url).toContain("/analytics/report/realtime")
    expect(live.supported).toBe(true)
    expect(live.activeUsers).toBe(7)

    mockFetch({
      supported: false,
      reason: "location_realtime_scope_not_supported",
    })
    const scoped = await fetchLocationAnalyticsRealtime("p1", "l1", {
      scopeRevision: 2,
      pageFilter: false,
    })
    expect(scoped.supported).toBe(false)
    expect(scoped.activeUsers).toBeNull()
  })
})
