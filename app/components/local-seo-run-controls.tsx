import { useEffect, useRef, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "~/lib/api"
import {
  LOCAL_SEO_PER_CALL_CREDITS,
  LOCAL_SEO_POINT_COUNT,
  createLocalSeoRun,
  fetchLocalSeoLatestRun,
  fetchLocalSeoMapsBudget,
  isLocalSeoLocationBound,
  isLocalSeoRunActive,
  localSeoEnabledMapQueries,
  localSeoLatestRunQueryKey,
  localSeoLocationsQueryKey,
  localSeoMapsBudgetQueryKey,
  localSeoRunCost,
  localSeoRunRefetchInterval,
  validateLocalSeoQueries,
  validateLocalSeoRadiusM,
  type LocalSeoLocation,
  type LocalSeoRun,
  type LocalSeoRunStatus,
} from "~/lib/local-seo-api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { FieldDescription, FieldError } from "~/components/ui/field"
import { Separator } from "~/components/ui/separator"
import { LocalSeoRunOutcomes } from "~/components/local-seo-run-outcomes"

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

/** A usable allowance is a finite, non-negative whole number of credits. */
function isKnownAvailableCredits(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

export type LocalSeoRunGate = {
  bound: boolean
  isRemote: boolean
  queryError: string | null
  radiusError: string | null
  runReadState: "pending" | "error" | "ready"
  runStatus: LocalSeoRunStatus | null
  reservedCredits: number | null | undefined
  unconfirmedCalls: number | null | undefined
  budgetState: "loading" | "error" | "ready"
  availableCredits: number | null
  cost: number
  /** A run was just created; block until the latest read reflects it. */
  confirmingCreatedRun?: boolean
  /** A start failed; block until the latest read and allowance are re-checked. */
  refreshingAfterError?: boolean
}

export function describeLocalSeoRunGate(gate: LocalSeoRunGate): {
  canStart: boolean
  reason: string | null
} {
  if (gate.isRemote) {
    return {
      canStart: false,
      reason:
        "This location is remote. Grid runs are not available for it yet.",
    }
  }
  if (!gate.bound) {
    return {
      canStart: false,
      reason: "Bind a Google listing before starting a run.",
    }
  }
  if (gate.queryError) {
    return { canStart: false, reason: gate.queryError }
  }
  if (gate.radiusError) {
    return { canStart: false, reason: gate.radiusError }
  }
  if (gate.runReadState === "error") {
    return {
      canStart: false,
      reason: "The latest run could not be read, so a new paid run is blocked.",
    }
  }
  if (gate.runReadState === "pending") {
    return {
      canStart: false,
      reason: "Checking the latest run before allowing a paid run.",
    }
  }
  if (gate.confirmingCreatedRun) {
    return {
      canStart: false,
      reason:
        "A run was just started. Confirming it is the latest run before allowing another paid run.",
    }
  }
  if (gate.refreshingAfterError) {
    return {
      canStart: false,
      reason:
        "A start failed. Re-checking the latest run and allowance before allowing another paid run.",
    }
  }
  if (gate.runStatus !== null && isLocalSeoRunActive(gate.runStatus)) {
    return {
      canStart: false,
      reason:
        "A run is already queued or running for this location. Starting another run is blocked and cannot charge another run.",
    }
  }
  if ((gate.reservedCredits ?? 0) > 0 || (gate.unconfirmedCalls ?? 0) > 0) {
    return {
      canStart: false,
      reason:
        "The last run left reserved credits or unconfirmed charges. Resolve them before starting another paid run.",
    }
  }
  if (gate.budgetState === "loading") {
    return {
      canStart: false,
      reason: "Checking the Maps allowance before allowing a paid run.",
    }
  }
  if (gate.budgetState === "error" || gate.availableCredits === null) {
    return {
      canStart: false,
      reason: "The Maps allowance could not be read, so a paid run is blocked.",
    }
  }
  if (!isKnownAvailableCredits(gate.availableCredits)) {
    return {
      canStart: false,
      reason:
        "The Maps allowance is unknown or unusable, so a paid run is blocked.",
    }
  }
  if (gate.availableCredits < gate.cost) {
    return {
      canStart: false,
      reason: `Not enough Maps allowance: ${gate.availableCredits} credits available, ${gate.cost} required.`,
    }
  }
  return { canStart: true, reason: null }
}

export function describeLocalSeoRunProgress(run: LocalSeoRun): string {
  const completed = run.completed_cells
  const total = run.total_cells
  if (
    typeof completed !== "number" ||
    typeof total !== "number" ||
    !Number.isFinite(completed) ||
    !Number.isFinite(total)
  ) {
    return "Progress unavailable"
  }
  return `${completed}/${total} cells settled`
}

function LocalSeoRecordedRun({ run }: { run: LocalSeoRun }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{run.status}</Badge>
        {run.status === "queued" ? (
          <span className="text-muted-foreground">Waiting for a worker.</span>
        ) : null}
        <span className="text-muted-foreground tabular-nums">
          {describeLocalSeoRunProgress(run)} · {run.credits_used} credits used
        </span>
      </div>
      <details className="group">
        <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Call outcomes
        </summary>
        <div className="flex flex-col gap-2 pt-3">
          <LocalSeoRunOutcomes run={run} />
        </div>
      </details>
    </div>
  )
}

function RunStat({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium tabular-nums">{children}</dd>
    </div>
  )
}

export function LocalSeoRunControls({
  projectId,
  location,
  radiusM,
  isRemote = false,
  onRunStarted,
  part = "full",
}: {
  projectId: string
  location: LocalSeoLocation
  radiusM: number
  isRemote?: boolean
  onRunStarted?: (runId: string) => void
  /** "action" is just the start button for a toolbar; "recorded" is only the
   * latest-run summary; "full" is the standalone card. */
  part?: "full" | "action" | "recorded"
}) {
  const queryClient = useQueryClient()
  const enabledMapQueries = localSeoEnabledMapQueries(location.queries)
  const count = enabledMapQueries.length
  const cost = localSeoRunCost(location)
  const queryError = validateLocalSeoQueries(enabledMapQueries)
  const radiusError = validateLocalSeoRadiusM(radiusM)
  const scopeKey = `${projectId}::${location.id}`
  const currentScopeRef = useRef(scopeKey)
  currentScopeRef.current = scopeKey
  const [createdRun, setCreatedRun] = useState<{
    scopeKey: string
    runId: string
  } | null>(null)
  const [refreshingScope, setRefreshingScope] = useState<string | null>(null)
  const latestRunQuery = useQuery({
    queryKey: localSeoLatestRunQueryKey(projectId, location.id),
    queryFn: () => fetchLocalSeoLatestRun(projectId, location.id),
    enabled: projectId !== "",
    refetchInterval: (query) =>
      localSeoRunRefetchInterval(query.state.data?.status),
  })
  const budgetQuery = useQuery({
    queryKey: localSeoMapsBudgetQueryKey(projectId),
    queryFn: () => fetchLocalSeoMapsBudget(projectId),
    enabled: projectId !== "",
  })

  const latestRun = latestRunQuery.data ?? null
  const availableCredits = budgetQuery.data?.available_credits ?? null
  const confirmingCreatedRun =
    createdRun !== null &&
    createdRun.scopeKey === scopeKey &&
    latestRun?.id !== createdRun.runId
  const refreshingAfterError = refreshingScope === scopeKey
  const budgetState: "loading" | "error" | "ready" = budgetQuery.isError
    ? "error"
    : budgetQuery.data
      ? "ready"
      : "loading"
  const runReadState: "pending" | "error" | "ready" = latestRunQuery.isError
    ? "error"
    : latestRunQuery.isPending
      ? "pending"
      : "ready"

  const gate = describeLocalSeoRunGate({
    bound: isLocalSeoLocationBound(location),
    isRemote,
    queryError,
    radiusError,
    runReadState,
    runStatus: latestRun?.status ?? null,
    reservedCredits: latestRun?.reserved_credits,
    unconfirmedCalls: latestRun?.unconfirmed_calls,
    budgetState,
    availableCredits,
    cost,
    confirmingCreatedRun,
    refreshingAfterError,
  })

  const startMutation = useMutation({
    mutationFn: (input: {
      projectId: string
      locationId: string
      radiusM: number
      expectedCredits: number
    }) =>
      createLocalSeoRun(
        input.projectId,
        input.locationId,
        input.radiusM,
        input.expectedCredits
      ),
    retry: false,
    onSuccess: (data, variables) => {
      const scope = `${variables.projectId}::${variables.locationId}`
      void queryClient.invalidateQueries({
        queryKey: localSeoLatestRunQueryKey(
          variables.projectId,
          variables.locationId
        ),
      })
      void queryClient.invalidateQueries({
        queryKey: localSeoMapsBudgetQueryKey(variables.projectId),
      })
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationsQueryKey(variables.projectId),
      })
      if (currentScopeRef.current === scope) {
        setCreatedRun({ scopeKey: scope, runId: data.id })
        onRunStarted?.(data.id)
      }
    },
    onError: (_error, variables) => {
      const scope = `${variables.projectId}::${variables.locationId}`
      if (currentScopeRef.current !== scope) return
      setRefreshingScope(scope)
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: localSeoLatestRunQueryKey(
            variables.projectId,
            variables.locationId
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: localSeoMapsBudgetQueryKey(variables.projectId),
        }),
      ]).finally(() => {
        setRefreshingScope((current) => (current === scope ? null : current))
      })
    },
  })

  const runStatus = latestRun?.status ?? null
  const previousRunStatusRef = useRef<LocalSeoRunStatus | null>(null)
  useEffect(() => {
    const previous = previousRunStatusRef.current
    previousRunStatusRef.current = runStatus
    if (previous === null || runStatus === null) return
    if (isLocalSeoRunActive(previous) && !isLocalSeoRunActive(runStatus)) {
      void queryClient.invalidateQueries({
        queryKey: localSeoMapsBudgetQueryKey(projectId),
      })
    }
  }, [runStatus, projectId, queryClient])

  useEffect(() => {
    if (createdRun === null) return
    if (createdRun.scopeKey !== scopeKey) {
      setCreatedRun(null)
      return
    }
    if (latestRun?.id === createdRun.runId) setCreatedRun(null)
  }, [createdRun, scopeKey, latestRun?.id])

  const startSummary = `${count} ${count === 1 ? "query" : "queries"} × ${LOCAL_SEO_POINT_COUNT} points × ${LOCAL_SEO_PER_CALL_CREDITS} credits · ${(radiusM / 1000).toFixed(1)} km radius${
    isKnownAvailableCredits(availableCredits) && budgetState === "ready"
      ? ` · ${availableCredits} credits available`
      : ""
  }`
  const startButton = (
    <Button
      title={startSummary}
      type="button"
      disabled={!gate.canStart || startMutation.isPending}
      onClick={() =>
        startMutation.mutate({
          projectId,
          locationId: location.id,
          radiusM,
          expectedCredits: cost,
        })
      }
    >
      {startMutation.isPending ? "Starting…" : `Start run · ${cost} credits`}
    </Button>
  )
  if (part === "action") {
    return (
      <div
        aria-label="Local SEO run controls"
        role="group"
        className="flex flex-col items-end gap-1 in-data-[slot=empty-content]:items-center"
      >
        {startButton}
        {gate.reason ? (
          <FieldDescription
            role="status"
            className="max-w-xs text-right in-data-[slot=empty-content]:text-center"
          >
            {gate.reason}
          </FieldDescription>
        ) : null}
        {startMutation.isError ? (
          <FieldError>
            {errorMessageOf(startMutation.error, "Could not start the run")}
          </FieldError>
        ) : null}
      </div>
    )
  }
  if (part === "recorded") {
    return (
      <section aria-label="Latest recorded run" className="flex flex-col gap-2">
        {runReadState === "ready" && latestRun ? (
          <LocalSeoRecordedRun run={latestRun} />
        ) : runReadState === "error" ? (
          <FieldError>
            {errorMessageOf(
              latestRunQuery.error,
              "Could not load the latest run"
            )}
          </FieldError>
        ) : null}
      </section>
    )
  }
  const allowanceKnown =
    budgetState === "ready" &&
    availableCredits !== null &&
    isKnownAvailableCredits(availableCredits)
  return (
    <section
      aria-label="Local SEO run controls"
      className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-sm font-medium">Next run</h2>
            <p
              className="max-w-xl break-words text-xs text-muted-foreground"
              title={enabledMapQueries.join(" · ")}
            >
              {count === 0 ? "No saved queries" : enabledMapQueries.join(" · ")}
            </p>
          </div>
          <Button
            type="button"
            disabled={!gate.canStart || startMutation.isPending}
            onClick={() =>
              startMutation.mutate({
                projectId,
                locationId: location.id,
                radiusM,
                expectedCredits: cost,
              })
            }
          >
            {startMutation.isPending
              ? "Starting…"
              : `Start run · ${cost} credits`}
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <RunStat label="Queries">{count}</RunStat>
          <RunStat label="Radius">{(radiusM / 1000).toFixed(1)} km</RunStat>
          <RunStat label={`Cost · ${count} × ${LOCAL_SEO_POINT_COUNT} × ${LOCAL_SEO_PER_CALL_CREDITS}`}>
            {cost} credits
          </RunStat>
          <RunStat label="Allowance">
            {allowanceKnown
              ? availableCredits >= cost
                ? `${availableCredits} · ${availableCredits - cost} after`
                : `${availableCredits} · ${cost} required`
              : "Unknown"}
          </RunStat>
        </dl>
        {gate.reason ? (
          <FieldDescription role="status">{gate.reason}</FieldDescription>
        ) : null}
        {startMutation.isError ? (
          <FieldError>
            {errorMessageOf(startMutation.error, "Could not start the run")}
          </FieldError>
        ) : null}
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Latest recorded run</h2>
        {runReadState === "pending" ? (
          <p className="text-sm text-muted-foreground">
            Loading the latest run…
          </p>
        ) : runReadState === "error" ? (
          <FieldError>
            {errorMessageOf(
              latestRunQuery.error,
              "Could not load the latest run"
            )}
          </FieldError>
        ) : latestRun ? (
          <LocalSeoRecordedRun run={latestRun} />
        ) : (
          <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
        )}
      </div>
    </section>
  )
}
