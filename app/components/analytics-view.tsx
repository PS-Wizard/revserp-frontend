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
  ProjectAnalyticsStatusResponse,
  ProjectResponse,
} from "~/lib/api.types"

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
        clientApiFetch<ProjectAnalyticsStatusResponse>(
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
    const [isStarting, setIsStarting] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [actionError, setActionError] = useState("")
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
    async function startConnection() {
      if (!activeProject) return
      setIsStarting(true)
      setActionError("")
      try {
        const response = await clientApiPost<{ auth_url: string }>(
          `/projects/${activeProject.id}/analytics/connect/start`,
          {
            return_path:
              window.location.pathname +
              window.location.search +
              window.location.hash,
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
    async function selectProperty() {
      if (!activeProject || !propertyId) return
      setIsSaving(true)
      setActionError("")
      try {
        await clientApiPost<{ ok: boolean }>(
          `/projects/${activeProject.id}/analytics/select-property`,
          { property_id: propertyId }
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
            <Button disabled={isStarting} onClick={startConnection}>
              {isStarting
                ? "Redirecting to Google..."
                : "Grant Analytics access"}
            </Button>
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
                      status.available_properties.find(
                        (property) => property.property_id === value
                      )?.display_name ?? value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {status.available_properties.map((property) => (
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
              <Button
                className="mt-5"
                disabled={!propertyId || isSaving}
                onClick={selectProperty}
              >
                {isSaving ? "Connecting project..." : "Connect project"}
              </Button>
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
