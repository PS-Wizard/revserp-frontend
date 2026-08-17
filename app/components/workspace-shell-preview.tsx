"use client"

import type { CSSProperties, FormEvent, ReactNode } from "react"
import { useEffect, useMemo, useReducer, useRef, useState } from "react"
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
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react"

import { AppNavbarDialogs, type AppNavbarProps } from "~/components/app-navbar"
import { AutoCrawlDialog } from "~/components/app-navbar/auto-crawl-dialog"
import { ProfileMenu } from "~/components/app-navbar/profile-menu"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { DropdownPillSurface } from "~/components/ui/hover-pill"
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
  DynamicIslandPanel,
  islandTransition,
} from "~/components/dynamic-island-poc"
import { focusRevbotPrompt } from "~/components/revbot/revbot-composer"
import { RevbotViewContent } from "~/components/revbot/revbot-view"
import { useRevbot } from "~/components/revbot/use-revbot"
import { getCrawlTimestamp } from "~/lib/crawl"
import { clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  CrawlResponse,
  CrawlsResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { useFeatures } from "~/lib/features"
import { WorkspaceSidebarNav } from "~/components/workspace-sidebar-nav"

const auditSections = [
  ["Overview", "summary", GaugeIcon],
  ["SEO", "seo", SearchIcon],
  ["AEO", "aeo", SparklesIcon],
  ["PageSpeed", "pagespeed", ActivityIcon],
  ["Site graph", "site-graph", NetworkIcon],
] as const

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
  const [islandState, setIslandState] = useState<
    "docked" | "minimized" | "maximized"
  >("docked")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const [isIslandThinking, setIsIslandThinking] = useState(false)
  const [islandConversationTitle, setIslandConversationTitle] =
    useState("New chat")
  const [isProjectPanelOpen, setIsProjectPanelOpen] = useState(false)
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
                ? "absolute inset-y-0 left-0 z-30 min-h-0 border-r border-border bg-sidebar p-2 text-foreground transition-[width,padding] duration-200 ease-out motion-reduce:transition-none"
                : "absolute inset-y-0 left-0 z-40 min-h-0 border-r border-border bg-sidebar p-3 text-foreground transition-[width,padding] duration-200 ease-out motion-reduce:transition-none"
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
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">
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
              <WorkspaceSidebarNav
                auditTab={auditTab}
                gscConnector={features.gsc_connector}
                isSidebarCollapsed={isSidebarCollapsed}
                onSelectWorkspace={selectWorkspace}
                view={view}
              />
            </div>
            <div className="min-h-0 flex-1" />
            <SidebarFooter className="gap-0 p-0 pt-3">
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
            <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
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
                  <DropdownPillSurface
                    align="start"
                    className="w-56"
                    side="bottom"
                  >
                    {(pill) =>
                      projects.length ? (
                        projects.map((project, index) => (
                          <DropdownMenuItem
                            key={project.id}
                            {...pill.getItemProps(index)}
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
                        <DropdownMenuItem {...pill.getItemProps(0)} disabled>
                          No projects yet
                        </DropdownMenuItem>
                      )
                    }
                  </DropdownPillSurface>
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
                        className="inline-flex min-w-0 items-center rounded-md px-1 py-0.5 font-normal text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-50 data-[popup-open]:bg-accent"
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
                  <DropdownPillSurface
                    align="start"
                    className="w-56"
                    side="bottom"
                  >
                    {(pill) =>
                      activeProjectCrawls.length ? (
                        activeProjectCrawls.map((crawl, index) => (
                          <DropdownMenuItem
                            key={crawl.id}
                            {...pill.getItemProps(index)}
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
                        <DropdownMenuItem {...pill.getItemProps(0)} disabled>
                          No crawls yet
                        </DropdownMenuItem>
                      )
                    }
                  </DropdownPillSurface>
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
                  <DropdownPillSurface
                    align="start"
                    className="w-48"
                    side="bottom"
                  >
                    {(pill) =>
                      workspaceNavItems.map((item, index) => {
                        const Icon = item.icon
                        return (
                          <DropdownMenuItem
                            key={item.label}
                            {...pill.getItemProps(index)}
                            onClick={item.onSelect}
                          >
                            <Icon aria-hidden="true" />
                            {item.label}
                            {item.isActive ? (
                              <CheckIcon className="ml-auto size-4" />
                            ) : null}
                          </DropdownMenuItem>
                        )
                      })
                    }
                  </DropdownPillSurface>
                </DropdownMenu>
              </h1>
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
                  <DropdownPillSurface
                    align="end"
                    className="w-48"
                    side="bottom"
                  >
                    {(pill) => (
                      <>
                        {features.auto_crawl ? (
                          <DropdownMenuItem
                            {...pill.getItemProps(0)}
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
                          {...pill.getItemProps(features.auto_crawl ? 1 : 0)}
                          disabled={!activeProject}
                          onClick={() =>
                            activeProject &&
                            businessProfile.openBusinessProfileDrawer(
                              activeProject
                            )
                          }
                        >
                          <Building2Icon aria-hidden="true" />
                          Business profile
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownPillSurface>
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
                  <DropdownPillSurface
                    align="end"
                    className="w-52"
                    side="bottom"
                  >
                    {(pill) => (
                      <>
                        <DropdownMenuItem
                          {...pill.getItemProps(0)}
                          disabled={!currentCrawlCompleted || isExportingAudit}
                          onClick={onExportAudit}
                        >
                          <FileTextIcon aria-hidden="true" />
                          {isExportingAudit
                            ? "Generating audit…"
                            : "Export PDF audit"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          {...pill.getItemProps(1)}
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
                          {...pill.getItemProps(2)}
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
                      </>
                    )}
                  </DropdownPillSurface>
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
                  ? "pointer-events-none relative z-0 min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto"
                  : "min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto"
              }
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
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
            <LayoutGroup id="ai-island-group">
              {islandState === "docked" ? (
                <DynamicIslandDockedChrome
                  active={isIslandThinking}
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
                      onInternalLink={handleRevbotInternalLink}
                      onTitleChange={setIslandConversationTitle}
                      revbot={islandRevbot}
                      showMic={false}
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
