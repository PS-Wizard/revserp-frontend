import { useEffect, useRef } from "react"

import { XIcon } from "lucide-react"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "~/lib/api"
import {
  isLocalSeoLocationBound,
  LOCAL_SEO_POINT_COUNT,
  localSeoLocationQueryKey,
  localSeoLocationsQueryKey,
  localSeoPointLetter,
  unbindLocalSeoListing,
  type LocalSeoListingLookup,
  type LocalSeoLocation,
  type LocalSeoPointDetails,
  type LocalSeoPointPlace,
  type LocalSeoPointQuery,
  type LocalSeoRun,
  type LocalSeoRunCompetitor,
  type LocalSeoRunCompetitors,
  type LocalSeoSector,
} from "~/lib/local-seo-api"
import {
  formatLocalSeoEmptyMeanRank,
  formatLocalSeoMeanRank,
  summarizeLocalSeoGridCells,
} from "~/lib/local-seo-directional"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"

const LOCAL_SEO_BOARD_ORDER: LocalSeoSector[] = [
  "NW",
  "N",
  "NE",
  "W",
  "centre",
  "E",
  "SW",
  "S",
  "SE",
]

const LOCAL_SEO_SECTOR_NAMES: Record<LocalSeoSector, string> = {
  centre: "Business centre",
  N: "North",
  NE: "North-east",
  E: "East",
  SE: "South-east",
  S: "South",
  SW: "South-west",
  W: "West",
  NW: "North-west",
}

function localSeoSectorCaption(sector: LocalSeoSector): string {
  return sector === "centre" ? "Centre" : sector
}

const LOCAL_SEO_POINT_EMPTY_TEXT = "The provider returned nothing here."

function describeLocalSeoPointQueryResult(entry: LocalSeoPointQuery): string {
  if (entry.error) return "Error"
  if (entry.call_status === "pending") return "Pending"
  if (entry.call_status === "request_failed") return "Failed"
  if (entry.call_status === "success_empty") return "No results"
  if (
    entry.match_status === "found" &&
    typeof entry.rank === "number" &&
    Number.isFinite(entry.rank) &&
    entry.rank > 0
  ) {
    return `#${Number.isInteger(entry.rank) ? entry.rank : entry.rank.toFixed(1)}`
  }
  if (entry.match_status === "absent") return "Not found"
  return "Unranked"
}

function LocalSeoPointPlaceRow({ place }: { place: LocalSeoPointPlace }) {
  const ratingParts: string[] = []
  if (place.rating !== null) ratingParts.push(`★ ${place.rating}`)
  if (place.rating_count !== null) {
    ratingParts.push(`${place.rating_count} reviews`)
  }
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">
        {place.position ?? "—"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-foreground">{place.title}</span>
          {place.is_target ? (
            <Badge variant="secondary">Your business</Badge>
          ) : null}
        </p>
        {place.address ? (
          <p className="text-xs text-muted-foreground">{place.address}</p>
        ) : null}
        {ratingParts.length > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {ratingParts.join(" · ")}
          </p>
        ) : null}
      </div>
    </li>
  )
}

