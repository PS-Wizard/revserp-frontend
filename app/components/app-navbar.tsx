"use client"

import { memo, useMemo, useReducer, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useLocation, useNavigate, useRevalidator } from "react-router"

import { BusinessProfileDrawer } from "~/components/app-navbar/business-profile-drawer"
import {
  CreateProjectDialog,
  DeleteCrawlDialog,
  DeleteProjectDialog,
  InviteMembersDialog,
  LeaveWorkspaceDialog,
} from "~/components/app-navbar/dialogs"
import { RunCrawlDialog } from "~/components/app-navbar/run-crawl-dialog"
import { AutoCrawlDialog } from "~/components/app-navbar/auto-crawl-dialog"
import { useAutoCrawlSettings } from "~/components/app-navbar/use-auto-crawl-settings"
import { useBusinessProfile } from "~/components/app-navbar/use-business-profile"
import { useProjectActions } from "~/components/app-navbar/use-project-actions"
import { useWorkspaceActions } from "~/components/app-navbar/use-workspace-actions"
import type {
  AppNavbarProps,
  DashboardView,
} from "~/components/app-navbar/types"
import {
  getCrawlValidationError,
  getInitials,
} from "~/components/app-navbar/utils"
import { CommandDock } from "~/components/command-dock/command-dock"
import { getCrawlTimestamp } from "~/lib/crawl"
import { clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  CrawlResponse,
  CrawlsResponse,
  ProjectResponse,
} from "~/lib/api.types"

// --- Create project form reducer ---

type CreateProjectState = {
  isCreateProjectOpen: boolean
  projectName: string
  projectBaseUrl: string
  createProjectError: string
  isCreatingProject: boolean
}

type CreateProjectEvent =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "SET_NAME"; value: string }
  | { type: "SET_BASE_URL"; value: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_CREATING" }
  | { type: "CREATED" }

function createProjectReducer(
  state: CreateProjectState,
  event: CreateProjectEvent
): CreateProjectState {
  switch (event.type) {
    case "OPEN":
      return { ...state, isCreateProjectOpen: true, createProjectError: "" }
    case "CLOSE":
      return { ...state, isCreateProjectOpen: false }
    case "SET_NAME":
      return { ...state, projectName: event.value }
    case "SET_BASE_URL":
      return { ...state, projectBaseUrl: event.value }
    case "SET_ERROR":
      return { ...state, createProjectError: event.error }
    case "SET_CREATING":
      return { ...state, isCreatingProject: true, createProjectError: "" }
    case "CREATED":
      return {
        isCreateProjectOpen: false,
        projectName: "",
        projectBaseUrl: "",
        createProjectError: "",
        isCreatingProject: false,
      }
  }
}

const initialCreateProjectState: CreateProjectState = {
  isCreateProjectOpen: false,
  projectName: "",
  projectBaseUrl: "",
  createProjectError: "",
  isCreatingProject: false,
}

// --- Run crawl form reducer ---

type RunCrawlState = {
  isRunCrawlOpen: boolean
  maxDepth: string
  maxPages: string
  delayMs: string
  jitterMs: string
  fetchTimeoutSeconds: string
  runCrawlError: string
  isStartingCrawl: boolean
}

type RunCrawlEvent =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "SET_MAX_DEPTH"; value: string }
  | { type: "SET_MAX_PAGES"; value: string }
  | { type: "SET_DELAY_MS"; value: string }
  | { type: "SET_JITTER_MS"; value: string }
  | { type: "SET_FETCH_TIMEOUT"; value: string }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_STARTING" }
  | { type: "STARTED" }

function runCrawlReducer(
  state: RunCrawlState,
  event: RunCrawlEvent
): RunCrawlState {
  switch (event.type) {
    case "OPEN":
      return { ...state, isRunCrawlOpen: true, runCrawlError: "" }
    case "CLOSE":
      return { ...state, isRunCrawlOpen: false }
    case "SET_MAX_DEPTH":
      return { ...state, maxDepth: event.value }
    case "SET_MAX_PAGES":
      return { ...state, maxPages: event.value }
    case "SET_DELAY_MS":
      return { ...state, delayMs: event.value }
    case "SET_JITTER_MS":
      return { ...state, jitterMs: event.value }
    case "SET_FETCH_TIMEOUT":
      return { ...state, fetchTimeoutSeconds: event.value }
    case "SET_ERROR":
      return { ...state, runCrawlError: event.error }
    case "SET_STARTING":
      return { ...state, isStartingCrawl: true, runCrawlError: "" }
    case "STARTED":
      return { ...state, isStartingCrawl: false, isRunCrawlOpen: false }
  }
}

