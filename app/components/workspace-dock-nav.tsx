"use client"

import { useState } from "react"

import type { AuditTab, DashboardView } from "~/components/app-navbar/types"
import type { ExportFormat } from "~/components/app-navbar/types"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"

import {
  CircleIcon,
  FileSpreadsheetIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react"

import {
  buildWorkspaceNavGroups,
  isWorkspaceTabActive,
} from "~/components/workspace-sidebar-nav"
import { HoverPill, useKeyedHoverPill } from "~/components/ui/hover-pill"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "~/components/ui/navigation-menu"
import { cn } from "~/lib/utils"

export type DockActionItem = {
  key: string
  label?: string
  icon?: React.ReactNode
  disabled?: boolean
  destructive?: boolean
  divider?: boolean
  onSelect?: () => void
}

type WorkspaceDockNavProps = {
  /** Rows rendered in the overflow panel, after a separator. */
  actions?: DockActionItem[]
  activeProjectId?: string
  crawls: CrawlResponse[]
  currentCrawl?: CrawlResponse | null
  formatCrawlLabel: (crawl: CrawlResponse) => string
  onCreateProject: () => void
  onDeleteCrawl: (crawl: CrawlResponse) => void
  onDeleteProject: (project: ProjectResponse) => void
  onExportCrawl: (crawl: CrawlResponse, format: ExportFormat) => void
  onOpenProjectPanel: () => void
  onSelectCrawl: (crawlId: string) => void
  onSelectProject: (projectId: string) => void
  projects: ProjectResponse[]
  /** Primary action rendered after the navigation menu. */
  trailing?: React.ReactNode
  auditTab: AuditTab
  gscConnector: boolean
  integrations: boolean
  maxCompetitors: number
  onSelectWorkspace: (nextView: DashboardView, nextAuditTab?: AuditTab) => void
  view: DashboardView
}

/**
 * One trigger per group. Hovering opens that group's panel; the shared viewport
 * morphs between panels, so moving across the bar slides the same surface rather
 * than closing and reopening.
 */
export function WorkspaceDockNav({
  actions,
  activeProjectId,
  auditTab,
  crawls,
  currentCrawl,
  formatCrawlLabel,
  gscConnector,
  integrations,
  maxCompetitors,
  onCreateProject,
  onDeleteCrawl,
  onDeleteProject,
  onExportCrawl,
  onOpenProjectPanel,
  onSelectCrawl,
  onSelectProject,
  onSelectWorkspace,
  projects,
  trailing,
  view,
}: WorkspaceDockNavProps) {
  // Controlled so a click can dismiss the mega menu before the project panel
  // opens. Otherwise the portalled menu paints above it and the two fight.
  const [openItem, setOpenItem] = useState<string | null>(null)
  // The context menu renders inside the panel, so a close unmounts it mid-gesture.
  // The panel stays put until the context menu reports itself closed.
  const [contextOpen, setContextOpen] = useState(false)
  const groups = buildWorkspaceNavGroups({
    gscConnector,
    integrations,
    maxCompetitors,
  })

  return (
    <>
      <NavigationMenu
        align="center"
        className="max-w-none min-w-0 shrink"
        closeDelay={180}
        delay={0}
        onValueChange={(next: string | null) => {
          if (next === null && contextOpen) return
          setOpenItem(next)
        }}
        side="bottom"
        sideOffset={10}
        value={openItem}
      >
        <NavigationMenuList>
          <NavigationMenuItem value="projects">
            <NavigationMenuTrigger
              className="h-9 max-w-56 cursor-pointer gap-2 rounded-lg px-3 text-sm text-foreground hover:bg-accent hover:text-foreground"
              onClick={(event) => {
                event.currentTarget.blur()
                setOpenItem(null)
                onOpenProjectPanel()
              }}
            >
              <span className="truncate">
                {projects.find((project) => project.id === activeProjectId)
                  ?.name ?? "Select a project"}
              </span>
            </NavigationMenuTrigger>
            <NavigationMenuContent
              className={cn("p-2", projects.length > 3 ? "w-[36rem]" : "w-80")}
            >
              <ProjectPanelList
                activeProjectId={activeProjectId}
                onContextOpenChange={setContextOpen}
                onCreateProject={onCreateProject}
                onDeleteProject={onDeleteProject}
                onSelectProject={(projectId) => {
                  setOpenItem(null)
                  onSelectProject(projectId)
                }}
                projects={projects}
              />
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem value="crawls">
            <NavigationMenuTrigger
              className="h-9 max-w-48 cursor-pointer gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={(event) => {
                event.currentTarget.blur()
                setOpenItem(null)
              }}
            >
              <span className="truncate">
                {currentCrawl ? formatCrawlLabel(currentCrawl) : "No crawl yet"}
              </span>
            </NavigationMenuTrigger>
            <NavigationMenuContent
              className={cn("p-2", crawls.length > 2 ? "w-[32rem]" : "w-80")}
            >
              <CrawlPanelList
                crawls={crawls}
                currentCrawlId={currentCrawl?.id}
                onContextOpenChange={setContextOpen}
                formatLabel={formatCrawlLabel}
                onDeleteCrawl={onDeleteCrawl}
                onExportCrawl={onExportCrawl}
                onSelectCrawl={(crawlId) => {
                  setOpenItem(null)
                  onSelectCrawl(crawlId)
                }}
              />
            </NavigationMenuContent>
          </NavigationMenuItem>
          <span
            aria-hidden="true"
            className="mx-2 h-5 w-px shrink-0 self-center bg-white/12"
          />
          {groups.map((group) => {
            const activeTab = group.tabs.find((tab) =>
              isWorkspaceTabActive(tab, view, auditTab)
            )
            return (
              <NavigationMenuItem key={group.key} value={group.key}>
                <NavigationMenuTrigger
                  // Clicking the group name goes to that group's landing tab. The
                  // groups are built in landing order, so the first tab is the one
                  // to land on: Overview, Search Console, Competitors, CMS.
                  onClick={() => {
                    const landing = group.tabs[0]
                    if (landing)
                      onSelectWorkspace(landing.view, landing.auditTab)
                  }}
                  className={cn(
                    "relative z-10 h-9 cursor-pointer gap-1.5 rounded-lg px-3 text-sm",
                    activeTab
                      ? "bg-foreground font-semibold text-background hover:opacity-90"
                      : "bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
                  )}
                >
                  {group.label}
                  {activeTab ? (
                    <>
                      <CircleIcon
                        aria-hidden="true"
                        className="size-1.5 shrink-0 fill-current opacity-50"
                      />
                      {activeTab.label}
                    </>
                  ) : null}
                </NavigationMenuTrigger>
                <NavigationMenuContent
                  className={cn(
                    "p-2",
                    group.tabs.length > 3 ? "w-[36rem]" : "w-80"
                  )}
                >
                  <DockPanel
                    group={group}
                    auditTab={auditTab}
                    onSelectWorkspace={onSelectWorkspace}
                    view={view}
                  />
                </NavigationMenuContent>
              </NavigationMenuItem>
            )
          })}
          {actions ? (
            <>
              <span
                aria-hidden="true"
                className="mx-2 h-5 w-px shrink-0 self-center bg-white/12"
              />
              {trailing}
              <NavigationMenuItem value="actions">
                <NavigationMenuTrigger
                  aria-label="Actions"
                  className="h-9 w-9 cursor-pointer rounded-lg px-0 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontalIcon aria-hidden="true" className="size-4" />
                </NavigationMenuTrigger>
                <NavigationMenuContent className="w-60 p-2">
                  <DockActions actions={actions} />
                </NavigationMenuContent>
              </NavigationMenuItem>
            </>
          ) : null}
        </NavigationMenuList>
      </NavigationMenu>
    </>
  )
}
/**
 * The panel rows use the app's sliding pill rather than a per-row hover fill, so
 * moving down the list glides one highlight instead of blinking each row. The
 * morph between panels still comes from the navigation menu viewport.
 */
