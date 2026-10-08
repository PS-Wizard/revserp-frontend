"use client"

import { memo, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { GSCOverview } from "~/components/gsc-overview/gsc-overview"
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
  CrawlResponse,
  ProjectGSCOverviewResponse,
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
  type ProjectGscStatusWithAccounts,
} from "~/lib/location-google-api"

const ALLOWED_GSC_AUTH_HOSTS = new Set(["accounts.google.com"])

function isAllowedGSCAuthURL(rawURL: string) {
  try {
    const parsed = new URL(rawURL)
    return (
      parsed.protocol === "https:" &&
      ALLOWED_GSC_AUTH_HOSTS.has(parsed.hostname)
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
      clientApiFetch<ProjectGscStatusWithAccounts>(
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

  // Sync the dropdown when the async status arrives. The parent remounts this
  // view per project, so no cross-project reset is needed here; keep a valid
  // current selection so a status refetch does not clobber the dropdown.
  useEffect(() => {
    const next = gscStatus?.selected_site?.site_url ?? ""
    setSelectedGSCSiteURL((prev) => {
      if (prev === next) return prev
      if (
        prev &&
        gscStatus?.available_sites.some((site) => site.site_url === prev)
      )
        return prev
      return next
    })
  }, [gscStatus])
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const googleConnections = gscStatus
    ? projectGoogleConnections(gscStatus)
    : []
  const boundGoogleAccountId = gscStatus
    ? projectGoogleBoundAccountId(gscStatus)
    : ""
  const boundSetupConnection = googleConnections.find(
    (connection) => connection.id === boundGoogleAccountId
  )
  const boundSetupUnverified =
    boundGoogleAccountId !== "" &&
    (!boundSetupConnection ||
      !describeGoogleAccount(boundSetupConnection).verified)
  const setupSiteList = useAccountPropertyList(
    projectId ?? "",
    "gsc",
    selectedAccountId
  )
  const setupUsesAccountList =
    selectedAccountId !== "" &&
    selectedAccountId !== boundGoogleAccountId &&
    setupSiteList.loadedAccountId === selectedAccountId

  function handleSetupAccountChange(next: string | null) {
    setSelectedAccountId(next ?? "")
    setSelectedGSCSiteURL("")
    setupSiteList.reset()
  }

  async function handleLoadSetupSites() {
    if (!selectedAccountId || setupSiteList.loading) return
    const { items } = await setupSiteList.load()
    setSelectedGSCSiteURL((prev) =>
      prev && items.some((item) => item.value === prev) ? prev : ""
    )
  }

  useEffect(() => {
    setSelectedAccountId((prev) => {
      const next = gscStatus ? projectGoogleSelectedAccountId(gscStatus) : ""
      if (!next) return prev
      if (
        prev &&
        gscStatus?.google_connections?.some(
          (connection) => connection.id === prev
        )
      )
        return prev
      return next
    })
  }, [gscStatus])

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

  async function handleRefreshGSCState() {
    if (!projectId) return
    await queryClient.invalidateQueries({
      queryKey: gscStatusQueryKey(projectId),
    })
    await queryClient.invalidateQueries({
      queryKey: gscOverviewQueryKey(projectId),
    })
  }

  async function handleStartGSCConnectWithMode(
    mode: "connect" | "add_account" | "reconnect_account",
    googleConnectionId?: string
  ) {
    if (!activeProject) return

    setIsStartingGSCConnect(true)
    setGscConnectErrorMessage("")
    try {
      const response = await startProjectGoogleConnect(
        activeProject.id,
        "gsc",
        {
          returnPath:
            window.location.pathname + window.location.search,
          mode,
          googleConnectionId,
        }
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

  async function handleStartGSCConnect() {
    await handleStartGSCConnectWithMode("connect")
  }

  async function handleAddGSCAccount() {
    await handleStartGSCConnectWithMode("add_account")
  }

  async function handleReconnectGSCAccount() {
    if (!boundGoogleAccountId) return
    await handleStartGSCConnectWithMode(
      "reconnect_account",
      boundGoogleAccountId
    )
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
          ...(selectedAccountId
            ? { google_connection_id: selectedAccountId }
            : {}),
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
    return <DataLoadingState label="Loading Search Console..." />
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
      <>
        <div className="mx-4 mt-6 sm:mx-6 lg:mx-4">
          <ProjectGoogleAccountBar
            currentPropertyId={
              gscStatus.selected_site?.site_url ?? selectedGSCSiteURL
            }
            disconnectPath={`/projects/${activeProject.id}/gsc/disconnect`}
            googleAccountEmail={gscStatus.google_account_email}
            googleConnectionId={gscStatus.google_connection_id}
            googleConnections={gscStatus.google_connections}
            isOrganizationOwner={isOrganizationOwner}
            needsReconnect={gscStatus.needs_reconnect}
            onChanged={() => void handleRefreshGSCState()}
            projectId={activeProject.id}
            selectBody={(googleConnectionId) => ({
              site_url:
                gscStatus.selected_site?.site_url ?? selectedGSCSiteURL,
              google_connection_id: googleConnectionId,
            })}
            selectPath={`/projects/${activeProject.id}/gsc/select-site`}
            selectedGoogleConnectionId={
              gscStatus.selected_google_connection_id
            }
            service="gsc"
            tokenError={gscStatus.token_error}
          />
        </div>
        <GSCOverview
          activeProjectID={activeProject.id}
          completedCrawls={completedCrawls}
          isOrganizationOwner={isOrganizationOwner}
          isLoading={isLoadingOverview}
          onRefreshOverview={handleRefreshOverview}
          overviewErrorMessage={gscLoadErrorMessage}
          overviewResponse={gscOverview ?? null}
          status={gscStatus}
        />
      </>
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
                  {(setupUsesAccountList
                    ? setupSiteList.items.map((item) => ({
                        site_url: item.value,
                        permission_level: item.detail,
                      }))
                    : gscStatus.available_sites
                  ).map((site) => (
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
            {googleConnections.length > 1 ? (
              <div className="flex flex-col gap-2 pt-5 sm:max-w-xl">
                <Select
                  onValueChange={handleSetupAccountChange}
                  value={selectedAccountId}
                >
                  <SelectTrigger className="min-h-12 w-full">
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
                        <SelectItem key={connection.id} value={connection.id}>
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
                        disabled={setupSiteList.loading}
                        onClick={() => void handleLoadSetupSites()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {setupSiteList.loading
                          ? "Loading properties…"
                          : setupSiteList.loadedAccountId === selectedAccountId
                            ? "Reload properties"
                            : "Load properties for this account"}
                      </Button>
                    </div>
                    {setupSiteList.error ? (
                      <p className="text-sm text-red-200" role="alert">
                        {setupSiteList.error}
                      </p>
                    ) : null}
                    {setupSiteList.loadedAccountId === selectedAccountId &&
                    setupSiteList.needsReconnect ? (
                      <p className="text-sm text-muted-foreground">
                        This account needs a reconnect before its properties
                        can be used.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : gscStatus?.google_account_email ||
              googleConnections.length === 1 ? (
              <p className="pt-5 text-sm text-muted-foreground">
                Connected as{" "}
                {
                  describeGoogleAccount({
                    id: boundGoogleAccountId,
                    google_account_email: gscStatus.google_account_email,
                  }).label
                }
                .
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-5 sm:max-w-sm">
              <Button
                disabled={!selectedGSCSiteURL || isSavingGSCProjectSelection}
                onClick={handleSelectGSCProject}
              >
                {isSavingGSCProjectSelection
                  ? "Connecting project..."
                  : "Connect project"}
              </Button>
              <Button
                disabled={isStartingGSCConnect}
                onClick={() => void handleAddGSCAccount()}
                variant="outline"
              >
                Add another Google account
              </Button>
              {boundGoogleAccountId &&
              (gscStatus?.needs_reconnect ||
                gscStatus?.token_error ||
                boundSetupUnverified) ? (
                <Button
                  disabled={isStartingGSCConnect}
                  onClick={() => void handleReconnectGSCAccount()}
                  variant="outline"
                >
                  Reconnect account
                </Button>
              ) : null}
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
