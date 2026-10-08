"use client"

import { useMemo, useState } from "react"
import { MapPinIcon } from "lucide-react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { ApiError } from "~/lib/api"
import {
  LOCAL_SEO_POINT_COUNT,
  fetchLocalSeoLatestRun,
  fetchLocalSeoLocation,
  fetchLocalSeoRun,
  fetchLocalSeoRunCompetitors,
  fetchLocalSeoRunPointCompetitors,
  isLocalSeoLocationBound,
  localSeoLatestRunQueryKey,
  localSeoLocationQueryKey,
  localSeoPointLetter,
  localSeoRunCompetitorsQueryKey,
  localSeoRunPointCompetitorsQueryKey,
  localSeoRunQueryKey,
  localSeoRunRefetchInterval,
  validateLocalSeoCoordinates,
  validateLocalSeoRadiusM,
  type LocalSeoRun,
} from "~/lib/local-seo-api"
import {
  findLocalSeoCentreCell,
  summarizeLocalSeoGridCells,
  type LocalSeoPointSummary,
} from "~/lib/local-seo-directional"
import { gridFeatureCollection } from "~/lib/local-seo-grid-geo"
import { Badge } from "~/components/ui/badge"
import { LocalSeoMap } from "~/components/local-seo-map"
import { LocalSeoRunControls } from "~/components/local-seo-run-controls"
import {
  LocationMapsPointCard,
  selectLocationMapsNewRunRadiusM,
} from "~/components/locations/location-visibility-maps"
import { LocationSavedRunPicker } from "~/components/locations/location-saved-run-picker"
import { LocationCompetitorsCards } from "~/components/locations/location-competitors-view"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { VisibilityRunningBanner } from "~/components/visibility-shared"

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

/** Frozen-run centre for the combined local page: the stored centre cell, never the live listing. */
export function selectCombinedLocalMapsCenter(
  run: LocalSeoRun | null
): [number, number] | null {
  if (!run) return null
  const centre = findLocalSeoCentreCell(run.cells)
  if (!centre) return null
  if (!Number.isFinite(centre.latitude) || !Number.isFinite(centre.longitude))
    return null
  if (validateLocalSeoCoordinates(centre.latitude, centre.longitude) !== null)
    return null
  return [centre.longitude, centre.latitude]
}

