"use client"

import type {
  CSSProperties,
  FormEvent,
  ReactElement,
  ReactNode,
} from "react"
import {
  lazy,
  Suspense,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import { useLocation, useNavigate, useRevalidator } from "react-router"
import {
  ActivityIcon,
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  CogIcon,
  DownloadIcon,
  EyeIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  GaugeIcon,
  NetworkIcon,
  PanelLeftIcon,
  PlayIcon,
  SearchCheckIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"

import { AppNavbarDialogs, type AppNavbarProps } from "~/components/app-navbar"
import { AutoCrawlDialog } from "~/components/app-navbar/auto-crawl-dialog"
import { ProfileMenu } from "~/components/app-navbar/profile-menu"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { HoverPill, useHoverPill } from "~/components/ui/hover-pill"
import { Separator } from "~/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "~/components/ui/sidebar"
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
import { ProjectPanel } from "~/components/command-dock/project-panel"
import {
  DynamicIslandDockedChrome,
  DynamicIslandMaxPanel,
  DynamicIslandMorphShell,
  islandDockedSizeClass,
} from "~/components/dynamic-island-poc"
import { getCrawlTimestamp } from "~/lib/crawl"
import { clientApiFetch, clientApiPost } from "~/lib/api"
import { cn } from "~/lib/utils"
import type {
  CrawlResponse,
  CrawlsResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { useFeatures } from "~/lib/features"

const RevbotView = lazy(() =>
  import("~/components/revbot/revbot-view").then((module) => ({
    default: module.RevbotView,
  }))
)

const auditSections = [
  ["Overview", "summary", GaugeIcon],
  ["SEO", "seo", SearchIcon],
  ["AEO", "aeo", SparklesIcon],
  ["PageSpeed", "pagespeed", ActivityIcon],
  ["Site graph", "site-graph", NetworkIcon],
] as const

function CollapsedTooltip({
  children,
  label,
  show,
}: {
  children: ReactElement
  label: string
  show: boolean
}) {
  if (!show) return children
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

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
      return { ...state, starting: false, isOpen: false }
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
  maxDepth: "5",
  maxPages: "",
  delayMs: "",
  jitterMs: "",
  fetchTimeoutSeconds: "60",
  error: "",
  starting: false,
}

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
  compareLabel,
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
  isPlatformAdmin,
  onExportAudit,
  isExportingAudit,
}: WorkspaceShellPreviewProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const revalidator = useRevalidator()
  const features = useFeatures()
  const [islandState, setIslandState] = useState<"docked" | "maximized">(
    "docked"
  )
  const [islandChromeVisible, setIslandChromeVisible] = useState(true)
  const [islandPanelVisible, setIslandPanelVisible] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const [isIslandThinking, setIsIslandThinking] = useState(false)
  const [islandConversationTitle, setIslandConversationTitle] =
    useState("New chat")
  const [isProjectPanelOpen, setIsProjectPanelOpen] = useState(false)
  const [navPill, setNavPill] = useState<{
    height: number
    top: number
  } | null>(null)
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
  const navItemRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const shouldReduceMotion = useReducedMotion() ?? false
  const workspaceContentKey = view
  const islandOpenTransition = {
    duration: shouldReduceMotion ? 0 : 0.24,
    ease: [0.22, 1, 0.36, 1] as const,
  }
  const islandDockTransition = {
    duration: shouldReduceMotion ? 0 : 0.2,
    ease: [0.4, 0, 0.2, 1] as const,
  }
  const islandBackdropTransition = {
    duration: shouldReduceMotion ? 0 : 0.24,
    ease: [0.22, 1, 0.36, 1] as const,
  }
  const islandPanelRevealTransition = {
    duration: shouldReduceMotion ? 0 : 0.08,
    ease: [0.22, 1, 0.36, 1] as const,
  }

  function maximizeIsland() {
    setIslandChromeVisible(false)
    setIslandPanelVisible(false)
    setIslandState("maximized")
  }

  function dockIsland() {
    setIslandPanelVisible(false)
    setIslandChromeVisible(false)
    setIslandState("docked")
  }

  function handleRevbotInternalLink(hash: string) {
    dockIsland()
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash,
      },
      { replace: true }
    )
  }

  function handleIslandLayoutComplete() {
    if (islandState === "maximized") {
      setIslandPanelVisible(true)
      return
    }
    setIslandChromeVisible(true)
  }

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ??
    projects[0] ??
    null
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
  const projectDropdownPill = useHoverPill()
  const tabDropdownPill = useHoverPill()
  const crawlDropdownPill = useHoverPill()
  const configureDropdownPill = useHoverPill()
  const exportDropdownPill = useHoverPill()
  const currentCrawlCompleted = currentCrawl?.status === "completed"
  const isExportingCrawl = projectActions.exportingCrawlId !== null

  function showNavPill(id: string) {
    const target = navItemRefs.current[id]
    if (!target) {
      setNavPill(null)
      return
    }
    setNavPill({
      height: target.offsetHeight,
      top: target.offsetTop,
    })
  }

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
    setIsSidebarCollapsed(true)
  }

  const workspaceNavItems = [
    ...auditSections.map(([label, tab, Icon]) => ({
      icon: Icon,
      isActive: view === "revserp-audit" && auditTab === tab,
      label,
      onSelect: () => selectWorkspace("revserp-audit", tab),
    })),
    {
      icon: EyeIcon,
      isActive: view === "revserp-visibility",
      label: "Visibility test",
      onSelect: () => selectWorkspace("revserp-visibility"),
    },
    ...(features.gsc_connector
      ? [
          {
            icon: SearchCheckIcon,
            isActive: view === "search-console",
            label: "Search Console",
            onSelect: () => selectWorkspace("search-console"),
          },
        ]
      : []),
  ]

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

  const headerLabel =
    view === "revserp-audit"
      ? (auditSections.find(([, tab]) => tab === auditTab)?.[0] ?? "Overview")
      : view === "revserp-visibility"
        ? "Visibility test"
        : view === "search-console"
          ? "Search Console"
          : view === "compare"
            ? (compareLabel ?? "Compare")
            : "Revbot"

  return (
    <LayoutGroup id="workspace-preview">
      <SidebarProvider
        className="relative h-svh min-h-0 bg-background text-foreground"
        open={!isSidebarCollapsed}
        style={
          {
            "--sidebar-width": isSidebarCollapsed ? "4rem" : "18rem",
          } as CSSProperties
        }
      >
        <motion.main className="relative h-full min-h-0 w-full" layoutRoot>
          <Sidebar
            collapsible="none"
            className={
              isSidebarCollapsed
                ? "absolute inset-y-0 left-0 z-30 min-h-0 border-r border-border bg-black p-2 text-foreground transition-[width,padding] duration-200 ease-out motion-reduce:transition-none"
                : "absolute inset-y-0 left-0 z-40 min-h-0 border-r border-border bg-black p-3 text-foreground shadow-lg transition-[width,padding] duration-200 ease-out motion-reduce:transition-none"
            }
          >
            <div>
              <SidebarHeader
                className={
                  isSidebarCollapsed
                    ? "flex-row items-center justify-center gap-0 p-0 py-3"
                    : "flex-row items-center justify-between gap-0 px-2 py-3"
                }
              >
                {isSidebarCollapsed ? null : (
                  <span className="text-sm font-semibold tracking-tight">
                    Revserp
                  </span>
                )}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label={
                          isSidebarCollapsed
                            ? "Expand sidebar"
                            : "Collapse sidebar"
                        }
                        className="h-auto px-2 py-1 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setIsSidebarCollapsed((collapsed) => !collapsed)
                        }
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <PanelLeftIcon
                          aria-hidden="true"
                          className={
                            isSidebarCollapsed ? "rotate-180" : undefined
                          }
                        />
                      </Button>
                    }
                  />
                  <TooltipContent side="right">
                    {isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  </TooltipContent>
                </Tooltip>
              </SidebarHeader>
              <Separator className="my-2" />
              <SidebarContent className="flex-none gap-0 overflow-visible">
                <SidebarGroup className="p-0">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className={
                          isSidebarCollapsed
                            ? "mx-auto !size-10 justify-center rounded-md bg-muted/70 text-sm font-semibold"
                            : "!h-auto gap-3 rounded-md bg-muted/70 p-3 text-left"
                        }
                        onClick={() => setIsProjectPanelOpen(true)}
                        size="lg"
                        title={
                          isSidebarCollapsed ? activeProject?.name : undefined
                        }
                        type="button"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold">
                          {activeProject?.name.slice(0, 1).toUpperCase() ?? "R"}
                        </span>
                        {isSidebarCollapsed ? null : (
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {activeProject?.name ?? "Select a project"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              Project workspace
                            </span>
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
              </SidebarContent>
              <nav aria-label="Workspace sections">
                <SidebarGroup className="mt-6 p-0">
                  {isSidebarCollapsed ? null : (
                    <SidebarGroupLabel className="h-auto px-2 pb-1 text-[0.7rem] font-medium tracking-widest text-muted-foreground uppercase">
                      Audit
                    </SidebarGroupLabel>
                  )}
                  <SidebarMenu
                    onMouseLeave={() => setNavPill(null)}
                  >
                    <SidebarMenuItem
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-1 z-0 rounded-md bg-accent"
                      style={{
                        height: navPill?.height ?? 0,
                        opacity: navPill ? 1 : 0,
                        top: navPill?.top ?? 0,
                        transition:
                          "top 150ms cubic-bezier(0.23,1,0.32,1), height 150ms cubic-bezier(0.23,1,0.32,1), opacity 120ms ease",
                      }}
                    />
                    {auditSections.map(([label, tab, Icon]) => {
                      const active =
                        view === "revserp-audit" && auditTab === tab
                      return (
                        <SidebarMenuItem
                          key={tab}
                          ref={(element) => {
                            navItemRefs.current[tab] = element
                          }}
                        >
                          <CollapsedTooltip
                            label={label}
                            show={isSidebarCollapsed}
                          >
                          <SidebarMenuButton
                            className={
                              isSidebarCollapsed
                                ? `relative z-10 !h-auto w-full justify-center rounded-md py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${active ? "text-foreground font-medium" : "text-muted-foreground"}`
                                : `relative z-10 !h-auto gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${active ? "text-foreground font-medium" : "text-muted-foreground"}`
                            }
                            isActive={active}
                            onClick={() =>
                              selectWorkspace("revserp-audit", tab)
                            }
                            onMouseEnter={() => showNavPill(tab)}
                            title={isSidebarCollapsed ? label : undefined}
                            type="button"
                          >
                            <Icon
                              aria-hidden="true"
                              className="size-4 shrink-0"
                            />
                            {isSidebarCollapsed ? null : label}
                            {isSidebarCollapsed ? null : (
                              <span
                                className={cn(
                                  "ml-auto shrink-0",
                                  active ? "text-foreground" : "invisible"
                                )}
                              >
                                <CheckIcon className="size-4" />
                              </span>
                            )}
                          </SidebarMenuButton>
                          </CollapsedTooltip>
                        </SidebarMenuItem>
                      )
                    })}
                    <SidebarMenuItem className="my-3">
                      <Separator />
                    </SidebarMenuItem>
                    <SidebarMenuItem
                      ref={(element) => {
                        navItemRefs.current["visibility"] = element
                      }}
                    >
                      <CollapsedTooltip
                        label="Visibility test"
                        show={isSidebarCollapsed}
                      >
                      <SidebarMenuButton
                        className={
                          isSidebarCollapsed
                            ? `relative z-10 !h-auto w-full justify-center rounded-md py-1.5 transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${view === "revserp-visibility" ? "text-foreground font-medium" : "text-muted-foreground"}`
                            : `relative z-10 !h-auto gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${view === "revserp-visibility" ? "text-foreground font-medium" : "text-muted-foreground"}`
                        }
                        isActive={view === "revserp-visibility"}
                        onClick={() => selectWorkspace("revserp-visibility")}
                        onMouseEnter={() => showNavPill("visibility")}
                        title={
                          isSidebarCollapsed ? "Visibility test" : undefined
                        }
                        type="button"
                      >
                        <EyeIcon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        {isSidebarCollapsed ? null : "Visibility test"}
                        {isSidebarCollapsed ? null : (
                          <span
                            className={cn(
                              "ml-auto shrink-0",
                              view === "revserp-visibility"
                                ? "text-foreground"
                                : "invisible"
                            )}
                          >
                            <CheckIcon className="size-4" />
                          </span>
                        )}
                      </SidebarMenuButton>
                      </CollapsedTooltip>
                    </SidebarMenuItem>
                    {features.gsc_connector ? (
                      <SidebarMenuItem
                        ref={(element) => {
                          navItemRefs.current["search-console"] = element
                        }}
                      >
                        <CollapsedTooltip
                          label="Search Console"
                          show={isSidebarCollapsed}
                        >
                        <SidebarMenuButton
                          className={
                            isSidebarCollapsed
                              ? `relative z-10 !h-auto w-full justify-center rounded-md py-1.5 transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${view === "search-console" ? "text-foreground font-medium" : "text-muted-foreground"}`
                              : `relative z-10 !h-auto gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-transparent hover:text-current active:bg-transparent data-active:bg-transparent data-active:text-foreground ${view === "search-console" ? "text-foreground font-medium" : "text-muted-foreground"}`
                          }
                          isActive={view === "search-console"}
                          onClick={() => selectWorkspace("search-console")}
                          onMouseEnter={() => showNavPill("search-console")}
                          title={
                            isSidebarCollapsed ? "Search Console" : undefined
                          }
                          type="button"
                        >
                          <SearchCheckIcon
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                          {isSidebarCollapsed ? null : "Search Console"}
                          {isSidebarCollapsed ? null : (
                            <span
                              className={cn(
                                "ml-auto shrink-0",
                                view === "search-console"
                                  ? "text-foreground"
                                  : "invisible"
                              )}
                            >
                              <CheckIcon className="size-4" />
                            </span>
                          )}
                        </SidebarMenuButton>
                        </CollapsedTooltip>
                      </SidebarMenuItem>
                    ) : null}
                  </SidebarMenu>
                </SidebarGroup>
              </nav>
            </div>
            <div className="min-h-0 flex-1" />
            <SidebarFooter className="gap-0 border-t border-border p-0 pt-3">
              <ProfileMenu
                compact
                initials={initials}
                isActiveOrganizationOwner={
                  workspaceActions.isActiveOrganizationOwner
                }
                isPlatformAdmin={isPlatformAdmin}
                onInviteOpen={workspaceActions.openInviteDialog}
                onLeaveWorkspaceOpen={workspaceActions.openLeaveWorkspaceDialog}
                onLogout={() => void workspaceActions.handleLogout()}
                onSelectOrganization={(id) =>
                  void workspaceActions.handleSelectOrganization(id)
                }
                organizationId={organizationId}
                organizations={organizations}
                profileActionError={workspaceActions.profileActionError}
                userName={userName}
                workspaceState={workspaceActions.workspaceState}
              />
            </SidebarFooter>
          </Sidebar>
          <section className="relative ml-16 flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <header className="relative z-30 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border px-4 md:px-6">
              <h1 className="flex min-w-0 items-center gap-1.5 text-sm">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        aria-label="Switch project"
                        className="inline-flex min-w-0 items-center rounded-md px-1 py-0.5 font-semibold text-foreground hover:bg-accent data-[popup-open]:bg-accent"
                        type="button"
                      />
                    }
                  >
                    <span className="truncate">
                      {activeProject?.name ?? "Select a project"}
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="relative w-56"
                    onMouseLeave={projectDropdownPill.clearPill}
                    side="bottom"
                  >
                    <HoverPill pill={projectDropdownPill.pill} />
                    {projects.length ? (
                      projects.map((project, index) => (
                        <DropdownMenuItem
                          key={project.id}
                          {...projectDropdownPill.getItemProps(index)}
                          onClick={() => selectProject(project.id)}
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate">{project.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {project.base_url}
                            </span>
                          </span>
                          {project.id === activeProjectId ? (
                            <CheckIcon className="ml-auto size-4 shrink-0" />
                          ) : null}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem
                        {...projectDropdownPill.getItemProps(0)}
                        disabled
                      >
                        No projects yet
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <CircleIcon
                  aria-hidden="true"
                  className="size-2 shrink-0 fill-emerald-500 text-emerald-500"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        aria-label="Select crawl"
                        className="inline-flex min-w-0 items-center rounded-md px-1 py-0.5 font-normal text-foreground hover:bg-accent data-[popup-open]:bg-accent disabled:pointer-events-none disabled:opacity-50"
                        disabled={!activeProject}
                        type="button"
                      />
                    }
                  >
                    <span className="truncate">
                      {currentCrawl
                        ? formatCrawlDateTime(currentCrawl)
                        : "No crawl yet"}
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="relative w-56"
                    onMouseLeave={crawlDropdownPill.clearPill}
                    side="bottom"
                  >
                    <HoverPill pill={crawlDropdownPill.pill} />
                    {activeProjectCrawls.length ? (
                      activeProjectCrawls.map((crawl, index) => (
                        <DropdownMenuItem
                          key={crawl.id}
                          {...crawlDropdownPill.getItemProps(index)}
                          onClick={() => selectCrawl(crawl.id)}
                        >
                          <span className="truncate">
                            {formatCrawlDateTime(crawl)}
                          </span>
                          {currentCrawl?.id === crawl.id ? (
                            <CheckIcon className="ml-auto size-4" />
                          ) : null}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem
                        {...crawlDropdownPill.getItemProps(0)}
                        disabled
                      >
                        No crawls yet
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <CircleIcon
                  aria-hidden="true"
                  className="size-2 shrink-0 fill-emerald-500 text-emerald-500"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        aria-label="Switch workspace section"
                        className="inline-flex min-w-0 items-center rounded-md px-1 py-0.5 font-medium text-foreground hover:bg-accent data-[popup-open]:bg-accent"
                        type="button"
                      />
                    }
                  >
                    <span className="truncate">{headerLabel}</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="relative w-48"
                    onMouseLeave={tabDropdownPill.clearPill}
                    side="bottom"
                  >
                    <HoverPill pill={tabDropdownPill.pill} />
                    {workspaceNavItems.map((item, index) => {
                      const Icon = item.icon
                      return (
                        <DropdownMenuItem
                          key={item.label}
                          {...tabDropdownPill.getItemProps(index)}
                          onClick={item.onSelect}
                        >
                          <Icon aria-hidden="true" />
                          {item.label}
                          {item.isActive ? (
                            <CheckIcon className="ml-auto size-4" />
                          ) : null}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </h1>
              <div
                className={cn(
                  "relative z-[100] flex items-center justify-center px-2",
                  islandDockedSizeClass
                )}
              >
                {features.ai_chat && islandState === "docked" ? (
                  <>
                    <DynamicIslandMorphShell
                      onLayoutAnimationComplete={handleIslandLayoutComplete}
                      state="docked"
                      transition={islandDockTransition}
                    />
                    <DynamicIslandDockedChrome
                      active={isIslandThinking}
                      onOpen={maximizeIsland}
                      visible={islandChromeVisible}
                    />
                  </>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        className="hidden lg:inline-flex"
                        disabled={!activeProject}
                        size="sm"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <CogIcon aria-hidden="true" />
                    Configure
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="size-3.5 text-muted-foreground"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="relative w-48"
                    onMouseLeave={configureDropdownPill.clearPill}
                    side="bottom"
                  >
                    <HoverPill pill={configureDropdownPill.pill} />
                    {features.auto_crawl ? (
                      <DropdownMenuItem
                        {...configureDropdownPill.getItemProps(0)}
                        disabled={!activeProject || autoCrawl.isSaving}
                        onClick={() =>
                          autoCrawl.enabled
                            ? void autoCrawl.handleDisable()
                            : void autoCrawl.openDialog()
                        }
                      >
                        <SparklesIcon aria-hidden="true" />
                        {autoCrawl.enabled ? "Auto crawl on" : "Auto crawl"}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      {...configureDropdownPill.getItemProps(
                        features.auto_crawl ? 1 : 0
                      )}
                      disabled={!activeProject}
                      onClick={() =>
                        activeProject &&
                        businessProfile.openBusinessProfileDrawer(activeProject)
                      }
                    >
                      <Building2Icon aria-hidden="true" />
                      Business profile
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        className="hidden md:inline-flex"
                        disabled={!currentCrawl}
                        size="sm"
                        type="button"
                        variant="outline"
                      />
                    }
                  >
                    <DownloadIcon aria-hidden="true" />
                    {isExportingAudit || isExportingCrawl
                      ? "Exporting…"
                      : "Export"}
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="size-3.5 text-muted-foreground"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="relative w-52"
                    onMouseLeave={exportDropdownPill.clearPill}
                    side="bottom"
                  >
                    <HoverPill pill={exportDropdownPill.pill} />
                    <DropdownMenuItem
                      {...exportDropdownPill.getItemProps(0)}
                      disabled={
                        !currentCrawlCompleted || isExportingAudit
                      }
                      onClick={onExportAudit}
                    >
                      <FileTextIcon aria-hidden="true" />
                      {isExportingAudit
                        ? "Generating audit…"
                        : "Export PDF audit"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      {...exportDropdownPill.getItemProps(1)}
                      disabled={!currentCrawlCompleted || isExportingCrawl}
                      onClick={() =>
                        currentCrawl &&
                        void projectActions.handleExportCrawl(
                          currentCrawl,
                          "xlsx"
                        )
                      }
                    >
                      <FileSpreadsheetIcon aria-hidden="true" />
                      Export crawl as XLSX
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      {...exportDropdownPill.getItemProps(2)}
                      disabled={!currentCrawlCompleted || isExportingCrawl}
                      onClick={() =>
                        currentCrawl &&
                        void projectActions.handleExportCrawl(
                          currentCrawl,
                          "csv"
                        )
                      }
                    >
                      <FileSpreadsheetIcon aria-hidden="true" />
                      Export crawl as CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  disabled={!activeProject || isCrawlRunning}
                  onClick={() => runCrawlDispatch({ type: "OPEN" })}
                  size="sm"
                  type="button"
                >
                  <PlayIcon aria-hidden="true" />
                  {isCrawlRunning ? crawlStatusLabel : "Run crawl"}
                </Button>
              </div>
            </header>
            <div
              className={
                islandState === "maximized"
                  ? "relative z-0 min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable pointer-events-none"
                  : "min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable"
              }
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  animate={{ filter: "blur(0px)", opacity: 1 }}
                  exit={{ filter: "blur(10px)", opacity: 0 }}
                  initial={{ filter: "blur(10px)", opacity: 0 }}
                  key={workspaceContentKey}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.15,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </section>
          {features.ai_chat ? (
            <>
              <AnimatePresence>
                {islandState === "maximized" ? (
                  <motion.div
                    animate={{ opacity: 1 }}
                    aria-hidden="true"
                    className={cn(
                      "fixed inset-0 z-[99] bg-black/30 backdrop-blur-md",
                      shouldReduceMotion && "backdrop-blur-none"
                    )}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key="island-backdrop"
                    transition={islandBackdropTransition}
                  />
                ) : null}
              </AnimatePresence>
              {islandState === "maximized" ? (
                <DynamicIslandMorphShell
                  onLayoutAnimationComplete={handleIslandLayoutComplete}
                  state="maximized"
                  transition={islandOpenTransition}
                />
              ) : null}
              <DynamicIslandMaxPanel
                keepMounted
                onDock={dockIsland}
                revealTransition={islandPanelRevealTransition}
                title={islandConversationTitle}
                visible={islandPanelVisible}
              >
                <Suspense fallback={null}>
                  <RevbotView
                    activeProject={activeProject}
                    allowedEfforts={features.ai_allowed_reasoning_efforts}
                    compact
                    defaultHistoryOpen
                    hideCompactHeader
                    onActivityChange={setIsIslandThinking}
                    onConversationChange={onRevbotConversationChange}
                    onInternalLink={handleRevbotInternalLink}
                    onTitleChange={setIslandConversationTitle}
                    requestedConversationId={revbotConversationId}
                    showMic={false}
                    variant="dark"
                  />
                </Suspense>
              </DynamicIslandMaxPanel>
            </>
          ) : null}
          {isProjectPanelOpen ? (
            <>
              <button
                aria-label="Close project selector"
                className="fixed inset-0 z-40 cursor-default bg-black/60"
                onClick={() => setIsProjectPanelOpen(false)}
                type="button"
              />
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
            </>
          ) : null}
        </motion.main>
      </SidebarProvider>
      <RunCrawlDialog
        activeProject={activeProject}
        activeProjectId={activeProjectId}
        delayMs={runCrawl.delayMs}
        fetchTimeoutSeconds={runCrawl.fetchTimeoutSeconds}
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
  )
}
