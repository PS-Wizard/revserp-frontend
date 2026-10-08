import { afterEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"

mock.module("apexcharts", () => ({
  default: class {
    render() {
      return Promise.resolve()
    }
    updateSeries() {
      return Promise.resolve()
    }
    updateOptions() {
      return Promise.resolve()
    }
    destroy() {}
  },
}))
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { mockDropdownMenu } from "~/lib/dropdown-menu-test-mock"
import type { LocalSeoLocation } from "~/lib/local-seo-api"
import type {
  LocationAnalyticsBindingResponse,
  LocationGscBindingResponse,
} from "~/lib/location-google-api"
import {
  LocationWorkspaceProvider,
  type LocationWorkspace,
  type LocationWebsiteScopeRevision,
} from "~/lib/location-workspace"

installTestDom()

mockDropdownMenu()

const { LocationGoogleReportView } = await import(
  "~/components/locations/location-google-report-view"
)

const PROJECT = "proj-1"
const LOCATION = "loc-1"

function makeLocation(): LocalSeoLocation {
  return {
    id: LOCATION,
    project_id: PROJECT,
    name: "Springfield Roastery",
    place_id: "place-1",
    address: "Main Street 1",
    locality: "Springfield",
    localities: [],
    services: [],
    latitude: 39.8,
    longitude: -89.6,
    queries: [],
  }
}

function makeScope(
  overrides: Partial<LocationWebsiteScopeRevision> = {}
): LocationWebsiteScopeRevision {
  return {
    id: "rev-2",
    revision: 2,
    url: "https://example.com/shop/",
    match: "subtree",
    created_at: "2026-09-01T12:00:00.000Z",
    ...overrides,
  }
}

function makeWorkspace(
  overrides: Partial<LocationWorkspace> = {}
): LocationWorkspace {
  return {
    projectId: PROJECT,
    location: makeLocation(),
    canManage: true,
    websiteScope: makeScope(),
    websiteScopeRevisions: [],
    ...overrides,
  }
}

const CONNECTIONS = [
  {
    id: "conn-1",
    google_account_email: "owner@example.com",
    google_status: "active",
  },
]

function gscBinding(
  overrides: Record<string, unknown> = {}
): LocationGscBindingResponse {
  return {
    mode: "inherit",
    effective: {
      source: "project",
      google_connection_id: "conn-1",
      google_account_email: "owner@example.com",
      site_url: "https://example.com/",
    },
    project: {
      google_connection_id: "conn-1",
      site_url: "https://example.com/",
    },
    google_connections: CONNECTIONS,
    ...overrides,
  } as LocationGscBindingResponse
}

function analyticsBinding(
  overrides: Record<string, unknown> = {}
): LocationAnalyticsBindingResponse {
  return {
    mode: "inherit",
    effective: {
      source: "project",
      google_connection_id: "conn-1",
      google_account_email: "owner@example.com",
      property_id: "123",
      property_display_name: "Shop",
      account_display_name: "Acct",
    },
    project: {
      google_connection_id: "conn-1",
      property_id: "123",
      property_display_name: "Shop",
      account_display_name: "Acct",
    },
    google_connections: CONNECTIONS,
    ...overrides,
  } as LocationAnalyticsBindingResponse
}

function gscWindow(overrides: Record<string, unknown> = {}) {
  return {
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
    trend: [
      { date: "2026-01-06", clicks: 4, impressions: 40, ctr: 0.1, position: 5 },
      { date: "2026-01-07", clicks: 6, impressions: 60, ctr: 0.1, position: 5 },
    ],
    top_queries: [
      { query: "coffee", clicks: 6, impressions: 60, ctr: 0.1, position: 5 },
    ],
    top_pages: [
      {
        page: "https://example.com/shop/",
        clicks: 6,
        impressions: 60,
        ctr: 0.1,
        position: 5,
      },
    ],
    country_breakdown: [],
    device_breakdown: [],
    opportunities: {
      low_ctr_queries: [],
      striking_distance_queries: [],
      question_queries: [],
    },
    ...overrides,
  }
}

function gscOverviewHit(overrides: Record<string, unknown> = {}) {
  return {
    location_id: LOCATION,
    source: "project",
    google_connection_id: "conn-1",
    google_account_email: "owner@example.com",
    site_url: "https://example.com/",
    scope_applied: true,
    scope: { revision: 2, url: "https://example.com/shop/", match: "subtree" },
    coverage: "branch",
    cached: true,
    configured: true,
    overview: {
      history_days: 180,
      windows: { "180": gscWindow() },
    },
    ...overrides,
  }
}

function gscQueriesPage(rows: unknown[] = []) {
  return {
    location_id: LOCATION,
    source: "project",
    site_url: "https://example.com/",
    scope_applied: true,
    scope: { revision: 2, url: "https://example.com/shop/", match: "subtree" },
    coverage: "branch",
    cached: true,
    configured: true,
    queries: {
      rows,
      days: 28,
      limit: 100,
      offset: 0,
      has_more: false,
      start_date: "2026-01-01",
      end_date: "2026-01-28",
    },
  }
}

function analyticsOverviewHit(overrides: Record<string, unknown> = {}) {
  return {
    location_id: LOCATION,
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

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

let route = {
  gscOverview: (() => gscOverviewHit()) as () => unknown,
  gscQueries: (() =>
    gscQueriesPage([
      { query: "coffee", clicks: 3, impressions: 30, ctr: 0.1, position: 4 },
    ])) as (url: string) => unknown,
  gscRefresh: (() => gscOverviewHit()) as () => unknown,
  analyticsOverview: (() => analyticsOverviewHit()) as () => unknown,
  realtime: (() => null) as () => unknown,
}

function installReportFetch() {
  ;(globalThis as Record<string, unknown>).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })
    if (url.includes("/gsc/report/refresh") && method === "POST") {
      const payload = await route.gscRefresh()
      if (payload instanceof Response) return payload
      return Response.json({
        ...(payload as Record<string, unknown>),
        queries: (route.gscQueries(url) as { queries: unknown }).queries,
      })
    }
    if (url.includes("/gsc/report/overview")) {
      return Response.json(route.gscOverview())
    }
    if (url.includes("/gsc/report/queries")) {
      return Response.json(route.gscQueries(url))
    }
    if (url.includes("/analytics/report/refresh") && method === "POST") {
      return Response.json(route.analyticsOverview())
    }
    if (url.includes("/analytics/report/overview")) {
      return Response.json(route.analyticsOverview())
    }
    if (url.includes("/analytics/report/realtime")) {
      const payload = route.realtime()
      if (payload === null) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        })
      }
      return Response.json(payload)
    }
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
    })
  }) as typeof fetch
}

