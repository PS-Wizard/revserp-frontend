import { useState } from "react"

import {
  ApiError,
  clientApiDelete,
  clientApiFetch,
  clientApiPost,
  clientApiPut,
} from "~/lib/api"
import type {
  ProjectAnalyticsPropertyResponse,
  ProjectAnalyticsStatusResponse,
  ProjectGSCSiteResponse,
  ProjectGSCStatusResponse,
} from "~/lib/api.types"
import { locationWorkspaceAPIPath } from "~/lib/location-workspace"


export type LocationGoogleService = "gsc" | "analytics"

export type LocationGoogleBindingMode = "inherit" | "off" | "custom"

export type LocationGoogleConnectMode =
  | "connect"
  | "add_account"
  | "reconnect_account"

export type LocationGoogleConnection = {
  id: string
  google_account_email: string
  google_status: string
}

export type LocationGscEffective = null | {
  source: "project" | "location"
  google_connection_id: string
  google_account_email: string
  site_url: string
  permission_level?: string
}

export type LocationGscBindingResponse = {
  mode: LocationGoogleBindingMode
  configured?: boolean
  effective: LocationGscEffective
  project: null | {
    google_connection_id: string
    site_url: string
  }
  google_connections: LocationGoogleConnection[]
}

export type LocationAnalyticsEffective = null | {
  source: "project" | "location"
  google_connection_id: string
  google_account_email: string
  property_id: string
  property_display_name: string
  account_display_name: string
}

export type LocationAnalyticsBindingResponse = {
  mode: LocationGoogleBindingMode
  configured?: boolean
  effective: LocationAnalyticsEffective
  project: null | {
    google_connection_id: string
    property_id: string
    property_display_name: string
    account_display_name: string
  }
  google_connections: LocationGoogleConnection[]
}

export type LocationGscBindingWrite =
  | { mode: "inherit" | "off" }
  | { mode: "custom"; google_connection_id: string; site_url: string }

export type LocationAnalyticsBindingWrite =
  | { mode: "inherit" | "off" }
  | { mode: "custom"; google_connection_id: string; property_id: string }

export function locationGoogleBindingQueryKey(
  projectId: string,
  locationId: string,
  service: LocationGoogleService
) {
  return ["location-google-binding", projectId, locationId, service] as const
}

export function locationGoogleBindingPath(
  projectId: string,
  locationId: string,
  service: LocationGoogleService
) {
  return `${locationWorkspaceAPIPath(projectId, locationId)}/${service}/binding`
}

function normalizeMode(value: unknown): LocationGoogleBindingMode {
  return value === "off" || value === "custom" ? value : "inherit"
}

function normalizeConnections(value: unknown): LocationGoogleConnection[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is LocationGoogleConnection =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string"
    )
    .map((item) => ({
      id: item.id,
      google_account_email:
        typeof item.google_account_email === "string"
          ? item.google_account_email
          : "",
      google_status:
        typeof item.google_status === "string" ? item.google_status : "",
    }))
}

export function locationGoogleBindingConfigured(
  binding: LocationGscBindingResponse | LocationAnalyticsBindingResponse
): boolean {
  return binding.configured ?? true
}

function normalizeGscBinding(
  data: LocationGscBindingResponse | null | undefined
): LocationGscBindingResponse {
  return {
    mode: normalizeMode(data?.mode),
    configured:
      typeof data?.configured === "boolean" ? data.configured : undefined,
    effective: data?.effective ?? null,
    project: data?.project ?? null,
    google_connections: normalizeConnections(data?.google_connections),
  }
}

function normalizeAnalyticsBinding(
  data: LocationAnalyticsBindingResponse | null | undefined
): LocationAnalyticsBindingResponse {
  return {
    mode: normalizeMode(data?.mode),
    configured:
      typeof data?.configured === "boolean" ? data.configured : undefined,
    effective: data?.effective ?? null,
    project: data?.project ?? null,
    google_connections: normalizeConnections(data?.google_connections),
  }
}

