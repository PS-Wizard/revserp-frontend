"use client"

import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { motion, useReducedMotion } from "motion/react"
import { InfoIcon, MapIcon } from "lucide-react"

import { ApiError } from "~/lib/api"
import {
  LOCAL_SEO_POINT_COUNT,
  fetchLocalSeoLatestRun,
  fetchLocalSeoLocation,
  fetchLocalSeoRunCompetitors,
  fetchLocalSeoRunPointCompetitors,
  isLocalSeoLocationBound,
  localSeoLatestRunQueryKey,
  localSeoLocationQueryKey,
  localSeoPointLetter,
  localSeoRunCompetitorsQueryKey,
  localSeoRunPointCompetitorsQueryKey,
  localSeoRunRefetchInterval,
  type LocalSeoRun,
  type LocalSeoRunCompetitor,
  type LocalSeoRunCompetitors,
} from "~/lib/local-seo-api"
import {
  CompetitorCardShell,
  CompetitorCardSkeleton,
  describeCompetitorAveragePosition,
} from "~/components/competitors/competitor-card-shell"
import { Badge } from "~/components/ui/badge"
import { buttonVariants } from "~/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { locationWorkspacePath } from "~/lib/location-workspace"

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function sortLocalCompetitors(list: LocalSeoRunCompetitor[]) {
  return [...list].sort((a, b) => {
    const an = a.average_position ?? null
    const bn = b.average_position ?? null
    if (an === null && bn !== null) return 1
    if (an !== null && bn === null) return -1
    if (an !== null && bn !== null && an !== bn) return an - bn
    if (a.query_points_seen !== b.query_points_seen)
      return b.query_points_seen - a.query_points_seen
    return a.place_id.localeCompare(b.place_id)
  })
}

function stableColorIndex(placeId: string) {
  let hash = 0
  for (let i = 0; i < placeId.length; i++) hash = (hash * 31 + placeId.charCodeAt(i)) >>> 0
  return hash % 3
}

