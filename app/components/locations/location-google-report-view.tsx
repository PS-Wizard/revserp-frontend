"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ChevronDownIcon, LinkIcon } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { AnalyticsOverview } from "~/components/analytics-overview/analytics-overview"
import { GSCOverview } from "~/components/gsc-overview/gsc-overview"
import type { GSCQueryPageOptions } from "~/components/gsc-overview/use-gsc-queries"
import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { DataLoadingState } from "~/components/data-loading-state"
import { ApiError } from "~/lib/api"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import type {
  ProjectAnalyticsOverviewResponse,
  ProjectAnalyticsStatusResponse,
  ProjectGSCOverviewResponse,
  ProjectGSCStatusResponse,
} from "~/lib/api.types"
import {
  deleteLocationGoogleBinding,
  describeLocationGoogleConnection,
  isAllowedGoogleAuthURL,
  locationGoogleBindingQueryKey,
  startProjectGoogleConnect,
  type LocationAnalyticsBindingResponse,
  type LocationGoogleService,
  type LocationGscBindingResponse,
} from "~/lib/location-google-api"
import {
  describeLocationReportCoverage,
  fetchLocationAnalyticsRealtime,
  fetchLocationAnalyticsReportOverview,
  fetchLocationGscReportOverview,
  locationAnalyticsReportOverviewKey,
  locationGscReportBase,
  locationGscReportOverviewKey,
  postLocationAnalyticsReportRefresh,
  postLocationGscReportRefresh,
  type LocationAnalyticsOverviewReport,
  type LocationAnalyticsRealtimeReport,
  type LocationGscOverviewReport,
  type LocationReportCoverage,
} from "~/lib/location-google-reports-api"

function reportErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function LocationGoogleReportView({
  projectId,
  locationId,
  service,
  binding,
  onChangeConnection,
}: {
  projectId: string
  locationId: string
  service: LocationGoogleService
  binding: LocationGscBindingResponse | LocationAnalyticsBindingResponse
  onChangeConnection?: () => void
}) {
  const workspace = useOptionalLocationWorkspace()
  const scope = workspace?.websiteScope ?? null
  const hasScope =
    scope !== null && scope.match !== "none" && (scope.url ?? "") !== ""
  const scopeRevision = hasScope ? scope.revision : null

  const [pageFilter, setPageFilter] = useState(false)
  const effectivePageFilter =
    binding.mode === "custom" && pageFilter && hasScope

  const query = useMemo(
    () => ({ scopeRevision, pageFilter: effectivePageFilter }),
    [scopeRevision, effectivePageFilter]
  )
  const showPageFilterToggle = binding.mode === "custom" && hasScope

  if (service === "gsc") {
    return (
      <LocationGscReport
        binding={binding as LocationGscBindingResponse}
        locationId={locationId}
        onChangeConnection={onChangeConnection}
        onPageFilterChange={setPageFilter}
        pageFilter={effectivePageFilter}
        projectId={projectId}
        query={query}
        scopeRevision={scopeRevision}
        showPageFilterToggle={showPageFilterToggle}
      />
    )
  }
  return (
    <LocationAnalyticsReport
      binding={binding as LocationAnalyticsBindingResponse}
      locationId={locationId}
      onChangeConnection={onChangeConnection}
      onPageFilterChange={setPageFilter}
      pageFilter={effectivePageFilter}
      projectId={projectId}
      query={query}
      scopeRevision={scopeRevision}
      showPageFilterToggle={showPageFilterToggle}
    />
  )
}

