import {
  ApiError,
  clientApiDelete,
  clientApiFetch,
  clientApiPost,
  clientApiPut,
} from "~/lib/api"

export type LocalSeoLocation = {
  id: string
  project_id: string
  name: string
  /** Null until a real Google listing is bound; never invent one. */
  place_id: string | null
  address: string
  locality: string
  localities: string[]
  /** Server-effective Model A services; the only source for query generation. */
  services: string[]
  latitude: number
  longitude: number
  /** Ordered saved query records; a run prices only the enabled map records. */
  queries: LocalSeoLocationQueryRecord[]
}

export type LocalSeoGeocodedAddress = {
  display_name: string
  latitude: number
  longitude: number
  locality: string
  country_code: string
  localities?: string[]
}

export type LocalSeoGeographyEnvelope = {
  results: LocalSeoGeocodedAddress[]
  cached: boolean
  refresh_error?: string | null
}

export type LocalSeoListingCandidate = {
  place_id: string
  title: string
  address: string
  latitude: number
  longitude: number
}

export type LocalSeoListingLookupStatus =
  | "completed"
  | "failed"
  | "uncertain"
  | "running"

export type LocalSeoListingLookup = {
  id: string
  status: LocalSeoListingLookupStatus
  expected_credits: number
  credits_used: number
  reserved_credits: number
  credit_known: boolean
  error: string | null
  candidates: LocalSeoListingCandidate[]
  deduplicated?: boolean
  source_candidate?: Pick<LocalSeoGeocodedAddress, "display_name" | "latitude" | "longitude">
}

export type LocalSeoRing = "centre" | "edge" | "corner"

export type LocalSeoSector =
  | "centre"
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW"

export type LocalSeoCallStatus =
  | "pending"
  | "request_failed"
  | "success_empty"
  | "success_nonempty"

export type LocalSeoMatchStatus = "found" | "absent" | "unknown"

export type LocalSeoCell = {
  query_index: number
  point_index: number
  latitude: number
  longitude: number
  distance_m: number
  ring: LocalSeoRing
  sector: LocalSeoSector
  call_status: LocalSeoCallStatus
  match_status: LocalSeoMatchStatus
  /** Rank is only ever set alongside a found match, and is otherwise null. */
  rank: number | null
  /** Stored raw places entries for this query (includes target/branches/duplicates), not unique competitors or all Google matches. Null when unknown. */
  result_count?: number | null
  credits: number
  /** False while the charge for this call is still ambiguous. */
  credit_known: boolean
  error: string | null
}

export type LocalSeoRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"

export type LocalSeoRun = {
  id: string
  location_id: string
  status: LocalSeoRunStatus
  radius_m: number
  expected_credits: number
  credits_used: number
  retry_credits: number
  queries: string[]
  target_place_id?: string
  /** All 45 planned cells, including pending ones, from the frozen queries. */
  cells: LocalSeoCell[]
  /** Credits still held by the reservation, when the backend reports it. */
  reserved_credits?: number | null
  /** Calls with ambiguous charges; confirmed spend may still rise. */
  unconfirmed_calls?: number | null
  error?: string | null
  /** Resolved cell count, when the backend reports progress; absent means unknown. */
  completed_cells?: number | null
  /** Planned cell count, when the backend reports progress; absent means unknown. */
  total_cells?: number | null
}

export type LocalSeoPointPlace = {
  /** Provider position exactly as stored; null when the provider omitted it. */
  position: number | null
  title: string
  address: string
  place_id: string | null
  rating: number | null
  rating_count: number | null
  /** True only for the frozen run target, never the current location place id. */
  is_target: boolean
}

export type LocalSeoPointQuery = {
  query_index: number
  query: string
  call_status: LocalSeoCallStatus
  match_status: LocalSeoMatchStatus
  rank: number | null
  error: string | null
  /** Provider order is preserved; never re-sorted, re-ranked, or deduplicated. */
  places: LocalSeoPointPlace[]
}

export type LocalSeoPointDetails = {
  run_id: string
  point_index: number
  /** Frozen run target; a rebound current location place id may differ. */
  target_place_id: string
  queries: LocalSeoPointQuery[]
}