function LocationListingCard({
  competitor,
  total,
  pointLetter,
  reduceMotion,
}: {
  competitor: LocalSeoRunCompetitor
  total: number
  pointLetter: string | null
  reduceMotion: boolean
}) {
  const coverage = pointLetter
    ? `Appeared in ${competitor.query_points_seen} of ${total} searches at Point ${pointLetter}`
    : `Appeared in ${competitor.query_points_seen} of ${total} searches`
  const resultCount = competitor.average_result_count
  const resultLists =
    typeof resultCount === "number" &&
    Number.isFinite(resultCount) &&
    resultCount > 0
      ? `Result lists averaged ${Number.isInteger(resultCount) ? resultCount : resultCount.toFixed(1)} ${resultCount === 1 ? "business" : "businesses"}`
      : null
  return (
    <motion.div
      layout={reduceMotion ? undefined : "position"}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <CompetitorCardShell
        title={competitor.title}
        index={stableColorIndex(competitor.place_id)}
        body={
          <div className="flex w-full flex-col gap-1">
            {competitor.address ? (
              <p className="break-words text-xs text-muted-foreground">
                {competitor.address}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground tabular-nums">{coverage}</p>
            {resultLists ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {resultLists}
              </p>
            ) : null}
          </div>
        }
        footerBadge={
          <Badge
            variant={
              competitor.average_position ? "secondary" : "outline"
            }
          >
            {describeCompetitorAveragePosition(
              competitor.average_position ?? null
            )}
          </Badge>
        }
      />
    </motion.div>
  )
}

export function LocationCompetitorsCards({
  data,
  pending,
  error,
  scopeControl,
}: {
  data: LocalSeoRunCompetitors | null
  pending: boolean
  error: string | null
  /** Rendered at the right edge of the section heading (e.g. a scope picker). */
  scopeControl?: ReactNode
}) {
  const reduceMotion = useReducedMotion() ?? false
  const shownIndex = data?.point_index ?? null
  const pointLetter =
    typeof shownIndex === "number" ? localSeoPointLetter(shownIndex) : null
  const heading = pointLetter ? `Point ${pointLetter} competitors` : "Whole run competitors"
  if (pending && !data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">{heading}</h3>
          {scopeControl}
        </div>
        <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {[0, 1, 2].map((index) => (
            <CompetitorCardSkeleton key={index} />
          ))}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">{heading}</h3>
          {scopeControl}
        </div>
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      </div>
    )
  }
  if (!data) return null
  const total = data.total_query_points
  const ordered = sortLocalCompetitors(data.competitors)
  const caveats = [
    data.failed_query_points > 0 ? `${data.failed_query_points} failed` : null,
    data.pending_query_points > 0 ? `${data.pending_query_points} pending` : null,
    data.unreadable_query_points > 0
      ? `${data.unreadable_query_points} unreadable`
      : null,
  ].filter(Boolean)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-medium">
            {heading} · {ordered.length} listed
          </h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            {`Results from ${data.contributing_query_points} of ${total} query-points`}
            {caveats.length > 0 ? ` · ${caveats.join(" · ")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            tabIndex={0}
            role="note"
            aria-label="How competitors are ranked"
            title="Average position is the mean of observed Maps positions per saved listing. Absent, failed and unreadable searches are excluded, and list sizes count every returned business including yours. Cards are ordered by average position, then appearances."
            className="text-muted-foreground hover:text-foreground"
          >
            <InfoIcon className="size-4" aria-hidden="true" />
          </span>
          {scopeControl}
        </div>
      </div>
      {data.contributing_query_points === 0 ? (
        <p className="text-sm text-muted-foreground">
          No contributing query-points yet — coverage is incomplete.
        </p>
      ) : null}
      {ordered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No competitors recorded</EmptyTitle>
            <EmptyDescription>
              The stored results for this scope contain no other listings.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {ordered.map((competitor) => (
            <LocationListingCard
              key={competitor.place_id}
              competitor={competitor}
              total={total}
              pointLetter={pointLetter}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
      )}
      {data.idless_entries > 0 ? (
        <p className="text-xs text-muted-foreground">
          {`${data.idless_entries} ${data.idless_entries === 1 ? "entry" : "entries"} omitted without an ID`}
        </p>
      ) : null}
    </div>
  )
}

export function LocationCompetitorsView({
  projectId,
  locationId,
}: {
  projectId: string
  locationId: string
}) {
  const [pointScope, setPointScope] = useState<number | null>(null)

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

  const run: LocalSeoRun | null = latestRunQuery.data ?? null
  const location = locationQuery.data ?? null
  const bound = location ? isLocalSeoLocationBound(location) : false
  const competitorsEnabled = bound && run !== null

  const scopeQuery = useQuery({
    queryKey:
      competitorsEnabled && run
        ? pointScope === null
          ? localSeoRunCompetitorsQueryKey(
              projectId,
              locationId,
              run.id,
              run.status,
              run.completed_cells ?? null
            )
          : localSeoRunPointCompetitorsQueryKey(
              projectId,
              locationId,
              run.id,
              pointScope,
              run.status,
              run.completed_cells ?? null
            )
        : (["location-competitors", "none"] as const),
    queryFn: () =>
      pointScope === null
        ? fetchLocalSeoRunCompetitors(projectId, locationId, run!.id)
        : fetchLocalSeoRunPointCompetitors(
            projectId,
            locationId,
            run!.id,
            pointScope!
          ),
    enabled: competitorsEnabled,
    placeholderData: keepPreviousData,
    refetchInterval: localSeoRunRefetchInterval(run?.status),
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

  return (
    <div className="flex flex-1 flex-col gap-4">
      <section aria-label="Location competitors" className="flex flex-col gap-3">
        {run ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{run.status}</Badge>
          </div>
        ) : null}
        {latestRunQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessageOf(
              latestRunQuery.error,
              "Could not load the latest run"
            )}
          </p>
        ) : !bound ? (
          <p className="text-sm text-muted-foreground">
            Bind a Google listing before Maps competitors can appear.
          </p>
        ) : !run ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No runs yet for this location</EmptyTitle>
              <EmptyDescription>
                Stored competitors appear here after the first Maps run.
                Review the point results first — opening the Maps test never
                starts a run.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                to={`${locationWorkspacePath(projectId, locationId)}&visibility=maps`}
              >
                Open Maps test
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Frozen queries: {run.queries.join(" · ") || "none"}
            </p>
            <label className="flex max-w-xs flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Competitor scope</span>
              <select
                aria-label="Competitor scope"
                value={pointScope === null ? "whole" : String(pointScope)}
                onChange={(event) => {
                  setPointScope(
                    event.target.value === "whole"
                      ? null
                      : Number.parseInt(event.target.value, 10)
                  )
                }}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="whole">Whole run</option>
                {Array.from({ length: LOCAL_SEO_POINT_COUNT }, (_, index) => (
                  <option key={index} value={String(index)}>
                    {`Point ${localSeoPointLetter(index)}`}
                  </option>
                ))}
              </select>
            </label>
            {scopeQuery.isFetching && scopeQuery.data ? (
              <p aria-live="polite" className="text-xs text-muted-foreground">
                Updating…
              </p>
            ) : null}
            <LocationCompetitorsCards
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
          </>
        )}
      </section>
    </div>
  )
}