const initialRunCrawlState: RunCrawlState = {
  isRunCrawlOpen: false,
  maxDepth: "5",
  maxPages: "",
  delayMs: "",
  jitterMs: "",
  fetchTimeoutSeconds: "60",
  runCrawlError: "",
  isStartingCrawl: false,
}

// --- Component ---

export const AppNavbar = memo(function AppNavbar({
  activeProjectId,
  currentCrawl,
  projectCrawls,
  isCrawlRunning,
  crawlStatusLabel,
  onCrawlStart,
  onCompareCrawl,
  compareLabel,
  organizationId,
  organizations,
  projects,
  userEmail,
  userName,
  view,
  onViewChange,
  auditTab,
  onAuditTabChange,
  isPlatformAdmin,
  onExportAudit,
  isExportingAudit,
}: AppNavbarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const revalidator = useRevalidator()

  // Bumped when a dialog action should also dismiss whatever panel the dock
  // has expanded (the dock owns its own view state).
  const [dockDismissToken, setDockDismissToken] = useState(0)
  const dismissDock = () => setDockDismissToken((token) => token + 1)

  const projectActions = useProjectActions({
    projects,
    activeProjectId,
    location,
    navigate,
    revalidator,
  })

  // Lazily-fetched crawls for non-active projects (hover panel). Keyed by
  // project id. The active project's crawls come from the loader via
  // projectCrawls prop and are not re-fetched here.
  const [fetchedProjectCrawls, setFetchedProjectCrawls] = useState<
    Record<string, CrawlResponse[]>
  >({})
  const fetchingProjectIds = useRef<Set<string>>(new Set())

  const mergedProjectCrawls: Record<string, CrawlResponse[]> = {
    ...fetchedProjectCrawls,
    ...projectCrawls,
  }

  function handleProjectHover(id: string | null) {
    projectActions.onProjectHover(id)
    if (
      id === null ||
      id === activeProjectId ||
      mergedProjectCrawls[id] !== undefined ||
      fetchingProjectIds.current.has(id)
    ) {
      return
    }
    fetchingProjectIds.current.add(id)
    void clientApiFetch<CrawlsResponse>(
      `/projects/${id}/crawls?limit=50&offset=0`
    )
      .then((response) => {
        setFetchedProjectCrawls((prev) => ({ ...prev, [id]: response.crawls }))
      })
      .catch(() => {
        // Leave the entry absent so a future hover can retry.
      })
      .finally(() => {
        fetchingProjectIds.current.delete(id)
      })
  }

  const workspaceActions = useWorkspaceActions({
    organizationId,
    organizations,
    navigate,
    revalidator,
  })

  const {
    businessProfileProject,
    brandName,
    websiteUrl,
    primaryCategory,
    primaryLocation,
    businessDescription,
    seedPrompts,
    businessProfileError,
    isLoadingBusinessProfile,
    isSavingBusinessProfile,
    canManageBusinessProfile,
    aiQuestions,
    isLoadingAIQuestions,
    isRegeneratingAIQuestions,
    hasUnsavedChanges,
    openBusinessProfileDrawer,
    closeBusinessProfileDrawer,
    updateSeedPrompt,
    handleSaveBusinessProfile,
    setBrandName,
    setWebsiteUrl,
    setPrimaryCategory,
    setPrimaryLocation,
    setBusinessDescription,
  } = useBusinessProfile()

  const [createProject, createProjectDispatch] = useReducer(
    createProjectReducer,
    initialCreateProjectState
  )
  const [runCrawl, runCrawlDispatch] = useReducer(
    runCrawlReducer,
    initialRunCrawlState
  )
  const autoCrawl = useAutoCrawlSettings(activeProjectId)

  const initials = useMemo(() => {
    const source = userName?.trim() || userEmail.split("@")[0] || "R"
    return getInitials(source, "R")
  }, [userEmail, userName])

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ??
    projects[0] ??
    null
  const crawlPanelProject =
    projects.find(
      (project) => project.id === projectActions.hoveredProjectId
    ) ?? activeProject
  const crawlPanelCrawls = crawlPanelProject
    ? [...(mergedProjectCrawls[crawlPanelProject.id] ?? [])].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      )
    : []

  const activeCrawls = activeProject
    ? [...(mergedProjectCrawls[activeProject.id] ?? [])].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      )
    : []

  function handleSelectProject(projectId: string, crawlId?: string) {
    const searchParams = new URLSearchParams(location.search)
    searchParams.set("project", projectId)
    if (projectId !== activeProjectId) {
      searchParams.delete("revbotConversation")
    }
    if (crawlId) {
      searchParams.set("crawl", crawlId)
    } else {
      searchParams.delete("crawl")
    }

    void navigate(`${location.pathname}?${searchParams.toString()}`)
  }

  function handleOpenBusinessProfileDrawer(project: ProjectResponse) {
    openBusinessProfileDrawer(project)
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (createProject.isCreatingProject) return

    const trimmedName = createProject.projectName.trim()
    const trimmedBaseUrl = createProject.projectBaseUrl.trim()

    if (!trimmedName || !trimmedBaseUrl) {
      createProjectDispatch({
        type: "SET_ERROR",
        error: "Project name and base URL are required.",
      })
      return
    }

    createProjectDispatch({ type: "SET_CREATING" })

    try {
      const createdProject = await clientApiPost<ProjectResponse>(
        `/organizations/${organizationId}/projects`,
        { name: trimmedName, base_url: trimmedBaseUrl }
      )

      createProjectDispatch({ type: "CREATED" })

      const searchParams = new URLSearchParams(location.search)
      searchParams.set("project", createdProject.id)
      await navigate(`${location.pathname}?${searchParams.toString()}`)
    } catch (error) {
      createProjectDispatch({
        type: "SET_ERROR",
        error:
          error instanceof Error ? error.message : "Unable to create project.",
      })
    }
  }

  async function handleRunCrawl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeProjectId || runCrawl.isStartingCrawl || isCrawlRunning) return

    const parsedMaxDepth = Number(runCrawl.maxDepth)
    const parsedFetchTimeoutSeconds = Number(runCrawl.fetchTimeoutSeconds)
    const validationError = getCrawlValidationError(
      parsedMaxDepth,
      parsedFetchTimeoutSeconds
    )
    if (validationError) {
      runCrawlDispatch({ type: "SET_ERROR", error: validationError })
      return
    }

    // Max pages is optional: blank means unlimited; when provided it must be a positive integer.
    const trimmedMaxPages = runCrawl.maxPages.trim()
    let parsedMaxPages: number | undefined
    if (trimmedMaxPages !== "") {
      parsedMaxPages = Number(trimmedMaxPages)
      if (!Number.isInteger(parsedMaxPages) || parsedMaxPages <= 0) {
        runCrawlDispatch({
          type: "SET_ERROR",
          error: "Max pages must be a positive whole number, or left blank.",
        })
        return
      }
    }

    // Delay is optional: blank means no delay; when provided it must be a positive integer.
    const trimmedDelayMs = runCrawl.delayMs.trim()
    let parsedDelayMs: number | undefined
    if (trimmedDelayMs !== "") {
      parsedDelayMs = Number(trimmedDelayMs)
      if (!Number.isInteger(parsedDelayMs) || parsedDelayMs <= 0) {
        runCrawlDispatch({
          type: "SET_ERROR",
          error:
            "Delay must be a positive whole number of milliseconds, or left blank.",
        })
        return
      }
    }

    // Jitter is optional: blank means no jitter; when provided it must be a positive integer.
    const trimmedJitterMs = runCrawl.jitterMs.trim()
    let parsedJitterMs: number | undefined
    if (trimmedJitterMs !== "") {
      parsedJitterMs = Number(trimmedJitterMs)
      if (!Number.isInteger(parsedJitterMs) || parsedJitterMs <= 0) {
        runCrawlDispatch({
          type: "SET_ERROR",
          error:
            "Jitter must be a positive whole number of milliseconds, or left blank.",
        })
        return
      }
    }

    runCrawlDispatch({ type: "SET_STARTING" })

    try {
      const crawl = await clientApiPost<CrawlResponse>(
        `/projects/${activeProjectId}/crawls`,
        {
          config_snapshot: {
            max_depth: parsedMaxDepth,
            fetch_timeout_seconds: parsedFetchTimeoutSeconds,
            ...(parsedMaxPages !== undefined
              ? { max_pages: parsedMaxPages }
              : {}),
            ...(parsedDelayMs !== undefined
              ? { request_delay_ms: parsedDelayMs }
              : {}),
            ...(parsedJitterMs !== undefined
              ? { request_jitter_ms: parsedJitterMs }
              : {}),
          },
        }
      )
      onCrawlStart(crawl)
      runCrawlDispatch({ type: "STARTED" })
      revalidator.revalidate()
    } catch (error) {
      runCrawlDispatch({
        type: "SET_ERROR",
        error:
          error instanceof Error ? error.message : "Unable to start crawl.",
      })
    }
  }

  return (
    <>
      <CommandDock
        activeCrawls={activeCrawls}
        activeProject={activeProject}
        activeProjectId={activeProjectId}
        auditTab={auditTab}
        cancellingCrawlId={projectActions.cancellingCrawlId}
        compareLabel={compareLabel}
        crawlPanelCrawls={crawlPanelCrawls}
        crawlStatusLabel={crawlStatusLabel}
        currentCrawl={currentCrawl}
        deletingCrawlId={projectActions.deletingCrawlId}
        deletingProjectId={projectActions.deletingProjectId}
        dismissToken={dockDismissToken}
        exportFormat={projectActions.exportFormat}
        exportingCrawlId={projectActions.exportingCrawlId}
        initials={initials}
        isActiveOrganizationOwner={workspaceActions.isActiveOrganizationOwner}
        isAutoCrawlEnabled={autoCrawl.enabled}
        isCrawlRunning={isCrawlRunning}
        isExportingAudit={isExportingAudit}
        isPlatformAdmin={isPlatformAdmin}
        onAuditTabChange={onAuditTabChange}
        onAutoCrawlDisable={() => void autoCrawl.handleDisable()}
        onAutoCrawlEnable={() => void autoCrawl.openDialog()}
        onCancelCrawl={(crawl) => void projectActions.handleCancelCrawl(crawl)}
        onCompareCrawl={onCompareCrawl}
        onCreateProjectOpen={() => createProjectDispatch({ type: "OPEN" })}
        onDeleteCrawl={projectActions.openDeleteCrawlDialog}
        onDeleteProject={projectActions.openDeleteProjectDialog}
        onExportAudit={onExportAudit}
        onExportCrawl={(crawl, format) =>
          void projectActions.handleExportCrawl(crawl, format)
        }
        onExportFormatChange={projectActions.onExportFormatChange}
        onInviteOpen={workspaceActions.openInviteDialog}
        onLeaveWorkspaceOpen={workspaceActions.openLeaveWorkspaceDialog}
        onLogout={() => void workspaceActions.handleLogout()}
        onOpenBusinessProfile={(project) =>
          handleOpenBusinessProfileDrawer(project)
        }
        onProjectHover={handleProjectHover}
        onRunCrawlOpen={() => runCrawlDispatch({ type: "OPEN" })}
        onSelectOrganization={(value) =>
          void workspaceActions.handleSelectOrganization(value)
        }
        onSelectProject={(projectId, crawlId) =>
          handleSelectProject(projectId, crawlId)
        }
        onViewChange={onViewChange}
        organizationId={organizationId}
        organizations={organizations}
        profileActionError={workspaceActions.profileActionError}
        projectActionError={projectActions.projectActionError}
        projects={projects}
        userName={userName}
        view={view}
        workspaceState={workspaceActions.workspaceState}
      />
      <RunCrawlDialog
        activeProject={activeProject}
        activeProjectId={activeProjectId}
        fetchTimeoutSeconds={runCrawl.fetchTimeoutSeconds}
        isCrawlRunning={isCrawlRunning}
        isOpen={runCrawl.isRunCrawlOpen}
        isStartingCrawl={runCrawl.isStartingCrawl}
        maxDepth={runCrawl.maxDepth}
        maxPages={runCrawl.maxPages}
        delayMs={runCrawl.delayMs}
        jitterMs={runCrawl.jitterMs}
        runCrawlError={runCrawl.runCrawlError}
        onFetchTimeoutSecondsChange={(value) =>
          runCrawlDispatch({ type: "SET_FETCH_TIMEOUT", value })
        }
        onMaxDepthChange={(value) =>
          runCrawlDispatch({ type: "SET_MAX_DEPTH", value })
        }
        onMaxPagesChange={(value) =>
          runCrawlDispatch({ type: "SET_MAX_PAGES", value })
        }
        onDelayMsChange={(value) =>
          runCrawlDispatch({ type: "SET_DELAY_MS", value })
        }
        onJitterMsChange={(value) =>
          runCrawlDispatch({ type: "SET_JITTER_MS", value })
        }
        onOpenChange={(open) =>
          runCrawlDispatch(open ? { type: "OPEN" } : { type: "CLOSE" })
        }
        onSubmit={handleRunCrawl}
      />
      <AutoCrawlDialog
        config={autoCrawl.config}
        error={autoCrawl.error}
        isOpen={autoCrawl.isDialogOpen}
        isSaving={autoCrawl.isSaving}
        nextRunAt={autoCrawl.nextRunAt}
        onConfigChange={autoCrawl.setConfig}
        onOpenChange={(open) =>
          open ? void autoCrawl.openDialog() : autoCrawl.closeDialog()
        }
        onSubmit={() => void autoCrawl.handleSaveConfig()}
      />

      <AppNavbarDialogs
        businessProfile={{
          businessProfileProject,
          brandName,
          websiteUrl,
          primaryCategory,
          primaryLocation,
          businessDescription,
          seedPrompts,
          businessProfileError,
          isLoadingBusinessProfile,
          isSavingBusinessProfile,
          canManageBusinessProfile,
          aiQuestions,
          isLoadingAIQuestions,
          isRegeneratingAIQuestions,
          hasUnsavedChanges,
          closeBusinessProfileDrawer,
          updateSeedPrompt,
          handleSaveBusinessProfile,
          setBrandName,
          setWebsiteUrl,
          setPrimaryCategory,
          setPrimaryLocation,
          setBusinessDescription,
        }}
        createProject={createProject}
        createProjectDispatch={createProjectDispatch}
        handleCreateProject={handleCreateProject}
        onDismissDock={dismissDock}
        projectActions={projectActions}
        workspaceActions={workspaceActions}
      />
    </>
  )
})

