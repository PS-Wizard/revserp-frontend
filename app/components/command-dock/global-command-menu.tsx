"use client"

import { useEffect, useState } from "react"
import {
  ActivityIcon,
  EyeIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderIcon,
  GaugeIcon,
  GlobeIcon,
  NetworkIcon,
  PlayIcon,
  SearchCheckIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"

import type {
  AuditTab,
  DashboardView,
  ExportFormat,
} from "~/components/app-navbar/types"
import { formatCrawlDateTime } from "~/components/app-navbar/utils"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"

export type GlobalCommandMenuProps = {
  view: DashboardView
  auditTab: AuditTab
  activeProject: ProjectResponse | null
  activeProjectId?: string | null
  activeCrawls: CrawlResponse[]
  currentCrawl: CrawlResponse | null
  projects: ProjectResponse[]
  isCrawlRunning: boolean
  isExportingAudit: boolean
  exportingCrawlId: string | null
  searchConsoleEnabled: boolean
  onViewChange: (view: DashboardView) => void
  onAuditTabChange: (tab: AuditTab) => void
  onSelectProject: (projectId: string, crawlId?: string) => void
  onCreateProjectOpen: () => void
  onRunCrawlOpen: () => void
  onExportAudit: () => void
  onExportCrawl: (crawl: CrawlResponse, format: ExportFormat) => void
}

function CrawlLabel({ crawl }: { crawl: CrawlResponse }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate font-medium">
        Switch to crawl {formatCrawlDateTime(crawl)}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {crawl.status}
        {crawl.urls_crawled > 0 ? ` · ${crawl.urls_crawled} URLs crawled` : ""}
      </span>
    </div>
  )
}

function ProjectLabel({ project }: { project: ProjectResponse }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate font-medium">Switch to {project.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {project.base_url}
      </span>
    </div>
  )
}

