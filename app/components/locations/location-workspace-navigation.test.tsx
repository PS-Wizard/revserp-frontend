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

function renderNavigation(website: boolean, googleReports = false) {
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
        <LocationWorkspaceProvider workspace={workspace}>
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