// --- Dialogs ---

export type AppNavbarDialogsProps = {
  businessProfile: {
    businessProfileProject: ReturnType<
      typeof useBusinessProfile
    >["businessProfileProject"]
    brandName: string
    websiteUrl: string
    primaryCategory: string
    primaryLocation: string
    businessDescription: string
    seedPrompts: string[]
    businessProfileError: string
    isLoadingBusinessProfile: boolean
    isSavingBusinessProfile: boolean
    canManageBusinessProfile: boolean
    aiQuestions: ReturnType<typeof useBusinessProfile>["aiQuestions"]
    isLoadingAIQuestions: boolean
    isRegeneratingAIQuestions: boolean
    hasUnsavedChanges: boolean
    closeBusinessProfileDrawer: () => void
    updateSeedPrompt: (index: number, value: string) => void
    handleSaveBusinessProfile: (
      event: FormEvent<HTMLFormElement>
    ) => Promise<void>
    setBrandName: (v: string) => void
    setWebsiteUrl: (v: string) => void
    setPrimaryCategory: (v: string) => void
    setPrimaryLocation: (v: string) => void
    setBusinessDescription: (v: string) => void
  }
  createProject: CreateProjectState
  createProjectDispatch: React.Dispatch<CreateProjectEvent>
  handleCreateProject: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onDismissDock: () => void
  projectActions: ReturnType<typeof useProjectActions>
  workspaceActions: ReturnType<typeof useWorkspaceActions>
}

