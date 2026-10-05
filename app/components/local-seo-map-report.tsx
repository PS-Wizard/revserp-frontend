import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router"

import { ApiError } from "~/lib/api"
import {
  isLocalSeoLocationBound,
  localSeoLocationQueryKey,
  localSeoLocationsQueryKey,
  unbindLocalSeoListing,
  validateLocalSeoRadiusM,
  type LocalSeoListingLookup,
  type LocalSeoLocation,
  type LocalSeoRun,
} from "~/lib/local-seo-api"
import {
  formatLocalSeoEmptyMeanRank,
  formatLocalSeoMeanRank,
  summarizeLocalSeoGridCells,
} from "~/lib/local-seo-directional"
import {
  LOCAL_SEO_BOARD_ORDER,
  LOCAL_SEO_SECTOR_NAMES,
} from "~/components/local-seo-grid"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"

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

export function localSeoReportGridHref(args: {
  projectId: string
  locationId: string
  radiusM: number | null
}): string {
  const base = `/app/projects/${args.projectId}/locations/${args.locationId}/grid`
  if (args.radiusM === null) return base
  if (validateLocalSeoRadiusM(args.radiusM) !== null) return base
  return `${base}?radius_m=${args.radiusM}`
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

function LocalSeoRunOverview({ run }: { run: LocalSeoRun }) {
  const overview = summarizeLocalSeoRunOverview(run)
  const summary = summarizeLocalSeoGridCells(run.cells, null)
  const pointBySector = new Map(
    summary.points.map((point) => [point.sector, point] as const)
  )
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
        {LOCAL_SEO_BOARD_ORDER.map((sector) => {
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
            <li
              key={sector}
              aria-label={
                point
                  ? `${LOCAL_SEO_SECTOR_NAMES[sector]} sampled point: mean rank ${headline}, ${point.foundCount} found, ${point.absentCount} absent, ${point.unknownCount} unknown`
                  : `${LOCAL_SEO_SECTOR_NAMES[sector]}: not sampled`
              }
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-md border border-border px-1 py-2 text-center",
                sector === "centre" && "border-primary/40 bg-muted/60"
              )}
            >
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                {sector === "centre" ? "Business" : sector}
              </span>
              <span className="text-base leading-none font-semibold tabular-nums">
                {headline}
              </span>
              {point ? (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {point.foundCount} found · {point.absentCount} absent
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
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

export type LocalSeoMapReportTab = "overview" | "listing" | "run"

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
  setupRadiusM,
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
  setupRadiusM?: number
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
  const draftRadiusM =
    setupRadiusM !== undefined && validateLocalSeoRadiusM(setupRadiusM) === null
      ? setupRadiusM
      : null
  const gridHref = localSeoReportGridHref({
    projectId,
    locationId: location.id,
    radiusM: draftRadiusM ?? latestRun?.radius_m ?? null,
  })

  if (tab === "overview") {
    return (
      <section aria-label="Run overview" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Latest run</h2>
        <LocalSeoReportRunStateNotice runState={runState} runError={runError} />
        {runState === "ready" && latestRun !== null ? (
          <LocalSeoRunOverview run={latestRun} />
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
      <Button
        nativeButton={false}
        size="sm"
        variant="outline"
        render={<Link to={gridHref}>Open grid</Link>}
      />
    </section>
  )
}