let root: Root | null = null

function renderReport(options: {
  service: "gsc" | "analytics"
  binding: LocationGscBindingResponse | LocationAnalyticsBindingResponse
  workspace: LocationWorkspace | null
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  const renderTree = (next: typeof options) => {
    act(() => {
      root!.render(
        <QueryClientProvider client={client}>
          <LocationWorkspaceProvider workspace={next.workspace}>
            <LocationGoogleReportView
              binding={next.binding}
              locationId={LOCATION}
              projectId={PROJECT}
              service={next.service}
            />
          </LocationWorkspaceProvider>
        </QueryClientProvider>
      )
    })
  }
  renderTree(options)
  return { client, container, rerender: renderTree }
}

async function flushUntil(check: () => boolean) {
  for (let i = 0; i < 60; i++) {
    if (check()) return
    await act(async () => {
      await flushTestDom()
    })
  }
  throw new Error("condition never became true")
}

function buttonByText(scope: ParentNode, text: string) {
  const found = [...scope.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text)
  )
  if (!found) throw new Error(`button "${text}" not found`)
  return found as HTMLButtonElement
}

async function openManageMenu(container: ParentNode) {
  const trigger = buttonByText(container, "Manage connection")
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await flushTestDom()
  })
  if (!document.querySelector('[role="menuitem"]')) {
    throw new Error("manage menu never opened")
  }
}

