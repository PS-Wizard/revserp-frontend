import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { Button } from "~/components/ui/button"
import { FieldError } from "~/components/ui/field"
import { ApiError } from "~/lib/api"
import type { LocalSeoRun } from "~/lib/local-seo-api"
import {
  LOCATION_RUN_HISTORY_DEFAULT_LIMIT,
  LOCATION_RUN_HISTORY_LIMIT_STEP,
  LOCATION_RUN_HISTORY_MAX_LIMIT,
  describeRunHistoryOption,
  fetchLocalSeoRunHistory,
  locationMapsRunSummaryOfRun,
  localSeoRunHistoryQueryKey,
} from "~/components/locations/location-maps-run-history"

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

/** Saved-run picker for one locked location. Null means the latest run. */
export function LocationSavedRunPicker({
  projectId,
  locationId,
  latestRun,
  value,
  sessionRunId,
  onChange,
}: {
  projectId: string
  locationId: string
  latestRun: LocalSeoRun | null
  value: string | null
  sessionRunId?: string | null
  onChange: (runId: string | null) => void
}) {
  const [limit, setLimit] = useState(LOCATION_RUN_HISTORY_DEFAULT_LIMIT)
  const historyQuery = useQuery({
    queryKey: localSeoRunHistoryQueryKey(projectId, locationId, limit, 0),
    queryFn: () =>
      fetchLocalSeoRunHistory(projectId, locationId, limit, 0, latestRun),
    enabled: projectId !== "" && locationId !== "",
  })

  const history = historyQuery.data ?? null
  const historyItems = history?.runs ?? []
  const historyTotal = history?.total ?? 0
  const latestSummary = latestRun
    ? locationMapsRunSummaryOfRun(latestRun)
    : null
  const canShowMore =
    history !== null &&
    historyTotal > historyItems.length &&
    limit < LOCATION_RUN_HISTORY_MAX_LIMIT
  const sessionSelected =
    sessionRunId !== null &&
    sessionRunId !== undefined &&
    sessionRunId !== latestRun?.id &&
    !historyItems.some((item) => item.id === sessionRunId)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label className="flex min-w-0 max-w-full items-center">
        <span className="sr-only">Selected run</span>
        <select
          aria-label="Selected run"
          value={value ?? "latest"}
          onChange={(event) =>
            onChange(
              event.target.value === "latest" ? null : event.target.value
            )
          }
          className="h-9 w-full min-w-0 max-w-full truncate rounded-lg border border-border bg-card px-3 text-sm sm:w-auto sm:min-w-64"
        >
          <option value="latest">
            Latest
            {latestSummary
              ? ` · ${describeRunHistoryOption(latestSummary)}`
              : ""}
          </option>
          {historyItems
            .filter((item) => item.id !== latestRun?.id)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {describeRunHistoryOption(item)}
              </option>
            ))}
          {sessionSelected ? (
            <option value={sessionRunId}>
              Started this session · {sessionRunId.slice(0, 8)}
            </option>
          ) : null}
        </select>
      </label>
      {historyQuery.isError ? (
        <FieldError>
          {errorMessageOf(historyQuery.error, "Could not load saved runs")}
        </FieldError>
      ) : null}
      {canShowMore ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={historyQuery.isFetching}
            onClick={() =>
              setLimit((current) =>
                Math.min(
                  current + LOCATION_RUN_HISTORY_LIMIT_STEP,
                  LOCATION_RUN_HISTORY_MAX_LIMIT
                )
              )
            }
          >
            {historyQuery.isFetching
              ? "Loading…"
              : `Show more runs (${historyItems.length} of ${historyTotal})`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
