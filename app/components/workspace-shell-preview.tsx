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
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar"
import { RunCrawlDialog } from "~/components/app-navbar/run-crawl-dialog"
import {
  addExcludedUrlPatternTokens,
  buildRunCrawlConfigSnapshot,
  DEFAULT_EXCLUDED_URL_PATTERNS,
  describeExcludedUrlPatternRejection,
  getExcludedUrlPatternsStorage,
  loadExcludedUrlPatterns,
  resolveExcludedUrlPatternsUserId,
  saveExcludedUrlPatterns,
  validateExcludedUrlPatterns,
} from "~/components/app-navbar/crawl-exclusions"
import { useAutoCrawlSettings } from "~/components/app-navbar/use-auto-crawl-settings"
import { useBusinessProfile } from "~/components/app-navbar/use-business-profile"
import { useProjectActions } from "~/components/app-navbar/use-project-actions"
import { useWorkspaceActions } from "~/components/app-navbar/use-workspace-actions"
import {
  formatCrawlDateTime,
  getCrawlSelectionTarget,
  getCrawlValidationError,
  getInitials,
  getWorkspaceNavigationTarget,
  getProjectSwitchTarget,
  getVisibilityModeTarget,
} from "~/components/app-navbar/utils"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
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
import { describeCrawlAnalysisProgress, getCrawlTimestamp } from "~/lib/crawl"
import { ApiError, clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  CrawlResponse,
  CrawlsResponse,
  ProjectResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import { useFeatures } from "~/lib/features"
import { toast } from "sonner"
import { WorkspaceDockNav } from "~/components/workspace-dock-nav"
import {
  OnboardingUiContext,
  requestOnboardingReplay,
} from "~/components/onboarding/onboarding-ui"
import { LocationWorkspaceNavigation } from "~/components/locations/location-workspace-navigation"
import { BusinessProfileDrawer } from "~/components/app-navbar/business-profile-drawer"
import { selectRevbotAuditSuggestions } from "~/components/revbot/revbot-audit-suggestion-starters"
import { WorkspaceSidebarNav } from "~/components/workspace-sidebar-nav"
import { sortProjectsByName } from "~/lib/project-sort"

type CreateProjectState = {
  isOpen: boolean
  name: string
  baseUrl: string
  error: string
  creating: boolean
  renameProjectId: string | null
}
type CreateProjectEvent =
  | { type: "OPEN" | "CLOSE" | "CREATING" | "CREATED" }
  | { type: "RENAME"; project: ProjectResponse }
  | { type: "NAME" | "BASE_URL" | "ERROR"; value: string }

function createProjectReducer(
  state: CreateProjectState,
  event: CreateProjectEvent
): CreateProjectState {
  switch (event.type) {
    case "OPEN":
      return { ...initialCreateProjectState, isOpen: true }
    case "RENAME":
      return {
        ...initialCreateProjectState,
        isOpen: true,
        renameProjectId: event.project.id,
        name: event.project.name,
        baseUrl: event.project.base_url,
      }
    case "CLOSE":
      return state.creating ? state : initialCreateProjectState
    case "NAME":
      return { ...state, name: event.value }
    case "BASE_URL":
      return state.renameProjectId ? state : { ...state, baseUrl: event.value }
    case "ERROR":
      return { ...state, error: event.value, creating: false }
    case "CREATING":
      return { ...state, creating: true, error: "" }
    case "CREATED":
      return initialCreateProjectState
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
  excludedUrlPatterns: string[]
  exclusionDraft: string
  exclusionError: string
}
type RunCrawlEvent =
  | { type: "OPEN" | "CLOSE" | "STARTING" | "STARTED" }
  | {
      type: "FORCE_FULL_CRAWL" | "HONOUR_ROBOTS_TXT" | "RENDER_JAVASCRIPT"
      value: boolean
    }
  | { type: "EXCLUDED_PATTERNS"; value: string[] }
  | {
      type:
        | "MAX_DEPTH"
        | "MAX_PAGES"
        | "DELAY_MS"
        | "JITTER_MS"
        | "FETCH_TIMEOUT"
        | "ERROR"
        | "EXCLUSION_DRAFT"
        | "EXCLUSION_ERROR"
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
    case "EXCLUDED_PATTERNS":
      return { ...state, excludedUrlPatterns: event.value }
    case "EXCLUSION_DRAFT":
      return { ...state, exclusionDraft: event.value }
    case "EXCLUSION_ERROR":
      return { ...state, exclusionError: event.value }
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
        exclusionDraft: "",
        exclusionError: "",
      }
  }
}

