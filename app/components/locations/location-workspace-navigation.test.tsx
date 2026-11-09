import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { revbotHashTarget } from "~/components/app-navbar/types"
import {
  LocationWorkspaceProvider,
  type LocationWorkspace,
} from "~/lib/location-workspace"
import {
  LocationWorkspaceNavigation,
  locationSectionHref,
} from "./location-workspace-navigation"

const workspace: LocationWorkspace = {
  projectId: "project-1",
  projectName: "Revketer",
  location: {
    id: "location-1",
    project_id: "project-1",
    name: "Parramatta",
    place_id: "place-1",
    address: "Parramatta NSW",
    locality: "Parramatta",
    localities: [],
    services: [],
    latitude: -33.8,
    longitude: 151,
    queries: [],
  },
  canManage: true,
  websiteScope: null,
  websiteScopeRevisions: [],
}

function scopedWorkspace(): LocationWorkspace {
  return {
    ...workspace,
    websiteScope: {
      id: "scope-1",
      revision: 1,
      url: "https://example.com/parramatta",
      match: "subtree",
      created_at: "2026-01-01T00:00:00Z",
    },
  }
}

function renderNavigation(website: boolean, googleReports = false, scoped = website) {
  const activeWorkspace = scoped ? scopedWorkspace() : workspace
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter
        initialEntries={[
          locationSectionHref(
            "project-1",
            "location-1",
            website ? "website" : "maps"
          ),
        ]}
      >
        <LocationWorkspaceProvider workspace={activeWorkspace}>
          <LocationWorkspaceNavigation
            view="revserp-audit"
            auditTab="overview"
            visibilityMode="maps"
            googleReports={googleReports}
            onOpenProfile={() => undefined}
          />
        </LocationWorkspaceProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("location workspace navigation", () => {
  test("Maps and AI links restore the correct workspace on refresh", () => {
    for (const section of ["maps", "ai"] as const) {
      const url = new URL(
        locationSectionHref("project-1", "location-1", section),
        "https://example.com"
      )
      expect(url.searchParams.get("location")).toBe("location-1")
      expect(url.searchParams.get("visibility")).toBe(section)
      expect(revbotHashTarget(url.hash.slice(1))).toEqual({
        view: "revserp-visibility",
      })
    }
  })

  test("website audit sections appear only inside Website", () => {
    expect(
      renderNavigation(false).includes('aria-label="Location website audit"')
    ).toBe(false)
    const html = renderNavigation(true)
    expect(html).toContain('aria-label="Location website audit"')
    expect(html).toContain("#seo-tab")
    expect(html.includes("#site-graph-tab")).toBe(false)
  })

  test("Google report navigation follows the feature gate", () => {
    expect(renderNavigation(false).includes("Search Console")).toBe(false)
    expect(renderNavigation(false, true)).toContain("Search Console")
  })

  test("breadcrumb shows project, locations, and location with project linking to overview", () => {
    const html = renderNavigation(false)
    expect(html).toContain("Revketer")
    expect(html).toContain("Locations")
    expect(html).toContain("Parramatta")
    expect(html).toContain('href="/app?project=project-1"')
  })

  test("website tab hides without scope and shows a connect action", () => {
    const unscoped = renderNavigation(false, false, false)
    expect(unscoped.includes(">Website<")).toBe(false)
    expect(unscoped).toContain("Connect site")
    const scoped = renderNavigation(true)
    expect(scoped.includes(">Website<")).toBe(true)
    expect(scoped.includes("Connect site")).toBe(false)
  })

  test("identifiers are URL encoded", () => {
    const url = new URL(
      locationSectionHref("project & 1", "branch/2", "website"),
      "https://example.com"
    )
    expect(url.searchParams.get("project")).toBe("project & 1")
    expect(url.searchParams.get("location")).toBe("branch/2")
  })
})

describe("location navigation without overview", () => {
  test("no overview tab, no website pages action, profile and breadcrumb kept", () => {
    const html = renderNavigation(true)
    const navStart = html.indexOf('aria-label="Location navigation"')
    const navHtml = html.slice(navStart, html.indexOf("</nav>", navStart))
    expect(navHtml.includes(">Overview<")).toBe(false)
    expect(html.includes("Website pages")).toBe(false)
    expect(html).toContain("Location profile")
    expect(html).toContain("Locations")
    expect(html).toContain("md:px-8")
  })

  test("legacy location_view=overview highlights Maps", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter
          initialEntries={[
            "/app?project=project-1&location=location-1&location_view=overview",
          ]}
        >
          <LocationWorkspaceProvider workspace={workspace}>
            <LocationWorkspaceNavigation
              view="revserp-audit"
              auditTab="overview"
              visibilityMode="maps"
              googleReports={false}
              onOpenProfile={() => undefined}
            />
          </LocationWorkspaceProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
    const current = html.indexOf('aria-current="page"')
    expect(current >= 0).toBe(true)
    expect(html.slice(current, html.indexOf("</a>", current))).toContain(">Maps")
  })
})
