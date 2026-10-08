"use client"

import { useQuery } from "@tanstack/react-query"

import {
  fetchLocalSeoLocation,
  localSeoLocationQueryKey,
} from "~/lib/local-seo-api"
import { LocationMapsCompetitorsPage } from "~/components/locations/location-maps-competitors-page"
import { RevserpVisibilityView } from "~/components/revserp-visibility-view"
import type { VisibilityMode } from "~/components/app-navbar/types"


export function LocationVisibilityView({
  projectId,
  locationId,
  initialAuditId,
  mode,
}: {
  projectId: string
  locationId: string
  initialAuditId?: string
  mode?: VisibilityMode
}) {
  const resolvedMode: VisibilityMode =
    mode ?? (initialAuditId ? "ai" : "maps")
  const locationQuery = useQuery({
    queryKey: localSeoLocationQueryKey(projectId, locationId),
    queryFn: () => fetchLocalSeoLocation(projectId, locationId),
    enabled:
      projectId !== "" && locationId !== "" && resolvedMode === "ai",
  })

  if (resolvedMode === "ai") {
    return (
      <RevserpVisibilityView
        projectId={projectId}
        crawlId={null}
        locationId={locationId}
        locationName={locationQuery.data?.name}
        initialAuditId={initialAuditId}
      />
    )
  }
  return (
    <LocationMapsCompetitorsPage projectId={projectId} locationId={locationId} />
  )
}