function LocalSeoPointQueryResult({ entry }: { entry: LocalSeoPointQuery }) {
  if (entry.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {entry.error}
      </p>
    )
  }
  if (entry.call_status === "pending") {
    return <p className="text-sm text-muted-foreground">No response yet.</p>
  }
  if (entry.call_status === "request_failed") {
    return (
      <p role="alert" className="text-sm text-destructive">
        The provider call failed.
      </p>
    )
  }
  if (entry.call_status === "success_empty") {
    return (
      <p className="text-sm text-muted-foreground">
        {LOCAL_SEO_POINT_EMPTY_TEXT}
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
        <ol className="flex flex-col gap-1.5">
          {entry.places.map((place, index) => (
            <LocalSeoPointPlaceRow
              key={`${entry.query_index}:${index}`}
              place={place}
            />
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

export function LocalSeoPointResultsPanel({
  pointIndex,
  details,
  pending,
  error,
  onClear,
}: {
  pointIndex: number
  details: LocalSeoPointDetails | null
  pending: boolean
  error: string | null
  onClear?: () => void
}) {
  const letter = localSeoPointLetter(pointIndex)
  const sector = LOCAL_SEO_BOARD_ORDER[pointIndex]
  const caption =
    sector === "centre"
      ? localSeoSectorCaption(sector)
      : LOCAL_SEO_SECTOR_NAMES[sector]
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{`Point ${letter} · ${caption}`}</CardTitle>
        <CardDescription>Stored results for this map point, one list per saved query. The tracked listing is badged.</CardDescription>
        {onClear ? (
          <CardAction>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Clear point ${letter}`}
              className="-mt-1 -mr-2 size-7"
              onClick={onClear}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending ? <Skeleton className="h-24 w-full" /> : null}
        {!pending && error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {!pending && !error && details ? (
          <>
            {details.target_place_id ? (
              <p className="text-xs text-muted-foreground">
                Marking frozen run target {details.target_place_id}.
              </p>
            ) : null}
            <ol className="flex flex-col gap-3">
              {details.queries.map((entry) => (
                <li
                  key={`${entry.query_index}:${entry.query}`}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-foreground">
                      {entry.query}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {describeLocalSeoPointQueryResult(entry)}
                    </span>
                  </div>
                  <LocalSeoPointQueryResult entry={entry} />
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {!pending && !error && !details ? (
          <p className="text-sm text-muted-foreground">
            No stored results for this point in the frozen run.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function LocalSeoMapLookupEvidence({
  lookup,
}: {
  lookup: LocalSeoListingLookup
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">
        Lookup {lookup.status} · expected {lookup.expected_credits} credit ·
        confirmed {lookup.credits_used}
        {lookup.reserved_credits > 0
          ? ` · ${lookup.reserved_credits} still reserved`
          : ""}
        {lookup.deduplicated ? " · reused stored evidence, no new charge" : ""}
      </p>
      {!lookup.credit_known ? (
        <p role="alert" className="text-sm text-destructive">
          Charge unconfirmed. Confirmed spend may still rise; uncertain holds
          stay reserved and nothing was retried automatically.
        </p>
      ) : null}
      {lookup.error ? (
        <p role="alert" className="text-sm text-destructive">
          {lookup.error}
        </p>
      ) : null}
    </div>
  )
}

export function describeLocalSeoReportRunState(args: {
  runPending: boolean
  runError: string | null
  latestRun: LocalSeoRun | null
}): "pending" | "error" | "empty" | "ready" {
  if (args.runPending) return "pending"
  if (args.runError) return "error"
  if (args.latestRun === null) return "empty"
  return "ready"
}

function summarizeLocalSeoRunOverview(run: LocalSeoRun) {
  const summary = summarizeLocalSeoGridCells(run.cells, null)
  let foundCount = 0
  let absentCount = 0
  let rankSum = 0
  for (const ring of summary.rings) {
    foundCount += ring.foundCount
    absentCount += ring.absentCount
    if (ring.meanRank !== null) rankSum += ring.meanRank * ring.foundCount
  }
  return {
    foundCount,
    absentCount,
    failedCount: run.cells.filter(
      (cell) => cell.call_status === "request_failed"
    ).length,
    foundOnlyMeanRank: foundCount > 0 ? rankSum / foundCount : null,
  }
}

function LocalSeoRunOverview({
  run,
  focusedPointIndex,
  onClearPointFocus,
  onSelectPoint,
  pointDetails,
  pointDetailsPending,
  pointDetailsError,
}: {
  run: LocalSeoRun
  focusedPointIndex?: number | null
  onClearPointFocus?: () => void
  onSelectPoint?: (pointIndex: number) => void
  pointDetails?: LocalSeoPointDetails | null
  pointDetailsPending?: boolean
  pointDetailsError?: string | null
}) {
  const pointPanelRef = useRef<HTMLDivElement | null>(null)
  const overview = summarizeLocalSeoRunOverview(run)
  const summary = summarizeLocalSeoGridCells(run.cells, null)
  const pointBySector = new Map(
    summary.points.map((point) => [point.sector, point] as const)
  )
  useEffect(() => {
    if (focusedPointIndex === null || focusedPointIndex === undefined) return
    pointPanelRef.current?.scrollIntoView({ block: "nearest" })
  }, [focusedPointIndex])
  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardDescription>
            Found-only mean rank across {overview.foundCount} found samples
          </CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {formatLocalSeoMeanRank(overview.foundOnlyMeanRank)}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p className="tabular-nums">
            {overview.foundCount} found · {overview.absentCount} absent ·{" "}
            {overview.failedCount} failed
          </p>
          <p>
            Frozen snapshot · radius {(run.radius_m / 1000).toFixed(1)} km ·{" "}
            {run.queries.length} saved quer
            {run.queries.length === 1 ? "y" : "ies"}
          </p>
        </CardContent>
      </Card>
      <ul
        aria-label="Nine-point visibility board"
        className="grid grid-cols-3 gap-1.5"
      >
        {LOCAL_SEO_BOARD_ORDER.map((sector, index) => {
          const point = pointBySector.get(sector)
          const headline = !point
            ? "—"
            : point.meanRank !== null
              ? formatLocalSeoMeanRank(point.meanRank)
              : formatLocalSeoEmptyMeanRank(
                  point.absentCount,
                  point.unknownCount
                )
          return (
            <li key={sector} className="contents">
              <button
                type="button"
                onClick={() => onSelectPoint?.(index)}
                aria-pressed={focusedPointIndex === index}
                aria-label={
                  point
                    ? `${LOCAL_SEO_SECTOR_NAMES[sector]} sampled point: mean rank ${headline}, ${point.foundCount} found, ${point.absentCount} absent, ${point.unknownCount} unknown`
                    : `${LOCAL_SEO_SECTOR_NAMES[sector]}: not sampled`
                }
                className={cn(
                  "flex min-h-16 w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-border px-1 py-2 text-center hover:bg-muted/60 aria-pressed:border-primary aria-pressed:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                  sector === "centre" && "border-primary/40 bg-muted/60"
                )}
              >
                <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
                  {`${localSeoPointLetter(index)} · ${localSeoSectorCaption(sector)}`}
                </span>
                <span className="text-base leading-none font-semibold tabular-nums">
                  {headline}
                </span>
                {point ? (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {point.foundCount} found · {point.absentCount} absent
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        {LOCAL_SEO_BOARD_ORDER.map(
          (sector, index) =>
            `${localSeoPointLetter(index)} ${localSeoSectorCaption(sector)}`
        ).join(" · ")}
      </p>
      {focusedPointIndex !== null && focusedPointIndex !== undefined ? (
        <div>
          <div ref={pointPanelRef} className="scroll-mt-2" />
          <LocalSeoPointResultsPanel
            pointIndex={focusedPointIndex}
            details={pointDetails ?? null}
            pending={pointDetailsPending ?? false}
            error={pointDetailsError ?? null}
            onClear={onClearPointFocus}
          />
        </div>
      ) : null}
    </>
  )
}

function LocalSeoReportRunStateNotice({
  runState,
  runError,
}: {
  runState: "pending" | "error" | "empty" | "ready"
  runError: string | null
}) {
  if (runState === "pending") return <Skeleton className="h-24 w-full" />
  if (runState === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {runError ?? "Could not load the latest run"}
      </p>
    )
  }
  if (runState === "empty") {
    return (
      <p className="text-sm text-muted-foreground">
        No runs yet for this location.
      </p>
    )
  }
  return null
}

function describeLocalSeoCompetitorRank(bestRank: number | null): string {
  if (typeof bestRank === "number" && Number.isFinite(bestRank) && bestRank > 0) {
    return `#${Number.isInteger(bestRank) ? bestRank : bestRank.toFixed(1)}`
  }
  return "No recorded rank"
}

function deriveLocalSeoBranchBrand(
  locationName: string | null | undefined
): string | null {
  if (!locationName) return null
  const brand = locationName.split(",")[0].trim().toLowerCase()
  if (!brand) return null
  if (!locationName.includes(",") && brand.split(/\s+/).length < 2) return null
  return brand
}

function LocalSeoRunCompetitorRow({
  competitor,
  total,
  queryLabels,
  pointLetter,
}: {
  competitor: LocalSeoRunCompetitor
  total: number
  queryLabels: string
  pointLetter?: string | null
}) {
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 flex-1 break-words font-medium text-foreground">
          {competitor.title}
          {competitor.same_brand_domain ? (
            <Badge variant="secondary" className="ml-1.5">
              Same website host
            </Badge>
          ) : null}
        </span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {describeLocalSeoCompetitorRank(competitor.best_rank)}
        </span>
      </div>
      {competitor.address ? (
        <p className="break-words text-xs text-muted-foreground">
          {competitor.address}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground tabular-nums">
        {pointLetter
          ? `Seen in ${competitor.query_points_seen} of ${total} queries at Point ${pointLetter}`
          : `in ${competitor.query_points_seen} of ${total} query-points`}
      </p>
      {queryLabels ? (
        <p className="break-words text-xs text-muted-foreground">
          {queryLabels}
        </p>
      ) : null}
    </li>
  )
}
export function LocalSeoRunCompetitorsCard({
  data,
  pending = false,
  error = null,
  locationName,
  pointIndex = null,
}: {
  data?: LocalSeoRunCompetitors | null
  pending?: boolean
  error?: string | null
  locationName?: string | null
  pointIndex?: number | null
}) {
  const pointLetter = typeof pointIndex === "number" ? localSeoPointLetter(pointIndex) : null
  const heading = pointLetter ? `Point ${pointLetter} competitors` : "Whole run competitors"
  if (pending) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">{heading}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }
  if (error) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">{heading}</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        </CardContent>
      </Card>
    )
  }
  if (!data) return null
  const total = data.total_query_points
  const labelsFor = (competitor: LocalSeoRunCompetitor) =>
    competitor.query_indexes
      .map((index) => data.queries[index] ?? `Query ${index + 1}`)
      .join(" · ")
  const branchBrand = deriveLocalSeoBranchBrand(locationName)
  const isLikelyBranch = (competitor: LocalSeoRunCompetitor) =>
    branchBrand !== null &&
    (competitor.title.trim().toLowerCase().startsWith(branchBrand) ||
      competitor.same_brand_domain)
  const likelyBranches = data.competitors.filter(isLikelyBranch)
  const otherCompetitors = data.competitors.filter(
    (competitor) => !isLikelyBranch(competitor)
  )
  const grouped = branchBrand !== null && likelyBranches.length > 0
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{heading}</CardTitle>
        <CardDescription>
          {pointLetter
            ? "Combined only this point's queries. Each place ID is a separate listing."
            : "Combined across all saved queries and map points. Each place ID is a separate listing."}
        </CardDescription>
        <CardDescription>
          {`Results from ${data.contributing_query_points} of ${total} query-points`} · {`${data.failed_query_points} failed`} ·{" "}
          {`${data.pending_query_points} pending`} · {`${data.unreadable_query_points} unreadable`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.contributing_query_points === 0 ? (
          <p className="text-sm text-muted-foreground">
            No contributing query-points yet — coverage is incomplete.
          </p>
        ) : null}
        {data.competitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No competitors recorded in the stored results.
          </p>
        ) : grouped ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Grouping is a guess based on title prefix or website host, not
              verified ownership.
            </p>
            <h3 className="text-sm font-medium">
              {`Likely your branches (${likelyBranches.length})`}
            </h3>
            <ul className="flex flex-col gap-2">
              {likelyBranches.map((competitor) => (
                <LocalSeoRunCompetitorRow
                  key={competitor.place_id}
                  competitor={competitor}
                  total={total}
                  queryLabels={labelsFor(competitor)}
                  pointLetter={pointLetter}
                />
              ))}
            </ul>
            <h3 className="text-sm font-medium">
              {`Competitors (${otherCompetitors.length})`}
            </h3>
            {otherCompetitors.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {otherCompetitors.map((competitor) => (
                  <LocalSeoRunCompetitorRow
                    key={competitor.place_id}
                    competitor={competitor}
                    total={total}
                    queryLabels={labelsFor(competitor)}
                    pointLetter={pointLetter}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No other competitors.
              </p>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.competitors.map((competitor) => (
              <LocalSeoRunCompetitorRow
                key={competitor.place_id}
                competitor={competitor}
                total={total}
                queryLabels={labelsFor(competitor)}
                pointLetter={pointLetter}
              />
            ))}
          </ul>
        )}
        {data.competitors.some((competitor) => competitor.same_brand_domain) ? (
          <p className="text-xs text-muted-foreground">
            Same website host does not identify all company branches.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {data.idless_entries > 0
            ? `${data.idless_entries} ${data.idless_entries === 1 ? "entry" : "entries"} omitted without an ID`
            : "No entries omitted without an ID."}
        </p>
      </CardContent>
    </Card>
  )
}

export type LocalSeoMapReportTab =
  | "overview"
  | "competitors"
  | "listing"
  | "run"

export function LocalSeoMapReportContent({
  projectId,
  location,
  latestRun,
  runPending,
  runError = null,
  lookup,
  lookupPending,
  onUnbound,
  tab,
  focusedPointIndex,
  onClearPointFocus,
  onSelectPoint,
  pointDetails = null,
  pointDetailsPending = false,
  pointDetailsError = null,
  competitors = null,
  competitorsPending = false,
  competitorsError = null,
  pointCompetitors = null,
  pointCompetitorsPending = false,
  pointCompetitorsError = null,
  onSelectCompetitorScope,
  onShowAllCompetitors,
}: {
  projectId: string
  location: LocalSeoLocation
  latestRun: LocalSeoRun | null
  runPending: boolean
  runError?: string | null
  lookup: LocalSeoListingLookup | null
  lookupPending: boolean
  onUnbound?: (location: LocalSeoLocation) => void
  tab: LocalSeoMapReportTab
  focusedPointIndex?: number | null
  onClearPointFocus?: () => void
  onSelectPoint?: (pointIndex: number) => void
  pointDetails?: LocalSeoPointDetails | null
  pointDetailsPending?: boolean
  pointDetailsError?: string | null
  competitors?: LocalSeoRunCompetitors | null
  competitorsPending?: boolean
  competitorsError?: string | null
  pointCompetitors?: LocalSeoRunCompetitors | null
  pointCompetitorsPending?: boolean
  pointCompetitorsError?: string | null
  onSelectCompetitorScope?: (pointIndex: number | null) => void
  onShowAllCompetitors?: () => void
}) {
  const queryClient = useQueryClient()
  const bound = isLocalSeoLocationBound(location)
  const unbindMutation = useMutation({
    mutationFn: () => unbindLocalSeoListing(projectId, location.id),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        localSeoLocationQueryKey(projectId, location.id),
        updated
      )
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationsQueryKey(projectId),
      })
      onUnbound?.(updated)
    },
  })
  const runState = describeLocalSeoReportRunState({
    runPending,
    runError,
    latestRun,
  })
  if (tab === "overview") {
    return (
      <section aria-label="Run overview" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Latest run</h2>
        <LocalSeoReportRunStateNotice runState={runState} runError={runError} />
        {runState === "ready" && latestRun !== null ? (
          <LocalSeoRunOverview
            run={latestRun}
            focusedPointIndex={focusedPointIndex}
            onClearPointFocus={onClearPointFocus}
            onSelectPoint={onSelectPoint}
            pointDetails={pointDetails}
            pointDetailsPending={pointDetailsPending}
            pointDetailsError={pointDetailsError}
          />
        ) : null}
      </section>
    )
  }

  if (tab === "competitors") {
    const competitorScope = focusedPointIndex ?? null
    const scopeValue = competitorScope === null ? "whole" : String(competitorScope)
    const handleScopeChange = (value: string) => {
      if (value === "whole") {
        if (onSelectCompetitorScope) onSelectCompetitorScope(null)
        else if (onShowAllCompetitors) onShowAllCompetitors()
        else onClearPointFocus?.()
        return
      }
      const parsed = Number.parseInt(value, 10)
      if (!Number.isInteger(parsed)) return
      if (onSelectCompetitorScope) onSelectCompetitorScope(parsed)
      else onSelectPoint?.(parsed)
    }
    return (
      <section aria-label="Competitors" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Competitors</h2>
        <LocalSeoReportRunStateNotice runState={runState} runError={runError} />
        {runState === "ready" && latestRun !== null ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Scope</span>
              <select
                aria-label="Competitor scope"
                value={scopeValue}
                onChange={(event) => handleScopeChange(event.target.value)}
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
            {competitorScope === null ? (
              <LocalSeoRunCompetitorsCard
                key="whole"
                data={competitors ?? null}
                pending={competitorsPending ?? false}
                error={competitorsError ?? null}
                locationName={location.name}
                pointIndex={null}
              />
            ) : (
              <LocalSeoRunCompetitorsCard
                key={`point-${competitorScope}`}
                data={pointCompetitors ?? null}
                pending={pointCompetitorsPending ?? false}
                error={pointCompetitorsError ?? null}
                locationName={location.name}
                pointIndex={competitorScope}
              />
            )}
          </>
        ) : null}
      </section>
    )
  }

  if (tab === "listing") {
    return (
      <section aria-label="Listing" className="flex flex-col gap-3">
        <Badge variant={bound ? "default" : "outline"}>
          {bound ? "Bound" : "Unbound"}
        </Badge>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Address</dt>
            <dd>
              {[location.address, location.locality]
                .filter(Boolean)
                .join(" · ") || "Not set"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Coordinates</dt>
            <dd className="tabular-nums">
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Place ID</dt>
            <dd className="break-all">{bound ? location.place_id : "None"}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Latest listing lookup</h2>
          {lookupPending ? (
            <Skeleton className="h-16 w-full" />
          ) : lookup ? (
            <LocalSeoMapLookupEvidence lookup={lookup} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No listing lookups yet.
            </p>
          )}
        </div>
        {bound ? (
          <Button
            size="sm"
            variant="outline"
            disabled={unbindMutation.isPending}
            onClick={() => unbindMutation.mutate()}
          >
            {unbindMutation.isPending ? "Unbinding…" : "Unbind listing · Free"}
          </Button>
        ) : null}
        {unbindMutation.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessageOf(unbindMutation.error, "Could not unbind")}
          </p>
        ) : null}
      </section>
    )
  }

  const placeMismatch =
    latestRun?.target_place_id != null &&
    latestRun.target_place_id !== location.place_id
  const heldCredits = latestRun?.reserved_credits ?? 0

  return (
    <section aria-label="Latest run" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{latestRun?.status ?? "none"}</Badge>
      </div>
      <LocalSeoReportRunStateNotice runState={runState} runError={runError} />
      {runState === "ready" && latestRun !== null ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">
            Frozen queries: {latestRun.queries.join(" · ") || "none"}
          </p>
          <p className="text-muted-foreground">
            Radius: {latestRun.radius_m} m
          </p>
          <p className="text-muted-foreground tabular-nums">
            Expected {latestRun.expected_credits} · confirmed{" "}
            {latestRun.credits_used}
            {heldCredits > 0 ? ` · ${heldCredits} held` : ""} credits
          </p>
          {placeMismatch ? (
            <p role="alert" className="text-destructive">
              This run tracked a different listing from the current location.
              Recorded listing: {latestRun.target_place_id}.
            </p>
          ) : null}
          {(latestRun.unconfirmed_calls ?? 0) > 0 ? (
            <p role="alert" className="text-destructive">
              {latestRun.unconfirmed_calls} unresolved charge
              {(latestRun.unconfirmed_calls ?? 0) === 1 ? "" : "s"} — confirmed
              spend may still rise.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
