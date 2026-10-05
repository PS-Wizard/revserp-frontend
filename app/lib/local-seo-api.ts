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
  query_service: string
  latitude: number
  longitude: number
  /** Zero to five editable strings; a run needs between one and five. Cost scales with what is saved. */
  queries: string[]
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
}

export type LocalSeoCreateRunResponse = {
  id: string
  status: LocalSeoRunStatus
  expected_credits: number
}

export const LOCAL_SEO_QUERY_COUNT = 5
export const LOCAL_SEO_POINT_COUNT = 9
/** Every provider call costs three credits. */
export const LOCAL_SEO_PER_CALL_CREDITS = 3
/** Five queries times nine points: every run plans 45 cells. */
export const LOCAL_SEO_CELL_COUNT =
  LOCAL_SEO_QUERY_COUNT * LOCAL_SEO_POINT_COUNT
/** Each deliberate Maps listing resolution attempt costs three credits. */
export const LOCAL_SEO_LISTING_LOOKUP_EXPECTED_CREDITS = 3
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
 * Zero to five distinct nonempty strings. Saving zero preserves an empty
 * list; run enqueue accepts between one and five. Never auto-pad.
 */
export function validateEditableLocalSeoQueries(queries: string[]): string | null {
  if (queries.length > LOCAL_SEO_QUERY_COUNT) {
    return `At most ${LOCAL_SEO_QUERY_COUNT} queries are allowed.`
  }
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

/** Run gate: bound identity plus between one and five saved queries. Cost
scales with what is actually saved, so a thin geography pays less rather
than padding duplicates. */
export function canRunLocalSeoGrid(location: LocalSeoLocation): boolean {
  return (
    isLocalSeoLocationBound(location) &&
    validateLocalSeoQueries(location.queries) === null
  )
}

/** Credits this location's run will reserve, from its actual saved queries. */
export function localSeoRunCost(location: LocalSeoLocation): number {
  return (
    location.queries.length *
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

/** Replaces the five editable strings; existing run snapshots never change. */
export function updateLocalSeoQueries(
  projectId: string,
  locationId: string,
  queries: string[],
) {
  return clientApiPut<LocalSeoLocation>(
    `/projects/${projectId}/locations/${locationId}/queries`,
    { queries },
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

/** Atomically reserves credits then enqueues; the run starts queued. */
export function createLocalSeoRun(
  projectId: string,
  locationId: string,
  radiusM: number,
) {
  return clientApiPost<LocalSeoCreateRunResponse>(
    `/projects/${projectId}/locations/${locationId}/runs`,
    { radius_m: radiusM },
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
  query_service: string
  latitude: number
  longitude: number
  queries: string[]
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

/** One explicit paid Maps search; repeating the same search and viewport is free. */
export function createLocalSeoListingLookup(
  projectId: string,
  locationId: string,
  input: { search_query: string; latitude: number; longitude: number } | Record<string, never> = {},
) {
  return clientApiPost<LocalSeoListingLookup>(
    `/projects/${projectId}/locations/${locationId}/listing-lookups`,
    input,
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
