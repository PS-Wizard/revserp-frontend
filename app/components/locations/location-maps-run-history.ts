import { ApiError, clientApiFetch } from "~/lib/api"
import {
  LOCAL_SEO_POINT_COUNT,
  type LocalSeoLocation,
  type LocalSeoRun,
  type LocalSeoRunStatus,
} from "~/lib/local-seo-api"

export const LOCATION_RUN_HISTORY_DEFAULT_LIMIT = 20
export const LOCATION_RUN_HISTORY_LIMIT_STEP = 20
export const LOCATION_RUN_HISTORY_MAX_LIMIT = 100

/** One stored Maps run as the history list projects it: frozen metadata only.
 * Cell detail stays on the single-run endpoints; counts come from the frozen
 * snapshot so a run keeps its grid shape after later query edits. */
export type LocationMapsRunHistoryItem = {
  id: string
  status: LocalSeoRunStatus
  radius_m: number
  expected_credits: number
  credits_used: number
  query_count: number
  grid_point_count: number
  total_cells: number
  created_at: string
  completed_at?: string | null
  error?: string | null
}

export type LocationMapsRunHistory = {
  total: number
  runs: LocationMapsRunHistoryItem[]
}

/** Backend bounds: limit 1..100, offset >= 0. Clamp client-side so an invalid
 * window never reaches the list read. */
export function normalizeRunHistoryWindow(
  limit: number,
  offset: number
): { limit: number; offset: number } {
  const safeLimit = Number.isInteger(limit)
    ? Math.min(
        Math.max(limit, 1),
        LOCATION_RUN_HISTORY_MAX_LIMIT
      )
    : LOCATION_RUN_HISTORY_DEFAULT_LIMIT
  const safeOffset =
    Number.isInteger(offset) && offset >= 0 ? offset : 0
  return { limit: safeLimit, offset: safeOffset }
}

export function localSeoRunHistoryQueryKey(
  projectId: string,
  locationId: string,
  limit: number,
  offset: number
) {
  const window = normalizeRunHistoryWindow(limit, offset)
  return [
    "local-seo-run-history",
    projectId,
    locationId,
    window.limit,
    window.offset,
  ] as const
}

function isHistoryShape(value: unknown): value is LocationMapsRunHistory {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.total === "number" && Array.isArray(record.runs)
  )
}

/** A full stored run projected onto the history item shape, so views can
 * fall back to latest-only while the list route is unwired. */
export function locationMapsRunSummaryOfRun(
  run: LocalSeoRun
): LocationMapsRunHistoryItem {
  return {
    id: run.id,
    status: run.status,
    radius_m: run.radius_m,
    expected_credits: run.expected_credits,
    credits_used: run.credits_used,
    query_count: run.queries.length,
    grid_point_count: LOCAL_SEO_POINT_COUNT,
    total_cells: run.queries.length * LOCAL_SEO_POINT_COUNT,
    created_at: "",
  }
}

/** Stored Maps run history, newest first. A 404 means the list route is not
 * registered yet (or the location has no runs to list): fall back to a
 * latest-only page synthesized from the stored latest run, never an error.
 * Ownership is already verified by the location read; other statuses throw. */
export async function fetchLocalSeoRunHistory(
  projectId: string,
  locationId: string,
  limit: number,
  offset: number,
  latest: LocalSeoRun | null
): Promise<LocationMapsRunHistory> {
  const window = normalizeRunHistoryWindow(limit, offset)
  try {
    const page = await clientApiFetch<LocationMapsRunHistory>(
      `/projects/${projectId}/locations/${locationId}/runs?limit=${window.limit}&offset=${window.offset}`
    )
    if (isHistoryShape(page)) return page
    throw new Error("Unexpected run history response")
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return {
        total: latest ? 1 : 0,
        runs: latest ? [locationMapsRunSummaryOfRun(latest)] : [],
      }
    }
    throw error
  }
}

/** Persisted grid radius from the location DTO (migration 101 column). The
 * field stays omitted until backend read paths select it, so absence is a
 * normal null, not an error. */
export function locationSavedRadiusM(
  location: LocalSeoLocation
): number | null {
  const raw = (location as unknown as { radius_m?: unknown }).radius_m
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null
  return raw
}

export function describeRunHistoryOption(item: {
  status: string
  query_count: number
  radius_m: number
  created_at: string
}): string {
  const queries = `${item.query_count} ${item.query_count === 1 ? "query" : "queries"}`
  const radius = `${(item.radius_m / 1000).toFixed(1)} km`
  const date = new Date(item.created_at)
  const day = Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
  return [item.status, queries, radius, day].filter(Boolean).join(" · ")
}