export function GlobalCommandMenu({
  view,
  auditTab,
  activeProject,
  activeProjectId,
  activeCrawls,
  currentCrawl,
  projects,
  isCrawlRunning,
  isExportingAudit,
  exportingCrawlId,
  searchConsoleEnabled,
  onViewChange,
  onAuditTabChange,
  onSelectProject,
  onCreateProjectOpen,
  onRunCrawlOpen,
  onExportAudit,
  onExportCrawl,
}: GlobalCommandMenuProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "k"
      ) {
        return
      }
      event.preventDefault()
      setSearch("")
      setOpen((isOpen) => !isOpen)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const close = () => {
    setOpen(false)
    setSearch("")
  }

  const select = (callback: () => void) => {
    close()
    callback()
  }

  const currentCrawlCompleted = currentCrawl?.status === "completed"
  const runCrawlReason =
    !activeProject || !activeProjectId
      ? "Select a project first"
      : isCrawlRunning
        ? "A crawl is already running"
        : undefined
  const pdfReason = isExportingAudit
    ? "PDF export in progress"
    : !currentCrawlCompleted
      ? "No completed current crawl"
      : undefined
  const crawlExportReason =
    exportingCrawlId !== null
      ? "Crawl export in progress"
      : !currentCrawlCompleted
        ? "No completed current crawl"
        : undefined

  return (
    <CommandDialog
      className="top-[40vh] max-w-2xl -translate-y-1/2"
      description="Search navigation, projects, crawls, and actions."
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setSearch("")
      }}
      open={open}
      title="Global command menu"
    >
      <Command
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          event.stopPropagation()
          close()
        }}
      >
        <CommandInput
          onValueChange={setSearch}
          placeholder="Search commands..."
          value={search}
        />
        <CommandList className="max-h-[min(70vh,42rem)]">
          <CommandEmpty>No commands found.</CommandEmpty>

          <CommandGroup heading="Navigation">
            <CommandItem
              data-checked={view === "revserp-audit" && auditTab === "summary"}
              onSelect={() =>
                select(() => {
                  onViewChange("revserp-audit")
                  onAuditTabChange("summary")
                })
              }
              value="Audit Summary"
            >
              <ActivityIcon />
              <span>Audit Summary</span>
            </CommandItem>
            <CommandItem
              data-checked={view === "revserp-audit" && auditTab === "seo"}
              onSelect={() =>
                select(() => {
                  onViewChange("revserp-audit")
                  onAuditTabChange("seo")
                })
              }
              value="SEO"
            >
              <SearchIcon />
              <span>SEO</span>
            </CommandItem>
            <CommandItem
              data-checked={view === "revserp-audit" && auditTab === "aeo"}
              onSelect={() =>
                select(() => {
                  onViewChange("revserp-audit")
                  onAuditTabChange("aeo")
                })
              }
              value="AEO"
            >
              <SparklesIcon />
              <span>AEO</span>
            </CommandItem>
            <CommandItem
              data-checked={
                view === "revserp-audit" && auditTab === "pagespeed"
              }
              onSelect={() =>
                select(() => {
                  onViewChange("revserp-audit")
                  onAuditTabChange("pagespeed")
                })
              }
              value="PageSpeed"
            >
              <GaugeIcon />
              <span>PageSpeed</span>
            </CommandItem>
            <CommandItem
              data-checked={
                view === "revserp-audit" && auditTab === "site-graph"
              }
              onSelect={() =>
                select(() => {
                  onViewChange("revserp-audit")
                  onAuditTabChange("site-graph")
                })
              }
              value="Site Graph"
            >
              <NetworkIcon />
              <span>Site Graph</span>
            </CommandItem>
            <CommandItem
              data-checked={view === "revserp-visibility"}
              onSelect={() => select(() => onViewChange("revserp-visibility"))}
              value="Visibility"
            >
              <EyeIcon />
              <span>Visibility</span>
            </CommandItem>
            {searchConsoleEnabled ? (
              <CommandItem
                data-checked={view === "search-console"}
                onSelect={() => select(() => onViewChange("search-console"))}
                value="Search Console"
              >
                <SearchCheckIcon />
                <span>Search Console</span>
              </CommandItem>
            ) : null}

            {projects.map((project) => (
              <CommandItem
                data-checked={project.id === activeProjectId}
                key={project.id}
                onSelect={() => select(() => onSelectProject(project.id))}
                value={`Switch to ${project.name} ${project.base_url}`}
              >
                <FolderIcon />
                <ProjectLabel project={project} />
              </CommandItem>
            ))}

            {search.trim()
              ? activeCrawls.map((crawl) => (
                  <CommandItem
                    data-checked={crawl.id === currentCrawl?.id}
                    key={crawl.id}
                    onSelect={() =>
                      select(() => onSelectProject(crawl.project_id, crawl.id))
                    }
                    value={`Switch to crawl ${formatCrawlDateTime(crawl)} ${crawl.id} ${crawl.status}`}
                  >
                    <GlobeIcon />
                    <CrawlLabel crawl={crawl} />
                  </CommandItem>
                ))
              : null}
          </CommandGroup>

          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => select(onCreateProjectOpen)}
              value="Create project"
            >
              <FolderIcon />
              <span>Create project</span>
            </CommandItem>
            <CommandItem
              disabled={runCrawlReason !== undefined}
              onSelect={() => {
                if (runCrawlReason) return
                select(onRunCrawlOpen)
              }}
              value="Run crawl"
            >
              <PlayIcon />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span>Run crawl</span>
                <span className="truncate text-xs text-muted-foreground">
                  {runCrawlReason ?? `Active project: ${activeProject?.name}`}
                </span>
              </div>
            </CommandItem>
            <CommandItem
              disabled={pdfReason !== undefined}
              onSelect={() => {
                if (pdfReason) return
                select(onExportAudit)
              }}
              value="Export PDF audit"
            >
              <FileTextIcon />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span>Export PDF audit</span>
                <span className="truncate text-xs text-muted-foreground">
                  {pdfReason ??
                    `Current crawl: ${formatCrawlDateTime(currentCrawl!)}`}
                </span>
              </div>
            </CommandItem>
            <CommandItem
              disabled={crawlExportReason !== undefined}
              onSelect={() => {
                if (crawlExportReason || !currentCrawl) return
                select(() => onExportCrawl(currentCrawl, "csv"))
              }}
              value="Export crawl as CSV"
            >
              <FileSpreadsheetIcon />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span>Export crawl as CSV</span>
                <span className="truncate text-xs text-muted-foreground">
                  {crawlExportReason ??
                    `Current crawl: ${formatCrawlDateTime(currentCrawl!)}`}
                </span>
              </div>
            </CommandItem>
            <CommandItem
              disabled={crawlExportReason !== undefined}
              onSelect={() => {
                if (crawlExportReason || !currentCrawl) return
                select(() => onExportCrawl(currentCrawl, "xlsx"))
              }}
              value="Export crawl as XLSX"
            >
              <FileSpreadsheetIcon />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span>Export crawl as XLSX</span>
                <span className="truncate text-xs text-muted-foreground">
                  {crawlExportReason ??
                    `Current crawl: ${formatCrawlDateTime(currentCrawl!)}`}
                </span>
              </div>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
