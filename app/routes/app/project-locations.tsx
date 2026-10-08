import { Navigate, useMatches, useParams, useSearchParams } from "react-router"

import { LocationListView } from "~/components/locations/location-list-view"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"

type AppRouteData = {
  projects?: Array<{ id: string; base_url?: string }>
  me?: {
    active_org_id?: string
    organizations?: Array<{ id: string; role: string }>
  }
}

/**
 * The parent route loader never sees this child's projectID param, so the
 * active project can name a different project. Match the loader's project list
 * by the route's own project id instead; null means the server still validates
 * the scope origin.
 */
export function parentWebsiteUrlFromMatches(
  matches: ReadonlyArray<{ id: string; data?: unknown }>,
  projectId: string
): string | null {
  const data = matches.find((match) => match.id === "routes/app")?.data as
    AppRouteData | undefined
  return (
    data?.projects?.find((project) => project.id === projectId)?.base_url ??
    null
  )
}

/**
 * Trash is owner-gated, mirroring the backend location workspace can_manage
 * semantics (role == "owner"). Unknown defaults to hidden, never to members.
 */
export function locationListCanManageFromMatches(
  matches: ReadonlyArray<{ id: string; data?: unknown }>
): boolean {
  const data = matches.find((match) => match.id === "routes/app")?.data as
    AppRouteData | undefined
  const me = data?.me
  if (!me) return false
  return (
    me.organizations?.find(
      (organization) => organization.id === me.active_org_id
    )?.role === "owner"
  )
}

export default function ProjectLocationsRoute() {
  const params = useParams()
  const projectId = params.projectID ?? params.projectId ?? ""
  const [searchParams] = useSearchParams()
  const matches = useMatches()
  const locationId = searchParams.get("location")
  const auditId = searchParams.get("audit")
  const parentWebsiteUrl = parentWebsiteUrlFromMatches(matches, projectId)

  if (projectId === "") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Missing project</EmptyTitle>
            <EmptyDescription>
              This screen needs a project in the URL.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )
  }

  if (locationId !== null || auditId !== null) {
    const next = new URLSearchParams({ project: projectId })
    if (locationId !== null) next.set("location", locationId)
    if (auditId !== null) next.set("audit", auditId)
    return <Navigate replace to={`/app?${next.toString()}`} />
  }

  const canManage = locationListCanManageFromMatches(matches)

  return (
    <main aria-label="Locations" className="flex w-full flex-1 flex-col">
      <LocationListView
        canManage={canManage}
        parentWebsiteUrl={parentWebsiteUrl}
        projectId={projectId}
      />
    </main>
  )
}