export type LocalSeoCreateRunResponse = {
  id: string
  status: LocalSeoRunStatus
  expected_credits: number
}

export type LocalSeoProjectService = {
  id: string
  label: string
}

export type LocalSeoProjectServiceOption = LocalSeoProjectService & {
  excluded: boolean
}

export type LocalSeoLocationServices = {
  /** Server-computed final list; the client never recomputes it from overrides. */
  effective: string[]
  project: LocalSeoProjectServiceOption[]
  location_only: string[]
}

export type LocalSeoServiceOverrideMode = "include" | "exclude"

export type LocalSeoServiceOverride = {
  service_id: string | null
  service_label: string | null
  mode: LocalSeoServiceOverrideMode
}

export type LocalSeoQueryKind = "map" | "ai_question"
export type LocalSeoQuerySource = "generated" | "manual"
export type LocalSeoQueryOrigin = "service" | "locality" | "landmark"

export type LocalSeoLocationQueryRecord = {
  id: string
  text: string
  ordinal: number
  enabled: boolean
  kind: LocalSeoQueryKind
  source: LocalSeoQuerySource
  origin: LocalSeoQueryOrigin
  landmark_id: string | null
}

/** Ordered PUT row for the queries endpoint; a missing id creates a record. */
export type LocalSeoLocationQueryDraft = {
  id?: string
  text: string
  enabled: boolean
  kind: LocalSeoQueryKind
  source: LocalSeoQuerySource
}

export type LocalSeoLandmark = {
  id: string
  name: string
  latitude: number
  longitude: number
  straight_line_m: number
  provider: string
  provider_ref: string
  categories: string[]
  fetched_at: string
  selected: boolean
}

export const LOCAL_SEO_QUERY_COUNT = 5
export const LOCAL_SEO_POINT_COUNT = 9
/** Row-major point letters A to I: A is north-west, E is the centre, I is south-east. */
export const LOCAL_SEO_POINT_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
] as const

export function localSeoPointLetter(pointIndex: number): string {
  return LOCAL_SEO_POINT_LETTERS[pointIndex] ?? "?"
}
/** Every provider call costs three credits. */
export const LOCAL_SEO_PER_CALL_CREDITS = 3
/** Five queries times nine points: every run plans 45 cells. */
export const LOCAL_SEO_CELL_COUNT =
  LOCAL_SEO_QUERY_COUNT * LOCAL_SEO_POINT_COUNT
/** Places identity lookup uses zero application credits; ranking is priced separately. */
export const LOCAL_SEO_LISTING_LOOKUP_EXPECTED_CREDITS = 0
/** 45 cells at three credits each: every run reserves 135 credits. */
export const LOCAL_SEO_BASE_EXPECTED_CREDITS =
  LOCAL_SEO_CELL_COUNT * LOCAL_SEO_PER_CALL_CREDITS
export const LOCAL_SEO_DEFAULT_RADIUS_M = 5000
export const LOCAL_SEO_MIN_RADIUS_M = 1000
export const LOCAL_SEO_MAX_RADIUS_M = 25000
/** Backend query limit in UTF-8 bytes, not characters. */
export const LOCAL_SEO_MAX_QUERY_BYTES = 500

export const LOCAL_SEO_COMPASS_SECTORS: LocalSeoSector[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
]

export function isLocalSeoRunActive(status: LocalSeoRunStatus) {
  return status === "queued" || status === "running"
}

/** Refetch a run query every second only while queued or running; false once terminal or unknown. */
export function localSeoRunRefetchInterval(
  status: LocalSeoRunStatus | null | undefined,
): number | false {
  return status === "queued" || status === "running" ? 1000 : false
}

