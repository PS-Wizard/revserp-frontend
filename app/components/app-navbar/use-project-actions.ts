"use client"

import { useReducer } from "react"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"
import { buildApiUrl, clientApiDelete } from "~/lib/api"
import { readExportError, getExportFilename, formatCrawlDate, getProjectFilenameSegment, downloadBlob } from "./utils"
import type { ExportFormat } from "./types"

// --- State ---

type DialogState = "closed" | "delete-project" | "delete-crawl"

type ProjectActionState = {
  projectActionError: string
  dialog: DialogState
  projectPendingDelete: ProjectResponse | null
  deletingProjectId: string | null
  crawlPendingDelete: CrawlResponse | null
  deletingCrawlId: string | null
  exportingCrawlId: string | null
  hoveredProjectId: string | null
  exportFormat: ExportFormat
}

const INITIAL_STATE: ProjectActionState = {
  projectActionError: "",
  dialog: "closed",
  projectPendingDelete: null,
  deletingProjectId: null,
  crawlPendingDelete: null,
  deletingCrawlId: null,
  exportingCrawlId: null,
  hoveredProjectId: null,
  exportFormat: "xlsx",
}

// --- Actions ---

type ProjectActionEvent =
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "OPEN_DELETE_PROJECT"; project: ProjectResponse }
  | { type: "DELETE_PROJECT_START" }
  | { type: "DELETE_PROJECT_DONE" }
  | { type: "OPEN_DELETE_CRAWL"; crawl: CrawlResponse }
  | { type: "DELETE_CRAWL_START" }
  | { type: "DELETE_CRAWL_DONE" }
  | { type: "SET_EXPORTING_CRAWL_ID"; id: string | null }
  | { type: "SET_HOVERED_PROJECT_ID"; id: string | null }
  | { type: "SET_EXPORT_FORMAT"; format: ExportFormat }
  | { type: "CLOSE_DIALOG" }

function projectActionReducer(
  state: ProjectActionState,
  event: ProjectActionEvent,
): ProjectActionState {
  switch (event.type) {
    case "SET_ERROR":
      return { ...state, projectActionError: event.error }
    case "CLEAR_ERROR":
      return { ...state, projectActionError: "" }
    case "OPEN_DELETE_PROJECT":
      return {
        ...state,
        projectActionError: "",
        dialog: "delete-project",
        projectPendingDelete: event.project,
        deletingProjectId: null,
      }
    case "DELETE_PROJECT_START":
      return { ...state, deletingProjectId: state.projectPendingDelete?.id ?? null }
    case "DELETE_PROJECT_DONE":
      return {
        ...state,
        dialog: "closed",
        projectPendingDelete: null,
        deletingProjectId: null,
        crawlPendingDelete: null,
      }
    case "OPEN_DELETE_CRAWL":
      return {
        ...state,
        projectActionError: "",
        dialog: "delete-crawl",
        crawlPendingDelete: event.crawl,
        deletingCrawlId: null,
      }
    case "DELETE_CRAWL_START":
      return { ...state, deletingCrawlId: state.crawlPendingDelete?.id ?? null }
    case "DELETE_CRAWL_DONE":
      return {
        ...state,
        dialog: "closed",
        crawlPendingDelete: null,
        deletingCrawlId: null,
      }
    case "SET_EXPORTING_CRAWL_ID":
      return { ...state, exportingCrawlId: event.id }
    case "SET_HOVERED_PROJECT_ID":
      return { ...state, hoveredProjectId: event.id }
    case "SET_EXPORT_FORMAT":
      return { ...state, exportFormat: event.format }
    case "CLOSE_DIALOG":
      return { ...state, dialog: "closed", projectActionError: "" }
  }
}

// --- Hook ---

type UseProjectActionsParams = {
  projects: ProjectResponse[]
  activeProjectId: string | undefined | null
  location: ReturnType<typeof import("react-router").useLocation>
  navigate: ReturnType<typeof import("react-router").useNavigate>
  revalidator: ReturnType<typeof import("react-router").useRevalidator>
}

