import { clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  GSCQueryPageResponse,
  ProjectAnalyticsOverviewResponse,
  ProjectGSCOverviewResponse,
} from "~/lib/api.types"
import { locationWorkspaceAPIPath } from "~/lib/location-workspace"


export type LocationGoogleReportSource = "project" | "location"

export type LocationReportCoverage = "branch" | "property-wide"

export type LocationReportScope = {
  revision: number
  url: string | null
  match: "none" | "exact" | "subtree"
}

function normalizeScope(value: unknown): LocationReportScope | null {
  if (typeof value !== "object" || value === null) return null
  const scope = value as {
    revision?: unknown
    url?: unknown
    match?: unknown
  }
  if (typeof scope.revision !== "number") return null
  const match =
    scope.match === "exact" || scope.match === "subtree" ? scope.match : "none"
  return {
    revision: scope.revision,
    url: typeof scope.url === "string" ? scope.url : null,
    match,
  }
}

function normalizeCoverage(
  value: unknown,
  scopeApplied: boolean
): LocationReportCoverage {
  if (value === "branch" || value === "property-wide") return value
  return scopeApplied ? "branch" : "property-wide"
}

export function describeLocationReportCoverage(
  coverage: LocationReportCoverage
) {
  return coverage === "branch" ? "Branch coverage" : "Property-wide"
}

export type LocationReportQuery = {
  scopeRevision: number | null
  pageFilter: boolean
}

export function locationReportQueryString(query: LocationReportQuery) {
  const params = new URLSearchParams()
  if (query.scopeRevision !== null) {
    params.set("scope_revision", String(query.scopeRevision))
  }
  if (query.pageFilter) params.set("page_filter", "true")
  const text = params.toString()
  return text === "" ? "" : `?${text}`
}

export function locationGscReportBase(projectId: string, locationId: string) {
  return `${locationWorkspaceAPIPath(projectId, locationId)}/gsc/report`
}

export function locationAnalyticsReportBase(
  projectId: string,
  locationId: string
) {
  return `${locationWorkspaceAPIPath(projectId, locationId)}/analytics/report`
}

export function locationGscReportOverviewKey(
  projectId: string,
  locationId: string,
  query: LocationReportQuery
) {
  return [
    "location-google-report",
    projectId,
    locationId,
    "gsc",
    "overview",
    query.scopeRevision,
    query.pageFilter,
  ] as const
}

export function locationAnalyticsReportOverviewKey(
  projectId: string,
  locationId: string,
  query: LocationReportQuery
) {
  return [
    "location-google-report",
    projectId,
    locationId,
    "analytics",
    "overview",
    query.scopeRevision,
    query.pageFilter,
  ] as const
}

export function locationAnalyticsRealtimeKey(
  projectId: string,
  locationId: string,
  query: LocationReportQuery
) {
  return [
    "location-google-report",
    projectId,
    locationId,
    "analytics",
    "realtime",
    query.scopeRevision,
    query.pageFilter,
  ] as const
}

export type LocationGscOverviewReport = {
  locationId: string
  source: LocationGoogleReportSource
  googleConnectionId: string
  googleAccountEmail: string
  siteUrl: string
  scopeApplied: boolean
  scope: LocationReportScope | null
  coverage: LocationReportCoverage
  cached: boolean
  /** False without a usable scope: info state, never parent figures. */
  configured: boolean
  reason: string
  overview: ProjectGSCOverviewResponse["overview"] | null
}

function normalizeGscOverviewReport(
  data: Record<string, unknown> | null | undefined,
  locationId: string
): LocationGscOverviewReport {
  const scopeApplied = data?.scope_applied === true
  return {
    locationId:
      typeof data?.location_id === "string" ? data.location_id : locationId,
    source: data?.source === "location" ? "location" : "project",
    googleConnectionId:
      typeof data?.google_connection_id === "string"
        ? data.google_connection_id
        : "",
    googleAccountEmail:
      typeof data?.google_account_email === "string"
        ? data.google_account_email
        : "",
    siteUrl: typeof data?.site_url === "string" ? data.site_url : "",
    scopeApplied,
    scope: normalizeScope(data?.scope),
    coverage: normalizeCoverage(data?.coverage, scopeApplied),
    cached: data?.cached !== false,
    configured: data?.configured !== false,
    reason: typeof data?.reason === "string" ? data.reason : "",
    overview:
      typeof data?.overview === "object" && data.overview !== null
        ? (data.overview as ProjectGSCOverviewResponse["overview"])
        : null,
  }
}

/** Cached-only GSC overview read. Never calls Google: hit returns the
 * stored payload, miss returns `cached:false`, unscoped `configured:false`. */
export function fetchLocationGscReportOverview(
  projectId: string,
  locationId: string,
  query: LocationReportQuery
) {
  return clientApiFetch<Record<string, unknown>>(
    `${locationGscReportBase(projectId, locationId)}/overview${locationReportQueryString(query)}`
  ).then((data) => normalizeGscOverviewReport(data, locationId))
}

export type LocationGscReportRefresh = {
  report: LocationGscOverviewReport
  queries: GSCQueryPageResponse | null
}

function normalizeQueryPage(value: unknown): GSCQueryPageResponse | null {
  const page = (value as { queries?: unknown })?.queries ?? value
  if (typeof page !== "object" || page === null) return null
  const rows = (page as { rows?: unknown }).rows
  if (!Array.isArray(rows)) return null
  return page as GSCQueryPageResponse
}