/** Mirrors the backend limits so an invalid run never reaches reservation. */
export function validateLocalSeoQueries(queries: string[]): string | null {
  if (queries.length < 1 || queries.length > LOCAL_SEO_QUERY_COUNT) {
    return `Between 1 and ${LOCAL_SEO_QUERY_COUNT} queries are required, got ${queries.length}.`
  }
  const trimmed = queries.map((query) => query.trim())
  if (trimmed.some((query) => query === "")) {
    return "Queries must all be non-empty."
  }
  if (
    trimmed.some(
      (query) =>
        new TextEncoder().encode(query).length > LOCAL_SEO_MAX_QUERY_BYTES,
    )
  ) {
    return `Queries must each fit within ${LOCAL_SEO_MAX_QUERY_BYTES} bytes.`
  }
  const lowered = trimmed.map((query) => query.toLowerCase())
  if (new Set(lowered).size !== lowered.length) {
    return "Queries must all be distinct, ignoring case and surrounding spaces."
  }
  return null
}

/**
 * Editor drafts may hold more rows than a run will price, or none at all; only
 * blank, duplicate, or oversized text is rejected here. The 1..5 price guard
 * lives in validateLocalSeoQueries at enqueue.
 */
export function validateEditableLocalSeoQueries(queries: string[]): string | null {
  const trimmed = queries.map((query) => query.trim())
  if (trimmed.some((query) => query === "")) {
    return "Queries must all be non-empty; remove the empty row instead."
  }
  if (
    trimmed.some(
      (query) =>
        new TextEncoder().encode(query).length > LOCAL_SEO_MAX_QUERY_BYTES,
    )
  ) {
    return `Queries must each fit within ${LOCAL_SEO_MAX_QUERY_BYTES} bytes.`
  }
  const lowered = trimmed.map((query) => query.toLowerCase())
  if (new Set(lowered).size !== lowered.length) {
    return "Queries must all be distinct, ignoring case and surrounding spaces."
  }
  return null
}

export function validateLocalSeoCoordinates(
  latitude: number,
  longitude: number,
): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "Coordinates must be finite numbers."
  }
  if (latitude < -90 || latitude > 90) {
    return "Latitude must be between -90 and 90."
  }
  if (longitude < -180 || longitude > 180) {
    return "Longitude must be between -180 and 180."
  }
  return null
}

/** A location is bound only once a real listing placeId is stored. */
export function isLocalSeoLocationBound(location: LocalSeoLocation): boolean {
  return location.place_id !== null && location.place_id !== ""
}

/** Enabled map query texts; the only strings a run prices or sends. */
export function localSeoEnabledMapQueries(
  queries: LocalSeoLocationQueryRecord[],
): string[] {
  return queries
    .filter((query) => query.enabled && query.kind === "map")
    .map((query) => query.text)
}

/** Dedupe key mirroring the backend query normalization: collapse whitespace, lowercase. */
export function localSeoQueryTextKey(text: string): string {
  return text.trim().split(/\s+/).join(" ").toLowerCase()
}

/** Run gate: bound identity plus between one and five enabled map queries. */
export function canRunLocalSeoGrid(location: LocalSeoLocation): boolean {
  return (
    isLocalSeoLocationBound(location) &&
    validateLocalSeoQueries(localSeoEnabledMapQueries(location.queries)) === null
  )
}

/** Credits this location's run reserves, from its enabled map queries. */
export function localSeoRunCost(location: LocalSeoLocation): number {
  return (
    localSeoEnabledMapQueries(location.queries).length *
    LOCAL_SEO_POINT_COUNT *
    LOCAL_SEO_PER_CALL_CREDITS
  )
}

/** Mirrors the backend limits so an invalid run never reaches reservation. */
export function validateLocalSeoRadiusM(radiusM: number): string | null {
  if (!Number.isFinite(radiusM)) {
    return "Radius must be a number."
  }
  if (!Number.isInteger(radiusM)) {
    return "Radius must be a whole number of metres."
  }
  if (
    radiusM < LOCAL_SEO_MIN_RADIUS_M ||
    radiusM > LOCAL_SEO_MAX_RADIUS_M
  ) {
    return `Radius must be between ${LOCAL_SEO_MIN_RADIUS_M} and ${LOCAL_SEO_MAX_RADIUS_M} metres.`
  }
  return null
}

export function localSeoLocationQueryKey(
  projectId: string,
  locationId: string,
) {
  return ["local-seo-location", projectId, locationId] as const
}

export function localSeoLatestRunQueryKey(
  projectId: string,
  locationId: string,
) {
  return ["local-seo-latest-run", projectId, locationId] as const
}