export function fetchLocationGscBinding(projectId: string, locationId: string) {
  return clientApiFetch<LocationGscBindingResponse>(
    locationGoogleBindingPath(projectId, locationId, "gsc")
  ).then(normalizeGscBinding)
}

export function putLocationGscBinding(
  projectId: string,
  locationId: string,
  body: LocationGscBindingWrite
) {
  return clientApiPut<{ ok: boolean; mode: LocationGoogleBindingMode }>(
    locationGoogleBindingPath(projectId, locationId, "gsc"),
    body
  )
}

export function fetchLocationAnalyticsBinding(
  projectId: string,
  locationId: string
) {
  return clientApiFetch<LocationAnalyticsBindingResponse>(
    locationGoogleBindingPath(projectId, locationId, "analytics")
  ).then(normalizeAnalyticsBinding)
}

export function putLocationAnalyticsBinding(
  projectId: string,
  locationId: string,
  body: LocationAnalyticsBindingWrite
) {
  return clientApiPut<{ ok: boolean; mode: LocationGoogleBindingMode }>(
    locationGoogleBindingPath(projectId, locationId, "analytics"),
    body
  )
}

export function deleteLocationGoogleBinding(
  projectId: string,
  locationId: string,
  service: LocationGoogleService
) {
  return clientApiDelete<{ ok: boolean }>(
    locationGoogleBindingPath(projectId, locationId, service)
  )
}

/** Wizard intent carried through OAuth in the returnPath query, so the
 * callback reopens the same wizard step without localStorage. */
export type LocationGoogleSetupIntent = {
  mode: LocationGoogleBindingMode
  service: LocationGoogleService
  locationId: string
}

/** OAuth returnPath carrying the wizard intent. Slugs are safe; only the
 * location id is encoded. */
export function locationGoogleSetupReturnPath(
  basePath: string,
  intent: LocationGoogleSetupIntent
): string {
  const separator = basePath.includes("?") ? "&" : "?"
  return (
    `${basePath}${separator}google_setup=${intent.mode}` +
    `&google_service=${intent.service}` +
    `&google_location=${encodeURIComponent(intent.locationId)}`
  )
}

/** Read a setup intent back from callback params. Null unless every value
 * matches a known slug, so forged params never drive the wizard. */
export function parseLocationGoogleSetupIntent(
  params: URLSearchParams
): LocationGoogleSetupIntent | null {
  const mode = params.get("google_setup")
  if (mode !== "inherit" && mode !== "custom" && mode !== "off") return null
  const service = params.get("google_service")
  if (service !== "gsc" && service !== "analytics") return null
  const locationId = params.get("google_location") ?? ""
  if (locationId === "") return null
  return { mode, service, locationId }
}

/** Whether an OAuth callback should reopen the wizard. A present intent is
 * decisive: a match restores — even when configured, and never auto-saving —
 * while a mismatch belongs to the other service tab and stays shut.
 * Without an intent, only a connected return on a still-unconfigured binding
 * reopens. Header reconnects carry no intent, so they never reopen. */
export function shouldRestoreLocationGoogleWizard(options: {
  intent: LocationGoogleSetupIntent | null
  service: LocationGoogleService
  locationId: string
  oauthStatus: string | null
  configured: boolean
  canManage: boolean
}): boolean {
  if (!options.canManage || options.oauthStatus === null) return false
  if (options.intent !== null)
    return (
      options.intent.service === options.service &&
      options.intent.locationId === options.locationId
    )
  return options.oauthStatus === "connected" && !options.configured
}

export function locationGoogleBindingQueryOptions(
  projectId: string,
  locationId: string,
  service: LocationGoogleService
) {
  return {
    queryKey: locationGoogleBindingQueryKey(projectId, locationId, service),
    queryFn: (): Promise<
      LocationGscBindingResponse | LocationAnalyticsBindingResponse
    > =>
      service === "gsc"
        ? fetchLocationGscBinding(projectId, locationId)
        : fetchLocationAnalyticsBinding(projectId, locationId),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    enabled: Boolean(projectId && locationId),
  }
}