const initialCreateProjectState: CreateProjectState = {
  isOpen: false,
  name: "",
  baseUrl: "",
  error: "",
  creating: false,
  renameProjectId: null,
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
  excludedUrlPatterns: [...DEFAULT_EXCLUDED_URL_PATTERNS],
  exclusionDraft: "",
  exclusionError: "",
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
  fullBleed?: boolean
  /** Stable slot outside the view-keyed transition; view switches remount children. */
  tour?: ReactNode
  /** Stable user scope for per-user crawl preferences; falls back to userEmail. */
  userId?: string | null
  currentBreakdown?: ScoreBreakdownResponse | null
}

export function WorkspaceShellPreview({
  children,
  tour,
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
  userId,
  view,
  onViewChange,
  visibilityMode = "maps",
  revbotConversationId,
  onRevbotConversationChange,
  auditTab,
  onAuditTabChange,
  onExportAudit,
  isPlatformAdmin,
  isExportingAudit,
  fullBleed = false,
  currentBreakdown,
}: WorkspaceShellPreviewProps) {
  const navigate = useNavigate()
  const alphabeticalProjects = useMemo(
    () => sortProjectsByName(projects),
    [projects]
  )
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
  const exclusionStorageUserId = resolveExcludedUrlPatternsUserId(
    userId,
    userEmail
  )

  // Saved choices win; defaults only fill a first open. Reloads on open
  // and on user/project change so one scope never leaks into another.
  useEffect(() => {
    if (!runCrawl.isOpen) return
    const stored = loadExcludedUrlPatterns(
      getExcludedUrlPatternsStorage(),
      exclusionStorageUserId,
      activeProjectId ?? null
    )
    runCrawlDispatch({
      type: "EXCLUDED_PATTERNS",
      value: stored ?? [...DEFAULT_EXCLUDED_URL_PATTERNS],
    })
    runCrawlDispatch({ type: "EXCLUSION_DRAFT", value: "" })
    runCrawlDispatch({ type: "EXCLUSION_ERROR", value: "" })
  }, [runCrawl.isOpen, activeProjectId, exclusionStorageUserId])

  function commitExclusionTokens(value: string) {
    const commit = addExcludedUrlPatternTokens(
      runCrawl.excludedUrlPatterns,
      value
    )
    runCrawlDispatch({ type: "EXCLUDED_PATTERNS", value: commit.patterns })
    runCrawlDispatch({
      type: "EXCLUSION_DRAFT",
      value: commit.invalid.join(" "),
    })
    runCrawlDispatch({
      type: "EXCLUSION_ERROR",
      value: describeExcludedUrlPatternRejection(commit.invalid, commit.capped),
    })
  }
  const fetchedProjectCrawls = useRef<Record<string, CrawlResponse[]>>({})
  const fetchingProjectIds = useRef(new Set<string>())
  const [, setFetchedCrawlsVersion] = useState(0)
  const shouldReduceMotion = useReducedMotion() ?? false
  const locationWorkspace = useOptionalLocationWorkspace()
  const isLocationScoped = locationWorkspace !== null
  const isLocationArea =
    isLocationScoped ||
    /^\/app\/projects\/[^/]+\/locations(\/|$)/.test(location.pathname)
  const locationProfileScope = useMemo(
    () =>
      locationWorkspace
        ? {
            projectId: locationWorkspace.projectId,
            locationId: locationWorkspace.location.id,
            locationName: locationWorkspace.location.name,
          }
        : undefined,
    [locationWorkspace]
  )
  const workspaceContentKey = locationWorkspace
    ? `${view}:${locationWorkspace.location.id}`
    : view
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

  const handleRevbotInternalLink = useCallback(
    (hash: string) => {
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash,
        },
        { replace: true }
      )
    },
    [location.pathname, location.search, navigate]
  )

  const handleRevbotEditorLink = useCallback(
    (url: string) => {
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
    },
    [
      currentCrawl?.id,
      location.hash,
      location.pathname,
      location.search,
      navigate,
    ]
  )

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
    locationId: locationWorkspace?.location.id,
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
  const revbotAuditSuggestions = useMemo(
    () =>
      selectRevbotAuditSuggestions({
        breakdown: currentBreakdown,
        currentCrawl,
        activeProjectId,
        isLocationScoped,
      }),
    [currentBreakdown, currentCrawl, activeProjectId, isLocationScoped]
  )
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
    isPlatformAdmin,
    navigate,
    revalidator,
  })
  const autoCrawl = useAutoCrawlSettings(activeProjectId)
  const businessProfile = useBusinessProfile()
  const localBusinessProfile = useBusinessProfile(locationProfileScope)
  // Tour-held dock menu (audit/business-profile steps); undefined = hover state.
  const [lockedDockItem, setLockedDockItem] = useState<
    string | null | undefined
  >(undefined)
  const lockDockItem = useCallback((key: string | null) => {
    setLockedDockItem(key ?? undefined)
  }, [])
  const openRevbotForTour = useCallback(() => setIslandState("minimized"), [])
  const maximizeRevbotForTour = useCallback(
    () => setIslandState("maximized"),
    []
  )
  const dockRevbotForTour = useCallback(() => setIslandState("docked"), [])
  const openBusinessProfileForTour = useCallback(() => {
    if (activeProject) businessProfile.openBusinessProfileDrawer(activeProject)
  }, [activeProject, businessProfile])
  const closeBusinessProfileForTour = useCallback(() => {
    businessProfile.closeBusinessProfileDrawer()
  }, [businessProfile])
  const onboardingUi = useMemo(
    () => ({
      islandState,
      openRevbot: openRevbotForTour,
      maximizeRevbot: maximizeRevbotForTour,
      dockRevbot: dockRevbotForTour,
      openBusinessProfile: openBusinessProfileForTour,
      closeBusinessProfile: closeBusinessProfileForTour,
      isBusinessProfileOpen: businessProfile.businessProfileProject !== null,
      isCreateProjectOpen: createProject.isOpen && !createProject.renameProjectId,
      lockDockItem,
    }),
    [
      islandState,
      openRevbotForTour,
      maximizeRevbotForTour,
      dockRevbotForTour,
      openBusinessProfileForTour,
      closeBusinessProfileForTour,
      businessProfile.businessProfileProject,
      createProject.isOpen,
      createProject.renameProjectId,
      lockDockItem,
    ]
  )
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
  const runningStageTitle =
    currentCrawl?.status === "running" && currentCrawl.phase === "analyzing"
      ? describeCrawlAnalysisProgress(currentCrawl.analysis_progress)?.title
      : null
  const isExportingCrawl = projectActions.exportingCrawlId !== null

  function selectProject(projectId: string, crawlId?: string) {
    const isLocationsActive = /^\/app\/projects\/[^/]+\/locations(\/|$)/.test(
      location.pathname
    )
    if (isLocationsActive) {
      void navigate(`/app/projects/${projectId}/locations`)
      return
    }
    if (projectId !== activeProjectId) {
      void navigate(getProjectSwitchTarget(location, projectId, crawlId))
      return
    }
    const params = new URLSearchParams(location.search)
    params.set("project", projectId)
    if (crawlId) params.set("crawl", crawlId)
    else params.delete("crawl")
    void navigate(`${location.pathname}?${params.toString()}`)
  }

  function selectCrawl(crawlId: string) {
    if (locationWorkspace) {
      selectProject(locationWorkspace.projectId, crawlId)
      return
    }
    void navigate(getCrawlSelectionTarget(location, crawlId))
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

  function selectProjectWorkspace(
    nextView: typeof view,
    nextAuditTab?: typeof auditTab,
    nextVisibilityMode?: typeof visibilityMode
  ) {
    if (!locationWorkspace) {
      selectWorkspace(nextView, nextAuditTab, nextVisibilityMode)
      return
    }
    const params = new URLSearchParams(location.search)
    for (const key of [
      "location",
      "location_view",
      "revbotConversation",
      "audit",
      "visibility",
    ])
      params.delete(key)
    if (nextView === "revserp-visibility")
      params.set("visibility", nextVisibilityMode ?? "ai")
    const target = getWorkspaceNavigationTarget(
      { pathname: "/app", search: `?${params}` },
      nextView,
      nextAuditTab ?? "overview"
    )
    if (nextView === "revserp-visibility") target.hash = "#ai-visibility"
    void navigate(target)
    setIsMobileSidebarOpen(false)
  }

  function selectWorkspace(
    nextView: typeof view,
    nextAuditTab?: typeof auditTab,
    nextVisibilityMode?: typeof visibilityMode
  ) {
    onViewChange(nextView)
    if (nextAuditTab !== undefined) onAuditTabChange(nextAuditTab)
    if (nextVisibilityMode !== undefined && nextView === "revserp-visibility") {
      void navigate(getVisibilityModeTarget(location, nextVisibilityMode), {
        replace: true,
      })
    }
    setIsMobileSidebarOpen(false)
  }

  function openRenameProject(project: ProjectResponse) {
    setIsProjectPanelOpen(false)
    createProjectDispatch({ type: "RENAME", project })
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (createProject.creating) return
    const name = createProject.name.trim()
    const baseUrl = createProject.baseUrl.trim()
    const renameProjectId = createProject.renameProjectId
    if (!name || (!renameProjectId && !baseUrl)) {
      createProjectDispatch({
        type: "ERROR",
        value: renameProjectId ? "Project name is required." : "Project name and base URL are required.",
      })
      return
    }
    createProjectDispatch({ type: "CREATING" })
    try {
      if (renameProjectId) {
        await clientApiFetch<ProjectResponse>(`/projects/${renameProjectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        })
        createProjectDispatch({ type: "CREATED" })
        revalidator.revalidate()
        return
      }
      const project = await clientApiPost<ProjectResponse>(
        `/organizations/${organizationId}/projects`,
        { name, base_url: baseUrl }
      )
      createProjectDispatch({ type: "CREATED" })
      selectProject(project.id)
      onViewChange("revserp-audit")
      onAuditTabChange("overview")
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
          error instanceof Error ? error.message : renameProjectId ? "Unable to rename project." : "Unable to create project.",
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
      // A typed but unsplit URL still counts: commit the pending draft first.
      const pendingExclusions = addExcludedUrlPatternTokens(
        runCrawl.excludedUrlPatterns,
        runCrawl.exclusionDraft
      )
      if (pendingExclusions.invalid.length > 0 || pendingExclusions.capped) {
        runCrawlDispatch({
          type: "EXCLUDED_PATTERNS",
          value: pendingExclusions.patterns,
        })
        runCrawlDispatch({
          type: "EXCLUSION_DRAFT",
          value: pendingExclusions.invalid.join(" "),
        })
        runCrawlDispatch({
          type: "EXCLUSION_ERROR",
          value: describeExcludedUrlPatternRejection(
            pendingExclusions.invalid,
            pendingExclusions.capped
          ),
        })
        return
      }
      const excludedUrlPatterns = pendingExclusions.patterns
      const exclusionPatternsError =
        validateExcludedUrlPatterns(excludedUrlPatterns)
      if (exclusionPatternsError) {
        runCrawlDispatch({
          type: "EXCLUSION_ERROR",
          value: exclusionPatternsError,
        })
        return
      }
      if (pendingExclusions.added.length > 0) {
        runCrawlDispatch({
          type: "EXCLUDED_PATTERNS",
          value: excludedUrlPatterns,
        })
      }
      runCrawlDispatch({ type: "EXCLUSION_DRAFT", value: "" })
      runCrawlDispatch({ type: "EXCLUSION_ERROR", value: "" })
      saveExcludedUrlPatterns(
        getExcludedUrlPatternsStorage(),
        exclusionStorageUserId,
        activeProjectId,
        excludedUrlPatterns
      )
      runCrawlDispatch({ type: "STARTING" })
      const crawl = await clientApiPost<CrawlResponse>(
        `/projects/${activeProjectId}/crawls`,
        {
          config_snapshot: buildRunCrawlConfigSnapshot(
            {
              max_depth: maxDepth,
              fetch_timeout_seconds: fetchTimeoutSeconds,
              force_full_crawl: runCrawl.forceFullCrawl,
              honour_robots_txt: runCrawl.honourRobotsTxt,
              render_javascript: runCrawl.renderJavaScript,
              ...(maxPages === undefined ? {} : { max_pages: maxPages }),
              ...(delayMs === undefined ? {} : { request_delay_ms: delayMs }),
              ...(jitterMs === undefined
                ? {}
                : { request_jitter_ms: jitterMs }),
            },
            excludedUrlPatterns
          ),
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
    <OnboardingUiContext.Provider value={onboardingUi}>
      <SetInsightsNavbarLabel.Provider value={setInsightsNavbarLabel}>
        <LayoutGroup id="workspace-preview">
          <SidebarProvider
            className="relative h-svh min-h-0 bg-background text-foreground"
            openMobile={isMobileSidebarOpen}
            onOpenMobileChange={setIsMobileSidebarOpen}
            style={{ "--sidebar-width": "4rem" } as CSSProperties}
          >
            <div className="md:hidden">
              <Sidebar>
                <SidebarContent className="p-2">
                  <WorkspaceSidebarNav
                    auditTab={isLocationScoped ? "overview" : auditTab}
                    gscConnector={features.gsc_connector}
                    integrations={features.integrations !== false}
                    isLocationScoped={false}
                    maxCompetitors={features.max_competitors}
                    onNavigate={() => setIsMobileSidebarOpen(false)}
                    onSelectWorkspace={selectProjectWorkspace}
                    pathname={location.pathname}
                    projectId={activeProject?.id}
                    view={isLocationScoped ? "revserp-audit" : view}
                    visibilityMode={visibilityMode}
                  />
                </SidebarContent>
              </Sidebar>
            </div>
            <motion.main className="relative h-full min-h-0 w-full" layoutRoot>
              <div className="relative flex h-full min-h-0 bg-shell-chrome">
                <section
                  className={
                    fullBleed
                      ? "relative ml-0 flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
                      : "relative ml-0 flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden md:pt-16"
                  }
                >
                  {fullBleed ? null : (
                    <header
                      className={
                        fullBleed
                          ? "absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 bg-transparent px-4 md:hidden"
                          : "relative z-30 flex h-14 shrink-0 items-center gap-3 px-4 md:hidden"
                      }
                    >
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
                  )}
                  {locationWorkspace && !fullBleed ? (
                    <LocationWorkspaceNavigation
                      view={view}
                      auditTab={auditTab}
                      visibilityMode={visibilityMode}
                      googleReports={features.gsc_connector}
                      onOpenProfile={() => {
                        if (activeProject)
                          localBusinessProfile.openBusinessProfileDrawer(
                            activeProject
                          )
                      }}
                    />
                  ) : null}
                  <div
                    className={
                      fullBleed
                        ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
                        : islandState === "maximized"
                          ? "tour-scroll-lock pointer-events-none relative z-0 flex min-h-0 flex-1 scrollbar-gutter-stable flex-col overflow-y-auto bg-background"
                          : `tour-scroll-lock min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto bg-background ${isLocationArea ? "px-4 md:px-8" : "px-3"}`
                    }
                  >
                    <AnimatePresence initial={false} mode="wait">
                      <motion.div
                        animate={{ opacity: 1 }}
                        className={
                          fullBleed
                            ? "flex h-full min-h-0 flex-col"
                            : "flex min-h-full flex-col"
                        }
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        key={workspaceContentKey}
                        transition={{
                          duration: shouldReduceMotion ? 0 : 0.15,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <RevbotStartPromptContext.Provider
                          value={
                            features.ai_chat ? revbotStartPromptValue : null
                          }
                        >
                          <PageAuditContext.Provider value={pageAuditValue}>
                            <ProjectPanelOpenContext.Provider
                              value={openProjectPanel}
                            >
                              {projects.length === 0 ? (
                                <div className="flex flex-1 items-center justify-center py-16">
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
                                        data-tour="onboarding-new-project"
                                        onClick={() =>
                                          createProjectDispatch({
                                            type: "OPEN",
                                          })
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
                  {tour}
                </section>
              </div>
              <div
                className={
                  fullBleed
                    ? "pointer-events-none fixed inset-x-0 top-2 z-40 flex h-14 items-center justify-end gap-2 bg-transparent px-3 text-foreground max-md:hidden"
                    : "fixed inset-x-0 top-2 z-40 flex h-14 items-center gap-2 bg-shell-chrome px-3 text-foreground backdrop-blur-xl max-md:hidden"
                }
              >
                {fullBleed ? null : (
                  <div className="flex min-w-0 flex-1 items-center">
                    <WorkspaceSwitcher
                      activeOrganizationName={
                        workspaceActions.activeOrganization?.name
                      }
                      isActiveOrganizationOwner={
                        workspaceActions.isActiveOrganizationOwner
                      }
                      canManageOrganization={
                        workspaceActions.canManageActiveOrganization
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
                )}
                <div className="pointer-events-auto flex min-w-0 shrink items-center justify-center">
                  <div className="flex max-w-full min-w-0 items-center overflow-hidden rounded-xl border border-white/12 bg-shell-chrome p-1">
                    <WorkspaceDockNav
                      activeProjectId={activeProjectId ?? undefined}
                      auditTab={isLocationScoped ? "overview" : auditTab}
                      crawls={activeProjectCrawls}
                      currentCrawl={currentCrawl}
                      formatCrawlLabel={formatCrawlDateTime}
                      gscConnector={features.gsc_connector}
                      integrations={features.integrations !== false}
                      isLocationScoped={false}
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
                      onRenameProject={openRenameProject}
                      onExportCrawl={(crawl, format) =>
                        void projectActions.handleExportCrawl(crawl, format)
                      }
                      onOpenProjectPanel={openProjectPanel}
                      onSelectCrawl={selectCrawl}
                      onSelectProject={selectProject}
                      onSelectWorkspace={selectProjectWorkspace}
                      lockedOpenItem={lockedDockItem}
                      pathname={location.pathname}
                      projectId={activeProject?.id}
                      projects={alphabeticalProjects}
                      trailing={
                        <button
                          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150 hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-40"
                          disabled={!activeProject || isCrawlRunning}
                          onClick={() => runCrawlDispatch({ type: "OPEN" })}
                          type="button"
                        >
                          <PlayIcon aria-hidden="true" className="size-4" />
                          {isCrawlRunning
                            ? (runningStageTitle ?? crawlStatusLabel)
                            : "Run crawl"}
                        </button>
                      }
                      view={isLocationScoped ? "revserp-audit" : view}
                      visibilityMode={visibilityMode}
                      actions={[
                        {
                          key: "auto-crawl",
                          icon: (
                            <SparklesIcon
                              aria-hidden="true"
                              className="size-4"
                            />
                          ),
                          disabled: !activeProject || autoCrawl.isSaving,
                          label: autoCrawl.enabled
                            ? "Auto crawl on"
                            : "Auto crawl",
                          onSelect: () =>
                            autoCrawl.enabled
                              ? void autoCrawl.handleDisable()
                              : void autoCrawl.openDialog(),
                        },

                        {
                          key: "business-profile",
                          icon: (
                            <Building2Icon
                              aria-hidden="true"
                              className="size-4"
                            />
                          ),
                          disabled: !activeProject,
                          label: "Business profile",
                          onSelect: () => {
                            if (activeProject)
                              businessProfile.openBusinessProfileDrawer(
                                activeProject
                              )
                          },
                        },
                        { key: "d1", divider: true },

                        {
                          key: "export-pdf",
                          icon: (
                            <FileTextIcon
                              aria-hidden="true"
                              className="size-4"
                            />
                          ),
                          disabled: !currentCrawlCompleted || isExportingAudit,
                          label: isExportingAudit
                            ? "Generating audit…"
                            : "Export PDF audit",
                          onSelect: onExportAudit,
                        },

                        {
                          key: "export-xlsx",
                          icon: (
                            <FileSpreadsheetIcon
                              aria-hidden="true"
                              className="size-4"
                            />
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
                            <FileSpreadsheetIcon
                              aria-hidden="true"
                              className="size-4"
                            />
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
                {fullBleed ? null : (
                  <div className="flex min-w-0 flex-1 items-center justify-end">
                    <ProfileMenu
                      initials={initials}
                      isPlatformAdmin={isPlatformAdmin}
                      onLogout={() => void workspaceActions.handleLogout()}
                      onTakeTour={requestOnboardingReplay}
                      profileActionError={workspaceActions.profileActionError}
                      userName={userName}
                      workspaceState={workspaceActions.workspaceState}
                    />
                  </div>
                )}
              </div>
              {features.ai_chat && !fullBleed ? (
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
                          canManageOrganization={
                            workspaceActions.canManageActiveOrganization
                          }
                          onActivityChange={setIsIslandThinking}
                          onEditorLink={handleRevbotEditorLink}
                          onInternalLink={handleRevbotInternalLink}
                          onTitleChange={setIslandConversationTitle}
                          revbot={islandRevbot}
                          suggestions={revbotAuditSuggestions}
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
                    onRenameProject={openRenameProject}
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
                    projects={alphabeticalProjects}
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
            excludedUrlPatterns={runCrawl.excludedUrlPatterns}
            exclusionDraft={runCrawl.exclusionDraft}
            exclusionError={runCrawl.exclusionError}
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
            onExclusionDraftChange={(value) =>
              runCrawlDispatch({ type: "EXCLUSION_DRAFT", value })
            }
            onExclusionCommit={commitExclusionTokens}
            onExclusionRemove={(pattern) =>
              runCrawlDispatch({
                type: "EXCLUDED_PATTERNS",
                value: runCrawl.excludedUrlPatterns.filter(
                  (entry) => entry !== pattern
                ),
              })
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
          <BusinessProfileDrawer businessProfile={localBusinessProfile} />
          <AppNavbarDialogs
            businessProfile={businessProfile}
            createProject={{
              isCreateProjectOpen: createProject.isOpen,
              projectName: createProject.name,
              projectBaseUrl: createProject.baseUrl,
              createProjectError: createProject.error,
              isCreatingProject: createProject.creating,
              isRenameMode: createProject.renameProjectId !== null,
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
    </OnboardingUiContext.Provider>
  )
}
