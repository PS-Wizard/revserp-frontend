import { afterEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

mock.module("apexcharts", () => ({
  default: class {
    render() {
      return Promise.resolve()
    }
    updateSeries() {}
    updateOptions() {}
    destroy() {}
  },
}))

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { mockDropdownMenu } from "~/lib/dropdown-menu-test-mock"
import type { LocalSeoLocation } from "~/lib/local-seo-api"
import {
  LocationWorkspaceProvider,
  type LocationWorkspace,
} from "~/lib/location-workspace"

installTestDom()

mockDropdownMenu()

const { LocationGoogleView } = await import(
  "~/components/locations/location-google-view"
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

function makeWorkspace(
  overrides: Partial<LocationWorkspace> = {}
): LocationWorkspace {
  return {
    projectId: PROJECT,
    location: makeLocation(),
    canManage: true,
    websiteScope: {
      id: "rev-2",
      revision: 2,
      url: "https://example.com/shop/",
      match: "subtree",
      created_at: "2026-09-01T12:00:00.000Z",
    },
    websiteScopeRevisions: [],
    ...overrides,
  }
}

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

const CONNECTIONS = [
  {
    id: "conn-1",
    google_account_email: "owner@example.com",
    google_status: "active",
  },
]

function gscBinding(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
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
  }
}

function analyticsBinding(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
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
  }
}

function gscOverviewHit() {
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
      history_days: 7,
      windows: {
        "7": {
          range: { current_start: "2026-01-01", current_end: "2026-01-07", previous_start: "2025-12-25", previous_end: "2025-12-31" },
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
          opportunities: { low_ctr_queries: [], striking_distance_queries: [], question_queries: [] },
        },
      },
    },
  }
}

function gscQueriesPage() {
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
      rows: [],
      days: 28,
      limit: 100,
      offset: 0,
      has_more: false,
      start_date: "2026-01-01",
      end_date: "2026-01-28",
    },
  }
}

function analyticsOverviewHit() {
  return {
    location_id: LOCATION,
    source: "project",
    google_connection_id: "conn-1",
    google_account_email: "owner@example.com",
    property_id: "123",
    property_display_name: "Shop",
    scope_applied: true,
    scope: { revision: 2, url: "https://example.com/shop/", match: "subtree" },
    coverage: "branch",
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
      trend: [],
      landing_pages: [],
      channels: [],
      sources: [],
      countries: [],
      devices: [],
    },
  }
}

let bindingPayload: Record<string, unknown> = gscBinding()

function installFetch() {
  ;(globalThis as Record<string, unknown>).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })
    if (method === "DELETE" && url.includes("/binding")) {
      bindingPayload = { ...bindingPayload, configured: false, mode: "inherit", effective: null }
      return Response.json({ ok: true })
    }
    if (method === "PUT" && url.includes("/binding")) {
      const next = body as { mode?: string }
      bindingPayload = {
        ...bindingPayload,
        configured: true,
        mode: next.mode ?? "inherit",
      }
      if (next.mode === "inherit" || next.mode === "off") {
        bindingPayload = { ...bindingPayload, effective: null }
      }
      return Response.json({ ok: true, mode: bindingPayload.mode })
    }
    if (method === "GET" && url.includes("/binding")) {
      return Response.json(bindingPayload)
    }
    if (url.includes("/gsc/report/overview")) return Response.json(gscOverviewHit())
    if (url.includes("/gsc/report/queries")) return Response.json(gscQueriesPage())
    if (url.includes("/analytics/report/overview")) {
      return Response.json(analyticsOverviewHit())
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }) as typeof fetch
}

let root: Root | null = null

function renderView(options: {
  service: "gsc" | "analytics"
  workspace: LocationWorkspace | null
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
          <LocationGoogleView
            projectId={PROJECT}
            locationId={LOCATION}
            service={options.service}
          />
        </LocationWorkspaceProvider>
      </QueryClientProvider>
    )
  })
  return { client, container }
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

