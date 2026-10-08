"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { ApiError } from "~/lib/api"
import {
  LOCAL_SEO_DEFAULT_RADIUS_M,
  LOCAL_SEO_POINT_COUNT,
  fetchLocalSeoLatestRun,
  fetchLocalSeoLocation,
  fetchLocalSeoPointDetails,
  fetchLocalSeoRun,
  isLocalSeoLocationBound,
  isLocalSeoRunActive,
  localSeoLatestRunQueryKey,
  localSeoLocationQueryKey,
  localSeoPointDetailsQueryKey,
  localSeoPointLetter,
  localSeoRunQueryKey,
  localSeoRunRefetchInterval,
  type LocalSeoCell,
  type LocalSeoLocation,
  type LocalSeoPointQuery,
  type LocalSeoRun,
} from "~/lib/local-seo-api"
import {
  formatLocalSeoEmptyMeanRank,
  formatLocalSeoMeanRank,
  summarizeLocalSeoGridCells,
  type LocalSeoPointSummary,
} from "~/lib/local-seo-directional"
import { LocationSavedRunPicker } from "~/components/locations/location-saved-run-picker"
import { locationSavedRadiusM } from "~/components/locations/location-maps-run-history"
import { LocalSeoRunControls } from "~/components/local-seo-run-controls"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import {
  VisibilityModelCard,
  VisibilityQueryRow,
  VisibilityRunningBanner,
  type VisibilityItemStatus,
} from "~/components/visibility-shared"

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function selectLocationMapsNewRunRadiusM(
  location: LocalSeoLocation,
  latestRun: LocalSeoRun | null
): number {
  return (
    locationSavedRadiusM(location) ??
    latestRun?.radius_m ??
    LOCAL_SEO_DEFAULT_RADIUS_M
  )
}

export function describeLocationMapsCellStatus(cell: LocalSeoCell): string {
  if (cell.call_status === "pending") return "Pending"
  if (cell.call_status === "request_failed") return "Failed"
  if (cell.call_status === "success_empty") return "No results"
  if (
    cell.match_status === "found" &&
    typeof cell.rank === "number" &&
    Number.isFinite(cell.rank) &&
    cell.rank > 0
  ) {
    return `#${Number.isInteger(cell.rank) ? String(cell.rank) : cell.rank.toFixed(1)}`
  }
  if (cell.match_status === "absent") return "Not found"
  return "Unknown"
}

/** Human line for a stored viewport drift: requested vs returned centre plus
the saved raw distance. Null when the run stored no usable drift. */
export function describeLocationMapsViewportDrift(
  cell: Pick<LocalSeoCell, "requested_ll" | "echoed_ll" | "viewport_drift_m">
): string | null {
  const drift = cell.viewport_drift_m
  if (typeof drift !== "number" || !Number.isFinite(drift) || drift < 0)
    return null
  const parts: string[] = []
  const requested = cell.requested_ll?.trim()
  const returned = cell.echoed_ll?.trim()
  if (requested) parts.push(`Requested ${requested}`)
  if (returned) parts.push(`Returned ${returned}`)
  parts.push(`Centre drift \u2248 ${Math.round(drift)} m`)
  return parts.join(" \u00b7 ")
}

const LOCATION_MAPS_POINT_SECTORS = [
  "NW",
  "N",
  "NE",
  "W",
  "centre",
  "E",
  "SW",
  "S",
  "SE",
] as const

function locationMapsPointCaption(pointIndex: number): string {
  const sector = LOCATION_MAPS_POINT_SECTORS[pointIndex] ?? "?"
  return sector === "centre" ? "Centre" : sector
}

function LocationMapsStoredQueryError({ entry }: { entry: LocalSeoPointQuery }) {
  const withoutStoredCause =
    entry.call_status === "request_failed" &&
    (entry.error === null || entry.error === "request failed")
  if (entry.error && !withoutStoredCause) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {entry.error}
      </p>
    )
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      The provider call failed; no specific cause was stored for this query.
    </p>
  )
}