export function AppNavbarDialogs({
  businessProfile,
  createProject,
  createProjectDispatch,
  handleCreateProject,
  onDismissDock,
  projectActions,
  workspaceActions,
}: AppNavbarDialogsProps) {
  const {
    businessProfileProject,
    brandName,
    websiteUrl,
    primaryCategory,
    primaryLocation,
    businessDescription,
    seedPrompts,
    businessProfileError,
    isLoadingBusinessProfile,
    isSavingBusinessProfile,
    canManageBusinessProfile,
    aiQuestions,
    isLoadingAIQuestions,
    isRegeneratingAIQuestions,
    hasUnsavedChanges,
    closeBusinessProfileDrawer,
    updateSeedPrompt,
    handleSaveBusinessProfile,
    setBrandName,
    setWebsiteUrl,
    setPrimaryCategory,
    setPrimaryLocation,
    setBusinessDescription,
  } = businessProfile

  return (
    <>
      <BusinessProfileDrawer
        aiQuestions={aiQuestions}
        brandName={brandName}
        businessDescription={businessDescription}
        businessProfileError={businessProfileError}
        businessProfileProject={businessProfileProject}
        canManageBusinessProfile={canManageBusinessProfile}
        hasUnsavedChanges={hasUnsavedChanges}
        isLoadingAIQuestions={isLoadingAIQuestions}
        isLoadingBusinessProfile={isLoadingBusinessProfile}
        isRegeneratingAIQuestions={isRegeneratingAIQuestions}
        isSavingBusinessProfile={isSavingBusinessProfile}
        primaryCategory={primaryCategory}
        primaryLocation={primaryLocation}
        seedPrompts={seedPrompts}
        websiteUrl={websiteUrl}
        onBrandNameChange={setBrandName}
        onBusinessDescriptionChange={setBusinessDescription}
        onClose={closeBusinessProfileDrawer}
        onPrimaryCategoryChange={setPrimaryCategory}
        onPrimaryLocationChange={setPrimaryLocation}
        onSeedPromptChange={updateSeedPrompt}
        onSubmit={handleSaveBusinessProfile}
        onWebsiteUrlChange={setWebsiteUrl}
      />

      <CreateProjectDialog
        createProjectError={createProject.createProjectError}
        isCreatingProject={createProject.isCreatingProject}
        isOpen={createProject.isCreateProjectOpen}
        projectBaseUrl={createProject.projectBaseUrl}
        projectName={createProject.projectName}
        onBaseUrlChange={(value) =>
          createProjectDispatch({ type: "SET_BASE_URL", value })
        }
        onNameChange={(value) =>
          createProjectDispatch({ type: "SET_NAME", value })
        }
        onOpenChange={(open) =>
          createProjectDispatch(open ? { type: "OPEN" } : { type: "CLOSE" })
        }
        onSubmit={handleCreateProject}
      />

      <DeleteProjectDialog
        deletingProjectId={projectActions.deletingProjectId}
        isOpen={projectActions.isDeleteProjectOpen}
        projectActionError={projectActions.projectActionError}
        projectPendingDelete={projectActions.projectPendingDelete}
        onDelete={() => {
          onDismissDock()
          void projectActions.handleDeleteProject()
        }}
        onOpenChange={(open) => {
          if (!open) projectActions.closeDialog()
        }}
      />

      <DeleteCrawlDialog
        crawlPendingDelete={projectActions.crawlPendingDelete}
        deletingCrawlId={projectActions.deletingCrawlId}
        isOpen={projectActions.isDeleteCrawlOpen}
        projectActionError={projectActions.projectActionError}
        onDelete={() => void projectActions.handleDeleteCrawl()}
        onOpenChange={(open) => {
          if (!open) projectActions.closeDialog()
        }}
      />

      <InviteMembersDialog
        activeOrganizationName={workspaceActions.activeOrganization?.name}
        hasCopiedInviteLink={workspaceActions.hasCopiedInviteLink}
        inviteExpiresAt={workspaceActions.inviteExpiresAt}
        inviteLink={workspaceActions.inviteLink}
        inviteMaxUses={workspaceActions.inviteMaxUses}
        isCreatingInvite={workspaceActions.isCreatingInvite}
        isOpen={workspaceActions.isInviteDialogOpen}
        profileActionError={workspaceActions.profileActionError}
        onCopyInviteLink={() => void workspaceActions.handleCopyInviteLink()}
        onExpiresAtChange={workspaceActions.setInviteExpiresAt}
        onMaxUsesChange={workspaceActions.setInviteMaxUses}
        onOpenChange={workspaceActions.closeInviteDialog}
        onSubmit={workspaceActions.handleCreateInvite}
      />

      <LeaveWorkspaceDialog
        activeOrganizationName={workspaceActions.activeOrganization?.name}
        isLeavingWorkspace={workspaceActions.workspaceState === "leaving"}
        isOpen={workspaceActions.isLeaveWorkspaceOpen}
        profileActionError={workspaceActions.profileActionError}
        onLeave={() => void workspaceActions.handleLeaveOrganization()}
        onOpenChange={workspaceActions.setLeaveWorkspaceOpen}
      />
    </>
  )
}

export type { AppNavbarProps, DashboardView }
