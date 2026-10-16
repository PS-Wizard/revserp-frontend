import { describe, expect, test } from "bun:test"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter, useLocation } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { LocationWorkspaceView } from "~/components/locations/location-workspace-view"
import { LocationWorkspaceProvider } from "~/lib/location-workspace"
import {
  locationSetupQueryKey,
  type LocationSetupResponse,
} from "~/lib/location-setup-api"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const WORKSPACE = {
  projectId: "p-1",
  location: {
    id: "l-9",
    project_id: "p-1",
    name: "Roastery",
    place_id: "ChIJ1",
    address: "Main Street 1",
    locality: "Downtown",
    localities: [],
    services: [],
    latitude: 27.7,
    longitude: 85.3,
    queries: [],
  },
  canManage: true,
  websiteScope: null,
  websiteScopeRevisions: [],
}

describe("location dispatch integration", () => {
  test("unsupported marketplace view guards back to the project", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    try {
      act(() => {
        root.render(
          <MemoryRouter>
            <LocationWorkspaceProvider workspace={WORKSPACE}>
              <LocationWorkspaceView
                view="marketplace"
                visibilityMode="maps"
                auditTab="overview"
                currentCrawlId={null}
                onAuditTabChange={() => undefined}
              />
            </LocationWorkspaceProvider>
          </MemoryRouter>
        )
      })
      await act(async () => {
        await flushTestDom()
      })
      const html = host.innerHTML
      expect(html).toContain("not available for locations")
      const link = host.querySelector("a")
      expect(link?.getAttribute("href")).toBe("/app?project=p-1")
    } finally {
      act(() => root.unmount())
      host.remove()
      document.body.innerHTML = ""
    }
  })

  test("no workspace renders nothing", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    try {
      act(() => {
        root.render(
          <MemoryRouter>
            <LocationWorkspaceProvider workspace={null}>
              <LocationWorkspaceView
                view="revserp-visibility"
                visibilityMode="ai"
                auditTab="overview"
                currentCrawlId={null}
                onAuditTabChange={() => undefined}
              />
            </LocationWorkspaceProvider>
          </MemoryRouter>
        )
      })
      await act(async () => {
        await flushTestDom()
      })
      expect(host.innerHTML).toBe("")
    } finally {
      act(() => root.unmount())
      host.remove()
      document.body.innerHTML = ""
    }
  })
})

describe("location site-graph normalization", () => {
  test("stale site-graph deep links land on the overview panel", () => {
    const scoped = {
      ...WORKSPACE,
      websiteScope: {
        id: "rev-id-1",
        revision: 1,
        url: "https://example.com/locations/roastery/",
        match: "exact" as const,
        created_at: "2026-09-02T12:00:00.000Z",
      },
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    try {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <QueryClientProvider client={client}>
            <LocationWorkspaceProvider workspace={scoped}>
              <LocationWorkspaceView
                view="revserp-audit"
                visibilityMode="maps"
                auditTab="site-graph"
                currentCrawlId={null}
                onAuditTabChange={() => undefined}
              />
            </LocationWorkspaceProvider>
          </QueryClientProvider>
        </MemoryRouter>
      )
      expect(html.includes("whole-site only")).toBe(false)
      expect(html).toContain("Deriving branch scores")
    } finally {
      client.clear()
    }
  })
})

describe("location home routing", () => {
  function seedSetup(client: QueryClient, setup: LocationSetupResponse) {
    client.setQueryData(locationSetupQueryKey("p-1", "l-9"), setup)
  }

  async function renderHome(client: QueryClient, seen: string[]) {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    try {
      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={["/app?project=p-1&location=l-9"]}>
            <PathProbe seen={seen} />
            <QueryClientProvider client={client}>
              <LocationWorkspaceProvider workspace={WORKSPACE}>
                <LocationWorkspaceView
                  view="revserp-audit"
                  visibilityMode="maps"
                  auditTab="overview"
                  currentCrawlId={null}
                  onAuditTabChange={() => undefined}
                />
              </LocationWorkspaceProvider>
            </QueryClientProvider>
          </MemoryRouter>
        )
        await flushTestDom()
        await flushTestDom()
      })
      return host.innerHTML
    } finally {
      act(() => root.unmount())
      host.remove()
      document.body.innerHTML = ""
    }
  }

  function PathProbe({ seen }: { seen: string[] }) {
    seen.push(`${useLocation().pathname}${useLocation().search}${useLocation().hash}`)
    return null
  }

  function newClient() {
    return new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
  }

  test("completed setup replaces the root with Maps", async () => {
    const client = newClient()
    seedSetup(client, { status: "completed", differences: "", steps: [] })
    const seen: string[] = []
    const html = await renderHome(client, seen)
    expect(seen.at(-1)).toBe("/app?project=p-1&location=l-9&location_view=maps&visibility=maps#maps")
    expect(html.includes("Location overview")).toBe(false)
    client.clear()
  })

  test("fresh setup stays on Initialize Location", async () => {
    const client = newClient()
    seedSetup(client, { status: "ready", differences: "", steps: [] })
    const seen: string[] = []
    const html = await renderHome(client, seen)
    expect(seen.at(-1)).toBe("/app?project=p-1&location=l-9")
    expect(html).toContain("Initialize Location")
    client.clear()
  })
})