export function locationGoogleServiceLabel(service: LocationGoogleService) {
  return service === "gsc" ? "Google Search Console" : "Google Analytics"
}

export function locationGoogleServiceShortLabel(
  service: LocationGoogleService
) {
  return service === "gsc" ? "Search Console" : "Analytics"
}

export type LocationGoogleSourceKind =
  | "parent-live"
  | "own"
  | "off"
  | "parent-unconfigured"
  | "custom-pending"

export type LocationGoogleSource = {
  kind: LocationGoogleSourceKind
  label: string
}

export function describeLocationGscSource(
  binding: LocationGscBindingResponse
): LocationGoogleSource {
  if (binding.mode === "off")
    return { kind: "off", label: "Off for this location" }
  if (binding.effective?.source === "location")
    return { kind: "own", label: "This location's property" }
  if (binding.effective?.source === "project")
    return { kind: "parent-live", label: "Parent property · live" }
  if (binding.mode === "custom")
    return { kind: "custom-pending", label: "Property not saved yet" }
  return { kind: "parent-unconfigured", label: "Parent has no property yet" }
}

export function describeLocationAnalyticsSource(
  binding: LocationAnalyticsBindingResponse
): LocationGoogleSource {
  if (binding.mode === "off")
    return { kind: "off", label: "Off for this location" }
  if (binding.effective?.source === "location")
    return { kind: "own", label: "This location's property" }
  if (binding.effective?.source === "project")
    return { kind: "parent-live", label: "Parent property · live" }
  if (binding.mode === "custom")
    return { kind: "custom-pending", label: "Property not saved yet" }
  return { kind: "parent-unconfigured", label: "Parent has no property yet" }
}

export type ProjectGscStatusWithAccounts = ProjectGSCStatusResponse & {
  google_connections?: LocationGoogleConnection[]
  selected_google_connection_id?: string
}

export type ProjectAnalyticsStatusWithAccounts =
  ProjectAnalyticsStatusResponse & {
    google_connections?: LocationGoogleConnection[]
    selected_google_connection_id?: string
  }

export function projectGoogleConnections(status: {
  google_connections?: LocationGoogleConnection[]
}): LocationGoogleConnection[] {
  return normalizeConnections(status.google_connections)
}

export function projectGoogleBoundAccountId(status: {
  selected_google_connection_id?: string
  google_connection_id?: string
}): string {
  return (
    status.selected_google_connection_id ?? status.google_connection_id ?? ""
  )
}

export function projectGoogleSelectedAccountId(
  status: {
    selected_google_connection_id?: string
    google_connection_id?: string
    google_connections?: LocationGoogleConnection[]
  },
  fallback = ""
): string {
  const bound = projectGoogleBoundAccountId(status)
  if (bound) return bound
  const connections = projectGoogleConnections(status)
  return connections[0]?.id ?? fallback
}

/** Display identity for one connected account. Legacy rows may carry a
 * blank email: never render them blank or invent an address — label them
 * with the neutral Google account name so the owner reconnects to prove
 * identity. A targeted reconnect fails closed server-side when the old
 * identity cannot be proven, so the id (not the email) is the reconnect key. */
export function describeGoogleAccount(connection: {
  id: string
  google_account_email?: string
}): { email: string; label: string; verified: boolean } {
  const email = connection.google_account_email ?? ""
  if (email !== "") return { email, label: email, verified: true }
  return { email: "", label: "Google account", verified: false }
}

export type LocationGoogleConnectionSummary = {
  connectionId: string
  propertyLabel: string
  accountLabel: string
  needsReconnect: boolean
}