function DockPanel({
  auditTab,
  group,
  onSelectWorkspace,
  view,
}: {
  auditTab: AuditTab
  group: {
    key: string
    label: string
    tabs: ReturnType<typeof buildWorkspaceNavGroups>[number]["tabs"]
  }
  onSelectWorkspace: (nextView: DashboardView, nextAuditTab?: AuditTab) => void
  view: DashboardView
}) {
  const { clearPill, pill, setItemRef, showPill } = useKeyedHoverPill()

  const columns = group.tabs.length > 3 ? 2 : 1

  return (
    <ul
      className="relative grid gap-0.5"
      onMouseLeave={clearPill}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      <HoverPill className="rounded-lg" pill={pill} />
      {group.tabs.map((tab) => {
        const active = isWorkspaceTabActive(tab, view, auditTab)
        return (
          <li key={tab.key}>
            <NavigationMenuLink
              className={cn(
                "relative z-10 h-auto cursor-pointer items-start gap-2.5 bg-transparent p-2 hover:bg-transparent focus:bg-transparent",
                active
                  ? "text-foreground"
                  : "text-foreground/80 hover:text-foreground"
              )}
              onClick={() => onSelectWorkspace(tab.view, tab.auditTab)}
              onMouseEnter={() => showPill(tab.key)}
              ref={setItemRef(tab.key)}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-white/10 to-white/[0.03] ring-1 ring-white/[0.06] ring-inset",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <tab.Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{tab.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {tab.description}
                </span>
              </span>
            </NavigationMenuLink>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The overflow rows use the same gliding pill as the tab panels, so moving down
 * either list behaves identically.
 */
function DockActions({ actions }: { actions: DockActionItem[] }) {
  const { clearPill, pill, setItemRef, showPill } = useKeyedHoverPill()

  return (
    <ul className="relative flex flex-col gap-0.5" onMouseLeave={clearPill}>
      <HoverPill className="rounded-md" pill={pill} />
      {actions.map((action) =>
        action.divider ? (
          <li
            aria-hidden="true"
            className="my-1 h-px bg-white/10"
            key={action.key}
          />
        ) : (
          <li key={action.key}>
            <button
              className={cn(
                "relative z-10 flex w-full cursor-pointer items-center gap-2 rounded-md bg-transparent px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-transparent disabled:pointer-events-none disabled:opacity-40",
                action.destructive ? "text-destructive" : "text-foreground"
              )}
              disabled={action.disabled}
              onClick={action.onSelect}
              onMouseEnter={() => showPill(action.key)}
              ref={setItemRef(action.key)}
              type="button"
            >
              {action.icon}
              {action.label}
            </button>
          </li>
        )
      )}
    </ul>
  )
}

/**
 * Fast project switching without leaving the page. Clicking the tile opens the
 * full project panel, which is where crawls and per-project actions live.
 */

function ProjectPanelList({
  activeProjectId,
  onContextOpenChange,
  onCreateProject,
  onDeleteProject,
  onSelectProject,
  projects,
}: {
  activeProjectId?: string
  onContextOpenChange: (open: boolean) => void
  onCreateProject: () => void
  onDeleteProject: (project: ProjectResponse) => void
  onSelectProject: (projectId: string) => void
  projects: ProjectResponse[]
}) {
  const { clearPill, pill, setItemRef, showPill } = useKeyedHoverPill()
  const columns = projects.length > 3 ? 2 : 1

  return (
    <ul
      className="relative grid max-h-72 gap-0.5 overflow-y-auto"
      onMouseLeave={clearPill}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      <HoverPill className="rounded-lg" pill={pill} />
      <li className="col-span-full">
        <button
          className="relative z-10 flex w-full cursor-pointer items-center gap-2.5 rounded-lg bg-transparent p-2 text-left text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={onCreateProject}
          type="button"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-white/10 to-white/[0.03] text-muted-foreground ring-1 ring-white/[0.06] ring-inset">
            <PlusIcon aria-hidden="true" className="size-4" />
          </span>
          <span className="text-sm font-medium">New project</span>
        </button>
      </li>
      <li
        aria-hidden="true"
        className="col-span-full my-0.5 h-px bg-white/10"
      />
      {projects.map((project) => {
        const active = project.id === activeProjectId
        return (
          <ContextMenu key={project.id} onOpenChange={onContextOpenChange}>
            <ContextMenuTrigger className="block">
              <button
                className={cn(
                  "relative z-10 flex h-auto w-full cursor-pointer items-center gap-2.5 rounded-lg bg-transparent p-2 text-left hover:bg-transparent focus:bg-transparent",
                  active
                    ? "text-foreground"
                    : "text-foreground/80 hover:text-foreground"
                )}
                onClick={() => onSelectProject(project.id)}
                onMouseEnter={() => showPill(project.id)}
                ref={setItemRef(project.id)}
                type="button"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-white/10 to-white/[0.03] text-sm font-semibold ring-1 ring-white/[0.06] ring-inset",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {project.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {project.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {project.base_url}
                  </span>
                </span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={() => onDeleteProject(project)}
                variant="destructive"
              >
                <TrashIcon aria-hidden="true" />
                Delete project
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </ul>
  )
}

function CrawlPanelList({
  crawls,
  currentCrawlId,
  formatLabel,
  onContextOpenChange,
  onDeleteCrawl,
  onExportCrawl,
  onSelectCrawl,
}: {
  crawls: CrawlResponse[]
  currentCrawlId?: string
  formatLabel: (crawl: CrawlResponse) => string
  onContextOpenChange: (open: boolean) => void
  onDeleteCrawl: (crawl: CrawlResponse) => void
  onExportCrawl: (crawl: CrawlResponse, format: ExportFormat) => void
  onSelectCrawl: (crawlId: string) => void
}) {
  const { clearPill, pill, setItemRef, showPill } = useKeyedHoverPill()

  if (crawls.length === 0) {
    return (
      <p className="px-2 py-3 text-sm text-muted-foreground">
        This project has no crawls yet.
      </p>
    )
  }

  return (
    <ul
      className="relative max-h-72 flex-col gap-0.5 overflow-y-auto"
      onMouseLeave={clearPill}
    >
      <HoverPill className="rounded-lg" pill={pill} />
      {crawls.map((crawl) => {
        const active = crawl.id === currentCrawlId
        return (
          <ContextMenu key={crawl.id} onOpenChange={onContextOpenChange}>
            <ContextMenuTrigger className="block">
              <button
                className={cn(
                  "relative z-10 flex h-auto w-full cursor-pointer items-center gap-2.5 rounded-lg bg-transparent p-2 text-left hover:bg-transparent focus:bg-transparent",
                  active
                    ? "text-foreground"
                    : "text-foreground/80 hover:text-foreground"
                )}
                onClick={() => onSelectCrawl(crawl.id)}
                onMouseEnter={() => showPill(crawl.id)}
                ref={setItemRef(crawl.id)}
                type="button"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-white/10 to-white/[0.03] ring-1 ring-white/[0.06] ring-inset",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <HistoryIcon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {formatLabel(crawl)}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {crawl.urls_crawled}/{crawl.page_count ?? 0} · Discovered:{" "}
                    {crawl.urls_discovered} · Crawled: {crawl.urls_crawled}
                  </span>
                </span>
                <span className="ml-auto shrink-0 text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                  {crawl.status}
                </span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onExportCrawl(crawl, "xlsx")}>
                <FileSpreadsheetIcon aria-hidden="true" />
                Export crawl as XLSX
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onExportCrawl(crawl, "csv")}>
                <FileSpreadsheetIcon aria-hidden="true" />
                Export crawl as CSV
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => onDeleteCrawl(crawl)}
                variant="destructive"
              >
                <TrashIcon aria-hidden="true" />
                Delete crawl
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </ul>
  )
}
