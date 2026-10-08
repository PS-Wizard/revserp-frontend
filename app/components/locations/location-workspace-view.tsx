import { lazy, Suspense } from "react"
import { Link } from "react-router"
import type {
  AuditTab,
  DashboardView,
  VisibilityMode,
} from "~/components/app-navbar/types"
import { getProjectBackTarget } from "~/components/app-navbar/utils"
import { LocationMapsCompetitorsPage } from "~/components/locations/location-maps-competitors-page"
import { LocationKeywordsView } from "~/components/locations/location-keywords-view"
import { LocationVisibilityView } from "~/components/locations/location-visibility-view"
import { LocationWebsiteAuditView } from "~/components/locations/location-website-audit-view"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"

const LocationGoogleView = lazy(() =>
  import("~/components/locations/location-google-view").then((module) => ({
    default: module.LocationGoogleView,
  }))
)

export function LocationWorkspaceView({
  view,
  auditTab,
  currentCrawlId,
  initialAuditId,
  onAuditTabChange,
  visibilityMode,
}: {
  view: DashboardView
  auditTab: AuditTab
  currentCrawlId: string | null
  initialAuditId?: string
  onAuditTabChange: (tab: AuditTab) => void
  visibilityMode: VisibilityMode
}) {
  const workspace = useOptionalLocationWorkspace()
  if (!workspace) return null
  const projectId = workspace.projectId
  const locationId = workspace.location.id
  // Site graph is whole-site only and hidden from the location nav: a stale
  // deep link or a parent tab switch landing here falls back to overview.
  const effectiveAuditTab = auditTab === "site-graph" ? "overview" : auditTab

  switch (view) {
    case "revserp-visibility":
      return (
        <LocationVisibilityView
          key={`${locationId}:${visibilityMode}:${initialAuditId ?? ""}`}
          projectId={projectId}
          locationId={locationId}
          mode={visibilityMode}
          initialAuditId={initialAuditId}
        />
      )
    case "keywords":
      return <LocationKeywordsView key={locationId} projectId={projectId} locationId={locationId} />
    case "competitors":
    case "compare":
      // Location competitors merged into the combined Maps page: the old
      // competitors navigation renders the same shared-run page.
      return <LocationMapsCompetitorsPage key={locationId} projectId={projectId} locationId={locationId} />
    case "search-console":
    case "analytics":
      return (
        <Suspense fallback={null}>
          <LocationGoogleView
            key={`${locationId}:${view}`}
            projectId={projectId}
            locationId={locationId}
            service={view === "search-console" ? "gsc" : "analytics"}
          />
        </Suspense>
      )
    case "marketplace":
      return (
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Marketplace is not available for locations.{" "}
            <Link
              className="font-medium text-foreground underline underline-offset-4"
              to={getProjectBackTarget(projectId)}
            >
              Back to project
            </Link>
          </p>
        </div>
      )
    default:
      return (
        <LocationWebsiteAuditView
          key={locationId}
          projectId={projectId}
          locationId={locationId}
          auditTab={effectiveAuditTab}
          currentCrawlId={currentCrawlId}
          onAuditTabChange={onAuditTabChange}
        />
      )
  }
}
