import { clientApiFetch, clientApiPost } from "~/lib/api"

export type LocationSetupStepId =
  | "prepare"
  | "profile"
  | "keyword_analysis"
  | "questions"
  | "map_queries"
  | "ai_visibility"
  | "maps_visibility"

export type LocationSetupStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"

export type LocationSetupStep = {
  id: LocationSetupStepId
  status: LocationSetupStepStatus
  reason?: string
}

export type LocationSetupStatus = "ready" | "running" | "completed" | "failed"

/** GET /projects/{projectID}/locations/{locationID}/setup. */
export type LocationSetupResponse = {
  status: LocationSetupStatus
  differences: string
  steps: LocationSetupStep[]
  error?: string
  estimated_maps_credits?: number
  ai_audit_id?: string
  maps_run_id?: string
}

export function locationSetupQueryKey(projectId: string, locationId: string) {
  return ["location-setup", projectId, locationId] as const
}

// Backend always returns a setup row (ready before init): a 404 means the
// location lookup itself failed, so surface it instead of masking as ready.
export function fetchLocationSetup(
  projectId: string,
  locationId: string
): Promise<LocationSetupResponse> {
  return clientApiFetch<LocationSetupResponse>(
    `/projects/${projectId}/locations/${locationId}/setup`
  )
}

/** POST {differences?} starts or resumes; completed steps are never restarted. */
export function startLocationSetup(
  projectId: string,
  locationId: string,
  differences?: string
) {
  return clientApiPost<LocationSetupResponse>(
    `/projects/${projectId}/locations/${locationId}/setup`,
    { differences: differences?.trim() ? differences.trim() : undefined }
  )
}

/** Active only while the backend is working: the single bounded poll window. */
export function isLocationSetupActive(
  status: LocationSetupStatus | null | undefined
) {
  return status === "running"
}

/** Poll every 2s only while running; org events cover everything else. */
export function locationSetupRefetchInterval(
  status: LocationSetupStatus | null | undefined
): number | false {
  return status === "running" ? 2000 : false
}

export type LocationMapsQueriesJobStatus =
  | "idle"
  | "pending"
  | "running"
  | "completed"
  | "failed"

/** GET .../maps-queries/status. */
export type LocationMapsQueriesStatusResponse = {
  status: LocationMapsQueriesJobStatus
  error?: string
}

export function locationMapsQueriesStatusQueryKey(
  projectId: string,
  locationId: string
) {
  return ["location-maps-queries-status", projectId, locationId] as const
}

export function fetchLocationMapsQueriesStatus(
  projectId: string,
  locationId: string
) {
  return clientApiFetch<LocationMapsQueriesStatusResponse>(
    `/projects/${projectId}/locations/${locationId}/maps-queries/status`
  )
}

/** POST .../maps-queries/regenerate queues a generation job; manual rows are kept. */
export function regenerateLocationMapsQueries(
  projectId: string,
  locationId: string
) {
  return clientApiPost<LocationMapsQueriesStatusResponse>(
    `/projects/${projectId}/locations/${locationId}/maps-queries/regenerate`,
    {}
  )
}

/** Bounded poll only while the generation job is queued or running. */
export function locationMapsQueriesRefetchInterval(
  status: LocationMapsQueriesJobStatus | null | undefined
): number | false {
  return status === "pending" || status === "running" ? 2000 : false
}