afterEach(() => {
  globalThis.fetch = originalFetch
  fetchCalls.length = 0
  bindingPayload = gscBinding()
  if (root) {
    act(() => {
      root!.unmount()
    })
    root = null
  }
  document.body.innerHTML = ""
  window.history.replaceState(null, "", "/")
})

describe("location google view", () => {
  test("default inherit without a row shows the initial Empty CTA, not the parent data", async () => {
    bindingPayload = gscBinding({
      configured: false,
      mode: "inherit",
    })
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.innerHTML.includes("isn&apos;t set up for this location") ||
      container.innerHTML.includes("isn't set up for this location")
    )
    expect(container.innerHTML).toContain("Connect Search Console")
    expect(container.innerHTML).toContain("nothing is saved until")
    expect(container.querySelector('input[type="radio"]')).toBeNull()
    const bindingReads = fetchCalls.filter(
      (call) => call.method === "GET" && call.url.includes("/binding")
    )
    expect(bindingReads).toHaveLength(1)
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)
    expect(
      fetchCalls.every((call) => call.url.includes(`/locations/${LOCATION}/`))
    ).toBe(true)
  })

  test("analytics unconfigured CTA names Analytics", async () => {
    bindingPayload = analyticsBinding({ configured: false, mode: "inherit" })
    installFetch()
    const { container } = renderView({
      service: "analytics",
      workspace: makeWorkspace(),
    })
    await flushUntil(() => container.innerHTML.includes("Connect Analytics"))
    expect(container.querySelector('input[type="radio"]')).toBeNull()
  })

  test("configured binding hides setup selectors behind a compact report header", async () => {
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace(),
    })
    await flushUntil(() => container.innerHTML.includes("Manage connection"))
    expect(container.innerHTML).toContain("https://example.com/")
    expect(container.innerHTML).toContain("owner@example.com")
    expect(container.querySelector('input[type="radio"]')).toBeNull()
    expect(container.innerHTML.includes("Binding mode")).toBe(false)
    // The manage menu, not the setup form, carries the property change entry.
    await openManageMenu(container)
    expect(menuItemByText("Change property")).toBeTruthy()
    expect(
      fetchCalls.some((call) => call.url.includes("/google-accounts/"))
    ).toBe(false)
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)
  })

  test("explicit off shows no selector; Configure and Remove return to the CTA", async () => {
    bindingPayload = gscBinding({ configured: true, mode: "off", effective: null })
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace(),
    })
    await flushUntil(() => container.innerHTML.includes("is off for this location"))
    expect(container.querySelector('input[type="radio"]')).toBeNull()
    expect(container.innerHTML).toContain("Configure")
    const remove = buttonByText(container, "Remove configuration")
    await act(async () => {
      remove.click()
      await flushTestDom()
    })
    await flushUntil(() =>
      fetchCalls.some(
        (call) => call.method === "DELETE" && call.url.includes("/gsc/binding")
      )
    )
    const del = fetchCalls.find((call) => call.method === "DELETE")
    expect(del?.url).toContain(`/projects/${PROJECT}/locations/${LOCATION}/gsc/binding`)
    await flushUntil(() => container.innerHTML.includes("Connect Search Console"))
  })

  test("report Unbind deletes the location binding and returns to the initial CTA", async () => {
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace(),
    })
    await flushUntil(() => container.innerHTML.includes("Manage connection"))
    await openManageMenu(container)
    await clickMenuItem("Unbind")
    await flushUntil(() =>
      fetchCalls.some(
        (call) => call.method === "DELETE" && call.url.includes("/binding")
      )
    )
    await flushUntil(() => container.innerHTML.includes("Connect Search Console"))
    expect(container.querySelector('input[type="radio"]')).toBeNull()
  })

  test("analytics parent controls unbind through the analytics binding path", async () => {
    bindingPayload = analyticsBinding()
    installFetch()
    const { container } = renderView({
      service: "analytics",
      workspace: makeWorkspace(),
    })
    await flushUntil(() => container.innerHTML.includes("Manage connection"))
    expect(container.innerHTML).toContain("Shop")
    await openManageMenu(container)
    await clickMenuItem("Unbind")
    await flushUntil(() =>
      fetchCalls.some(
        (call) =>
          call.method === "DELETE" && call.url.includes("/analytics/binding")
      )
    )
    await flushUntil(() => container.innerHTML.includes("Connect Analytics"))
  })

  test("missing saved identity shows no email and offers Reconnect in the menu", async () => {
    bindingPayload = gscBinding({
      mode: "custom",
      effective: {
        source: "location",
        google_connection_id: "conn-1",
        google_account_email: "",
        site_url: "https://example.com/shop",
      },
      google_connections: [
        { id: "conn-1", google_account_email: "", google_status: "active" },
      ],
    })
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace(),
    })
    await flushUntil(() => container.innerHTML.includes("Manage connection"))
    // The old neutral "Google account" fallback label is gone.
    expect(container.innerHTML.includes("Google account")).toBe(false)
    expect(container.innerHTML.includes("Unverified")).toBe(false)
    await openManageMenu(container)
    expect(menuItemByText("Reconnect account")).toBeTruthy()
  })

  test("read-only viewers get identity without actions or setup controls", async () => {
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace({ canManage: false }),
    })
    await flushUntil(() => container.innerHTML.includes("https://example.com/"))
    expect(container.innerHTML.includes("Unbind")).toBe(false)
    expect(container.innerHTML.includes("Change")).toBe(false)
    expect(container.innerHTML.includes("Reconnect")).toBe(false)
    expect(container.querySelector('input[type="radio"]')).toBeNull()
  })

  test("read-only unconfigured shows no Connect control", async () => {
    bindingPayload = gscBinding({ configured: false, mode: "inherit" })
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace({ canManage: false }),
    })
    await flushUntil(() =>
      container.innerHTML.includes("Only organization owners")
    )
    expect(container.innerHTML.includes("Connect Search Console")).toBe(false)
  })

  test("oauth return shows a notice and strips only oauth params", async () => {
    window.history.replaceState(
      null,
      "",
      "/app?project=proj-1&location=loc-1&gsc_project_id=xyz&gsc_status=connected"
    )
    bindingPayload = gscBinding({ configured: false, mode: "inherit" })
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.innerHTML.includes("Google account connected")
    )
    expect(
      fetchCalls.filter(
        (call) => call.method === "GET" && call.url.includes("/binding")
      ).length
    ).toBe(1)
    expect(window.location.search.includes("gsc_status")).toBe(false)
    expect(window.location.search.includes("gsc_project_id")).toBe(false)
    expect(window.location.search.includes("project=proj-1")).toBe(true)
    expect(window.location.search.includes("location=loc-1")).toBe(true)
  })

  test("oauth mismatch error shows a nothing-changed notice without refetch", async () => {
    window.history.replaceState(
      null,
      "",
      "/app?project=proj-1&location=loc-1&gsc_status=error&gsc_error=google_account_mismatch"
    )
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.innerHTML.includes("did not match the reconnect target")
    )
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await flushTestDom()
      })
    }
    expect(
      fetchCalls.filter(
        (call) => call.method === "GET" && call.url.includes("/binding")
      ).length
    ).toBe(1)
  })

  test("configured inherit without a parent property offers Configure", async () => {
    bindingPayload = gscBinding({ effective: null, project: null })
    installFetch()
    const { container } = renderView({
      service: "gsc",
      workspace: makeWorkspace(),
    })
    await flushUntil(() =>
      container.innerHTML.includes("No property to report yet")
    )
    expect(container.innerHTML).toContain("Configure")
    expect(container.querySelector('input[type="radio"]')).toBeNull()
  })

  test("works without location workspace context", async () => {
    installFetch()
    const { container } = renderView({ service: "gsc", workspace: null })
    await flushUntil(() => container.innerHTML.includes("https://example.com/"))
  })
})
