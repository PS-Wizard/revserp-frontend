"use client"

import { Navigate } from "react-router"

import { useLocationSetup } from "~/hooks/use-location-setup"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import {
  LOCAL_SEO_DEFAULT_RADIUS_M,
  localSeoEnabledMapQueries,
} from "~/lib/local-seo-api"
import { locationSavedRadiusM } from "~/components/locations/location-maps-run-history"
import { locationSectionHref } from "~/components/locations/location-workspace-navigation"
import { LocationSetupPanel } from "~/components/locations/location-setup-panel"
import { Button } from "~/components/ui/button"

/** Saved grid line for the setup disclosure; null when nothing is saved yet. */
export function describeLocationGridSettings(
  queries: string[],
  radiusM: number | null
): string | null {
  if (queries.length === 0) return null
  const radiusKm = ((radiusM ?? LOCAL_SEO_DEFAULT_RADIUS_M) / 1000).toFixed(1)
  return `${queries.length} ${queries.length === 1 ? "map query" : "map queries"} · ${radiusKm} km radius`
}


export function LocationHomeView({
  projectId,
  locationId,
}: {
  projectId: string
  locationId: string
}) {
  const workspace = useOptionalLocationWorkspace()
  const setup = useLocationSetup({
    projectId,
    locationId,
    enabled: projectId !== "" && locationId !== "",
  })
  if (!setup.isLoading && setup.loadError && !setup.setup) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
        <p className="text-sm text-destructive" role="alert">
          {setup.loadError}
        </p>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void setup.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }
  if (setup.setup?.status === "completed") {
    return (
      <Navigate
        replace
        to={locationSectionHref(projectId, locationId, "maps")}
      />
    )
  }
  const location = workspace?.location ?? null
  const gridSummary = location
    ? describeLocationGridSettings(
        localSeoEnabledMapQueries(location.queries),
        locationSavedRadiusM(location)
      )
    : null
  return (
    <LocationSetupPanel
      canStart={workspace?.canManage ?? false}
      gridSummary={gridSummary}
      isLoading={setup.isLoading}
      isStarting={setup.isStarting}
      onStart={(differences) => void setup.start(differences)}
      setup={setup.setup}
      startError={setup.startError}
    />
  )
}