/** Compact identity for a location's effective binding. The account label is
 * the saved email or the neutral Google account name — property and account
 * display names are never used as identity. Reconnect follows the same token
 * verification rule as the setup form. */
export function describeLocationGoogleConnection(
  binding: LocationGscBindingResponse | LocationAnalyticsBindingResponse,
  service: LocationGoogleService
): LocationGoogleConnectionSummary | null {
  const effective = binding.effective
  if (!effective) return null
  const propertyLabel =
    service === "gsc"
      ? (effective as NonNullable<LocationGscBindingResponse["effective"]>)
          .site_url
      : (effective as NonNullable<
          LocationAnalyticsBindingResponse["effective"]
        >).property_display_name ||
        (effective as NonNullable<
          LocationAnalyticsBindingResponse["effective"]
        >).property_id
  const listed = binding.google_connections.find(
    (connection) => connection.id === effective.google_connection_id
  )
  const savedEmail =
    listed?.google_account_email || effective.google_account_email
  return {
    connectionId: effective.google_connection_id,
    propertyLabel,
    accountLabel: savedEmail !== "" ? savedEmail : "Google account",
    needsReconnect: listed
      ? !describeGoogleAccount(listed).verified ||
        listed.google_status === "reauth_required"
      : false,
  }
}

export type AccountGscSitesResponse = {
  google_connection_id: string
  google_account_email: string
  google_status: string
  available_sites: ProjectGSCSiteResponse[]
}

function normalizeSites(value: unknown): ProjectGSCSiteResponse[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is ProjectGSCSiteResponse =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { site_url?: unknown }).site_url === "string"
  )
}

function normalizeProperties(
  value: unknown
): ProjectAnalyticsPropertyResponse[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is ProjectAnalyticsPropertyResponse =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { property_id?: unknown }).property_id === "string"
  )
}

/** Live site list for exactly one account (member). Uses that account's
 * token, never the bound one — so pickers load from the chosen account. */
export function fetchAccountGscSites(
  projectId: string,
  googleConnectionId: string
) {
  return clientApiFetch<AccountGscSitesResponse>(
    `/projects/${projectId}/google-accounts/${googleConnectionId}/gsc-sites`
  ).then((data) => ({
    google_connection_id:
      typeof data?.google_connection_id === "string"
        ? data.google_connection_id
        : googleConnectionId,
    google_account_email:
      typeof data?.google_account_email === "string"
        ? data.google_account_email
        : "",
    google_status:
      typeof data?.google_status === "string" ? data.google_status : "",
    available_sites: normalizeSites(data?.available_sites),
  }))
}

export type AccountAnalyticsPropertiesResponse = {
  google_connection_id: string
  google_account_email: string
  google_status: string
  has_analytics_scope: boolean
  needs_reconnect: boolean
  available_properties: ProjectAnalyticsPropertyResponse[]
}

export function fetchAccountAnalyticsProperties(
  projectId: string,
  googleConnectionId: string
) {
  return clientApiFetch<AccountAnalyticsPropertiesResponse>(
    `/projects/${projectId}/google-accounts/${googleConnectionId}/analytics-properties`
  ).then((data) => ({
    google_connection_id:
      typeof data?.google_connection_id === "string"
        ? data.google_connection_id
        : googleConnectionId,
    google_account_email:
      typeof data?.google_account_email === "string"
        ? data.google_account_email
        : "",
    google_status:
      typeof data?.google_status === "string" ? data.google_status : "",
    has_analytics_scope: data?.has_analytics_scope === true,
    needs_reconnect: data?.needs_reconnect === true,
    available_properties: normalizeProperties(data?.available_properties),
  }))
}

export type AccountPropertyOption = {
  value: string
  label: string
  detail: string
}

export type AccountPropertyList = {
  items: AccountPropertyOption[]
  accountEmail: string
  accountStatus: string
  needsReconnect: boolean
  missingScope: boolean
  loading: boolean
  error: string
  loadedAccountId: string
  load: (
    targetAccountId?: string
  ) => Promise<{ items: AccountPropertyOption[]; error: string }>
  reset: () => void
}