function menuItemByText(text: string) {
  const found = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.includes(text)
  )
  if (!found) throw new Error(`menu item "${text}" not found`)
  return found
}

async function clickMenuItem(text: string) {
  await act(async () => {
    menuItemByText(text).dispatchEvent(
      new MouseEvent("click", { bubbles: true, button: 0 })
    )
    await flushTestDom()
  })
}

function parentApiCalls() {
  return fetchCalls.filter((call) => {
    const path = call.url.split("?")[0] ?? ""
    if (!path.includes(`/projects/${PROJECT}/`)) return false
    if (path.includes(`/locations/${LOCATION}/`)) return false
    return true
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
  fetchCalls.length = 0
  route = {
    gscOverview: () => gscOverviewHit(),
    gscRefresh: () => gscOverviewHit(),
    gscQueries: () =>
      gscQueriesPage([
        { query: "coffee", clicks: 3, impressions: 30, ctr: 0.1, position: 4 },
      ]),
    analyticsOverview: () => analyticsOverviewHit(),
    realtime: () => null,
  }
  if (root) {
    act(() => {
      root!.unmount()
    })
    root = null
  }
  document.body.innerHTML = ""
})

describe("location google report view", () => {
  test("a missing saved query page reports a gap, not no Google results", async () => {
    route.gscQueries = () => ({ cached: false })
    installReportFetch()
    const { container } = renderReport({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.innerHTML.includes("This query page is not saved")
    )
    expect(container.textContent).toContain("Query results are not available.")
    expect(container.textContent?.includes("No queries found")).toBe(false)
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)
    expect(parentApiCalls()).toEqual([])
  })

  test("explicit refresh keeps search and preset while updating the overview", async () => {
    const requested = (url: string) => {
      const params = new URL(url, "https://test.invalid").searchParams
      return (
        params.get("search") === "coffee" &&
        params.get("preset") === "questions"
      )
    }
    route.gscQueries = (url) => {
      if (!requested(url)) return gscQueriesPage()
      if (
        !fetchCalls.some(
          (call) => call.method === "POST" && requested(call.url)
        )
      ) {
        return { cached: false }
      }
      return gscQueriesPage([
        {
          query: "where is coffee",
          clicks: 3,
          impressions: 30,
          ctr: 0.1,
          position: 4,
        },
      ])
    }
    route.gscRefresh = () =>
      gscOverviewHit({
        overview: {
          history_days: 180,
          windows: { "180": gscWindow({ top_queries: [] }) },
        },
      })
    installReportFetch()
    const { container } = renderReport({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.innerHTML.includes("Search performance table")
    )
    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="Search all queries..."]'
    )!
    act(() => {
      buttonByText(container, "Questions").click()
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, "coffee")
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
    await flushUntil(() =>
      fetchCalls.some((call) => call.method === "GET" && requested(call.url))
    )
    expect(fetchCalls.some((call) => call.method === "POST")).toBe(false)
    await act(async () => {
      buttonByText(container, "Refresh").click()
      await flushTestDom()
    })
    await flushUntil(
      () => container.textContent?.includes("where is coffee") === true
    )
    const posts = fetchCalls.filter((call) => call.method === "POST")
    expect(posts).toHaveLength(1)
    expect(requested(posts[0]!.url)).toBe(true)
    expect(posts[0]!.url).toContain("limit=100")
    expect(posts[0]!.url).toContain("offset=0")
    expect(input.value).toBe("coffee")
    expect(
      container.textContent?.includes("This query page is not saved")
    ).toBe(false)
    expect(parentApiCalls()).toEqual([])
  })

  test("refresh loads a missing next page and replaces it on a later refresh", async () => {
    route.gscQueries = (url) => {
      const offset = Number(
        new URL(url, "https://test.invalid").searchParams.get("offset")
      )
      const refreshed = fetchCalls.some(
        (call) => call.method === "POST" && call.url.includes("offset=100")
      )
      if (offset === 100 && !refreshed) return { cached: false }
      const rows =
        offset === 100
          ? [
              {
                query: "next page coffee",
                clicks: 3,
                impressions: 30,
                ctr: 0.1,
                position: 4,
              },
            ]
          : Array.from({ length: 100 }, (_, index) => ({
              query: `coffee ${index}`,
              clicks: 3,
              impressions: 30,
              ctr: 0.1,
              position: 4,
            }))
      const page = gscQueriesPage(rows)
      page.queries.has_more = offset === 0
      page.queries.offset = offset
      return page
    }
    installReportFetch()
    const { container } = renderReport({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace(),
    })
    await flushUntil(
      () => container.textContent?.includes("Showing 100 queries") === true
    )
    await act(async () => {
      buttonByText(container, "Load more queries").click()
      await flushTestDom()
    })
    await flushUntil(
      () =>
        container.textContent?.includes("This query page is not saved") === true
    )
    expect(fetchCalls.some((call) => call.method === "POST")).toBe(false)
    for (let index = 0; index < 2; index += 1) {
      await act(async () => {
        buttonByText(container, "Refresh").click()
        await flushTestDom()
      })
      await flushUntil(
        () => container.textContent?.includes("Showing 101 queries") === true
      )
    }
    const posts = fetchCalls.filter((call) => call.method === "POST")
    expect(posts).toHaveLength(2)
    expect(posts.every((call) => call.url.includes("offset=100"))).toBe(true)
    expect(container.textContent?.includes("Showing 102 queries")).toBe(false)
    expect(parentApiCalls()).toEqual([])
  })

  test("mount reads cached location endpoints only, never posts or parent apis", async () => {
    installReportFetch()
    const { container } = renderReport({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace(),
    })
    await flushUntil(() => container.innerHTML.includes("Branch coverage"))
    expect(container.innerHTML).toContain("Rev 2")
    expect(container.innerHTML).toContain("owner@example.com")
    expect(container.innerHTML).toContain("https://example.com/")
    expect(container.innerHTML).toContain("Clicks")
    expect(container.innerHTML.includes("Limit to branch website scope")).toBe(
      false
    )
    expect(fetchCalls.length > 0).toBe(true)
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)
    expect(parentApiCalls()).toEqual([])
    const overviewCall = fetchCalls.find((call) =>
      call.url.includes("/gsc/report/overview")
    )
    expect(overviewCall?.url).toContain("scope_revision=2")
    expect(overviewCall?.url.includes("page_filter")).toBe(false)
  })

  test("inherit without scope shows info state and no figures", async () => {
    route.gscOverview = () => ({
      configured: false,
      reason: "location_website_scope_not_set",
      source: "project",
    })
    installReportFetch()
    const { container } = renderReport({
      service: "gsc",
      binding: gscBinding({ effective: null, project: null }),
      workspace: makeWorkspace({ websiteScope: null }),
    })
    await flushUntil(() =>
      container.innerHTML.includes("No branch scope for reports")
    )
    expect(container.innerHTML.includes("Clicks")).toBe(false)
    expect(container.innerHTML.includes("Branch coverage")).toBe(false)
    expect(
      fetchCalls.some((call) => call.url.includes("/gsc/report/queries"))
    ).toBe(false)
  })

  test("cache miss auto-refreshes exactly once without a click", async () => {
    route.gscOverview = () => ({
      configured: true,
      cached: false,
      reason: "location_google_report_not_refreshed",
      source: "project",
      site_url: "https://example.com/",
      coverage: "branch",
    })
    route.gscRefresh = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return Response.json(gscOverviewHit())
    }
    installReportFetch()
    const { container } = renderReport({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.innerHTML.includes("Fetching your report from Google...")
    )
    await flushUntil(() => container.innerHTML.includes("Branch coverage"))
    const posts = fetchCalls.filter((call) => call.method === "POST")
    expect(posts).toHaveLength(1)
    expect(posts[0]?.url).toContain("/gsc/report/refresh")
    expect(parentApiCalls()).toEqual([])
  })

  test("failed auto-refresh offers Try again that posts once more", async () => {
    route.gscOverview = () => ({
      configured: true,
      cached: false,
      reason: "location_google_report_not_refreshed",
      source: "project",
      site_url: "https://example.com/",
      coverage: "branch",
    })
    route.gscRefresh = () =>
      new Response(JSON.stringify({ error: "Google is unavailable." }), {
        status: 502,
      })
    installReportFetch()
    const { container } = renderReport({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.textContent?.includes("Couldn't fetch the report") === true
    )
    expect(container.textContent).toContain("Google is unavailable.")
    expect(fetchCalls.filter((call) => call.method === "POST")).toHaveLength(1)
    const retry = buttonByText(container, "Try again")
    await act(async () => {
      retry.click()
      await flushTestDom()
    })
    await flushUntil(
      () => fetchCalls.filter((call) => call.method === "POST").length === 2
    )
    expect(parentApiCalls()).toEqual([])
  })

  test("custom analytics reports property-wide with explicit realtime panel", async () => {
    route.realtime = () => ({
      location_id: LOCATION,
      source: "location",
      property_id: "123",
      coverage: "property-wide",
      supported: true,
      active_users: 7,
    })
    installReportFetch()
    const { container } = renderReport({
      service: "analytics",
      binding: analyticsBinding({
        mode: "custom",
        effective: {
          source: "location",
          google_connection_id: "conn-1",
          google_account_email: "owner@example.com",
          property_id: "123",
          property_display_name: "Shop",
          account_display_name: "Acct",
        },
      }),
      workspace: makeWorkspace({ websiteScope: null }),
    })
    await flushUntil(() => container.innerHTML.includes("Property-wide"))
    expect(container.innerHTML).toContain("Shop")
    expect(container.innerHTML).toContain("Active users")
    expect(
      fetchCalls.some((call) => call.url.includes("/report/realtime"))
    ).toBe(false)
    const show = buttonByText(container, "Show live users")
    await act(async () => {
      show.click()
      await flushTestDom()
    })
    await flushUntil(() =>
      fetchCalls.some((call) => call.url.includes("/report/realtime"))
    )
    const realtimeCalls = fetchCalls.filter((call) =>
      call.url.includes("/report/realtime")
    )
    expect(realtimeCalls).toHaveLength(1)
    expect(realtimeCalls[0]?.method).toBe("GET")
    expect(parentApiCalls()).toEqual([])
  })

  test("scoped analytics realtime renders unsupported without fetching", async () => {
    installReportFetch()
    const { container } = renderReport({
      service: "analytics",
      binding: analyticsBinding(),
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.innerHTML.includes("Live users unavailable")
    )
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await flushTestDom()
      })
    }
    expect(
      fetchCalls.some((call) => call.url.includes("/report/realtime"))
    ).toBe(false)
    expect(container.innerHTML.includes("Show live users")).toBe(false)
  })

  test("custom page filter toggle pins the filtered read", async () => {
    installReportFetch()
    const { container } = renderReport({
      service: "gsc",
      binding: gscBinding({
        mode: "custom",
        effective: {
          source: "location",
          google_connection_id: "conn-1",
          google_account_email: "owner@example.com",
          site_url: "https://example.com/shop",
        },
      }),
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.innerHTML.includes("Limit to branch website scope")
    )
    const toggle = container.querySelector('[role="checkbox"]')
    if (!toggle) throw new Error("page filter toggle not found")
    await act(async () => {
      ;(toggle as HTMLElement).click()
      await flushTestDom()
    })
    await flushUntil(() =>
      fetchCalls.some(
        (call) =>
          call.method === "GET" &&
          call.url.includes("/gsc/report/overview") &&
          call.url.includes("page_filter=true")
      )
    )
    expect(parentApiCalls()).toEqual([])
  })

  test("scope revision change refetches the overview with the new pin", async () => {
    installReportFetch()
    const { rerender } = renderReport({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      fetchCalls.some(
        (call) =>
          call.method === "GET" &&
          call.url.includes("/gsc/report/overview") &&
          call.url.includes("scope_revision=2")
      )
    )
    rerender({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace({
        websiteScope: makeScope({ id: "rev-3", revision: 3 }),
      }),
    })
    await flushUntil(() =>
      fetchCalls.some(
        (call) =>
          call.method === "GET" &&
          call.url.includes("/gsc/report/overview") &&
          call.url.includes("scope_revision=3")
      )
    )
    expect(parentApiCalls()).toEqual([])
  })
})

describe("location google connection header", () => {
  function renderWithChange(options: {
    service: "gsc" | "analytics"
    binding: LocationGscBindingResponse | LocationAnalyticsBindingResponse
    workspace: LocationWorkspace | null
    onChangeConnection?: () => void
  }) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root!.render(
        <QueryClientProvider client={client}>
          <LocationWorkspaceProvider workspace={options.workspace}>
            <LocationGoogleReportView
              binding={options.binding}
              locationId={LOCATION}
              projectId={PROJECT}
              service={options.service}
              onChangeConnection={options.onChangeConnection}
            />
          </LocationWorkspaceProvider>
        </QueryClientProvider>
      )
    })
    return { client, container }
  }

  test("gsc header opens the manage menu for Change property and Unbind", async () => {
    installReportFetch()
    let changed = 0
    const { container } = renderWithChange({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace(),
      onChangeConnection: () => {
        changed += 1
      },
    })
    await flushUntil(() => container.innerHTML.includes("Manage connection"))
    expect(container.innerHTML).toContain("https://example.com/")
    expect(container.innerHTML).toContain("owner@example.com")
    expect(document.querySelector('[role="menuitem"]')).toBeNull()
    await openManageMenu(container)
    await clickMenuItem("Change property")
    expect(changed).toBe(1)
    await openManageMenu(container)
    await clickMenuItem("Unbind")
    await flushUntil(() =>
      fetchCalls.some(
        (call) => call.method === "DELETE" && call.url.includes("/gsc/binding")
      )
    )
    const del = fetchCalls.find((call) => call.method === "DELETE")
    expect(del?.url).toContain(
      `/projects/${PROJECT}/locations/${LOCATION}/gsc/binding`
    )
  })

  test("analytics header unbinds through the analytics binding path", async () => {
    installReportFetch()
    const { container } = renderWithChange({
      service: "analytics",
      binding: analyticsBinding(),
      workspace: makeWorkspace(),
      onChangeConnection: () => {},
    })
    await flushUntil(() => container.innerHTML.includes("Manage connection"))
    expect(container.innerHTML).toContain("Shop")
    expect(container.innerHTML).toContain("owner@example.com")
    await openManageMenu(container)
    await clickMenuItem("Unbind")
    await flushUntil(() =>
      fetchCalls.some(
        (call) =>
          call.method === "DELETE" && call.url.includes("/analytics/binding")
      )
    )
  })

  test("read-only viewers see identity without header actions", async () => {
    installReportFetch()
    const { container } = renderWithChange({
      service: "gsc",
      binding: gscBinding(),
      workspace: makeWorkspace({ canManage: false }),
      onChangeConnection: () => {},
    })
    await flushUntil(() => container.innerHTML.includes("https://example.com/"))
    expect(container.innerHTML.includes("Manage connection")).toBe(false)
    expect(container.innerHTML.includes("Unbind")).toBe(false)
    expect(container.innerHTML.includes("Change")).toBe(false)
  })
})