export function useProjectActions({
  projects,
  activeProjectId,
  location,
  navigate,
  revalidator,
}: UseProjectActionsParams) {
  const [state, dispatch] = useReducer(projectActionReducer, INITIAL_STATE)

  function openDeleteProjectDialog(project: ProjectResponse) {
    dispatch({ type: "OPEN_DELETE_PROJECT", project })
  }

  async function handleDeleteProject() {
    if (!state.projectPendingDelete || state.deletingProjectId) return

    dispatch({ type: "CLEAR_ERROR" })
    dispatch({ type: "DELETE_PROJECT_START" })

    try {
      await clientApiDelete<{ ok: boolean }>(`/projects/${state.projectPendingDelete.id}`)

      const remainingProjects = projects.filter(
        (project) => project.id !== state.projectPendingDelete!.id,
      )

      if (state.projectPendingDelete.id === activeProjectId) {
        const searchParams = new URLSearchParams(location.search)
        const nextProject = remainingProjects[0] ?? null

        if (nextProject) {
          searchParams.set("project", nextProject.id)
        } else {
          searchParams.delete("project")
        }

        await navigate(`${location.pathname}?${searchParams.toString()}`)
      }

      revalidator.revalidate()
      dispatch({ type: "DELETE_PROJECT_DONE" })
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Unable to delete project.",
      })
      dispatch({ type: "DELETE_PROJECT_DONE" })
    }
  }

  function openDeleteCrawlDialog(crawl: CrawlResponse) {
    dispatch({ type: "OPEN_DELETE_CRAWL", crawl })
  }

  async function handleDeleteCrawl() {
    if (!state.crawlPendingDelete || state.deletingCrawlId) return

    dispatch({ type: "CLEAR_ERROR" })
    dispatch({ type: "DELETE_CRAWL_START" })

    try {
      await clientApiDelete<{ ok: boolean }>(`/crawls/${state.crawlPendingDelete.id}`)
      revalidator.revalidate()

      const searchParams = new URLSearchParams(location.search)
      if (searchParams.get("crawl") === state.crawlPendingDelete.id) {
        searchParams.delete("crawl")
        await navigate(`${location.pathname}?${searchParams.toString()}`)
      }

      dispatch({ type: "DELETE_CRAWL_DONE" })
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Unable to delete crawl.",
      })
      dispatch({ type: "DELETE_CRAWL_DONE" })
    }
  }

  async function handleExportCrawl(crawl: CrawlResponse, format: ExportFormat) {
    if (crawl.status !== "completed" || state.exportingCrawlId) {
      dispatch({ type: "SET_ERROR", error: "Only completed crawls can be exported." })
      return
    }

    dispatch({ type: "CLEAR_ERROR" })
    dispatch({ type: "SET_EXPORTING_CRAWL_ID", id: crawl.id })

    try {
      const response = await fetch(
        buildApiUrl(`/crawls/${crawl.id}/score-breakdown/export.${format}`),
        { credentials: "include" },
      )

      if (!response.ok) {
        throw new Error(await readExportError(response))
      }

      const blob = await response.blob()
      const project = projects.find((item) => item.id === crawl.project_id)
      const filename = getExportFilename(
        response.headers.get("content-disposition"),
        `${getProjectFilenameSegment(project)}-${formatCrawlDate(crawl)}-issues.${format}`,
      )
      downloadBlob(blob, filename)
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Unable to export crawl issues.",
      })
    } finally {
      dispatch({ type: "SET_EXPORTING_CRAWL_ID", id: null })
    }
  }

  const isDeleteProjectOpen = state.dialog === "delete-project"
  const isDeleteCrawlOpen = state.dialog === "delete-crawl"

  return {
    projectActionError: state.projectActionError,
    projectPendingDelete: state.projectPendingDelete,
    isDeleteProjectOpen,
    deletingProjectId: state.deletingProjectId,
    crawlPendingDelete: state.crawlPendingDelete,
    isDeleteCrawlOpen,
    deletingCrawlId: state.deletingCrawlId,
    exportingCrawlId: state.exportingCrawlId,
    hoveredProjectId: state.hoveredProjectId,
    exportFormat: state.exportFormat,
    openDeleteProjectDialog,
    handleDeleteProject,
    openDeleteCrawlDialog,
    handleDeleteCrawl,
    handleExportCrawl,
    onExportFormatChange: (format: ExportFormat) => dispatch({ type: "SET_EXPORT_FORMAT", format }),
    onProjectHover: (id: string | null) => dispatch({ type: "SET_HOVERED_PROJECT_ID", id }),
    closeDialog: () => dispatch({ type: "CLOSE_DIALOG" }),
  }
}
