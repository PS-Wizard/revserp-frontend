"use client"

import { useMemo, useReducer, useState } from "react"
import type { FormEvent } from "react"
import { useLocation, useNavigate, useRevalidator } from "react-router"
import {
  Building2Icon,
  ChevronsUpDownIcon,
  DownloadIcon,
  PlayIcon,
  SearchIcon,
} from "lucide-react"
import { CompileLoader } from "~/components/compile-loader"

import { BusinessProfileDrawer } from "~/components/app-navbar/business-profile-drawer"
import {
  CreateProjectDialog,
  DeleteCrawlDialog,
  DeleteProjectDialog,
  InviteMembersDialog,
  LeaveWorkspaceDialog,
} from "~/components/app-navbar/dialogs"
import { ProfileMenu } from "~/components/app-navbar/profile-menu"
import { ProjectPickerDialog } from "~/components/app-navbar/project-picker-dialog"
import { RunCrawlDialog } from "~/components/app-navbar/run-crawl-dialog"
import { AiConversationsPopover } from "~/components/app-navbar/ai-conversations-popover"
import { useBusinessProfile } from "~/components/app-navbar/use-business-profile"
import { useProjectActions } from "~/components/app-navbar/use-project-actions"
import { useWorkspaceActions } from "~/components/app-navbar/use-workspace-actions"
import type {
  AppNavbarProps,
  DashboardView,
} from "~/components/app-navbar/types"
import {
  formatCrawlDateTime,
  getCrawlValidationError,
  getInitials,
} from "~/components/app-navbar/utils"
import { getCrawlTimestamp } from "~/lib/crawl"
import { Button } from "~/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { clientApiPost } from "~/lib/api"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"

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
  fetchTimeoutSeconds: "10",
  runCrawlError: "",
  isStartingCrawl: false,
}

// --- Component ---

export function AppNavbar({
  activeProjectId,
  currentCrawl,
  projectCrawls,
  isCrawlRunning,
  crawlStatusLabel,
  onCrawlStart,
  organizationId,
  organizations,
  projects,
  userEmail,
  userName,
  view,
  onViewChange,
  onSelectConversation,
  onDeleteConversation,
  isPlatformAdmin,
}: AppNavbarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const revalidator = useRevalidator()

  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false)

  const projectActions = useProjectActions({
    projects,
    activeProjectId,
    location,
    navigate,
    revalidator,
  })

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
    ? [...(projectCrawls[crawlPanelProject.id] ?? [])].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      )
    : []

  const activeCrawls = activeProject
    ? [...(projectCrawls[activeProject.id] ?? [])].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      )
    : []

  function handleSelectProject(projectId: string, crawlId?: string) {
    setIsProjectMenuOpen(false)

    const searchParams = new URLSearchParams(location.search)
    searchParams.set("project", projectId)
    if (crawlId) {
      searchParams.set("crawl", crawlId)
    } else {
      searchParams.delete("crawl")
    }

    void navigate(`${location.pathname}?${searchParams.toString()}`)
  }

  function handleOpenBusinessProfileDrawer(project: ProjectResponse) {
    openBusinessProfileDrawer(project)
    setIsProjectMenuOpen(false)
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
      setIsProjectMenuOpen(false)

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
      await clientApiPost<CrawlResponse>(
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
      onCrawlStart()
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
      <header className="w-full">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 py-4">
          <div className="flex min-w-0 items-center">
            <Tabs
              onValueChange={(value) => onViewChange(value as DashboardView)}
              value={view}
            >
              <TabsList>
                <TabsTrigger value="revserp-audit">Revserp Audit</TabsTrigger>
                <TabsTrigger value="search-console">Search Console</TabsTrigger>
                <AiConversationsPopover
                  activeProjectId={activeProjectId}
                  onViewChange={onViewChange}
                  onSelectConversation={onSelectConversation}
                  onDeleteConversation={onDeleteConversation}
                />
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              className="w-72 justify-between"
              onClick={() => setIsProjectMenuOpen(true)}
              variant="outline"
            >
              <span className="flex min-w-0 items-center gap-2 truncate">
                <SearchIcon data-icon="inline-start" />
                <span className="truncate">
                  {activeProject?.name || "Search projects"}
                </span>
              </span>
              <ChevronsUpDownIcon data-icon="inline-end" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                {isCrawlRunning ? (
                  <CompileLoader className="text-foreground" size={18} />
                ) : null}
                {isCrawlRunning
                  ? crawlStatusLabel === "queued"
                    ? "Queued"
                    : "Crawling"
                  : "Run Crawl"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!activeProjectId || isCrawlRunning}
                    onClick={() => runCrawlDispatch({ type: "OPEN" })}
                  >
                    <PlayIcon />
                    Run Crawl
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!activeProject}
                    onClick={() =>
                      activeProject &&
                      handleOpenBusinessProfileDrawer(activeProject)
                    }
                  >
                    <Building2Icon />
                    Business Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger
                      disabled={activeCrawls.length === 0}
                    >
                      <DownloadIcon />
                      Export Crawl
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52">
                      {activeCrawls.length === 0 ? (
                        <DropdownMenuItem disabled>
                          No crawls available
                        </DropdownMenuItem>
                      ) : (
                        activeCrawls.map((crawl) => (
                          <DropdownMenuSub key={crawl.id}>
                            <DropdownMenuSubTrigger
                              disabled={
                                crawl.status !== "completed" ||
                                projectActions.exportingCrawlId !== null
                              }
                            >
                              <span className="truncate">
                                {formatCrawlDateTime(crawl)}
                              </span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-24">
                              <DropdownMenuItem
                                disabled={
                                  crawl.status !== "completed" ||
                                  projectActions.exportingCrawlId !== null
                                }
                                onClick={() => {
                                  void projectActions.handleExportCrawl(
                                    crawl,
                                    "xlsx"
                                  )
                                }}
                              >
                                XLSX
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={
                                  crawl.status !== "completed" ||
                                  projectActions.exportingCrawlId !== null
                                }
                                onClick={() => {
                                  void projectActions.handleExportCrawl(
                                    crawl,
                                    "csv"
                                  )
                                }}
                              >
                                CSV
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        ))
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex justify-end">
            <ProfileMenu
              initials={initials}
              isActiveOrganizationOwner={
                workspaceActions.isActiveOrganizationOwner
              }
              workspaceState={workspaceActions.workspaceState}
              organizationId={organizationId}
              organizations={organizations}
              profileActionError={workspaceActions.profileActionError}
              userName={userName}
              isPlatformAdmin={isPlatformAdmin}
              onInviteOpen={workspaceActions.openInviteDialog}
              onLeaveWorkspaceOpen={workspaceActions.openLeaveWorkspaceDialog}
              onLogout={() => void workspaceActions.handleLogout()}
              onSelectOrganization={(value) =>
                void workspaceActions.handleSelectOrganization(value)
              }
            />
          </div>
        </div>
      </header>
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

      <AppNavbarDialogs
        activeProjectId={activeProjectId}
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
          closeBusinessProfileDrawer,
          updateSeedPrompt,
          handleSaveBusinessProfile,
          setBrandName,
          setWebsiteUrl,
          setPrimaryCategory,
          setPrimaryLocation,
          setBusinessDescription,
        }}
        crawlPanelCrawls={crawlPanelCrawls}
        createProject={createProject}
        createProjectDispatch={createProjectDispatch}
        currentCrawl={currentCrawl}
        handleCreateProject={handleCreateProject}
        handleOpenBusinessProfileDrawer={handleOpenBusinessProfileDrawer}
        handleSelectProject={handleSelectProject}
        isProjectMenuOpen={isProjectMenuOpen}
        projectActions={projectActions}
        projects={projects}
        setIsProjectMenuOpen={setIsProjectMenuOpen}
        workspaceActions={workspaceActions}
      />
    </>
  )
}

