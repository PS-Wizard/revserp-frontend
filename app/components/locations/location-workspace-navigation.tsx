"use client"

import { Link, useLocation } from "react-router"
import type {
  AuditTab,
  DashboardView,
  VisibilityMode,
} from "~/components/app-navbar/types"
import { getProjectBackTarget } from "~/components/app-navbar/utils"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import { auditSections } from "~/components/workspace-sidebar-nav"
import { LocationWebsiteScopeSettingsButton } from "~/components/locations/location-website-scope-settings"

const LOCATION_SECTIONS = [
  { id: "maps", label: "Maps", hash: "maps" },
  { id: "ai", label: "AI visibility", hash: "ai-visibility" },
  { id: "website", label: "Website", hash: "overview-tab" },
  { id: "keywords", label: "Keywords", hash: "keywords" },
  { id: "search-console", label: "Search Console", hash: "search-console" },
  { id: "analytics", label: "Analytics", hash: "analytics" },
] as const

type LocationSection = (typeof LOCATION_SECTIONS)[number]["id"]

export function locationSectionHref(
  projectId: string,
  locationId: string,
  section: LocationSection
) {
  const params = new URLSearchParams({
    project: projectId,
    location: locationId,
    location_view: section,
  })
  if (section === "maps" || section === "ai") params.set("visibility", section)
  const hash = LOCATION_SECTIONS.find((item) => item.id === section)!.hash
  return `/app?${params}#${hash}`
}

export function LocationWorkspaceNavigation({
  view,
  auditTab,
  visibilityMode,
  googleReports,
  onOpenProfile,
}: {
  view: DashboardView
  auditTab: AuditTab
  visibilityMode: VisibilityMode
  googleReports: boolean
  onOpenProfile: () => void
}) {
  const workspace = useOptionalLocationWorkspace()
  const location = useLocation()
  if (!workspace) return null
  const params = new URLSearchParams(location.search)
  const scope = workspace.websiteScope ?? null
  const hasWebsiteScope = scope !== null && scope.match !== "none" && (scope.url ?? "") !== ""
  const rawActiveSection =
    view === "revserp-visibility"
      ? visibilityMode === "ai"
        ? "ai"
        : "maps"
      : view === "revserp-audit"
        ? auditTab !== "overview" || params.get("location_view") === "website"
          ? "website"
          : "maps"
        : view === "competitors"
          ? "maps"
          : view
  const activeSection = !hasWebsiteScope && rawActiveSection === "website" ? "maps" : rawActiveSection
  const projectName = workspace.projectName?.trim() ? workspace.projectName : workspace.projectId
  return (
    <section
      aria-label="Location workspace"
      className="flex shrink-0 flex-col gap-3 border-b bg-background px-4 py-3 md:px-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link
            className="text-muted-foreground hover:text-foreground"
            to={getProjectBackTarget(workspace.projectId)}
          >
            {projectName}
          </Link>
          <span aria-hidden="true" className="text-muted-foreground">
            /
          </span>
          <Link
            className="text-muted-foreground hover:text-foreground"
            to={`/app/projects/${encodeURIComponent(workspace.projectId)}/locations`}
          >
            Locations
          </Link>
          <span aria-hidden="true" className="text-muted-foreground">
            /
          </span>
          <span className="truncate font-medium">
            {workspace.location.name}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!hasWebsiteScope ? (
            <LocationWebsiteScopeSettingsButton
              label="Connect site"
              locationId={workspace.location.id}
              projectId={workspace.projectId}
              workspace={workspace}
            />
          ) : null}
          <Button onClick={onOpenProfile} size="sm" variant="outline">
            Location profile
          </Button>
        </div>
      </div>
      <nav
        aria-label="Location navigation"
        className="flex items-center gap-1 overflow-x-auto"
      >
        {LOCATION_SECTIONS.filter(
          (item) =>
            (hasWebsiteScope || item.id !== "website") &&
            (googleReports ||
              (item.id !== "analytics" && item.id !== "search-console"))
        ).map((item) => (
          <Link
            aria-current={activeSection === item.id ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
              activeSection === item.id && "bg-accent text-foreground"
            )}
            key={item.id}
            to={locationSectionHref(
              workspace.projectId,
              workspace.location.id,
              item.id
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {activeSection === "website" ? (
        <nav
          aria-label="Location website audit"
          className="flex items-center gap-1 overflow-x-auto"
        >
          {auditSections
            .filter(([, tab]) => tab !== "site-graph")
            .map(([label, tab]) => (
              <Link
                aria-current={auditTab === tab ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                  auditTab === tab && "bg-accent text-foreground"
                )}
                key={tab}
                to={`${locationSectionHref(workspace.projectId, workspace.location.id, "website").split("#")[0]}#${tab}-tab`}
              >
                {label}
              </Link>
            ))}
        </nav>
      ) : null}
    </section>
  )
}