export function localSeoRunQueryKey(
  projectId: string,
  locationId: string,
  runId: string,
) {
  return ["local-seo-run", projectId, locationId, runId] as const
}

export function fetchLocalSeoLocation(projectId: string, locationId: string) {
  return clientApiFetch<LocalSeoLocation>(
    `/projects/${projectId}/locations/${locationId}`,
  )
}

/** Replaces the ordered query records; returns the saved records, not the location. */
export function updateLocalSeoLocationQueryRecords(
  projectId: string,
  locationId: string,
  records: LocalSeoLocationQueryDraft[],
) {
  return clientApiPut<LocalSeoLocationQueryRecord[]>(
    `/projects/${projectId}/locations/${locationId}/queries`,
    records,
  )
}

/** Latest run, or null when the location has never run (backend 404). */
export async function fetchLocalSeoLatestRun(
  projectId: string,
  locationId: string,
): Promise<LocalSeoRun | null> {
  try {
    return await clientApiFetch<LocalSeoRun>(
      `/projects/${projectId}/locations/${locationId}/runs/latest`,
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export function fetchLocalSeoRun(
  projectId: string,
  locationId: string,
  runId: string,
) {
  return clientApiFetch<LocalSeoRun>(
    `/projects/${projectId}/locations/${locationId}/runs/${runId}`,
  )
}

export function localSeoPointDetailsQueryKey(
  projectId: string,
  locationId: string,
  runId: string,
  pointIndex: number,
  /** Run status is part of the key so a terminal transition refetches once more. */
  status: LocalSeoRunStatus,
) {
  return [
    "local-seo-point-details",
    projectId,
    locationId,
    runId,
    pointIndex,
    status,
  ] as const
}

/** Frozen per-point provider evidence; a stored-data read that never calls a provider. */
export function fetchLocalSeoPointDetails(
  projectId: string,
  locationId: string,
  runId: string,
  pointIndex: number,
) {
  return clientApiFetch<LocalSeoPointDetails>(
    `/projects/${projectId}/locations/${locationId}/runs/${runId}/points/${pointIndex}`,
  )
}

/** Atomically reserves expectedCredits then enqueues; the run starts queued. */
export function createLocalSeoRun(
  projectId: string,
  locationId: string,
  radiusM: number,
  expectedCredits: number,
) {
  return clientApiPost<LocalSeoCreateRunResponse>(
    `/projects/${projectId}/locations/${locationId}/runs`,
    { radius_m: radiusM, expected_credits: expectedCredits },
  )
}

export function localSeoLocationsQueryKey(projectId: string) {
  return ["local-seo-locations", projectId] as const
}

export function localSeoLatestListingLookupQueryKey(
  projectId: string,
  locationId: string,
) {
  return ["local-seo-listing-lookup-latest", projectId, locationId] as const
}

export function fetchLocalSeoLocations(projectId: string) {
  return clientApiFetch<LocalSeoLocation[]>(`/projects/${projectId}/locations`)
}

export type LocalSeoCreateLocationInput = {
  name: string
  address: string
  locality: string
  localities?: string[]
  latitude: number
  longitude: number
}

/** Creates an unbound location; place_id is never submitted. */
export function createLocalSeoLocation(
  projectId: string,
  input: LocalSeoCreateLocationInput,
) {
  return clientApiPost<LocalSeoLocation>(
    `/projects/${projectId}/locations`,
    input,
  )
}

export function deleteLocalSeoLocation(projectId: string, locationId: string) {
  return clientApiDelete<unknown>(`/projects/${projectId}/locations/${locationId}`)
}

/** Split a service field on commas so one box holds several services. */
export function splitLocalSeoServices(serviceText: string): string[] {
  return serviceText
    .split(",")
    .map((service) => service.trim())
    .filter((service) => service !== "")
}

export function generateLocalSeoQueries(
  projectId: string,
  input: { service: string; services?: string[]; locality: string; localities?: string[] },
) {
  return clientApiPost<{ queries: string[] }>(
    `/projects/${projectId}/locations/queries/generate`,
    input,
  )
}

/** Free Nominatim search; call only on explicit user action, never per keystroke. */
export function searchLocalSeoAddresses(
  projectId: string,
  input: { address: string; refresh?: boolean },
) {
  return clientApiPost<LocalSeoGeographyEnvelope>(
    `/projects/${projectId}/locations/address-search`,
    input,
  )
}

/** Free reverse lookup used to confirm locality for accepted coordinates. */
export function reverseLocalSeoAddress(
  projectId: string,
  input: { latitude: number; longitude: number; refresh?: boolean },
) {
  return clientApiPost<LocalSeoGeographyEnvelope>(
    `/projects/${projectId}/locations/reverse-address`,
    input,
  )
}

/** One explicit zero-credit Places search; identical stored attempts are reused. */
export function createLocalSeoListingLookup(
  projectId: string,
  locationId: string,
  input: { search_query: string; latitude: number; longitude: number } | Record<string, never> = {},
) {
  return clientApiPost<LocalSeoListingLookup>(
    `/projects/${projectId}/locations/${locationId}/listing-lookups`,
    { ...input, expected_credits: LOCAL_SEO_LISTING_LOOKUP_EXPECTED_CREDITS },
  )
}

/** Latest stored lookup, or null when none exists yet (backend 404). Free. */
export async function fetchLocalSeoLatestListingLookup(
  projectId: string,
  locationId: string,
): Promise<LocalSeoListingLookup | null> {
  try {
    return await clientApiFetch<LocalSeoListingLookup>(
      `/projects/${projectId}/locations/${locationId}/listing-lookups/latest`,
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Free candidate confirmation. New Maps evidence supplies authoritative coordinates. */
export function bindLocalSeoListing(
  projectId: string,
  locationId: string,
  input: { lookup_id: string; place_id: string },
) {
  return clientApiPost<LocalSeoLocation>(
    `/projects/${projectId}/locations/${locationId}/listing`,
    input,
  )
}

/** Free explicit unbinding; historical runs keep their frozen identity and coordinates. */
export function unbindLocalSeoListing(projectId: string, locationId: string) {
  return clientApiDelete<LocalSeoLocation>(
    `/projects/${projectId}/locations/${locationId}/listing`,
  )
}

/** Project-wide service catalog, ordered by the server. */
export function localSeoProjectServicesQueryKey(projectId: string) {
  return ["local-seo-project-services", projectId] as const
}

export function fetchLocalSeoProjectServices(projectId: string) {
  return clientApiFetch<LocalSeoProjectService[]>(
    `/projects/${projectId}/services`,
  )
}

export function createLocalSeoProjectService(projectId: string, label: string) {
  return clientApiPost<LocalSeoProjectService>(`/projects/${projectId}/services`, {
    label,
  })
}

export function renameLocalSeoProjectService(
  projectId: string,
  serviceId: string,
  label: string,
) {
  return clientApiFetch<LocalSeoProjectService>(
    `/projects/${projectId}/services/${serviceId}`,
    {
      method: "PATCH",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ label }),
    },
  )
}

export function deleteLocalSeoProjectService(projectId: string, serviceId: string) {
  return clientApiDelete<unknown>(`/projects/${projectId}/services/${serviceId}`)
}

export function localSeoLocationServicesQueryKey(
  projectId: string,
  locationId: string,
) {
  return ["local-seo-location-services", projectId, locationId] as const
}

export function fetchLocalSeoLocationServices(projectId: string, locationId: string) {
  return clientApiFetch<LocalSeoLocationServices>(
    `/projects/${projectId}/locations/${locationId}/services`,
  )
}

export function updateLocalSeoLocationServices(
  projectId: string,
  locationId: string,
  overrides: LocalSeoServiceOverride[],
) {
  return clientApiPut<LocalSeoLocationServices>(
    `/projects/${projectId}/locations/${locationId}/services`,
    { overrides },
  )
}

export function localSeoLocationQueryRecordsQueryKey(
  projectId: string,
  locationId: string,
) {
  return ["local-seo-location-query-records", projectId, locationId] as const
}

/** Server query records for a location, ordered by ordinal. */
export function fetchLocalSeoLocationQueryRecords(projectId: string, locationId: string) {
  return clientApiFetch<LocalSeoLocationQueryRecord[]>(
    `/projects/${projectId}/locations/${locationId}/queries`,
  )
}

export function localSeoLandmarksQueryKey(projectId: string, locationId: string) {
  return ["local-seo-landmarks", projectId, locationId] as const
}

export function fetchLocalSeoLandmarks(projectId: string, locationId: string) {
  return clientApiFetch<LocalSeoLandmark[]>(
    `/projects/${projectId}/locations/${locationId}/landmarks`,
  )
}

export function refreshLocalSeoLandmarks(projectId: string, locationId: string) {
  return clientApiPost<LocalSeoLandmark[]>(
    `/projects/${projectId}/locations/${locationId}/landmarks/refresh`,
    {},
  )
}

export function updateLocalSeoLandmarkSelection(
  projectId: string,
  locationId: string,
  selectedIds: string[],
) {
  return clientApiPut<LocalSeoLandmark[]>(
    `/projects/${projectId}/locations/${locationId}/landmarks/selection`,
    { selected_ids: selectedIds },
  )
}

export type LocalSeoMapsBudget = {
  remaining_credits: number
  reserved_credits: number
  spent_credits: number
  available_credits: number
}

export function localSeoMapsBudgetQueryKey(projectId: string) {
  return ["local-seo-maps-budget", projectId] as const
}

/** Organization Maps spending allowance for a project. Read-only and never a
Serper provider account balance; a missing or unauthorized project stays a 404
error rather than defaulting to a synthetic allowance. */
export function fetchLocalSeoMapsBudget(projectId: string) {
  return clientApiFetch<LocalSeoMapsBudget>(
    `/projects/${projectId}/maps-budget`,
  )
}

/** Run-level competitor rollup; backend order is frequency desc, best rank asc, id. */
export type LocalSeoRunCompetitor = {
  place_id: string
  title: string
  address: string
  query_points_seen: number
  best_rank: number | null
  /** True when the row shares the frozen target website host; false when the website is missing. */
  same_brand_domain: boolean
  query_indexes: number[]
}


/** Frozen competitor evidence for one recorded run; target is excluded by the backend. */
export type LocalSeoRunCompetitors = {
  run_id: string
  target_place_id: string
  queries: string[]
  /** Null for the whole run; a point index for per-point scope. */
  point_index: number | null
  total_query_points: number
  contributing_query_points: number
  failed_query_points: number
  pending_query_points: number
  unreadable_query_points: number
  idless_entries: number
  competitors: LocalSeoRunCompetitor[]
}

/** Status plus completed_cells bust the cache while a run is still active. */
export function localSeoRunCompetitorsQueryKey(
  projectId: string,
  locationId: string,
  runId: string,
  status: LocalSeoRunStatus,
  completedCells: number | null | undefined,
) {
  return [
    "local-seo-run-competitors",
    projectId,
    locationId,
    runId,
    status,
    completedCells ?? null,
  ] as const
}

/** Frozen stored competitor rollup; never calls a provider. */
export function fetchLocalSeoRunCompetitors(
  projectId: string,
  locationId: string,
  runId: string,
) {
  return clientApiFetch<LocalSeoRunCompetitors>(
    `/projects/${projectId}/locations/${locationId}/runs/${runId}/competitors`,
  )
}

/** Status plus completed_cells bust the cache while a run is still active. */
export function localSeoRunPointCompetitorsQueryKey(
  projectId: string,
  locationId: string,
  runId: string,
  pointIndex: number,
  status: LocalSeoRunStatus,
  completedCells: number | null | undefined,
) {
  return [
    "local-seo-run-point-competitors",
    projectId,
    locationId,
    runId,
    pointIndex,
    status,
    completedCells ?? null,
  ] as const
}

/** Frozen stored per-point competitor rollup; never calls a provider. */
export function fetchLocalSeoRunPointCompetitors(
  projectId: string,
  locationId: string,
  runId: string,
  pointIndex: number,
) {
  return clientApiFetch<LocalSeoRunCompetitors>(
    `/projects/${projectId}/locations/${locationId}/runs/${runId}/points/${pointIndex}/competitors`,
  )
}
