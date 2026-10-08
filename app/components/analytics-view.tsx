"use client"

import { memo, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { AnalyticsOverview } from "~/components/analytics-overview/analytics-overview"
import { DataLoadingState } from "~/components/data-loading-state"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { ApiError, clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  ProjectAnalyticsOverviewResponse,
  ProjectAnalyticsRealtimeResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { ProjectGoogleAccountBar } from "~/components/project-google-account-bar"
import {
  describeGoogleAccount,
  projectGoogleBoundAccountId,
  projectGoogleConnections,
  projectGoogleSelectedAccountId,
  startProjectGoogleConnect,
  useAccountPropertyList,
  type ProjectAnalyticsStatusWithAccounts,
} from "~/lib/location-google-api"

const allowedGoogleAuthHosts = new Set(["accounts.google.com"])
function isAllowedGoogleAuthURL(rawURL: string) {
  try {
    const url = new URL(rawURL)
    return url.protocol === "https:" && allowedGoogleAuthHosts.has(url.hostname)
  } catch {
    return false
  }
}
export function analyticsStatusQueryKey(projectId: string) {
  return ["analytics-status", projectId] as const
}
// The connected GA property is part of the key: switching the property must
// not reuse the previous property's cached overview as placeholder data.
export function analyticsOverviewQueryKey(
  projectId: string,
  propertyId?: string
) {
  return ["analytics-overview", projectId, propertyId ?? ""] as const
}
export function analyticsRealtimeQueryKey(
  projectId: string,
  propertyId?: string
) {
  return ["analytics-realtime", projectId, propertyId ?? ""] as const
}

type Props = {
  activeProject: ProjectResponse | null
  isOrganizationOwner: boolean
}

export const AnalyticsView = memo(
  function AnalyticsView({ activeProject, isOrganizationOwner }: Props) {
    const queryClient = useQueryClient()
    const projectId = activeProject?.id
    const {
      data: status,
      isLoading: loadingStatus,
      error: statusError,
    } = useQuery({
      queryKey: projectId
        ? analyticsStatusQueryKey(projectId)
        : ["analytics-status-disabled"],
      queryFn: () =>
        clientApiFetch<ProjectAnalyticsStatusWithAccounts>(
          `/projects/${projectId!}/analytics/status`
        ),
      enabled: Boolean(projectId),
      placeholderData: (previous) => previous,
    })
    const connected = Boolean(
      projectId &&
      status?.has_analytics_scope &&
      !status.needs_reconnect &&
      status.connected
    )
    const connectedPropertyId = status?.selected_property?.property_id
    const {
      data: overview,
      error: overviewError,
      isLoading: loadingOverview,
    } = useQuery({
      queryKey: projectId
        ? analyticsOverviewQueryKey(projectId, connectedPropertyId)
        : ["analytics-overview-disabled"],
      queryFn: () =>
        clientApiFetch<ProjectAnalyticsOverviewResponse>(
          `/projects/${projectId!}/analytics/overview`
        ),
      enabled: connected,
      placeholderData: (previous) => previous,
      // The overview builds eight GA reports server-side and is cached for an
      // hour. Automatic retries would stack more slow requests on top of a
      // failure, so the Refresh button is the retry path instead.
      retry: false,
    })
    const { data: realtime } = useQuery({
      queryKey: projectId
        ? analyticsRealtimeQueryKey(projectId, connectedPropertyId)
        : ["analytics-realtime-disabled"],
      queryFn: () =>
        clientApiFetch<ProjectAnalyticsRealtimeResponse>(
          `/projects/${projectId!}/analytics/realtime`
        ),
      enabled: connected,
      refetchInterval: 60_000,
    })
    const [propertyId, setPropertyId] = useState("")
    const [selectedAccountId, setSelectedAccountId] = useState("")
    const [isStarting, setIsStarting] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [actionError, setActionError] = useState("")
    const googleConnections = status
      ? projectGoogleConnections(status)
      : []
    const boundGoogleAccountId = status
      ? projectGoogleBoundAccountId(status)
      : ""
    const boundSetupConnection = googleConnections.find(
      (connection) => connection.id === boundGoogleAccountId
    )
    const boundSetupUnverified =
      boundGoogleAccountId !== "" &&
      (!boundSetupConnection ||
        !describeGoogleAccount(boundSetupConnection).verified)
    const setupPropertyList = useAccountPropertyList(
      projectId ?? "",
      "analytics",
      selectedAccountId
    )
    const setupUsesAccountList =
      selectedAccountId !== "" &&
      selectedAccountId !== boundGoogleAccountId &&
      setupPropertyList.loadedAccountId === selectedAccountId

    function handleSetupAccountChange(next: string | null) {
      setSelectedAccountId(next ?? "")
      setPropertyId("")
      setupPropertyList.reset()
    }

    async function handleLoadSetupProperties() {
      if (!selectedAccountId || setupPropertyList.loading) return
      const { items } = await setupPropertyList.load()
      setPropertyId((current) =>
        current && items.some((item) => item.value === current)
          ? current
          : ""
      )
    }
    useEffect(() => {
      const next = status?.selected_property?.property_id ?? ""
      setPropertyId((current) =>
        current &&
        status?.available_properties.some(
          (property) => property.property_id === current
        )
          ? current
          : next
      )
    }, [status])
    useEffect(() => {
      setSelectedAccountId((current) => {
        const next = status ? projectGoogleSelectedAccountId(status) : ""
        if (!next) return current
        if (
          current &&
          status?.google_connections?.some(
            (connection) => connection.id === current
          )
        )
          return current
        return next
      })
    }, [status])

    const errorMessage =
      actionError ||
      status?.token_error ||
      (statusError instanceof ApiError
        ? statusError.message
        : statusError
          ? "Unable to load Google Analytics data."
          : overviewError instanceof ApiError
            ? overviewError.message
            : overviewError
              ? "Unable to load Google Analytics data."
              : "")
    async function startConnectionWithMode(
      mode?: "add_account" | "reconnect_account",
      googleConnectionId?: string
    ) {
      if (!activeProject) return
      setIsStarting(true)
      setActionError("")
      try {
        const response = await startProjectGoogleConnect(
          activeProject.id,
          "analytics",
          {
            returnPath:
              window.location.pathname +
              window.location.search +
              window.location.hash,
            mode,
            googleConnectionId,
          }
        )
        if (!isAllowedGoogleAuthURL(response.auth_url))
          throw new Error(
            "Unable to start Google Analytics connection: unexpected auth URL."
          )
        window.location.href = response.auth_url
      } catch (error) {
        setActionError(
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to start Google Analytics connection."
        )
        setIsStarting(false)
      }
    }
    async function startConnection() {
      await startConnectionWithMode()
    }
    async function handleAddAnalyticsAccount() {
      await startConnectionWithMode("add_account")
    }
    async function handleReconnectAnalyticsAccount() {
      if (!boundGoogleAccountId) return
      await startConnectionWithMode(
        "reconnect_account",
        boundGoogleAccountId
      )
    }
    async function selectProperty() {
      if (!activeProject || !propertyId) return
      setIsSaving(true)
      setActionError("")
      try {
        await clientApiPost<{ ok: boolean }>(
          `/projects/${activeProject.id}/analytics/select-property`,
          {
            property_id: propertyId,
            ...(selectedAccountId
              ? { google_connection_id: selectedAccountId }
              : {}),
          }
        )
        await queryClient.invalidateQueries({
          queryKey: analyticsStatusQueryKey(activeProject.id),
        })
        await queryClient.invalidateQueries({
          queryKey: analyticsOverviewQueryKey(activeProject.id),
        })
      } catch (error) {
        setActionError(
          error instanceof ApiError
            ? error.message
            : "Unable to connect this project to Google Analytics."
        )
      } finally {
        setIsSaving(false)
      }
    }
    async function refresh() {
      if (!projectId) return
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: analyticsStatusQueryKey(projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: analyticsOverviewQueryKey(projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: analyticsRealtimeQueryKey(projectId),
        }),
      ])
    }

    if (!activeProject)
      return (
        <AnalyticsStateCard
          title="Select a project"
          description="Choose a project first to see its Google Analytics connection state."
        />
      )
    if (loadingStatus && !status) {
      return <DataLoadingState label="Loading Google Analytics..." />
    }
    if (errorMessage && !status)
      return (
        <AnalyticsStateCard
          title="Unable to load Google Analytics"
          description={errorMessage}
          error
        />
      )
    if (!status) return null
    if (
      status.has_google_connection &&
      (!status.has_analytics_scope || status.needs_reconnect)
    )
      return isOrganizationOwner ? (
        <AnalyticsStateCard
          title="Grant Analytics access"
          description="Google is connected for this workspace, but Analytics access needs to be granted again."
          action={
            <span className="flex flex-wrap gap-2">
              <Button disabled={isStarting} onClick={startConnection}>
                {isStarting
                  ? "Redirecting to Google..."
                  : "Grant Analytics access"}
              </Button>
              {boundGoogleAccountId &&
              (status.needs_reconnect || boundSetupUnverified) ? (
                <Button
                  disabled={isStarting}
                  onClick={() => void handleReconnectAnalyticsAccount()}
                  variant="outline"
                >
                  Reconnect selected account
                </Button>
              ) : null}
            </span>
          }
          errorMessage={actionError}
        />
      ) : (
        <AnalyticsStateCard
          title="Google Analytics access needs owner approval"
          description="Let the organization owner know they need to grant Google Analytics access before this view is available."
        />
      )
    if (connected)
      return (
        <>
          <div className="mx-4 mt-6 sm:mx-6 lg:mx-4">
            <ProjectGoogleAccountBar
              currentPropertyId={
                status.selected_property?.property_id ?? propertyId
              }
              disconnectPath={`/projects/${activeProject.id}/analytics/disconnect`}
              googleAccountEmail={status.google_account_email}
              googleConnectionId={status.google_connection_id}
              googleConnections={status.google_connections}
              isOrganizationOwner={isOrganizationOwner}
              needsReconnect={status.needs_reconnect}
              onChanged={() => void refresh()}
              projectId={activeProject.id}
              selectBody={(googleConnectionId) => ({
                property_id:
                  status.selected_property?.property_id ?? propertyId,
                google_connection_id: googleConnectionId,
              })}
              selectPath={`/projects/${activeProject.id}/analytics/select-property`}
              selectedGoogleConnectionId={
                status.selected_google_connection_id
              }
              service="analytics"
              tokenError={status.token_error}
            />
          </div>
          <AnalyticsOverview
            key={status.selected_property?.property_id}
            activeProjectId={activeProject.id}
            isLoading={loadingOverview}
            isOrganizationOwner={isOrganizationOwner}
            onRefreshOverview={refresh}
            overviewErrorMessage={errorMessage}
            realtimeActiveUsers={realtime?.active_users}
            status={status}
            overviewResponse={overview ?? null}
          />
        </>
      )
    if (status.has_google_connection && isOrganizationOwner)
      return (
        <AnalyticsStateCard
          title="Select the Google Analytics property for this project"
          description="Google is connected for this workspace. Pick the property that should power this project's Analytics view."
          action={
            <>
              <Select
                onValueChange={(value) => setPropertyId(value ?? "")}
                value={propertyId}
              >
                <SelectTrigger className="min-h-12 w-full sm:max-w-xl">
                  <SelectValue placeholder="Select a Google Analytics property">
                    {(value) =>
                      (setupUsesAccountList
                        ? setupPropertyList.items.map((item) => ({
                            property_id: item.value,
                            display_name: item.label,
                            account_display_name: item.detail,
                          }))
                        : status.available_properties
                      ).find((property) => property.property_id === value)
                        ?.display_name ?? value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(setupUsesAccountList
                    ? setupPropertyList.items.map((item) => ({
                        property_id: item.value,
                        display_name: item.label,
                        account_display_name: item.detail,
                      }))
                    : status.available_properties
                  ).map((property) => (
                    <SelectItem
                      key={property.property_id}
                      value={property.property_id}
                    >
                      <div className="flex flex-col gap-1 py-1">
                        <span>{property.display_name}</span>
                        {property.account_display_name ? (
                          <span className="text-xs text-muted-foreground">
                            {property.account_display_name}
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {googleConnections.length > 1 ? (
                <div className="flex flex-col gap-2">
                  <Select
                    onValueChange={handleSetupAccountChange}
                    value={selectedAccountId}
                  >
                    <SelectTrigger className="min-h-12 w-full sm:max-w-xl">
                      <SelectValue placeholder="Select a Google account">
                        {(value: string) => {
                          const match = googleConnections.find(
                            (connection) => connection.id === value
                          )
                          return match
                            ? describeGoogleAccount(match).label
                            : value
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {googleConnections.map((connection) => {
                        const identity = describeGoogleAccount(connection)
                        return (
                          <SelectItem
                            key={connection.id}
                            value={connection.id}
                          >
                            <div className="flex flex-col gap-1 py-1">
                              <span>{identity.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {connection.google_status === "active"
                                  ? identity.verified
                                    ? "Connected"
                                    : "Connected — reconnect to verify identity"
                                  : connection.google_status ||
                                    "Reconnect to verify identity"}
                              </span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  {selectedAccountId !== "" &&
                  selectedAccountId !== boundGoogleAccountId ? (
                    <div className="flex flex-col gap-2">
                      <div>
                        <Button
                          disabled={setupPropertyList.loading}
                          onClick={() => void handleLoadSetupProperties()}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {setupPropertyList.loading
                            ? "Loading properties…"
                            : setupPropertyList.loadedAccountId ===
                                selectedAccountId
                              ? "Reload properties"
                              : "Load properties for this account"}
                        </Button>
                      </div>
                      {setupPropertyList.error ? (
                        <p className="text-sm text-red-200" role="alert">
                          {setupPropertyList.error}
                        </p>
                      ) : null}
                      {setupPropertyList.loadedAccountId ===
                        selectedAccountId &&
                      (setupPropertyList.needsReconnect ||
                        setupPropertyList.missingScope) ? (
                        <p className="text-sm text-muted-foreground">
                          {setupPropertyList.missingScope
                            ? "This account hasn't granted Analytics access yet — grant it from the parent connection first."
                            : "This account needs a reconnect before its properties can be used."}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : status.google_account_email ||
                googleConnections.length === 1 ? (
                <p className="text-sm text-muted-foreground">
                  Connected as{" "}
                  {
                    describeGoogleAccount({
                      id: boundGoogleAccountId,
                      google_account_email: status.google_account_email,
                    }).label
                  }
                  .
                </p>
              ) : null}
              <span className="flex flex-wrap gap-2">
                <Button
                  className="mt-5"
                  disabled={!propertyId || isSaving}
                  onClick={selectProperty}
                >
                  {isSaving ? "Connecting project..." : "Connect project"}
                </Button>
                <Button
                  className="mt-5"
                  disabled={isStarting}
                  onClick={() => void handleAddAnalyticsAccount()}
                  variant="outline"
                >
                  Add another Google account
                </Button>
              </span>
            </>
          }
          errorMessage={actionError || status.token_error || ""}
        />
      )
    if (status.has_google_connection)
      return (
        <AnalyticsStateCard
          title="Google Analytics is connected, but the owner is yet to select a project"
          description="Let the organization owner know they still need to pick the Analytics property for this project."
        />
      )
    return isOrganizationOwner ? (
      <AnalyticsStateCard
        title="Google Analytics isn't connected yet"
        description="Connect Google Analytics for this workspace to start wiring a project into the Analytics view."
        action={
          <Button disabled={isStarting} onClick={startConnection}>
            {isStarting
              ? "Redirecting to Google..."
              : "Connect Google Analytics"}
          </Button>
        }
        errorMessage={actionError}
      />
    ) : (
      <AnalyticsStateCard
        title="Google Analytics is currently not connected"
        description="Let the organization owner know they need to connect Google Analytics before this view is available."
      />
    )
  },
  (previous, next) =>
    previous.activeProject?.id === next.activeProject?.id &&
    previous.isOrganizationOwner === next.isOrganizationOwner
)

function AnalyticsStateCard({
  title,
  description,
  action,
  error,
  errorMessage,
}: {
  title: string
  description: string
  action?: React.ReactNode
  error?: boolean
  errorMessage?: string
}) {
  return (
    <div className="p-6">
      <Card className="bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader>
          <CardTitle className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
            {title}
          </CardTitle>
          <CardDescription
            className={
              error
                ? "max-w-2xl pt-5 text-base leading-7 text-red-200"
                : "max-w-2xl pt-5 text-base leading-7"
            }
          >
            {description}
          </CardDescription>
        </CardHeader>
        {action || errorMessage ? (
          <CardContent>
            {action}
            {errorMessage ? (
              <p className="pt-4 text-sm text-red-200">{errorMessage}</p>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
    </div>
  )
}