export function useAccountPropertyList(
  projectId: string,
  service: LocationGoogleService,
  accountId: string
): AccountPropertyList {
  const [items, setItems] = useState<AccountPropertyOption[]>([])
  const [accountEmail, setAccountEmail] = useState("")
  const [accountStatus, setAccountStatus] = useState("")
  const [missingScope, setMissingScope] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [loadedAccountId, setLoadedAccountId] = useState("")

  async function load(targetAccountId?: string) {
    const target = targetAccountId ?? accountId
    if (!projectId || !target || loading)
      return { items: [], error: "" }
    setLoading(true)
    setError("")
    try {
      let next: AccountPropertyOption[] = []
      if (service === "gsc") {
        const response = await fetchAccountGscSites(projectId, target)
        next = response.available_sites.map((site) => ({
          value: site.site_url,
          label: site.site_url,
          detail: site.permission_level ?? "",
        }))
        setAccountEmail(response.google_account_email)
        setAccountStatus(response.google_status)
        setMissingScope(false)
      } else {
        const response = await fetchAccountAnalyticsProperties(
          projectId,
          target
        )
        next = response.available_properties.map((property) => ({
          value: property.property_id,
          label: property.display_name || property.property_id,
          detail: property.account_display_name ?? "",
        }))
        setAccountEmail(response.google_account_email)
        setAccountStatus(response.google_status)
        setMissingScope(!response.has_analytics_scope)
        if (response.needs_reconnect) setAccountStatus("reauth_required")
      }
      setItems(next)
      setLoadedAccountId(target)
      return { items: next, error: "" }
    } catch (loadError) {
      const message =
        loadError instanceof ApiError
          ? loadError.message
          : "Could not load properties for this account."
      setError(message)
      return { items: [], error: message }
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setItems([])
    setAccountEmail("")
    setAccountStatus("")
    setMissingScope(false)
    setError("")
    setLoadedAccountId("")
  }

  return {
    items,
    accountEmail,
    accountStatus,
    needsReconnect: accountStatus === "reauth_required",
    missingScope,
    loading,
    error,
    loadedAccountId,
    load,
    reset,
  }
}

export type ProjectGoogleAccountsResponse = {
  google_connections: LocationGoogleConnection[]
  can_manage_connection: boolean
}

export function fetchProjectGoogleAccounts(projectId: string) {
  return clientApiFetch<ProjectGoogleAccountsResponse>(
    `/projects/${projectId}/google-accounts`
  ).then((data) => ({
    google_connections: normalizeConnections(data?.google_connections),
    can_manage_connection: data?.can_manage_connection === true,
  }))
}

export function startProjectGoogleConnect(
  projectId: string,
  service: LocationGoogleService,
  options: {
    returnPath: string
    mode?: LocationGoogleConnectMode
    googleConnectionId?: string
  }
) {
  const body: Record<string, string> = { return_path: options.returnPath }
  if (options.mode && options.mode !== "connect") body.mode = options.mode
  if (options.googleConnectionId)
    body.google_connection_id = options.googleConnectionId
  return clientApiPost<{ auth_url: string }>(
    `/projects/${projectId}/${service === "gsc" ? "gsc" : "analytics"}/connect/start`,
    body
  )
}

const ALLOWED_GOOGLE_AUTH_HOSTS = new Set(["accounts.google.com"])

/** Same allowlist the project GSC/Analytics views enforce before leaving
 * for Google: only https://accounts.google.com is ever followed. */
export function isAllowedGoogleAuthURL(rawURL: string) {
  try {
    const parsed = new URL(rawURL)
    return (
      parsed.protocol === "https:" &&
      ALLOWED_GOOGLE_AUTH_HOSTS.has(parsed.hostname)
    )
  } catch {
    return false
  }
}