function LocationMapsQueryEvidence({ entry }: { entry: LocalSeoPointQuery }) {
  if (entry.call_status === "pending") {
    return <p className="text-sm text-muted-foreground">No response yet.</p>
  }
  if (entry.call_status === "request_failed") {
    return <LocationMapsStoredQueryError entry={entry} />
  }
  if (entry.call_status === "success_empty") {
    return (
      <p className="text-sm text-muted-foreground">
        The provider returned nothing here.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {entry.places.length === 0 ? (
        <p role="alert" className="text-sm text-destructive">
          The provider reported results but stored none.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {entry.places.map((place, index) => (
            <li
              key={`${entry.query_index}:${index}`}
              className={`flex items-start gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                place.is_target ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : ""
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-micro font-semibold ${
                  place.is_target
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {place.position ?? index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-1.5">
                  <span
                    className={`break-words ${
                      place.is_target ? "font-medium text-foreground" : "text-foreground/80"
                    }`}
                  >
                    {place.title}
                  </span>
                  {place.is_target ? (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-micro font-semibold tracking-wide text-emerald-500 uppercase">
                      You
                    </span>
                  ) : null}
                </p>
                {place.address ? (
                  <p className="text-xs text-muted-foreground">{place.address}</p>
                ) : null}
                {place.rating !== null || place.rating_count !== null ? (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {[
                      place.rating !== null ? `★ ${place.rating}` : null,
                      place.rating_count !== null
                        ? `${place.rating_count} reviews`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {entry.match_status === "absent" ? (
        <p className="text-sm text-muted-foreground">
          Your business is not in this list.
        </p>
      ) : null}
    </div>
  )
}

export function LocationMapsPointCard({
  projectId,
  locationId,
  pointIndex,
  run,
  pointCells,
  summary,
}: {
  projectId: string
  locationId: string
  pointIndex: number
  run: LocalSeoRun
  pointCells: LocalSeoCell[]
  summary: LocalSeoPointSummary | null
}) {
  const [openQuery, setOpenQuery] = useState<number | null>(null)
  const letter = localSeoPointLetter(pointIndex)
  const detailsQuery = useQuery({
    queryKey:
      openQuery === null
        ? (["location-maps-point-details", projectId, locationId, "none"] as const)
        : localSeoPointDetailsQueryKey(
            projectId,
            locationId,
            run.id,
            pointIndex,
            run.status
          ),
    queryFn: () =>
      fetchLocalSeoPointDetails(projectId, locationId, run.id, pointIndex),
    enabled: openQuery !== null,
    refetchInterval: localSeoRunRefetchInterval(run.status),
  })
  const pendingCount = pointCells.filter((cell) => cell.call_status === "pending").length
  const runActive = isLocalSeoRunActive(run.status)
  const hasRank = summary?.meanRank !== null && summary?.meanRank !== undefined
  const working = runActive && !hasRank && pendingCount > 0
  const score = hasRank
    ? `Avg. rank \u2248${formatLocalSeoMeanRank(summary.meanRank)}`
    : working
      ? "Working…"
      : summary
        ? formatLocalSeoEmptyMeanRank(
            summary.absentCount,
            summary.unknownCount - pendingCount
          )
        : "—"
  const coverage = summary
    ? `${summary.foundCount}/${run.queries.length} found · ${summary.absentCount} absent · ${summary.unknownCount - pendingCount} unknown${pendingCount > 0 ? ` · ${pendingCount} pending` : ""}`
    : "Not sampled"
  const firstCell = pointCells[0] ?? null
  const driftNote = firstCell ? describeLocationMapsViewportDrift(firstCell) : null
  const openEntry =
    openQuery === null
      ? null
      : (detailsQuery.data?.queries.find(
          (entry) => entry.query_index === openQuery
        ) ?? null)

  return (
    <VisibilityModelCard
      title={`Point ${letter} · ${locationMapsPointCaption(pointIndex)}`}
      countLabel={score}
    >
      <p className="px-3 pt-1 pb-2 text-xs text-muted-foreground tabular-nums">
        {firstCell
          ? `${(firstCell.distance_m / 1000).toFixed(1)} km · ${firstCell.latitude.toFixed(5)}, ${firstCell.longitude.toFixed(5)} · ${coverage}`
          : `Not sampled · No stored cells for this point in the frozen run.`}
      </p>
      {driftNote ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground tabular-nums break-words">
          Ranks are approximate: {driftNote}
        </p>
      ) : hasRank ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground">
          Ranks are approximate — the provider may answer from a nearby map
          centre.
        </p>
      ) : null}
      {run.queries.map((query, queryIndex) => {
        const cell =
          pointCells.find((candidate) => candidate.query_index === queryIndex) ??
          null
        const status = cell ? describeLocationMapsCellStatus(cell) : "Pending"
        const itemStatus: VisibilityItemStatus =
          !cell || cell.call_status === "pending"
            ? "pending"
            : cell.call_status === "request_failed"
              ? "failed"
              : "success"
        return (
          <VisibilityQueryRow
            key={`${run.id}:${pointIndex}:${queryIndex}`}
            label={query}
            status={itemStatus}
            ariaLabel={`${query} results at point ${letter}`}
            failedLabel="Failed"
            runningLabel={status}
            open={openQuery === queryIndex}
            onToggle={() =>
              setOpenQuery((current) => (current === queryIndex ? null : queryIndex))
            }
            meta={
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {status}
              </span>
            }
          >
            <div className="flex flex-col gap-2">
              {detailsQuery.isPending ? (
                <Skeleton className="h-16 w-full" />
              ) : detailsQuery.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessageOf(detailsQuery.error, "Could not load point results")}
                </p>
              ) : openEntry && openEntry.query_index === queryIndex ? (
                <LocationMapsQueryEvidence entry={openEntry} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No stored results for this query at this point.
                </p>
              )}
            </div>
          </VisibilityQueryRow>
        )
      })}
    </VisibilityModelCard>
  )
}

export function LocationVisibilityMapsView({
  projectId,
  locationId,
}: {
  projectId: string
  locationId: string
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [sessionRunId, setSessionRunId] = useState<string | null>(null)
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
  const evidenceRun = historySelected ? (evidenceQuery.data ?? null) : latestRun
  const pointSummaries = useMemo(() => {
    if (!evidenceRun) return new Map<number, LocalSeoPointSummary>()
    return new Map(
      summarizeLocalSeoGridCells(evidenceRun.cells, null).points.map(
        (point) => [point.pointIndex, point] as const
      )
    )
  }, [evidenceRun])

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
  if (!isLocalSeoLocationBound(location)) {
    return (
      <p className="text-sm text-muted-foreground">
        Bind a Google listing before Maps results can appear.
      </p>
    )
  }

  const radiusM = selectLocationMapsNewRunRadiusM(location, latestRun)

  return (
    <div className="flex flex-1 flex-col gap-4">
      <LocationSavedRunPicker
        projectId={projectId}
        locationId={location.id}
        latestRun={latestRun}
        value={selectedRunId}
        sessionRunId={sessionRunId}
        onChange={(runId) => setSelectedRunId(runId)}
      />
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
        <section aria-label="Grid point results" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {historySelected ? "Saved run" : "Latest run"} · Frozen queries:{" "}
            {evidenceRun.queries.join(" · ") || "none"} · Frozen radius:{" "}
            {(evidenceRun.radius_m / 1000).toFixed(1)} km
          </p>
          <div
            aria-label="Nine-point grid results"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: LOCAL_SEO_POINT_COUNT }, (_, pointIndex) => (
              <LocationMapsPointCard
                key={`${evidenceRun.id}:${pointIndex}`}
                projectId={projectId}
                locationId={location.id}
                pointIndex={pointIndex}
                run={evidenceRun}
                pointCells={evidenceRun.cells.filter(
                  (cell) => cell.point_index === pointIndex
                )}
                summary={pointSummaries.get(pointIndex) ?? null}
              />
            ))}
          </div>
        </section>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No runs yet for this location</EmptyTitle>
            <EmptyDescription>
              Stored point results appear here after the first Maps run. Starting
              a run is explicit below.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {canManage ? (
        <LocalSeoRunControls
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
  )
}
