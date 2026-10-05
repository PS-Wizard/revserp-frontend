import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams, useSearchParams } from "react-router"

import { LocalSeoGrid } from "~/components/local-seo-grid"
import { LocalSeoRecordedMap } from "~/components/local-seo-recorded-map"
import { ApiError } from "~/lib/api"
import {
  LOCAL_SEO_BASE_EXPECTED_CREDITS,
  localSeoRunCost,
  LOCAL_SEO_DEFAULT_RADIUS_M,
  LOCAL_SEO_MAX_RADIUS_M,
  LOCAL_SEO_MIN_RADIUS_M,
  LOCAL_SEO_QUERY_COUNT,
  canRunLocalSeoGrid,
  createLocalSeoRun,
  fetchLocalSeoLatestRun,
  fetchLocalSeoLocation,
  isLocalSeoLocationBound,
  isLocalSeoRunActive,
  localSeoLatestRunQueryKey,
  localSeoLocationQueryKey,
  updateLocalSeoQueries,
  validateEditableLocalSeoQueries,
  validateLocalSeoQueries,
  validateLocalSeoRadiusM,
} from "~/lib/local-seo-api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"

function runStatusBadgeVariant(status: string) {
  switch (status) {
    case "completed":
      return "default" as const
    case "partial":
    case "failed":
      return "destructive" as const
    default:
      return "secondary" as const
  }
}

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export default function ProjectLocationGridRoute() {
  const params = useParams()
  const projectId = params.projectID ?? params.projectId ?? ""
  const locationId = params.locationID ?? params.locationId ?? ""
  const hasIds = projectId !== "" && locationId !== ""
  const queryClient = useQueryClient()

  const [queryDrafts, setQueryDrafts] = useState<string[] | null>(null)
  const [searchParams] = useSearchParams()
  const [radiusInput, setRadiusInput] = useState(() => {
    const requested = searchParams.get("radius_m")
    const radius = requested ? Number(requested) : LOCAL_SEO_DEFAULT_RADIUS_M
    return String(validateLocalSeoRadiusM(radius) === null ? radius : LOCAL_SEO_DEFAULT_RADIUS_M)
  })
  const [costConfirmed, setCostConfirmed] = useState(false)

  const locationQuery = useQuery({
    queryKey: localSeoLocationQueryKey(projectId, locationId),
    queryFn: () => fetchLocalSeoLocation(projectId, locationId),
    enabled: hasIds,
  })

  const latestRunQuery = useQuery({
    queryKey: localSeoLatestRunQueryKey(projectId, locationId),
    queryFn: () => fetchLocalSeoLatestRun(projectId, locationId),
    enabled: hasIds,
    refetchInterval: (query) => {
      const run = query.state.data
      return run && isLocalSeoRunActive(run.status) ? 4000 : false
    },
  })

  const queriesMutation = useMutation({
    mutationFn: (queries: string[]) =>
      updateLocalSeoQueries(projectId, locationId, queries),
    onSuccess: (location) => {
      setQueryDrafts(null)
      queryClient.setQueryData(
        localSeoLocationQueryKey(projectId, locationId),
        location,
      )
    },
  })

  const runMutation = useMutation({
    mutationFn: (radiusM: number) =>
      createLocalSeoRun(projectId, locationId, radiusM),
    onSuccess: () => {
      setCostConfirmed(false)
      void queryClient.invalidateQueries({
        queryKey: localSeoLatestRunQueryKey(projectId, locationId),
      })
    },
  })

  if (!hasIds) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Missing location</EmptyTitle>
            <EmptyDescription>
              This screen needs a project and a location in the URL.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )
  }

  const location = locationQuery.data
  const latestRun = latestRunQuery.data ?? null
  const effectiveQueries = queryDrafts ?? location?.queries ?? []
  const editableQueriesError = validateEditableLocalSeoQueries(effectiveQueries)
  const queriesDirty =
    location !== undefined &&
    queryDrafts !== null &&
    (queryDrafts.length !== location.queries.length ||
      queryDrafts.some((query, index) => query !== location.queries[index]))
  const isBound = location ? isLocalSeoLocationBound(location) : false
  const savedQueriesError = validateLocalSeoQueries(location?.queries ?? [])
  const canRun = location ? canRunLocalSeoGrid(location) : false
  const runCost = location
    ? localSeoRunCost(location)
    : LOCAL_SEO_BASE_EXPECTED_CREDITS

  const radiusM = Number(radiusInput)
  const radiusError = validateLocalSeoRadiusM(radiusM)
  const latestActive = latestRun !== null && isLocalSeoRunActive(latestRun.status)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1">
        <Button
          nativeButton={false}
          size="sm"
          variant="ghost"
          render={<Link to="/app">Back to workspace</Link>}
        />
        <Button
          nativeButton={false}
          size="sm"
          variant="ghost"
          render={
            <Link to={`/app/projects/${projectId}/locations`}>
              Back to Locations
            </Link>
          }
        />
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {locationQuery.isPending ? (
              <Skeleton className="h-8 w-56" />
            ) : (
              (location?.name ?? "Location grid")
            )}
          </h1>
          {location ? (
            <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              <p>
                {isBound
                  ? location.place_id
                  : "Unbound — no Google listing yet"}{" "}·{" "}
                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </p>
              {location.address || location.locality ? (
                <p>
                  {[location.address, location.locality]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {location ? (
            <Badge variant={isBound ? "default" : "outline"}>
              {isBound ? "Bound" : "Unbound"}
            </Badge>
          ) : null}
          {latestRun ? (
            <Badge variant={runStatusBadgeVariant(latestRun.status)}>
              {latestRun.status}
            </Badge>
          ) : null}
        </div>
      </header>

      {locationQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load this location</CardTitle>
            <CardDescription>
              {errorMessageOf(locationQuery.error, "Request failed")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => void locationQuery.refetch()}
              variant="outline"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Tracked queries</CardTitle>
          <CardDescription>
            Zero to five distinct queries. Saving replaces them for future
            runs; existing run snapshots keep their frozen queries. A run
            needs between one and {LOCAL_SEO_QUERY_COUNT} saved queries and a
            bound listing; cost follows the number you keep.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {locationQuery.isPending ? (
            <div className="flex flex-col gap-2" aria-label="Loading queries">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Tracked queries</legend>
              {effectiveQueries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No queries saved. Add up to {LOCAL_SEO_QUERY_COUNT}; an
                  empty list stays empty.
                </p>
              ) : null}
              {effectiveQueries.map((query, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <Label htmlFor={`local-seo-query-${index}`}>
                    Query {index + 1}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={`local-seo-query-${index}`}
                      value={query}
                      onChange={(event) => {
                        const next = [...effectiveQueries]
                        next[index] = event.target.value
                        setQueryDrafts(next)
                      }}
                      placeholder={`e.g. coffee roastery near downtown`}
                      autoComplete="off"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQueryDrafts(
                          effectiveQueries.filter((_, i) => i !== index),
                        )
                      }}
                      aria-label={`Remove query ${index + 1}`}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </fieldset>
          )}
          {effectiveQueries.length < LOCAL_SEO_QUERY_COUNT &&
          location !== undefined ? (
            <div>
              <Button
                variant="outline"
                onClick={() => setQueryDrafts([...effectiveQueries, ""])}
              >
                Add query
              </Button>
            </div>
          ) : null}
          {editableQueriesError && queryDrafts !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {editableQueriesError}
            </p>
          ) : null}
          {queriesMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessageOf(queriesMutation.error, "Could not save queries")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                !queriesDirty ||
                editableQueriesError !== null ||
                queriesMutation.isPending
              }
              onClick={() => {
                if (editableQueriesError !== null) return
                queriesMutation.mutate(
                  effectiveQueries.map((query) => query.trim()),
                )
              }}
            >
              {queriesMutation.isPending ? "Saving…" : "Save queries"}
            </Button>
            {queryDrafts !== null ? (
              <Button variant="outline" onClick={() => setQueryDrafts(null)}>
                Discard edits
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grid run</CardTitle>
          <CardDescription>
            Samples the saved queries at nine points. Every run reserves{" "}
            {runCost} credits before it is enqueued.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex max-w-xs flex-col gap-1.5">
            <Label htmlFor="local-seo-radius">Sampling radius in metres</Label>
            <Input
              id="local-seo-radius"
              inputMode="numeric"
              value={radiusInput}
              onChange={(event) => setRadiusInput(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              How far the nine sample points spread around the accepted
              coordinates — a sampling control, not a service area. Between{" "}
              {LOCAL_SEO_MIN_RADIUS_M} and {LOCAL_SEO_MAX_RADIUS_M} metres;
              default {LOCAL_SEO_DEFAULT_RADIUS_M}.
            </p>
            {radiusError ? (
              <p role="alert" className="text-sm text-destructive">
                {radiusError}
              </p>
            ) : null}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              checked={costConfirmed}
              onCheckedChange={(checked) =>
                setCostConfirmed(checked === true)
              }
              aria-label={`Confirm the ${runCost}-credit reservation`}
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm leading-none font-medium">
                Confirm the {runCost}-credit reservation
              </span>
              <p className="text-xs text-muted-foreground">
                Starting a run reserves {runCost}{" "}
                credits up front.
                {latestRun
                  ? ` Latest run confirmed spend: ${latestRun.credits_used}${latestRun.retry_credits > 0 ? ` (+${latestRun.retry_credits} retry)` : ""}.`
                  : " No runs yet for this location."}
              </p>
            </div>
          </div>

          {runMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessageOf(runMutation.error, "Could not start the run")}
            </p>
          ) : null}
          {!canRun && location !== undefined ? (
            <p role="status" className="text-sm text-muted-foreground">
              {!isBound
                ? "Ranking is disabled until a Google listing is bound to this location. Bind one from the Locations page — the placeId is never invented."
                : `Save between 1 and ${LOCAL_SEO_QUERY_COUNT} distinct queries to enable runs — currently ${location.queries.length} saved (${savedQueriesError}).`}
            </p>
          ) : null}
          <div>
            <Button
              disabled={
                radiusError !== null ||
                !costConfirmed ||
                runMutation.isPending ||
                latestActive ||
                !canRun
              }
              onClick={() => {
                if (radiusError !== null || !costConfirmed || !canRun) return
                runMutation.mutate(radiusM)
              }}
            >
              {runMutation.isPending
                ? "Starting…"
                : latestActive
                  ? "Run in progress…"
                  : `Start grid run (${runCost} credits)`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section aria-label="Latest run" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Latest run</h2>
        {latestRunQuery.isPending ? (
          <div className="flex flex-col gap-2" aria-label="Loading latest run">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : latestRunQuery.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>Could not load the latest run</CardTitle>
              <CardDescription>
                {errorMessageOf(latestRunQuery.error, "Request failed")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => void latestRunQuery.refetch()}
                variant="outline"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : latestRun === null ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No runs yet</EmptyTitle>
              <EmptyDescription>
                Confirm the credit reservation above, then start the first
                grid run for this location.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Run status
                  <Badge variant={runStatusBadgeVariant(latestRun.status)}>
                    <span aria-live="polite">{latestRun.status}</span>
                  </Badge>
                  {latestActive ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      Refreshing every few seconds…
                    </span>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  Radius {latestRun.radius_m} m · reserved{" "}
                  {latestRun.expected_credits} · confirmed spend{" "}
                  {latestRun.credits_used}
                  {latestRun.retry_credits > 0
                    ? ` (+${latestRun.retry_credits} retry)`
                    : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="text-muted-foreground">
                  Frozen queries: {latestRun.queries.join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  This snapshot is frozen: editing queries or binding a listing
                  does not change it.
                </p>
                {location &&
                latestRun.target_place_id &&
                latestRun.target_place_id !== location.place_id ? (
                  <p role="alert" className="text-destructive">
                    This run tracked a different listing from the current location.
                    Recorded listing: {latestRun.target_place_id}.
                  </p>
                ) : null}
                {(latestRun.unconfirmed_calls ?? 0) > 0 ? (
                  <p role="alert" className="text-destructive">
                    {latestRun.unconfirmed_calls} {latestRun.unconfirmed_calls === 1 ? "call has" : "calls have"} unresolved charges — confirmed spend may still rise.
                  </p>
                ) : null}
                {latestRun.reserved_credits != null &&
                latestRun.reserved_credits > 0 ? (
                  <p className="font-medium">
                    {latestRun.reserved_credits} credits still held in reservation.
                  </p>
                ) : null}
                {latestRun.error ? (
                  <p role="alert" className="text-destructive">
                    {latestRun.error}
                  </p>
                ) : null}
              </CardContent>
            </Card>
            <Separator />
            <LocalSeoRecordedMap run={latestRun} />
            <LocalSeoGrid cells={latestRun.cells} queries={latestRun.queries} />
          </>
        )}
      </section>
    </main>
  )
}