/** Explicit refresh: the only call that reaches Google. Stores overview
 * plus one queries page server-side and returns both. */
export function postLocationGscReportRefresh(
  projectId: string,
  locationId: string,
  query: LocationReportQuery,
  options: {
    days?: number
    limit: number
    offset?: number
    search: string
    dimension?: string
    preset?: string
  } = { limit: 100, search: "" }
) {
  const params = new URLSearchParams({
    limit: String(options.limit),
    offset: String(options.offset ?? 0),
  })
  if (options.days !== undefined) params.set("days", String(options.days))
  if (options.search) params.set("search", options.search)
  if (options.dimension) params.set("dimension", options.dimension)
  if (options.preset && options.preset !== "all")
    params.set("preset", options.preset)
  const base = locationReportQueryString(query)
  const separator = base === "" ? "?" : "&"
  return clientApiPost<Record<string, unknown>>(
    `${locationGscReportBase(projectId, locationId)}/refresh${base}${params.toString() ? `${separator}${params.toString()}` : ""}`,
    {}
  ).then((data) => ({
    report: normalizeGscOverviewReport(data, locationId),
    queries: normalizeQueryPage(
      (data as { queries?: unknown })?.queries ?? null
    ),
  }))
}

export type LocationAnalyticsOverviewReport = {
  locationId: string
  source: LocationGoogleReportSource
  googleConnectionId: string
  googleAccountEmail: string
  propertyId: string
  propertyDisplayName: string
  scopeApplied: boolean
  scope: LocationReportScope | null
  coverage: LocationReportCoverage
  cached: boolean
  configured: boolean
  reason: string
  overview: ProjectAnalyticsOverviewResponse["overview"] | null
}

function normalizeAnalyticsOverviewReport(
  data: Record<string, unknown> | null | undefined,
  locationId: string
): LocationAnalyticsOverviewReport {
  const scopeApplied = data?.scope_applied === true
  return {
    locationId:
      typeof data?.location_id === "string" ? data.location_id : locationId,
    source: data?.source === "location" ? "location" : "project",
    googleConnectionId:
      typeof data?.google_connection_id === "string"
        ? data.google_connection_id
        : "",
    googleAccountEmail:
      typeof data?.google_account_email === "string"
        ? data.google_account_email
        : "",
    propertyId: typeof data?.property_id === "string" ? data.property_id : "",
    propertyDisplayName:
      typeof data?.property_display_name === "string"
        ? data.property_display_name
        : "",
    scopeApplied,
    scope: normalizeScope(data?.scope),
    coverage: normalizeCoverage(data?.coverage, scopeApplied),
    cached: data?.cached !== false,
    configured: data?.configured !== false,
    reason: typeof data?.reason === "string" ? data.reason : "",
    overview:
      typeof data?.overview === "object" && data.overview !== null
        ? (data.overview as ProjectAnalyticsOverviewResponse["overview"])
        : null,
  }
}

/** Cached-only Analytics overview read. Never calls Google. */
export function fetchLocationAnalyticsReportOverview(
  projectId: string,
  locationId: string,
  query: LocationReportQuery
) {
  return clientApiFetch<Record<string, unknown>>(
    `${locationAnalyticsReportBase(projectId, locationId)}/overview${locationReportQueryString(query)}`
  ).then((data) => normalizeAnalyticsOverviewReport(data, locationId))
}

/** Explicit Analytics refresh: the only call that reaches Google. */
export function postLocationAnalyticsReportRefresh(
  projectId: string,
  locationId: string,
  query: LocationReportQuery
) {
  return clientApiPost<Record<string, unknown>>(
    `${locationAnalyticsReportBase(projectId, locationId)}/refresh${locationReportQueryString(query)}`,
    {}
  ).then((data) => normalizeAnalyticsOverviewReport(data, locationId))
}

export type LocationAnalyticsRealtimeReport = {
  locationId: string
  source: LocationGoogleReportSource
  propertyId: string
  scopeApplied: boolean
  scope: LocationReportScope | null
  coverage: LocationReportCoverage
  supported: boolean
  reason: string
  activeUsers: number | null
}

/** Live realtime read. Call only from an explicit realtime panel, never
 * on mount: for scoped reads the server answers `supported:false`. */
export function fetchLocationAnalyticsRealtime(
  projectId: string,
  locationId: string,
  query: LocationReportQuery
) {
  return clientApiFetch<Record<string, unknown>>(
    `${locationAnalyticsReportBase(projectId, locationId)}/realtime${locationReportQueryString(query)}`
  ).then((data): LocationAnalyticsRealtimeReport => {
    const scopeApplied = data?.scope_applied === true
    return {
      locationId:
        typeof data?.location_id === "string" ? data.location_id : locationId,
      source: data?.source === "location" ? "location" : "project",
      propertyId: typeof data?.property_id === "string" ? data.property_id : "",
      scopeApplied,
      scope: normalizeScope(data?.scope),
      coverage: normalizeCoverage(data?.coverage, scopeApplied),
      supported: data?.supported !== false,
      reason: typeof data?.reason === "string" ? data.reason : "",
      activeUsers:
        typeof data?.active_users === "number" ? data.active_users : null,
    }
  })
}
