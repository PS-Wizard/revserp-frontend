"use client"

import {
  memo,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react"

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
type AsyncState = {
  isStartingGSCConnect: boolean
  isSavingGSCProjectSelection: boolean
  isLoadingGSC: boolean
  gscConnectErrorMessage: string
  gscProjectSelectionErrorMessage: string
  gscLoadErrorMessage: string
  gscStatus: ProjectGSCStatusResponse | null
  gscOverview: ProjectGSCOverviewResponse | null
}

const initialAsyncState: AsyncState = {
  isStartingGSCConnect: false,
  isSavingGSCProjectSelection: false,
  isLoadingGSC: false,
  gscConnectErrorMessage: "",
  gscProjectSelectionErrorMessage: "",
  gscLoadErrorMessage: "",
  gscStatus: null,
  gscOverview: null,
}

type AsyncAction =
  | { type: "START_CONNECT" }
  | { type: "FINISH_CONNECT" }
  | { type: "START_SELECT" }
  | { type: "FINISH_SELECT" }
  | { type: "START_LOAD" }
  | { type: "FINISH_LOAD" }
  | { type: "SET_CONNECT_ERROR"; message: string }
  | { type: "SET_SELECT_ERROR"; message: string }
  | { type: "SET_LOAD_ERROR"; message: string }
  | { type: "SET_GSC_STATUS"; status: ProjectGSCStatusResponse | null }
  | { type: "SET_GSC_OVERVIEW"; overview: ProjectGSCOverviewResponse | null }
  | { type: "CLEAR_ERRORS" }

function asyncReducer(state: AsyncState, action: AsyncAction): AsyncState {
  switch (action.type) {
    case "START_CONNECT":
      return {
        ...state,
        isStartingGSCConnect: true,
        gscConnectErrorMessage: "",
      }
    case "FINISH_CONNECT":
      return { ...state, isStartingGSCConnect: false }
    case "START_SELECT":
      return {
        ...state,
        isSavingGSCProjectSelection: true,
        gscProjectSelectionErrorMessage: "",
      }
    case "FINISH_SELECT":
      return { ...state, isSavingGSCProjectSelection: false }
    case "START_LOAD":
      return { ...state, isLoadingGSC: true, gscLoadErrorMessage: "" }
    case "FINISH_LOAD":
      return { ...state, isLoadingGSC: false }
    case "SET_CONNECT_ERROR":
      return {
        ...state,
        gscConnectErrorMessage: action.message,
        isStartingGSCConnect: false,
      }
    case "SET_SELECT_ERROR":
      return {
        ...state,
        gscProjectSelectionErrorMessage: action.message,
        isSavingGSCProjectSelection: false,
      }
    case "SET_LOAD_ERROR":
      return { ...state, gscLoadErrorMessage: action.message }
    case "SET_GSC_STATUS":
      return { ...state, gscStatus: action.status }
    case "SET_GSC_OVERVIEW":
      return { ...state, gscOverview: action.overview }
    case "CLEAR_ERRORS":
      return {
        ...state,
        gscConnectErrorMessage: "",
        gscProjectSelectionErrorMessage: "",
        gscLoadErrorMessage: "",
      }
    default:
      return state
  }
}

type SearchConsoleViewProps = {
  activeProject: ProjectResponse | null
  isOrganizationOwner: boolean
}

export const SearchConsoleView = memo(function SearchConsoleView({
  activeProject,
  isOrganizationOwner,
}: SearchConsoleViewProps) {
  const [asyncState, dispatch] = useReducer(asyncReducer, initialAsyncState)
  const [selectedGSCSiteURL, setSelectedGSCSiteURL] = useState("")
  const { gscStatus, gscOverview } = asyncState
  const requestKeyRef = useRef(0)

  const loadGSCData = useCallback(async () => {
    if (!activeProject) {
      dispatch({ type: "SET_GSC_STATUS", status: null })
      dispatch({ type: "SET_GSC_OVERVIEW", overview: null })
      return
    }

    const requestKey = ++requestKeyRef.current
    dispatch({ type: "START_LOAD" })

    try {
      const nextStatus = await clientApiFetch<ProjectGSCStatusResponse>(
        `/projects/${activeProject.id}/gsc/status`
      )
      if (requestKey !== requestKeyRef.current) return

      dispatch({ type: "SET_GSC_STATUS", status: nextStatus })
      setSelectedGSCSiteURL(nextStatus.selected_site?.site_url ?? "")
      dispatch({ type: "SET_GSC_OVERVIEW", overview: null })

      if (nextStatus.has_google_connection && nextStatus.connected) {
        const overview = await clientApiFetch<ProjectGSCOverviewResponse>(
          `/projects/${activeProject.id}/gsc/overview`
        )
        if (requestKey === requestKeyRef.current)
          dispatch({ type: "SET_GSC_OVERVIEW", overview })
      }
    } catch (error) {
      if (requestKey === requestKeyRef.current) {
        dispatch({
          type: "SET_LOAD_ERROR",
          message:
            error instanceof ApiError
              ? error.message
              : "Unable to load Google Search Console data.",
        })
      }
    } finally {
      if (requestKey === requestKeyRef.current)
        dispatch({ type: "FINISH_LOAD" })
    }
  }, [activeProject])

  useEffect(() => {
    void loadGSCData()
  }, [loadGSCData])

  async function handleStartGSCConnect() {
    if (!activeProject) return

    dispatch({ type: "START_CONNECT" })
    try {
      const response = await clientApiPost<{ auth_url: string }>(
        `/projects/${activeProject.id}/gsc/connect/start`,
        { return_path: window.location.pathname + window.location.search }
      )
      window.location.href = response.auth_url
    } catch (error) {
      dispatch({
        type: "SET_CONNECT_ERROR",
        message:
          error instanceof ApiError
            ? error.message
            : "Unable to start Google Search Console connection.",
      })
    }
  }

  async function handleSelectGSCProject() {
    if (!activeProject || !selectedGSCSiteURL) return

    dispatch({ type: "START_SELECT" })
    try {
      await clientApiPost<{ ok: boolean }>(
        `/projects/${activeProject.id}/gsc/select-site`,
        {
          site_url: selectedGSCSiteURL,
        }
      )
      await loadGSCData()
    } catch (error) {
      dispatch({
        type: "SET_SELECT_ERROR",
        message:
          error instanceof ApiError
            ? error.message
            : "Unable to connect this project to Google Search Console.",
      })
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

  if (asyncState.isLoadingGSC && !gscStatus) {
    return (
      <GSCStateCard
        description="Fetching GSC only because this tab is open."
        title="Loading Search Console"
      />
    )
  }

  if (asyncState.gscLoadErrorMessage && !gscStatus) {
    return (
      <GSCStateCard
        description={asyncState.gscLoadErrorMessage}
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
        overviewErrorMessage={asyncState.gscLoadErrorMessage}
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
                disabled={
                  !selectedGSCSiteURL || asyncState.isSavingGSCProjectSelection
                }
                onClick={handleSelectGSCProject}
              >
                {asyncState.isSavingGSCProjectSelection
                  ? "Connecting project..."
                  : "Connect project"}
              </Button>
            </div>
            {asyncState.gscProjectSelectionErrorMessage ? (
              <p className="pt-4 text-sm text-red-200">
                {asyncState.gscProjectSelectionErrorMessage}
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
                disabled={asyncState.isStartingGSCConnect}
                onClick={handleStartGSCConnect}
              >
                {asyncState.isStartingGSCConnect
                  ? "Redirecting to Google..."
                  : "Connect now"}
              </Button>
            </div>
            {asyncState.gscConnectErrorMessage ? (
              <p className="pt-4 text-sm text-red-200">
                {asyncState.gscConnectErrorMessage}
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
    previous.isOrganizationOwner === next.isOrganizationOwner
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