function LocationGoogleConnectionHeader({
  projectId,
  locationId,
  service,
  binding,
  onChangeConnection,
  compact = false,
}: {
  projectId: string
  locationId: string
  service: LocationGoogleService
  binding: LocationGscBindingResponse | LocationAnalyticsBindingResponse
  onChangeConnection?: () => void
  /** Only the manage menu; the surrounding header already names the property. */
  compact?: boolean
}) {
  const queryClient = useQueryClient()
  const workspace = useOptionalLocationWorkspace()
  const canManage = workspace?.canManage ?? true
  const summary = describeLocationGoogleConnection(binding, service)
  const [busy, setBusy] = useState<"unbind" | "reconnect" | null>(null)
  const [error, setError] = useState("")

  if (!summary) return null
  const connectionId = summary.connectionId

  async function handleUnbind() {
    if (busy) return
    setBusy("unbind")
    setError("")
    try {
      await deleteLocationGoogleBinding(projectId, locationId, service)
      await queryClient.invalidateQueries({
        queryKey: locationGoogleBindingQueryKey(projectId, locationId, service),
      })
      await queryClient.invalidateQueries({
        queryKey: ["location-google-report", projectId, locationId],
      })
    } catch (unbindError) {
      setError(
        reportErrorMessage(unbindError, "Could not remove this connection.")
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleReconnect() {
    if (busy) return
    setBusy("reconnect")
    setError("")
    try {
      const response = await startProjectGoogleConnect(projectId, service, {
        returnPath:
          window.location.pathname +
          window.location.search +
          window.location.hash,
        mode: "reconnect_account",
        googleConnectionId: connectionId,
      })
      if (!isAllowedGoogleAuthURL(response.auth_url)) {
        throw new Error(
          "Unable to start the Google connection: unexpected auth URL."
        )
      }
      window.location.href = response.auth_url
    } catch (reconnectError) {
      setError(
        reportErrorMessage(
          reconnectError,
          "Unable to start the Google connection."
        )
      )
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {compact ? null : (
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <LinkIcon
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate">{summary.propertyLabel}</span>
            <span className="truncate font-normal text-muted-foreground">
              · {summary.accountLabel}
            </span>
          </span>
        )}
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  disabled={busy !== null}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {busy === "unbind"
                    ? "Unbinding…"
                    : busy === "reconnect"
                      ? "Redirecting…"
                      : "Manage connection"}
                  <ChevronDownIcon data-icon="inline-end" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {onChangeConnection ? (
                <DropdownMenuItem onClick={onChangeConnection}>
                  Change property
                </DropdownMenuItem>
              ) : null}
              {summary.needsReconnect ? (
                <DropdownMenuItem onClick={() => void handleReconnect()}>
                  Reconnect account
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void handleUnbind()}
              >
                Unbind
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function ReportSourceBar({
  coverage,
  email,
  revision,
}: {
  coverage: LocationReportCoverage
  email: string
  revision: number | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">
        {describeLocationReportCoverage(coverage)}
      </Badge>
      {revision !== null ? (
        <Badge variant="outline">Rev {revision}</Badge>
      ) : null}
      {email !== "" ? (
        <span className="text-xs text-muted-foreground">{email}</span>
      ) : null}
    </div>
  )
}

function PageFilterToggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={() => onChange(!checked)} />
      Limit to branch website scope
    </label>
  )
}

function ScopeInfoState({ reason }: { reason: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">No branch scope for reports</CardTitle>
        <CardDescription>
          {reason === "location_website_scope_not_set"
            ? "Inherit is on, but no branch website scope is set, so there is nothing scoped to report. Set an exact page or subtree scope to enable inherited reports — parent-wide figures are never shown here."
            : "This location is not configured for reports yet. Check the binding above."}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function RefreshCtaState({
  title,
  description,
  refreshing,
  refreshError,
  onRefresh,
  actionLabel = "Refresh from Google",
  header,
}: {
  title: string
  description: string
  refreshing: boolean
  refreshError: string
  onRefresh: () => void
  actionLabel?: string
  header?: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          {header}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Button
            disabled={refreshing}
            onClick={onRefresh}
            size="sm"
            type="button"
            variant="outline"
          >
            {refreshing ? "Refreshing…" : actionLabel}
          </Button>
        </div>
        {refreshError ? (
          <p className="text-sm text-destructive" role="alert">
            {refreshError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** First open of an unfetched report pulls it from Google once, no click. */
function useAutoFirstRefresh({
  due,
  refreshing,
  refresh,
}: {
  due: boolean
  refreshing: boolean
  refresh: () => void
}) {
  const attempted = useRef(false)
  useEffect(() => {
    if (!due || refreshing || attempted.current) return
    attempted.current = true
    refresh()
  })
}

function LocationGscReport({
  projectId,
  locationId,
  binding,
  query,
  scopeRevision,
  pageFilter,
  showPageFilterToggle,
  onPageFilterChange,
  onChangeConnection,
}: {
  projectId: string
  locationId: string
  binding: LocationGscBindingResponse
  query: { scopeRevision: number | null; pageFilter: boolean }
  scopeRevision: number | null
  pageFilter: boolean
  showPageFilterToggle: boolean
  onPageFilterChange: (next: boolean) => void
  onChangeConnection?: () => void
}) {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState("")

  const overviewQuery = useQuery({
    queryKey: locationGscReportOverviewKey(projectId, locationId, query),
    queryFn: () => fetchLocationGscReportOverview(projectId, locationId, query),
    enabled: Boolean(projectId && locationId),
    retry: false,
    placeholderData: (previous) => previous,
  })
  const report: LocationGscOverviewReport | undefined = overviewQuery.data

  const queriesExtraParams = useMemo(() => {
    const params: Record<string, string> = {}
    if (query.scopeRevision !== null) {
      params.scope_revision = String(query.scopeRevision)
    }
    if (query.pageFilter) params.page_filter = "true"
    return params
  }, [query.scopeRevision, query.pageFilter])

  const status = useMemo<ProjectGSCStatusResponse | null>(() => {
    if (!report) return null
    const connection = binding.google_connections.find(
      (candidate) => candidate.id === report.googleConnectionId
    )
    const email =
      report.googleAccountEmail || binding.effective?.google_account_email || ""
    const permission =
      binding.effective?.source === "location" ||
      binding.effective?.source === "project"
        ? (binding.effective.permission_level ?? undefined)
        : undefined
    return {
      has_google_connection: true,
      google_connection_id: report.googleConnectionId,
      google_account_email: email,
      google_status: connection?.google_status,
      needs_reconnect: false,
      can_manage_connection: false,
      connected: true,
      selected_site: { site_url: report.siteUrl, permission_level: permission },
      available_sites: [
        { site_url: report.siteUrl, permission_level: permission },
      ],
      token_error: undefined,
    }
  }, [binding, report])

  const overviewResponse = useMemo<ProjectGSCOverviewResponse | null>(() => {
    if (!report?.overview) return null
    return {
      project_id: projectId,
      site_url: report.siteUrl,
      permission_level:
        binding.effective?.source === "location" ||
        binding.effective?.source === "project"
          ? (binding.effective.permission_level ?? undefined)
          : undefined,
      google_connection: report.googleConnectionId,
      overview: report.overview,
    }
  }, [binding, projectId, report])

  async function handleRefresh(options?: GSCQueryPageOptions) {
    if (refreshing) return
    setRefreshing(true)
    setRefreshError("")
    try {
      const result = await postLocationGscReportRefresh(
        projectId,
        locationId,
        query,
        options
      )
      queryClient.setQueryData(
        locationGscReportOverviewKey(projectId, locationId, query),
        result.report
      )
    } catch (error) {
      setRefreshError(
        reportErrorMessage(error, "Could not refresh the location report.")
      )
    } finally {
      setRefreshing(false)
    }
  }

  const canManage = useOptionalLocationWorkspace()?.canManage ?? true
  useAutoFirstRefresh({
    due: canManage && report?.configured === true && !report.cached,
    refreshing,
    refresh: () => void handleRefresh(),
  })

  if (overviewQuery.isLoading && !report) {
    return <DataLoadingState label="Loading location report..." />
  }

  if (overviewQuery.isError && !report) {
    return (
      <RefreshCtaState
        description={reportErrorMessage(
          overviewQuery.error,
          "Could not load this location's cached report."
        )}
        onRefresh={() => void overviewQuery.refetch()}
        refreshing={false}
        refreshError=""
        title="Unable to load location report"
      />
    )
  }

  if (!report) return null

  if (!report.configured) {
    return <ScopeInfoState reason={report.reason} />
  }

  if (!report.cached || !report.overview || !status || !overviewResponse) {
    return (
      <div className="flex flex-col gap-4">
        {refreshing && !refreshError ? (
          <DataLoadingState label="Fetching your report from Google..." />
        ) : (
          <RefreshCtaState
            actionLabel={refreshError ? "Try again" : "Refresh from Google"}
            description={refreshError ? "Google didn't return the report. Try again, or manage the connection." : `Nothing cached yet for ${report.siteUrl || "this property"}.`}
            header={
              <LocationGoogleConnectionHeader
                binding={binding}
                locationId={locationId}
                onChangeConnection={onChangeConnection}
                projectId={projectId}
                service="gsc"
              />
            }
            onRefresh={() => void handleRefresh()}
            refreshing={refreshing}
            refreshError={refreshError}
            title={refreshError ? "Couldn't fetch the report" : "No report yet"}
          />
        )}
        {showPageFilterToggle ? (
          <PageFilterToggle
            checked={pageFilter}
            onChange={onPageFilterChange}
          />
        ) : null}
      </div>
    )
  }

  const email =
    report.googleAccountEmail || binding.effective?.google_account_email || ""

  return (
    <div className="flex flex-col gap-4">
      <GSCOverview
        key={`${report.googleConnectionId}:${report.siteUrl}:${query.scopeRevision}:${query.pageFilter}`}
        activeProjectID={projectId}
        completedCrawls={[]}
        isLoading={overviewQuery.isLoading}
        isOrganizationOwner={false}
        onRefreshOverview={() => handleRefresh()}
        overviewErrorMessage={refreshError}
        overviewResponse={overviewResponse}
        queriesBasePath={`${locationGscReportBase(projectId, locationId)}/queries`}
        queriesExtraParams={queriesExtraParams}
        onRefreshQueries={handleRefresh}
        keywordProjectId={null}
        status={status}
        actions={
          <>
            <LocationGoogleConnectionHeader
              compact
              binding={binding}
              locationId={locationId}
              onChangeConnection={onChangeConnection}
              projectId={projectId}
              service="gsc"
            />
            {showPageFilterToggle ? (
              <PageFilterToggle checked={pageFilter} onChange={onPageFilterChange} />
            ) : null}
            <ReportSourceBar
              coverage={report.coverage}
              email={email}
              revision={report.scope?.revision ?? scopeRevision}
            />
          </>
        }
      />
    </div>
  )
}

function LocationAnalyticsReport({
  projectId,
  locationId,
  binding,
  query,
  scopeRevision,
  pageFilter,
  showPageFilterToggle,
  onPageFilterChange,
  onChangeConnection,
}: {
  projectId: string
  locationId: string
  binding: LocationAnalyticsBindingResponse
  query: { scopeRevision: number | null; pageFilter: boolean }
  scopeRevision: number | null
  pageFilter: boolean
  showPageFilterToggle: boolean
  onPageFilterChange: (next: boolean) => void
  onChangeConnection?: () => void
}) {
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState("")
  const [refreshCount, setRefreshCount] = useState(0)
  const [realtimeOpen, setRealtimeOpen] = useState(false)
  const [realtimeLoading, setRealtimeLoading] = useState(false)
  const [realtimeError, setRealtimeError] = useState("")
  const [realtime, setRealtime] =
    useState<LocationAnalyticsRealtimeReport | null>(null)

  const overviewQuery = useQuery({
    queryKey: locationAnalyticsReportOverviewKey(projectId, locationId, query),
    queryFn: () =>
      fetchLocationAnalyticsReportOverview(projectId, locationId, query),
    enabled: Boolean(projectId && locationId),
    retry: false,
    placeholderData: (previous) => previous,
  })
  const report: LocationAnalyticsOverviewReport | undefined = overviewQuery.data

  const status = useMemo<ProjectAnalyticsStatusResponse | null>(() => {
    if (!report) return null
    const connection = binding.google_connections.find(
      (candidate) => candidate.id === report.googleConnectionId
    )
    const email =
      report.googleAccountEmail || binding.effective?.google_account_email || ""
    const selectedProperty = {
      property_id: report.propertyId,
      display_name: report.propertyDisplayName || report.propertyId,
      account_display_name:
        binding.effective?.source === "location" ||
        binding.effective?.source === "project"
          ? (binding.effective.account_display_name ?? "")
          : "",
    }
    return {
      has_google_connection: true,
      has_analytics_scope: true,
      google_connection_id: report.googleConnectionId,
      google_account_email: email,
      google_status: connection?.google_status,
      needs_reconnect: false,
      can_manage_connection: false,
      connected: true,
      selected_property: selectedProperty,
      available_properties: [selectedProperty],
      token_error: undefined,
    }
  }, [binding, report])

  const overviewResponse =
    useMemo<ProjectAnalyticsOverviewResponse | null>(() => {
      if (!report?.overview) return null
      return {
        project_id: projectId,
        property_id: report.propertyId,
        property_name: report.propertyDisplayName || report.propertyId,
        google_connection: report.googleConnectionId,
        overview: report.overview,
      }
    }, [projectId, report])

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    setRefreshError("")
    try {
      const next = await postLocationAnalyticsReportRefresh(
        projectId,
        locationId,
        query
      )
      queryClient.setQueryData(
        locationAnalyticsReportOverviewKey(projectId, locationId, query),
        next
      )
      setRefreshCount((count) => count + 1)
    } catch (error) {
      setRefreshError(
        reportErrorMessage(error, "Could not refresh the location report.")
      )
    } finally {
      setRefreshing(false)
    }
  }

  const scopedRealtime =
    binding.mode === "inherit" || (pageFilter && scopeRevision !== null)

  async function handleOpenRealtime() {
    if (realtimeLoading) return
    setRealtimeOpen(true)
    setRealtimeLoading(true)
    setRealtimeError("")
    try {
      const live = await fetchLocationAnalyticsRealtime(
        projectId,
        locationId,
        query
      )
      setRealtime(live)
    } catch (error) {
      setRealtimeError(reportErrorMessage(error, "Could not load live users."))
    } finally {
      setRealtimeLoading(false)
    }
  }

  const canManage = useOptionalLocationWorkspace()?.canManage ?? true
  useAutoFirstRefresh({
    due: canManage && report?.configured === true && !report.cached,
    refreshing,
    refresh: () => void handleRefresh(),
  })

  if (overviewQuery.isLoading && !report) {
    return <DataLoadingState label="Loading location report..." />
  }

  if (overviewQuery.isError && !report) {
    return (
      <RefreshCtaState
        description={reportErrorMessage(
          overviewQuery.error,
          "Could not load this location's cached report."
        )}
        onRefresh={() => void overviewQuery.refetch()}
        refreshing={false}
        refreshError=""
        title="Unable to load location report"
      />
    )
  }

  if (!report) return null

  if (!report.configured) {
    return <ScopeInfoState reason={report.reason} />
  }

  if (!report.cached || !report.overview || !status || !overviewResponse) {
    return (
      <div className="flex flex-col gap-4">
        {refreshing && !refreshError ? (
          <DataLoadingState label="Fetching your report from Google..." />
        ) : (
          <RefreshCtaState
            actionLabel={refreshError ? "Try again" : "Refresh from Google"}
            description={refreshError ? "Google didn't return the report. Try again, or manage the connection." : `Nothing cached yet for ${report.propertyDisplayName || report.propertyId || "this property"}.`}
            header={
              <LocationGoogleConnectionHeader
                binding={binding}
                locationId={locationId}
                onChangeConnection={onChangeConnection}
                projectId={projectId}
                service="analytics"
              />
            }
            onRefresh={() => void handleRefresh()}
            refreshing={refreshing}
            refreshError={refreshError}
            title={refreshError ? "Couldn't fetch the report" : "No report yet"}
          />
        )}
        {showPageFilterToggle ? (
          <PageFilterToggle
            checked={pageFilter}
            onChange={onPageFilterChange}
          />
        ) : null}
      </div>
    )
  }

  const email =
    report.googleAccountEmail || binding.effective?.google_account_email || ""

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsOverview
        key={`${report.propertyId}:${query.scopeRevision}:${query.pageFilter}:${refreshCount}`}
        activeProjectId={projectId}
        isLoading={overviewQuery.isLoading}
        isOrganizationOwner={false}
        onRefreshOverview={() => handleRefresh()}
        overviewErrorMessage={refreshError}
        overviewResponse={overviewResponse}
        realtimeActiveUsers={realtime?.activeUsers ?? undefined}
        status={status}
        actions={
          <>
            <LocationGoogleConnectionHeader
              compact
              binding={binding}
              locationId={locationId}
              onChangeConnection={onChangeConnection}
              projectId={projectId}
              service="analytics"
            />
            {showPageFilterToggle ? (
              <PageFilterToggle checked={pageFilter} onChange={onPageFilterChange} />
            ) : null}
            <ReportSourceBar
              coverage={report.coverage}
              email={email}
              revision={report.scope?.revision ?? scopeRevision}
            />
          </>
        }
      />

      {scopedRealtime ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live users unavailable</CardTitle>
            <CardDescription>
              Realtime can&apos;t be scoped to branch pages — the GA4 Realtime
              API exposes no page dimension — so no count is shown instead of a
              property-wide one.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live users</CardTitle>
            <CardDescription>
              Property-wide live count for this location&apos;s own property.
              Loads only when opened.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!realtimeOpen ? (
              <div>
                <Button
                  onClick={() => void handleOpenRealtime()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Show live users
                </Button>
              </div>
            ) : realtimeLoading && !realtime ? (
              <DataLoadingState label="Loading live users..." />
            ) : realtimeError && !realtime ? (
              <p className="text-sm text-destructive" role="alert">
                {realtimeError}
              </p>
            ) : (
              <>
                <p className="text-3xl font-medium tracking-[-0.05em]">
                  {realtime?.activeUsers ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Users in the last 30 minutes · property-wide
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={realtimeLoading}
                    onClick={() => void handleOpenRealtime()}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    {realtimeLoading ? "Refreshing…" : "Refresh"}
                  </Button>
                  <Button
                    onClick={() => {
                      setRealtimeOpen(false)
                      setRealtime(null)
                      setRealtimeError("")
                    }}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    Hide
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
