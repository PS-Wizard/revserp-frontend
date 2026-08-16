"use client"

import { memo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { GSCOverview } from "~/components/gsc-overview/gsc-overview"
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
  CrawlResponse,
  ProjectGSCOverviewResponse,
  ProjectGSCStatusResponse,
  ProjectResponse,
} from "~/lib/api.types"

const ALLOWED_GSC_AUTH_HOSTS = new Set(["accounts.google.com"])

function isAllowedGSCAuthURL(rawURL: string) {
  try {
    const parsed = new URL(rawURL)
    return (
      parsed.protocol === "https:" && ALLOWED_GSC_AUTH_HOSTS.has(parsed.hostname)
    )
  } catch {
    return false
  }
}

export function gscStatusQueryKey(projectId: string) {
  return ["gsc-status", projectId] as const
}

export function gscOverviewQueryKey(projectId: string) {
  return ["gsc-overview", projectId] as const
}

type SearchConsoleViewProps = {
  activeProject: ProjectResponse | null
  isOrganizationOwner: boolean
  completedCrawls: CrawlResponse[]
}

export const SearchConsoleView = memo(function SearchConsoleView({
  activeProject,
  isOrganizationOwner,
  completedCrawls,
}: SearchConsoleViewProps) {
  const queryClient = useQueryClient()
  const projectId = activeProject?.id

  const {
    data: gscStatus,
    isLoading: isLoadingStatus,
    error: statusError,
  } = useQuery({
    queryKey: projectId
      ? gscStatusQueryKey(projectId)
      : ["gsc-status-disabled"],
    queryFn: () =>
      clientApiFetch<ProjectGSCStatusResponse>(
        `/projects/${projectId!}/gsc/status`
      ),
    enabled: Boolean(projectId),
    placeholderData: (prev) => prev,
  })

  const overviewEnabled =
    Boolean(projectId) &&
    Boolean(gscStatus?.has_google_connection) &&
    Boolean(gscStatus?.connected)

  const {
    data: gscOverview,
    isLoading: isLoadingOverview,
    error: overviewError,
  } = useQuery({
    queryKey: projectId
      ? gscOverviewQueryKey(projectId)
      : ["gsc-overview-disabled"],
    queryFn: () =>
      clientApiFetch<ProjectGSCOverviewResponse>(
        `/projects/${projectId!}/gsc/overview`
      ),
    enabled: overviewEnabled,
    placeholderData: (prev) => prev,
  })

  const isLoadingGSC = isLoadingStatus || (overviewEnabled && isLoadingOverview)

  const gscLoadErrorMessage =
    (statusError instanceof ApiError
      ? statusError.message
      : statusError
        ? "Unable to load Google Search Console data."
        : "") ||
    (overviewError instanceof ApiError
      ? overviewError.message
      : overviewError
        ? "Unable to load Google Search Console data."
        : "")

  const [selectedGSCSiteURL, setSelectedGSCSiteURL] = useState(
    gscStatus?.selected_site?.site_url ?? ""
  )
  const [isStartingGSCConnect, setIsStartingGSCConnect] = useState(false)
  const [gscConnectErrorMessage, setGscConnectErrorMessage] = useState("")
  const [isSavingGSCProjectSelection, setIsSavingGSCProjectSelection] =
    useState(false)
  const [gscProjectSelectionErrorMessage, setGscProjectSelectionErrorMessage] =
    useState("")

  async function handleRefreshOverview() {
    if (!projectId) return
    await queryClient.invalidateQueries({
      queryKey: gscOverviewQueryKey(projectId),
    })
  }

  async function handleStartGSCConnect() {
    if (!activeProject) return

    setIsStartingGSCConnect(true)
    setGscConnectErrorMessage("")
    try {
      const response = await clientApiPost<{ auth_url: string }>(
        `/projects/${activeProject.id}/gsc/connect/start`,
        { return_path: window.location.pathname + window.location.search }
      )
      if (!isAllowedGSCAuthURL(response.auth_url)) {
        throw new Error(
          "Unable to start Google Search Console connection: unexpected auth URL."
        )
      }
      window.location.href = response.auth_url
    } catch (error) {
      setGscConnectErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to start Google Search Console connection."
      )
      setIsStartingGSCConnect(false)
    }
  }

  async function handleSelectGSCProject() {
    if (!activeProject || !selectedGSCSiteURL) return

    setIsSavingGSCProjectSelection(true)
    setGscProjectSelectionErrorMessage("")
    try {
      await clientApiPost<{ ok: boolean }>(
        `/projects/${activeProject.id}/gsc/select-site`,
        {
          site_url: selectedGSCSiteURL,
        }
      )
      // Invalidate both so they refetch with updated state
      await queryClient.invalidateQueries({
        queryKey: gscStatusQueryKey(activeProject.id),
      })
      await queryClient.invalidateQueries({
        queryKey: gscOverviewQueryKey(activeProject.id),
      })
    } catch (error) {
      setGscProjectSelectionErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to connect this project to Google Search Console."
      )
    } finally {
      setIsSavingGSCProjectSelection(false)
    }
  }

  if (!activeProject) {
    return (
      <GSCStateCard
        description="Choose a project first to see its Google Search Console connection state."
        title="Select a project"
      />
    )
  }

  if (isLoadingGSC && !gscStatus) {
    return (
      <GSCStateCard
        description="Fetching GSC only because this tab is open."
        title="Loading Search Console"
      />
    )
  }

  if (gscLoadErrorMessage && !gscStatus) {
    return (
      <GSCStateCard
        description={gscLoadErrorMessage}
        descriptionClassName="text-red-200"
        title="Unable to load Search Console"
      />
    )
  }

  if (gscStatus?.has_google_connection && gscStatus.connected) {
    return (
      <GSCOverview
        activeProjectID={activeProject.id}
        completedCrawls={completedCrawls}
        isOrganizationOwner={isOrganizationOwner}
        onRefreshOverview={handleRefreshOverview}
        overviewErrorMessage={gscLoadErrorMessage}
        overviewResponse={gscOverview ?? null}
        status={gscStatus}
      />
    )
  }

  if (gscStatus?.has_google_connection && isOrganizationOwner) {
    return (
      <GSCStateCard
        action={
          <>
            <div className="pt-8 sm:max-w-xl">
              <Select
                onValueChange={(value) => setSelectedGSCSiteURL(value ?? "")}
                value={selectedGSCSiteURL}
              >
                <SelectTrigger className="min-h-12 w-full">
                  <SelectValue placeholder="Select a Search Console property" />
                </SelectTrigger>
                <SelectContent>
                  {gscStatus.available_sites.map((site) => (
                    <SelectItem key={site.site_url} value={site.site_url}>
                      <div className="flex flex-col gap-1 py-1">
                        <span>{site.site_url}</span>
                        {site.permission_level ? (
                          <span className="text-xs text-muted-foreground">
                            {site.permission_level}
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-5 sm:max-w-sm">
              <Button
                disabled={!selectedGSCSiteURL || isSavingGSCProjectSelection}
                onClick={handleSelectGSCProject}
              >
                {isSavingGSCProjectSelection
                  ? "Connecting project..."
                  : "Connect project"}
              </Button>
            </div>
            {gscProjectSelectionErrorMessage ? (
              <p className="pt-4 text-sm text-red-200">
                {gscProjectSelectionErrorMessage}
              </p>
            ) : null}
          </>
        }
        description="Google Search Console is connected for this workspace. Pick the property that should power this project's GSC view."
        title="Select the Search Console property for this project"
      />
    )
  }

  if (gscStatus?.has_google_connection) {
    return (
      <GSCStateCard
        description="Let the organization owner know they still need to pick the Search Console property for this project."
        title="GSC is connected, but the owner is yet to select a project"
      />
    )
  }

  if (isOrganizationOwner) {
    return (
      <GSCStateCard
        action={
          <>
            <div className="pt-8 sm:max-w-sm">
              <Button
                disabled={isStartingGSCConnect}
                onClick={handleStartGSCConnect}
              >
                {isStartingGSCConnect
                  ? "Redirecting to Google..."
                  : "Connect now"}
              </Button>
            </div>
            {gscConnectErrorMessage ? (
              <p className="pt-4 text-sm text-red-200">
                {gscConnectErrorMessage}
              </p>
            ) : null}
          </>
        }
        description="Connect Google Search Console for this workspace to start wiring a project into the GSC view."
        title="Google Search Console isn't connected yet"
      />
    )
  }

  return (
    <GSCStateCard
      description="Let the organization owner know they need to connect Google Search Console before this view is available."
      title="Google Search Console is currently not connected"
    />
  )
}, areSearchConsoleViewPropsEqual)

function areSearchConsoleViewPropsEqual(
  previous: SearchConsoleViewProps,
  next: SearchConsoleViewProps
) {
  return (
    previous.activeProject?.id === next.activeProject?.id &&
    previous.isOrganizationOwner === next.isOrganizationOwner &&
    previous.completedCrawls === next.completedCrawls
  )
}

function GSCStateCard({
  title,
  description,
  descriptionClassName,
  action,
}: {
  title: string
  description: string
  descriptionClassName?: string
  action?: React.ReactNode
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
              descriptionClassName ?? "max-w-2xl pt-5 text-base leading-7"
            }
          >
            {description}
          </CardDescription>
        </CardHeader>
        {action ? <CardContent>{action}</CardContent> : null}
      </Card>
    </div>
  )
}
