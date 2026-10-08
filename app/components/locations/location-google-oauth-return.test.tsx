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

mock.module("~/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import type { LocalSeoLocation } from "~/lib/local-seo-api"
import {
  LocationWorkspaceProvider,
  type LocationWorkspace,
} from "~/lib/location-workspace"

installTestDom()

// base-ui detects `document` at module load, so the DOM must exist before the
// component (and its dropdown-menu dependency) is imported.
const { LocationGoogleView } = await import(
  "~/components/locations/location-google-view"
)

const PROJECT = "proj-1"
const LOCATION = "loc-1"

function makeWorkspace(): LocationWorkspace {
  return {
    projectId: PROJECT,
    location: {
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
    } as LocalSeoLocation,
    canManage: true,
    websiteScope: {
      id: "rev-2",
      revision: 2,
      url: "https://example.com/shop/",
      match: "subtree",
      created_at: "2026-09-01T12:00:00.000Z",
    },
    websiteScopeRevisions: [],
  }
}

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch
let bindingPayload: Record<string, unknown> = {}

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
    if (method === "GET" && url.includes("/binding")) {
      return Response.json(bindingPayload)
    }
    if (url.includes("/gsc/report/overview")) {
      return Response.json({
        location_id: LOCATION,
        source: "location",
        google_connection_id: "conn-1",
        google_account_email: "owner@example.com",
        site_url: "https://example.com/shop",
        coverage: "property-wide",
        cached: true,
        configured: true,
        overview: {
          history_days: 7,
          windows: {
            "7": {
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
      })
    }
    if (url.includes("/gsc/report/queries")) {
      return Response.json({
        location_id: LOCATION,
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
      })
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }) as typeof fetch
}

let root: Root | null = null

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <QueryClientProvider client={client}>
        <LocationWorkspaceProvider workspace={makeWorkspace()}>
          <LocationGoogleView
            projectId={PROJECT}
            locationId={LOCATION}
            service="gsc"
          />
        </LocationWorkspaceProvider>
      </QueryClientProvider>
    )
  })
  return { container }
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

function radioByTitle(scope: ParentNode, title: string) {
  const label = [...scope.querySelectorAll("label")].find((candidate) =>
    candidate.textContent?.includes(title)
  )
  const input = label?.querySelector('input[type="radio"]')
  if (!input) throw new Error(`radio "${title}" not found`)
  return input as HTMLInputElement
}

function liveCalls() {
  return fetchCalls.filter(
    (call) =>
      call.method !== "GET" || call.url.includes("/google-accounts/")
  )
}

afterEach(() => {
  globalThis.fetch = originalFetch
  fetchCalls.length = 0
  bindingPayload = {}
  if (root) {
    act(() => {
      root!.unmount()
    })
    root = null
  }
  document.body.innerHTML = ""
  window.history.replaceState(null, "", "/")
})

describe("location google oauth return", () => {
  test("own unconfigured return restores the custom step with zero live calls", async () => {
    bindingPayload = {
      configured: false,
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
      google_connections: [
        {
          id: "conn-1",
          google_account_email: "owner@example.com",
          google_status: "active",
        },
        {
          id: "conn-new",
          google_account_email: "newuser@example.com",
          google_status: "active",
        },
      ],
    }
    window.history.replaceState(
      null,
      "",
      "/app?project=proj-1&location=loc-1&gsc_status=connected&google_setup=custom&google_service=gsc&google_location=loc-1"
    )
    installFetch()
    const { container } = renderView()
    await flushUntil(() =>
      container.innerHTML.includes("This location&apos;s own property") ||
      container.innerHTML.includes("This location's own property")
    )
    expect(
      radioByTitle(container, "This location's own property").checked
    ).toBe(true)
    expect(radioByTitle(container, "Inherit parent").checked).toBe(false)
    expect(container.innerHTML).toContain("Google account connected")
    expect(container.innerHTML).toContain("owner@example.com")
    expect(container.innerHTML.includes("Unverified")).toBe(false)
    expect(liveCalls()).toEqual([])
    expect(
      fetchCalls.filter(
        (call) => call.method === "GET" && call.url.includes("/binding")
      )
    ).toHaveLength(1)
    expect(window.location.search.includes("google_setup")).toBe(false)
    expect(window.location.search.includes("gsc_status")).toBe(false)
    expect(window.location.search.includes("project=proj-1")).toBe(true)
  })

  test("custom configured error return restores the custom step without saving", async () => {
    bindingPayload = {
      configured: true,
      mode: "custom",
      effective: {
        source: "location",
        google_connection_id: "conn-1",
        google_account_email: "owner@example.com",
        site_url: "https://example.com/shop",
      },
      project: {
        google_connection_id: "conn-1",
        site_url: "https://example.com/",
      },
      google_connections: [
        {
          id: "conn-1",
          google_account_email: "owner@example.com",
          google_status: "active",
        },
      ],
    }
    window.history.replaceState(
      null,
      "",
      "/app?project=proj-1&location=loc-1&gsc_status=error&gsc_error=google_account_mismatch&google_setup=custom&google_service=gsc&google_location=loc-1"
    )
    installFetch()
    const { container } = renderView()
    await flushUntil(() =>
      container.innerHTML.includes("did not match the reconnect target")
    )
    await flushUntil(
      () =>
        radioByTitle(container, "This location's own property").checked ===
        true
    )
    expect(radioByTitle(container, "Inherit parent").checked).toBe(false)
    const finalize = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Finalize")
    ) as HTMLButtonElement
    expect(finalize.disabled).toBe(false)
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await flushTestDom()
      })
    }
    expect(liveCalls()).toEqual([])
    expect(window.location.search.includes("google_setup")).toBe(false)
    expect(window.location.search.includes("gsc_error")).toBe(false)
  })
})
