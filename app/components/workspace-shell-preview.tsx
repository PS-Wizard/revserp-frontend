"use client"

import type { CSSProperties, FormEvent, ReactNode } from "react"
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import { useLocation, useNavigate, useRevalidator } from "react-router"
import {
  Building2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderPlusIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react"

import { AppNavbarDialogs, type AppNavbarProps } from "~/components/app-navbar"
import { AutoCrawlDialog } from "~/components/app-navbar/auto-crawl-dialog"
import { ProfileMenu } from "~/components/app-navbar/profile-menu"
import { WorkspaceSwitcher } from "~/components/app-navbar/workspace-switcher"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar"
import { RunCrawlDialog } from "~/components/app-navbar/run-crawl-dialog"
import { useAutoCrawlSettings } from "~/components/app-navbar/use-auto-crawl-settings"
import { useBusinessProfile } from "~/components/app-navbar/use-business-profile"
import { useProjectActions } from "~/components/app-navbar/use-project-actions"
import { useWorkspaceActions } from "~/components/app-navbar/use-workspace-actions"
import {
  formatCrawlDateTime,
  getCrawlValidationError,
  getInitials,
} from "~/components/app-navbar/utils"
import { ProjectPanelOpenContext } from "~/components/summary/project-panel-context"
import { ProjectPanel } from "~/components/command-dock/project-panel"
import { PageEditor } from "~/components/editor/page-editor"
import {
  DynamicIslandDockedChrome,
  DynamicIslandPanel,
  islandTransition,
} from "~/components/dynamic-island-poc"
import { focusRevbotPrompt } from "~/components/revbot/revbot-composer"
import {
  RevbotStartPromptContext,
  type RevbotStartPromptOptions,
} from "~/components/revbot/revbot-start-prompt-context"
import { RevbotViewContent } from "~/components/revbot/revbot-view"
import { useRevbot } from "~/components/revbot/use-revbot"
import {
  PageAuditContext,
  type SelectedAuditPage,
} from "~/components/page-audit/page-audit-context"
import { getCrawlTimestamp } from "~/lib/crawl"
import { ApiError, clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  CrawlResponse,
  CrawlsResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { useFeatures } from "~/lib/features"
import { toast } from "sonner"
import { WorkspaceDockNav } from "~/components/workspace-dock-nav"

type CreateProjectState = {
  isOpen: boolean
  name: string
  baseUrl: string
  error: string
  creating: boolean
}
type CreateProjectEvent =
  | { type: "OPEN" | "CLOSE" | "CREATING" | "CREATED" }
  | { type: "NAME" | "BASE_URL" | "ERROR"; value: string }

function createProjectReducer(
  state: CreateProjectState,
  event: CreateProjectEvent
): CreateProjectState {
  switch (event.type) {
    case "OPEN":
      return { ...state, isOpen: true, error: "" }
    case "CLOSE":
      return { ...state, isOpen: false }
    case "NAME":
      return { ...state, name: event.value }
    case "BASE_URL":
      return { ...state, baseUrl: event.value }
    case "ERROR":
      return { ...state, error: event.value, creating: false }
    case "CREATING":
      return { ...state, creating: true, error: "" }
    case "CREATED":
      return {
        isOpen: false,
        name: "",
        baseUrl: "",
        error: "",
        creating: false,
      }
  }
}

type RunCrawlState = {
  isOpen: boolean
  forceFullCrawl: boolean
  honourRobotsTxt: boolean
  renderJavaScript: boolean
  maxDepth: string
  maxPages: string
  delayMs: string
  jitterMs: string
  fetchTimeoutSeconds: string
  error: string
  starting: boolean
}
type RunCrawlEvent =
  | { type: "OPEN" | "CLOSE" | "STARTING" | "STARTED" }
  | {
      type: "FORCE_FULL_CRAWL" | "HONOUR_ROBOTS_TXT" | "RENDER_JAVASCRIPT"
      value: boolean
    }
  | {
      type:
        | "MAX_DEPTH"
        | "MAX_PAGES"
        | "DELAY_MS"
        | "JITTER_MS"
        | "FETCH_TIMEOUT"
        | "ERROR"
      value: string
    }

function runCrawlReducer(
  state: RunCrawlState,
  event: RunCrawlEvent
): RunCrawlState {
  switch (event.type) {
    case "OPEN":
      return { ...state, isOpen: true, error: "" }
    case "CLOSE":
      return { ...state, isOpen: false }
    case "FORCE_FULL_CRAWL":
      return { ...state, forceFullCrawl: event.value }
    case "HONOUR_ROBOTS_TXT":
      return { ...state, honourRobotsTxt: event.value }
    case "RENDER_JAVASCRIPT":
      return { ...state, renderJavaScript: event.value }
    case "MAX_DEPTH":
      return { ...state, maxDepth: event.value }
    case "MAX_PAGES":
      return { ...state, maxPages: event.value }
    case "DELAY_MS":
      return { ...state, delayMs: event.value }
    case "JITTER_MS":
      return { ...state, jitterMs: event.value }
    case "FETCH_TIMEOUT":
      return { ...state, fetchTimeoutSeconds: event.value }
    case "ERROR":
      return { ...state, error: event.value, starting: false }
    case "STARTING":
      return { ...state, starting: true, error: "" }
    case "STARTED":
      return {
        ...state,
        starting: false,
        isOpen: false,
        forceFullCrawl: false,
        honourRobotsTxt: false,
        renderJavaScript: false,
      }
  }
}

const initialCreateProjectState: CreateProjectState = {
  isOpen: false,
  name: "",
  baseUrl: "",
  error: "",
  creating: false,
}
const initialRunCrawlState: RunCrawlState = {
  isOpen: false,
  forceFullCrawl: false,
  honourRobotsTxt: false,
  renderJavaScript: false,
  maxDepth: "5",
  maxPages: "",
  delayMs: "",
  jitterMs: "",
  fetchTimeoutSeconds: "60",
  error: "",
  starting: false,
}

/** Insights fills the navbar center while a competitor comparison is open. */
export const SetInsightsNavbarLabel = createContext<
  (label: { you: string; them: string } | null) => void
>(() => {})

/** Full application-shell contract; the route owns all loader data and view state. */
export type WorkspaceShellPreviewProps = AppNavbarProps & {
  children: ReactNode
  revbotConversationId: string | null
  onRevbotConversationChange: (conversationId: string | null) => void
}

export function WorkspaceShellPreview({
  children,
  activeProjectId,
  currentCrawl,
  projectCrawls,
  isCrawlRunning,
  crawlStatusLabel,
  onCrawlStart,
  onCompareCrawl,
  organizationId,
  organizations,
  projects,
  userEmail,
  userName,
  view,
  onViewChange,
  revbotConversationId,
  onRevbotConversationChange,
  auditTab,
  onAuditTabChange,
  onExportAudit,
  isPlatformAdmin,
  isExportingAudit,
}: WorkspaceShellPreviewProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const revalidator = useRevalidator()
  const features = useFeatures()
  const [islandState, setIslandState] = useState<
    "docked" | "minimized" | "maximized"
  >("docked")
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isIslandThinking, setIsIslandThinking] = useState(false)
  const [islandConversationTitle, setIslandConversationTitle] =
    useState("New chat")
  const [isProjectPanelOpen, setIsProjectPanelOpen] = useState(false)
  const [selectedAuditPage, setSelectedAuditPage] =
    useState<SelectedAuditPage | null>(null)
  const [, setInsightsNavbarLabel] = useState<{
    you: string
    them: string
  } | null>(null)
  // Stable opener handed to in-shell views (summary greeting) through context.
  const openProjectPanel = useCallback(() => setIsProjectPanelOpen(true), [])
  const [createProject, createProjectDispatch] = useReducer(
    createProjectReducer,
    initialCreateProjectState
  )
  const [runCrawl, runCrawlDispatch] = useReducer(
    runCrawlReducer,
    initialRunCrawlState
  )
  const fetchedProjectCrawls = useRef<Record<string, CrawlResponse[]>>({})
  const fetchingProjectIds = useRef(new Set<string>())
  const [, setFetchedCrawlsVersion] = useState(0)
  const shouldReduceMotion = useReducedMotion() ?? false
  const workspaceContentKey = view
  const islandMorphTransition = islandTransition(shouldReduceMotion)
  const pendingIslandPromptFocusRef = useRef(false)

  useEffect(() => {
    setSelectedAuditPage(null)
  }, [activeProjectId, currentCrawl?.id])

  useEffect(() => {
    if (view !== "competitors") setInsightsNavbarLabel(null)
  }, [view])

  const pageAuditValue = useMemo(
    () => ({
      selectedPage: selectedAuditPage,
      setSelectedPage: setSelectedAuditPage,
    }),
    [selectedAuditPage]
  )

  function focusIslandRevbotPrompt() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const panel = document.querySelector(
          '[role="dialog"][aria-label="Revbot"]'
        )
        focusRevbotPrompt(panel)
      })
    })
  }

  function openIsland() {
    setIslandState("minimized")
  }

  function minimizeIsland() {
    setIslandState("minimized")
  }

  function maximizeIsland() {
    setIslandState("maximized")
  }

  function dockIsland() {
    setIslandState("docked")
  }

  function handleRevbotInternalLink(hash: string) {
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash,
      },
      { replace: true }
    )
  }

  function handleRevbotEditorLink(url: string) {
    const params = new URLSearchParams(location.search)
    params.set("editorUrl", url)
    if (!params.has("crawl") && currentCrawl?.id) {
      params.set("crawl", currentCrawl.id)
    }
    navigate({
      pathname: location.pathname,
      search: params.toString(),
      hash: location.hash,
    })
  }

  useEffect(() => {
    if (!features.ai_chat) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && islandState !== "docked") {
        if (islandState === "maximized") minimizeIsland()
        else dockIsland()
        return
      }

      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "k" ||
        event.repeat
      ) {
        return
      }

      event.preventDefault()

      // Ctrl+K is "expand + focus". Keep the stepwise expansion chain
      // (docked -> minimized -> maximized) from the original shortcut:
      // the second press must still expand further instead of being
      // swallowed by a focus-only path. The focus request is consumed by
      // the effect below after the expansion commits, so the focus never
      // fires mid-morph or in place of an expansion.
      if (islandState === "docked") {
        pendingIslandPromptFocusRef.current = true
        openIsland()
        return
      }

      if (islandState === "minimized") {
        pendingIslandPromptFocusRef.current = true
        maximizeIsland()
        return
      }

      // Maximized: no further expansion, just focus.
      focusIslandRevbotPrompt()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [features.ai_chat, islandState])

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ??
    projects[0] ??
    null

  useEffect(() => {
    if (!features.ai_chat || islandState === "docked") return
    if (!pendingIslandPromptFocusRef.current) return

    pendingIslandPromptFocusRef.current = false
    focusIslandRevbotPrompt()
  }, [features.ai_chat, islandState, activeProject?.id])

  const islandRevbot = useRevbot({
    activeProject,
    allowedEfforts: features.ai_allowed_reasoning_efforts,
    onConversationChange: onRevbotConversationChange,
    requestedConversationId: revbotConversationId,
  })
  const { newChat: startNewRevbotChat, send: sendRevbotMessage } = islandRevbot
  const startRevbotPrompt = useCallback(
    (content: string, options?: RevbotStartPromptOptions) => {
      startNewRevbotChat()
      if (!options?.keepDocked) {
        setIslandState("minimized")
      }
      void sendRevbotMessage(content)
    },
    [sendRevbotMessage, startNewRevbotChat]
  )
  const isRevbotTurnActive =
    islandRevbot.status === "queued" || islandRevbot.status === "running"
  const revbotStartPromptValue = useMemo(
    () => ({
      startPrompt: startRevbotPrompt,
      isActive: isRevbotTurnActive,
    }),
    [isRevbotTurnActive, startRevbotPrompt]
  )
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
  const autoCrawl = useAutoCrawlSettings(activeProjectId)
  const businessProfile = useBusinessProfile()
  const initials = useMemo(() => {
    const source = userName?.trim() || userEmail.split("@")[0] || "R"
    return getInitials(source, "R")
  }, [userEmail, userName])
  const mergedProjectCrawls = {
    ...fetchedProjectCrawls.current,
    ...projectCrawls,
  }
  const crawlPanelProject =
    projects.find(
      (project) => project.id === projectActions.hoveredProjectId
    ) ?? activeProject
  const crawlPanelCrawls = crawlPanelProject
    ? [...(mergedProjectCrawls[crawlPanelProject.id] ?? [])].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      )
    : []
  const activeProjectCrawls = activeProject
    ? [...(mergedProjectCrawls[activeProject.id] ?? [])].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      )
    : []
  const currentCrawlCompleted = currentCrawl?.status === "completed"
  const isExportingCrawl = projectActions.exportingCrawlId !== null

  function selectProject(projectId: string, crawlId?: string) {
    const params = new URLSearchParams(location.search)
    params.set("project", projectId)
    if (projectId !== activeProjectId) params.delete("revbotConversation")
    if (crawlId) params.set("crawl", crawlId)
    else params.delete("crawl")
    void navigate(`${location.pathname}?${params.toString()}`)
  }

  function selectCrawl(crawlId: string) {
    const params = new URLSearchParams(location.search)
    params.set("crawl", crawlId)
    onViewChange("revserp-audit")
    onAuditTabChange("overview")
    void navigate(`${location.pathname}?${params.toString()}`)
  }

  function hoverProject(projectId: string | null) {
    projectActions.onProjectHover(projectId)
    if (
      !projectId ||
      projectId === activeProjectId ||
      mergedProjectCrawls[projectId] ||
      fetchingProjectIds.current.has(projectId)
    )
      return
    fetchingProjectIds.current.add(projectId)
    void clientApiFetch<CrawlsResponse>(
      `/projects/${projectId}/crawls?limit=50&offset=0`
    )
      .then((response) => {
        fetchedProjectCrawls.current[projectId] = response.crawls
        setFetchedCrawlsVersion((version) => version + 1)
      })
      .finally(() => fetchingProjectIds.current.delete(projectId))
  }

  function selectWorkspace(
    nextView: typeof view,
    nextAuditTab?: typeof auditTab
  ) {
    onViewChange(nextView)
    if (nextAuditTab !== undefined) onAuditTabChange(nextAuditTab)
    setIsMobileSidebarOpen(false)
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (createProject.creating) return
    const name = createProject.name.trim()
    const baseUrl = createProject.baseUrl.trim()
    if (!name || !baseUrl) {
      createProjectDispatch({
        type: "ERROR",
        value: "Project name and base URL are required.",
      })
      return
    }
    createProjectDispatch({ type: "CREATING" })
    try {
      const project = await clientApiPost<ProjectResponse>(
        `/organizations/${organizationId}/projects`,
        { name, base_url: baseUrl }
      )
      createProjectDispatch({ type: "CREATED" })
      selectProject(project.id)
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.message === "project_limit_reached"
      ) {
        createProjectDispatch({ type: "CREATED" })
        toast.error("You have exceeded your project limit. Please contact us.")
        return
      }
      createProjectDispatch({
        type: "ERROR",
        value:
          error instanceof Error ? error.message : "Unable to create project.",
      })
    }
  }

  async function handleRunCrawl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeProjectId || runCrawl.starting || isCrawlRunning) return
    const maxDepth = Number(runCrawl.maxDepth)
    const fetchTimeoutSeconds = Number(runCrawl.fetchTimeoutSeconds)
    const validationError = getCrawlValidationError(
      maxDepth,
      fetchTimeoutSeconds
    )
    if (validationError) {
      runCrawlDispatch({ type: "ERROR", value: validationError })
      return
    }
    const optionalPositiveInteger = (value: string, label: string) => {
      if (!value.trim()) return undefined
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(
          `${label} must be a positive whole number, or left blank.`
        )
      }
      return parsed
    }
    try {
      const maxPages = optionalPositiveInteger(runCrawl.maxPages, "Max pages")
      const delayMs = optionalPositiveInteger(runCrawl.delayMs, "Delay")
      const jitterMs = optionalPositiveInteger(runCrawl.jitterMs, "Jitter")
      runCrawlDispatch({ type: "STARTING" })
      const crawl = await clientApiPost<CrawlResponse>(
        `/projects/${activeProjectId}/crawls`,
        {
          config_snapshot: {
            max_depth: maxDepth,
            fetch_timeout_seconds: fetchTimeoutSeconds,
            force_full_crawl: runCrawl.forceFullCrawl,
            honour_robots_txt: runCrawl.honourRobotsTxt,
            render_javascript: runCrawl.renderJavaScript,
            ...(maxPages === undefined ? {} : { max_pages: maxPages }),
            ...(delayMs === undefined ? {} : { request_delay_ms: delayMs }),
            ...(jitterMs === undefined ? {} : { request_jitter_ms: jitterMs }),
          },
        }
      )
      onCrawlStart(crawl)
      runCrawlDispatch({ type: "STARTED" })
      revalidator.revalidate()
    } catch (error) {
      runCrawlDispatch({
        type: "ERROR",
        value:
          error instanceof Error ? error.message : "Unable to start crawl.",
      })
    }
  }

  return (
    <SetInsightsNavbarLabel.Provider value={setInsightsNavbarLabel}>
      <LayoutGroup id="workspace-preview">
        <SidebarProvider
          className="relative h-svh min-h-0 bg-background text-foreground"
          openMobile={isMobileSidebarOpen}
          onOpenMobileChange={setIsMobileSidebarOpen}
          style={{ "--sidebar-width": "4rem" } as CSSProperties}
        >
          <motion.main className="relative h-full min-h-0 w-full" layoutRoot>
            <div className="relative flex h-full min-h-0 bg-shell-chrome">
            <section className="relative ml-0 flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden md:pt-16">
              <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 px-4 md:hidden">
                <SidebarTrigger aria-label="Open navigation" />
                <button
                  className="inline-flex min-w-0 items-center rounded-md px-1 py-0.5 text-sm font-semibold text-foreground"
                  onClick={openProjectPanel}
                  type="button"
                >
                  <span className="truncate">
                    {activeProject?.name ?? "Select a project"}
                  </span>
                </button>
              </header>
              <div
                className={
                  islandState === "maximized"
? "pointer-events-none relative z-0 flex min-h-0 flex-1 scrollbar-gutter-stable flex-col overflow-y-auto bg-background"
: "min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto bg-background"
                }
              >
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    animate={{ opacity: 1 }}
                    className="flex min-h-full flex-col"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key={workspaceContentKey}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.15,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <RevbotStartPromptContext.Provider
                      value={features.ai_chat ? revbotStartPromptValue : null}
                    >
                      <PageAuditContext.Provider value={pageAuditValue}>
                        <ProjectPanelOpenContext.Provider
                          value={openProjectPanel}
                        >
                          {projects.length === 0 ? (
                            <div className="flex flex-1 items-center justify-center px-4 py-16 lg:px-6">
                              <Empty className="border-0">
                                <EmptyHeader>
                                  <EmptyMedia
                                    className="size-16 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-8"
                                    variant="icon"
                                  >
                                    <FolderPlusIcon aria-hidden="true" />
                                  </EmptyMedia>
                                  <EmptyTitle
                                    aria-level={2}
                                    className="text-2xl"
                                    role="heading"
                                  >
                                    Start with a project
                                  </EmptyTitle>
                                  <EmptyDescription>
                                    Add a website. Then set up its crawl and
                                    business profile.
                                  </EmptyDescription>
                                </EmptyHeader>
                                <EmptyContent>
                                  <Button
                                    onClick={() =>
                                      createProjectDispatch({ type: "OPEN" })
                                    }
                                    type="button"
                                  >
                                    <PlusIcon
                                      aria-hidden="true"
                                      data-icon="inline-start"
                                    />
                                    Create project
                                  </Button>
                                </EmptyContent>
                              </Empty>
                            </div>
                          ) : (
                            children
                          )}
                        </ProjectPanelOpenContext.Provider>
                      </PageAuditContext.Provider>
                    </RevbotStartPromptContext.Provider>
                  </motion.div>
                </AnimatePresence>
              </div>
            </section>
            </div>
            <div className="fixed inset-x-0 top-2 z-40 flex h-14 items-center gap-2 bg-shell-chrome px-3 text-foreground backdrop-blur-xl max-md:hidden">
              <div className="flex min-w-0 flex-1 items-center">
                <WorkspaceSwitcher
                  activeOrganizationName={
                    workspaceActions.activeOrganization?.name
                  }
                  isActiveOrganizationOwner={
                    workspaceActions.isActiveOrganizationOwner
                  }
                  onInviteOpen={workspaceActions.openInviteDialog}
                  onLeaveWorkspaceOpen={
                    workspaceActions.openLeaveWorkspaceDialog
                  }
                  onSelectOrganization={(id) =>
                    void workspaceActions.handleSelectOrganization(id)
                  }
                  organizationId={organizationId}
                  organizations={organizations}
                  workspaceState={workspaceActions.workspaceState}
                />
              </div>
              <div className="flex min-w-0 shrink items-center justify-center">
                <div className="flex max-w-full min-w-0 items-center overflow-hidden rounded-xl border border-white/12 bg-shell-chrome p-1">
                  <WorkspaceDockNav
                    activeProjectId={activeProjectId ?? undefined}
                    auditTab={auditTab}
                    crawls={activeProjectCrawls}
                    currentCrawl={currentCrawl}
                    formatCrawlLabel={formatCrawlDateTime}
                    gscConnector={features.gsc_connector}
                    integrations={features.integrations !== false}
                    maxCompetitors={features.max_competitors}
                    onCreateProject={() =>
                      createProjectDispatch({ type: "OPEN" })
                    }
                    onDeleteCrawl={(crawl) =>
                      projectActions.openDeleteCrawlDialog(crawl)
                    }
                    onDeleteProject={(project) =>
                      projectActions.openDeleteProjectDialog(project)
                    }
                    onExportCrawl={(crawl, format) =>
                      void projectActions.handleExportCrawl(crawl, format)
                    }
                    onOpenProjectPanel={openProjectPanel}
                    onSelectCrawl={selectCrawl}
                    onSelectProject={selectProject}
                    onSelectWorkspace={selectWorkspace}
                    projects={projects}
                    trailing={
                      <button
                        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/12 px-3 text-sm font-medium transition-colors duration-150 hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-40"
                        disabled={!activeProject || isCrawlRunning}
                        onClick={() => runCrawlDispatch({ type: "OPEN" })}
                        type="button"
                      >
                        <PlayIcon aria-hidden="true" className="size-4" />
                        {isCrawlRunning ? crawlStatusLabel : "Run crawl"}
                      </button>
                    }
                    view={view}
                    actions={[
                      {
                        key: "auto-crawl",
                        icon: <SparklesIcon aria-hidden="true" className="size-4" />,
                        disabled: !activeProject || autoCrawl.isSaving,
                        label: autoCrawl.enabled ? "Auto crawl on" : "Auto crawl",
                        onSelect: () =>
                          autoCrawl.enabled
                            ? void autoCrawl.handleDisable()
                            : void autoCrawl.openDialog(),
                      },
                      ...(features.integrations !== false
                        ? [
                            {
                              key: "integrations",
                              icon: (
                                <SettingsIcon
                                  aria-hidden="true"
                                  className="size-4"
                                />
                              ),
                              label: "Integrations",
                              onSelect: () =>
                                navigate("/app/settings/integrations"),
                            },
                          ]
                        : []),
                      {
                        key: "business-profile",
                        icon: (
                          <Building2Icon aria-hidden="true" className="size-4" />
                        ),
                        disabled: !activeProject,
                        label: "Business profile",
                        onSelect: () => {
                          if (activeProject)
                            businessProfile.openBusinessProfileDrawer(activeProject)
                        },
                      },
                      { key: "d1", divider: true },
                      {
                        key: "export-pdf",
                        icon: <FileTextIcon aria-hidden="true" className="size-4" />,
                        disabled: !currentCrawlCompleted || isExportingAudit,
                        label: isExportingAudit
                          ? "Generating audit…"
                          : "Export PDF audit",
                        onSelect: onExportAudit,
                      },
                      {
                        key: "export-xlsx",
                        icon: (
                          <FileSpreadsheetIcon aria-hidden="true" className="size-4" />
                        ),
                        disabled: !currentCrawlCompleted || isExportingCrawl,
                        label: "Export crawl as XLSX",
                        onSelect: () => {
                          if (currentCrawl)
                            void projectActions.handleExportCrawl(
                              currentCrawl,
                              "xlsx"
                            )
                        },
                      },
                      {
                        key: "export-csv",
                        icon: (
                          <FileSpreadsheetIcon aria-hidden="true" className="size-4" />
                        ),
                        disabled: !currentCrawlCompleted || isExportingCrawl,
                        label: "Export crawl as CSV",
                        onSelect: () => {
                          if (currentCrawl)
                            void projectActions.handleExportCrawl(
                              currentCrawl,
                              "csv"
                            )
                        },
                      },
                    ]}
                  />
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-end">
                <ProfileMenu
                  initials={initials}
                  isPlatformAdmin={isPlatformAdmin}
                  onLogout={() => void workspaceActions.handleLogout()}
                  profileActionError={workspaceActions.profileActionError}
                  userName={userName}
                  workspaceState={workspaceActions.workspaceState}
                />
              </div>
            </div>
            {features.ai_chat ? (
              <LayoutGroup id="ai-island-group">
                {islandState === "docked" ? (
                  <DynamicIslandDockedChrome
                    active={isIslandThinking || isRevbotTurnActive}
                    onOpen={openIsland}
                    transition={islandMorphTransition}
                  />
                ) : (
                  <DynamicIslandPanel
                    activeConversationId={islandRevbot.conversationId}
                    conversations={islandRevbot.conversations}
                    controlsDisabled={islandRevbot.loading}
                    isConversationActive={islandRevbot.conversationActive}
                    onDock={dockIsland}
                    onDeleteConversation={(id) =>
                      void islandRevbot.deleteConversation(id)
                    }
                    onMaximize={maximizeIsland}
                    onMinimize={minimizeIsland}
                    onNewChat={() => islandRevbot.newChat()}
                    onSelectConversation={(id) =>
                      void islandRevbot.selectConversation(id)
                    }
                    panelState={
                      islandState === "maximized" ? "maximized" : "minimized"
                    }
                    title={islandConversationTitle}
                    transition={islandMorphTransition}
                  >
                    {activeProject ? (
                      <RevbotViewContent
                        activeProject={activeProject}
                        allowedEfforts={features.ai_allowed_reasoning_efforts}
                        compact
                        defaultHistoryOpen={false}
                        hideCompactHeader
                        hideHistory={islandState !== "maximized"}
                        onActivityChange={setIsIslandThinking}
                        onEditorLink={handleRevbotEditorLink}
                        onInternalLink={handleRevbotInternalLink}
                        onTitleChange={setIslandConversationTitle}
                        revbot={islandRevbot}
                        showMessageAvatar={islandState === "maximized"}
                        showMic
                        variant="dark"
                      />
                    ) : null}
                  </DynamicIslandPanel>
                )}
              </LayoutGroup>
            ) : null}
            <AnimatePresence>
              {isProjectPanelOpen ? (
                <motion.button
                  animate={{ opacity: 1 }}
                  aria-label="Close project selector"
                  className="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-sm"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  key="project-panel-backdrop"
                  onClick={() => setIsProjectPanelOpen(false)}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                  type="button"
                />
              ) : null}
            </AnimatePresence>
            {isProjectPanelOpen ? (
              <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
                <ProjectPanel
                  activeProjectId={activeProjectId}
                  cancellingCrawlId={projectActions.cancellingCrawlId}
                  crawlPanelCrawls={crawlPanelCrawls}
                  currentCrawl={currentCrawl}
                  deletingCrawlId={projectActions.deletingCrawlId}
                  deletingProjectId={projectActions.deletingProjectId}
                  exportFormat={projectActions.exportFormat}
                  exportingCrawlId={projectActions.exportingCrawlId}
                  onCancelCrawl={(crawl) =>
                    void projectActions.handleCancelCrawl(crawl)
                  }
                  onCompareCrawl={(crawl) => {
                    setIsProjectPanelOpen(false)
                    onCompareCrawl(crawl)
                  }}
                  onCreateProjectOpen={() => {
                    setIsProjectPanelOpen(false)
                    createProjectDispatch({ type: "OPEN" })
                  }}
                  onDeleteCrawl={projectActions.openDeleteCrawlDialog}
                  onDeleteProject={projectActions.openDeleteProjectDialog}
                  onExportCrawl={(crawl, format) =>
                    void projectActions.handleExportCrawl(crawl, format)
                  }
                  onExportFormatChange={projectActions.onExportFormatChange}
                  onOpenBusinessProfile={(project) => {
                    setIsProjectPanelOpen(false)
                    businessProfile.openBusinessProfileDrawer(project)
                  }}
                  onProjectHover={(id) => hoverProject(id)}
                  onSelectProject={(projectId, crawlId) => {
                    setIsProjectPanelOpen(false)
                    selectProject(projectId, crawlId)
                  }}
                  projectActionError={projectActions.projectActionError}
                  projects={projects}
                  reducedMotion={shouldReduceMotion}
                />
              </div>
            ) : null}
          </motion.main>
        </SidebarProvider>
        <PageEditor />
        <RunCrawlDialog
          activeProject={activeProject}
          activeProjectId={activeProjectId}
          delayMs={runCrawl.delayMs}
          fetchTimeoutSeconds={runCrawl.fetchTimeoutSeconds}
          forceFullCrawl={runCrawl.forceFullCrawl}
          honourRobotsTxt={runCrawl.honourRobotsTxt}
          renderJavaScript={runCrawl.renderJavaScript}
          isCrawlRunning={isCrawlRunning}
          isOpen={runCrawl.isOpen}
          isStartingCrawl={runCrawl.starting}
          jitterMs={runCrawl.jitterMs}
          maxDepth={runCrawl.maxDepth}
          maxPages={runCrawl.maxPages}
          runCrawlError={runCrawl.error}
          onDelayMsChange={(value) =>
            runCrawlDispatch({ type: "DELAY_MS", value })
          }
          onFetchTimeoutSecondsChange={(value) =>
            runCrawlDispatch({ type: "FETCH_TIMEOUT", value })
          }
          onForceFullCrawlChange={(value) =>
            runCrawlDispatch({ type: "FORCE_FULL_CRAWL", value })
          }
          onHonourRobotsTxtChange={(value) =>
            runCrawlDispatch({ type: "HONOUR_ROBOTS_TXT", value })
          }
          onRenderJavaScriptChange={(value) =>
            runCrawlDispatch({ type: "RENDER_JAVASCRIPT", value })
          }
          onJitterMsChange={(value) =>
            runCrawlDispatch({ type: "JITTER_MS", value })
          }
          onMaxDepthChange={(value) =>
            runCrawlDispatch({ type: "MAX_DEPTH", value })
          }
          onMaxPagesChange={(value) =>
            runCrawlDispatch({ type: "MAX_PAGES", value })
          }
          onOpenChange={(open) =>
            runCrawlDispatch({ type: open ? "OPEN" : "CLOSE" })
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
          businessProfile={businessProfile}
          createProject={{
            isCreateProjectOpen: createProject.isOpen,
            projectName: createProject.name,
            projectBaseUrl: createProject.baseUrl,
            createProjectError: createProject.error,
            isCreatingProject: createProject.creating,
          }}
          createProjectDispatch={(event) => {
            if (event.type === "OPEN") createProjectDispatch({ type: "OPEN" })
            else if (event.type === "CLOSE")
              createProjectDispatch({ type: "CLOSE" })
            else if (event.type === "SET_NAME")
              createProjectDispatch({ type: "NAME", value: event.value })
            else if (event.type === "SET_BASE_URL")
              createProjectDispatch({ type: "BASE_URL", value: event.value })
          }}
          handleCreateProject={handleCreateProject}
          onDismissDock={() => setIsProjectPanelOpen(false)}
          projectActions={projectActions}
          workspaceActions={workspaceActions}
        />
      </LayoutGroup>
    </SetInsightsNavbarLabel.Provider>
  )
}