// --- Dialogs ---

type AppNavbarDialogsProps = {
  activeProjectId: AppNavbarProps["activeProjectId"]
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
  crawlPanelCrawls: CrawlResponse[]
  createProject: CreateProjectState
  createProjectDispatch: React.Dispatch<CreateProjectEvent>
  currentCrawl: AppNavbarProps["currentCrawl"]
  handleCreateProject: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleOpenBusinessProfileDrawer: (project: ProjectResponse) => void
  handleSelectProject: (projectId: string, crawlId?: string) => void
  isProjectMenuOpen: boolean
  projectActions: ReturnType<typeof useProjectActions>
  projects: AppNavbarProps["projects"]
  setIsProjectMenuOpen: (v: boolean) => void
  workspaceActions: ReturnType<typeof useWorkspaceActions>
}

function AppNavbarDialogs({
  activeProjectId,
  businessProfile,
  crawlPanelCrawls,
  createProject,
  createProjectDispatch,
  currentCrawl,
  handleCreateProject,
  handleOpenBusinessProfileDrawer,
  handleSelectProject,
  isProjectMenuOpen,
  projectActions,
  projects,
  setIsProjectMenuOpen,
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
      <ProjectPickerDialog
        activeProjectId={activeProjectId}
        crawlPanelCrawls={crawlPanelCrawls}
        currentCrawl={currentCrawl}
        cancellingCrawlId={projectActions.cancellingCrawlId}
        deletingCrawlId={projectActions.deletingCrawlId}
        deletingProjectId={projectActions.deletingProjectId}
        exportFormat={projectActions.exportFormat}
        exportingCrawlId={projectActions.exportingCrawlId}
        isOpen={isProjectMenuOpen}
        projectActionError={projectActions.projectActionError}
        projects={projects}
        onCancelCrawl={(crawl) => void projectActions.handleCancelCrawl(crawl)}
        onCreateProjectOpen={() => createProjectDispatch({ type: "OPEN" })}
        onDeleteCrawl={projectActions.openDeleteCrawlDialog}
        onDeleteProject={projectActions.openDeleteProjectDialog}
        onExportCrawl={(crawl, format) =>
          void projectActions.handleExportCrawl(crawl, format)
        }
        onExportFormatChange={projectActions.onExportFormatChange}
        onOpenBusinessProfile={(project) =>
          void handleOpenBusinessProfileDrawer(project)
        }
        onOpenChange={setIsProjectMenuOpen}
        onProjectHover={projectActions.onProjectHover}
        onSelectProject={(projectId, crawlId) =>
          void handleSelectProject(projectId, crawlId)
        }
      />

      <BusinessProfileDrawer
        brandName={brandName}
        businessDescription={businessDescription}
        businessProfileError={businessProfileError}
        businessProfileProject={businessProfileProject}
        canManageBusinessProfile={canManageBusinessProfile}
        isLoadingBusinessProfile={isLoadingBusinessProfile}
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
          setIsProjectMenuOpen(false)
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

export type { DashboardView }
