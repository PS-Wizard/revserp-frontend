"use client"

import { useEffect, useRef, useState } from "react"

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
  ProjectGSCOverviewResponse,
  ProjectGSCStatusResponse,
  ProjectResponse,
} from "~/lib/api.types"

export function SearchConsoleView({
  activeProject,
  isOrganizationOwner,
}: {
  activeProject: ProjectResponse | null
  isOrganizationOwner: boolean
}) {
  const [isStartingGSCConnect, setIsStartingGSCConnect] = useState(false)
  const [isSavingGSCProjectSelection, setIsSavingGSCProjectSelection] = useState(false)
  const [isLoadingGSC, setIsLoadingGSC] = useState(false)
  const [gscConnectErrorMessage, setGSCConnectErrorMessage] = useState("")
  const [gscProjectSelectionErrorMessage, setGSCProjectSelectionErrorMessage] = useState("")
  const [gscLoadErrorMessage, setGSCLoadErrorMessage] = useState("")
  const [selectedGSCSiteURL, setSelectedGSCSiteURL] = useState("")
  const [gscStatus, setGSCStatus] = useState<ProjectGSCStatusResponse | null>(null)
  const [gscOverview, setGSCOverview] = useState<ProjectGSCOverviewResponse | null>(null)
  const requestKeyRef = useRef(0)

  useEffect(() => {
    void loadGSCData()
  }, [activeProject?.id])

  async function handleStartGSCConnect() {
    if (!activeProject) return

    setGSCConnectErrorMessage("")
    setIsStartingGSCConnect(true)
    try {
      const response = await clientApiPost<{ auth_url: string }>(
        `/projects/${activeProject.id}/gsc/connect/start`,
        { return_path: window.location.pathname + window.location.search }
      )
      window.location.href = response.auth_url
    } catch (error) {
      setGSCConnectErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to start Google Search Console connection."
      )
      setIsStartingGSCConnect(false)
    }
  }

  async function handleSelectGSCProject() {
    if (!activeProject || !selectedGSCSiteURL) return

    setGSCProjectSelectionErrorMessage("")
    setIsSavingGSCProjectSelection(true)
    try {
      await clientApiPost<{ ok: boolean }>(`/projects/${activeProject.id}/gsc/select-site`, {
        site_url: selectedGSCSiteURL,
      })
      await loadGSCData()
    } catch (error) {
      setGSCProjectSelectionErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to connect this project to Google Search Console."
      )
    } finally {
      setIsSavingGSCProjectSelection(false)
    }
  }

  async function loadGSCData() {
    if (!activeProject) {
      setGSCStatus(null)
      setGSCOverview(null)
      return
    }

    const requestKey = ++requestKeyRef.current
    setIsLoadingGSC(true)
    setGSCLoadErrorMessage("")
    setGSCConnectErrorMessage("")
    setGSCProjectSelectionErrorMessage("")

    try {
      const nextStatus = await clientApiFetch<ProjectGSCStatusResponse>(
        `/projects/${activeProject.id}/gsc/status`
      )
      if (requestKey !== requestKeyRef.current) return

      setGSCStatus(nextStatus)
      setSelectedGSCSiteURL(nextStatus.selected_site?.site_url ?? "")
      setGSCOverview(null)

      if (nextStatus.has_google_connection && nextStatus.connected) {
        const overview = await clientApiFetch<ProjectGSCOverviewResponse>(
          `/projects/${activeProject.id}/gsc/overview`
        )
        if (requestKey === requestKeyRef.current) setGSCOverview(overview)
      }
    } catch (error) {
      if (requestKey === requestKeyRef.current) {
        setGSCLoadErrorMessage(
          error instanceof ApiError ? error.message : "Unable to load Google Search Console data."
        )
      }
    } finally {
      if (requestKey === requestKeyRef.current) setIsLoadingGSC(false)
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
        isOrganizationOwner={isOrganizationOwner}
        onRefreshOverview={loadGSCData}
        overviewErrorMessage={gscLoadErrorMessage}
        overviewResponse={gscOverview}
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
              <Select onValueChange={(value) => setSelectedGSCSiteURL(value ?? "")} value={selectedGSCSiteURL}>
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
                {isSavingGSCProjectSelection ? "Connecting project..." : "Connect project"}
              </Button>
            </div>
            {gscProjectSelectionErrorMessage ? (
              <p className="pt-4 text-sm text-red-200">{gscProjectSelectionErrorMessage}</p>
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
              <Button disabled={isStartingGSCConnect} onClick={handleStartGSCConnect}>
                {isStartingGSCConnect ? "Redirecting to Google..." : "Connect now"}
              </Button>
            </div>
            {gscConnectErrorMessage ? (
              <p className="pt-4 text-sm text-red-200">{gscConnectErrorMessage}</p>
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
      <Card className="border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader>
          <CardTitle className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
            {title}
          </CardTitle>
          <CardDescription className={descriptionClassName ?? "max-w-2xl pt-5 text-base leading-7"}>
            {description}
          </CardDescription>
        </CardHeader>
        {action ? <CardContent>{action}</CardContent> : null}
      </Card>
    </div>
  )
}