/** Combined LOCAL Maps and competitors page. One run picker, one map, one
shared point focus across the grid cards and the competitor scope below. */
export function LocationMapsCompetitorsPage({
  projectId,
  locationId,
}: {
  projectId: string
  locationId: string
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [sessionRunId, setSessionRunId] = useState<string | null>(null)
  const [focusedPointIndex, setFocusedPointIndex] = useState<number | null>(null)
  const workspace = useOptionalLocationWorkspace()
  const canManage = workspace?.canManage ?? true
  const locationQuery = useQuery({
    queryKey: localSeoLocationQueryKey(projectId, locationId),
    queryFn: () => fetchLocalSeoLocation(projectId, locationId),
    enabled: projectId !== "" && locationId !== "",
  })
  const latestRunQuery = useQuery({
    queryKey: localSeoLatestRunQueryKey(projectId, locationId),
    queryFn: () => fetchLocalSeoLatestRun(projectId, locationId),
    enabled: projectId !== "" && locationId !== "",
    refetchInterval: (query) =>
      localSeoRunRefetchInterval(query.state.data?.status),
  })
  const latestRun = latestRunQuery.data ?? null
  const location = locationQuery.data ?? null
  const bound = location ? isLocalSeoLocationBound(location) : false
  const historySelected = selectedRunId !== null
  const evidenceQuery = useQuery({
    queryKey: historySelected
      ? localSeoRunQueryKey(projectId, locationId, selectedRunId)
      : (["local-seo-run", projectId, locationId, "none"] as const),
    queryFn: () => fetchLocalSeoRun(projectId, locationId, selectedRunId!),
    enabled: historySelected && projectId !== "" && locationId !== "",
    refetchInterval: (query) =>
      localSeoRunRefetchInterval(query.state.data?.status),
  })
  // One shared run: the history pick (or the live latest) feeds the map, the
  // nine grid cards, and the competitors below it.
  const evidenceRun = historySelected ? (evidenceQuery.data ?? null) : latestRun
  const pointSummaries = useMemo(() => {
    if (!evidenceRun) return new Map<number, LocalSeoPointSummary>()
    return new Map(
      summarizeLocalSeoGridCells(evidenceRun.cells, null).points.map(
        (point) => [point.pointIndex, point] as const
      )
    )
  }, [evidenceRun])
  const fallbackCenter: [number, number] | null =
    location &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
      ? [location.longitude, location.latitude]
      : null
  const mapCenter = selectCombinedLocalMapsCenter(evidenceRun) ?? fallbackCenter
  const overlayData = useMemo(() => {
    if (!mapCenter || !evidenceRun) return undefined
    if (validateLocalSeoRadiusM(evidenceRun.radius_m) !== null) return undefined
    return gridFeatureCollection(evidenceRun.cells, mapCenter, evidenceRun.radius_m)
  }, [mapCenter?.[0], mapCenter?.[1], evidenceRun])

  const competitorsEnabled = bound && evidenceRun !== null
  const scopeQuery = useQuery({
    queryKey:
      competitorsEnabled && evidenceRun
        ? focusedPointIndex === null
          ? localSeoRunCompetitorsQueryKey(
              projectId,
              locationId,
              evidenceRun.id,
              evidenceRun.status,
              evidenceRun.completed_cells ?? null
            )
          : localSeoRunPointCompetitorsQueryKey(
              projectId,
              locationId,
              evidenceRun.id,
              focusedPointIndex,
              evidenceRun.status,
              evidenceRun.completed_cells ?? null
            )
        : (["location-maps-competitors", "none"] as const),
    queryFn: () =>
      focusedPointIndex === null
        ? fetchLocalSeoRunCompetitors(projectId, locationId, evidenceRun!.id)
        : fetchLocalSeoRunPointCompetitors(
            projectId,
            locationId,
            evidenceRun!.id,
            focusedPointIndex!
          ),
    enabled: competitorsEnabled,
    placeholderData: keepPreviousData,
    refetchInterval: localSeoRunRefetchInterval(evidenceRun?.status),
  })

  if (locationQuery.isPending || latestRunQuery.isPending) {
    return <Skeleton className="h-64 w-full" />
  }
  if (locationQuery.isError || !location) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {errorMessageOf(locationQuery.error, "Could not load the location")}
      </p>
    )
  }
  if (!bound) {
    return (
      <p className="text-sm text-muted-foreground">
        Bind a Google listing before Maps results can appear.
      </p>
    )
  }

  const radiusM = selectLocationMapsNewRunRadiusM(location, latestRun)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
      {evidenceRun || historySelected ? (
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
      <LocationSavedRunPicker
        projectId={projectId}
        locationId={location.id}
        latestRun={latestRun}
        value={selectedRunId}
        sessionRunId={sessionRunId}
        onChange={(runId) => {
          setSelectedRunId(runId)
          setFocusedPointIndex(null)
        }}
      />
      {evidenceRun ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge
            variant="outline"
            title={evidenceRun.queries.join(" · ") || "No queries"}
          >
            {`${evidenceRun.queries.length} ${evidenceRun.queries.length === 1 ? "query" : "queries"}`}
          </Badge>
          <Badge variant="outline">
            {`${(evidenceRun.radius_m / 1000).toFixed(1)} km radius`}
          </Badge>
          <Badge variant="secondary">{evidenceRun.status}</Badge>
        </div>
      ) : null}
      </div>
      {canManage ? (
        <LocalSeoRunControls
          part="action"
          key={`${projectId}:${location.id}`}
          projectId={projectId}
          location={location}
          radiusM={radiusM}
          onRunStarted={(runId) => {
            setSessionRunId(runId)
            setSelectedRunId(runId)
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Only organization owners can start a Maps run.
        </p>
      )}
      </div>
      ) : null}
      {latestRunQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessageOf(latestRunQuery.error, "Could not load the latest run")}
        </p>
      ) : null}
      {latestRun &&
      (latestRun.status === "queued" || latestRun.status === "running") ? (
        <VisibilityRunningBanner
          label={
            latestRun.status === "queued"
              ? "Run queued · credits stay reserved until it finishes"
              : "Run in progress · resolving cells"
          }
          completedText={
            typeof latestRun.completed_cells === "number" &&
            typeof latestRun.total_cells === "number"
              ? `${latestRun.completed_cells} of ${latestRun.total_cells} cells settled`
              : "Progress unavailable"
          }
          fraction={
            typeof latestRun.completed_cells === "number" &&
            typeof latestRun.total_cells === "number" &&
            latestRun.total_cells > 0
              ? latestRun.completed_cells / latestRun.total_cells
              : null
          }
        />
      ) : null}
      {historySelected && evidenceQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessageOf(evidenceQuery.error, "Could not load the saved run")}
        </p>
      ) : null}

      {historySelected && evidenceQuery.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : historySelected && evidenceQuery.isError ? (
        <p className="text-sm text-muted-foreground">Saved run unavailable.</p>
      ) : !historySelected && latestRunQuery.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : evidenceRun ? (
        <>
          <section aria-label="Run map">
            <div className="h-[55vh] min-h-[320px] w-full overflow-hidden rounded-xl border border-border sm:min-h-[380px]">
              <LocalSeoMap
                key={`${location.id}:${evidenceRun.id}`}
                center={mapCenter ?? undefined}
                // Page scroll wins over wheel capture here; drag, click, and +/- stay live.
                disableScrollZoom
                radiusM={
                  mapCenter &&
                  validateLocalSeoRadiusM(evidenceRun.radius_m) === null
                    ? evidenceRun.radius_m
                    : null
                }
                overlayData={overlayData}
                onMapClick={() => setFocusedPointIndex(null)}
                onFeatureClick={(feature) => {
                  const pointIndex = feature.properties?.pointIndex
                  if (typeof pointIndex !== "number") return
                  setFocusedPointIndex((current) =>
                    current === pointIndex ? null : pointIndex
                  )
                }}
              />
            </div>
          </section>
          <section aria-label="Grid point results" className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Grid points</h2>
            <div
              aria-label="Nine-point grid results"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {Array.from({ length: LOCAL_SEO_POINT_COUNT }, (_, pointIndex) => {
                const focused = focusedPointIndex === pointIndex
                return (
                  <div
                    key={`${evidenceRun.id}:${pointIndex}`}
                    className={
                      focused
                        ? "rounded-lg ring-2 ring-primary/70 ring-offset-4 ring-offset-background"
                        : undefined
                    }
                  >
                    <LocationMapsPointCard
                      projectId={projectId}
                      locationId={location.id}
                      pointIndex={pointIndex}
                      run={evidenceRun}
                      pointCells={evidenceRun.cells.filter(
                        (cell) => cell.point_index === pointIndex
                      )}
                      summary={pointSummaries.get(pointIndex) ?? null}
                    />
                  </div>
                )
              })}
            </div>
          </section>
          <section
            aria-label="Location competitors"
            className="flex flex-col gap-3"
          >
            <LocationCompetitorsCards
              scopeControl={
                <select
                  aria-label="Competitor scope"
                  value={
                    focusedPointIndex === null ? "whole" : String(focusedPointIndex)
                  }
                  onChange={(event) => {
                    setFocusedPointIndex(
                      event.target.value === "whole"
                        ? null
                        : Number.parseInt(event.target.value, 10)
                    )
                  }}
                  className="h-8 rounded-lg border border-border bg-card px-2.5 text-sm"
                >
                  <option value="whole">All points</option>
                  {Array.from({ length: LOCAL_SEO_POINT_COUNT }, (_, index) => (
                    <option key={index} value={String(index)}>
                      {`Point ${localSeoPointLetter(index)}`}
                    </option>
                  ))}
                </select>
              }
              data={scopeQuery.data ?? null}
              pending={scopeQuery.isPending || scopeQuery.isFetching}
              error={
                scopeQuery.isError
                  ? errorMessageOf(
                      scopeQuery.error,
                      "Could not load competitors"
                    )
                  : null
              }
            />
          </section>
        </>
      ) : (
        <Empty className="border border-dashed border-border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPinIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No runs yet for this location</EmptyTitle>
            <EmptyDescription>
              Start a Maps run to sample {LOCAL_SEO_POINT_COUNT} grid points
              around this listing. Point results and competitors appear here
              once it finishes.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {canManage ? (
              <LocalSeoRunControls
                part="action"
                key={`${projectId}:${location.id}`}
                projectId={projectId}
                location={location}
                radiusM={radiusM}
                onRunStarted={(runId) => {
                  setSessionRunId(runId)
                  setSelectedRunId(runId)
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Only organization owners can start a Maps run.
              </p>
            )}
          </EmptyContent>
        </Empty>
      )}
      <LocalSeoRunControls
        part="recorded"
        projectId={projectId}
        location={location}
        radiusM={radiusM}
      />
    </div>
  )
}
