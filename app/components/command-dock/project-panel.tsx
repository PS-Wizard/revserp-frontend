"use client"

import { useEffect, useRef } from "react"
import { motion } from "motion/react"
import { Building2Icon, CheckIcon, PlusIcon, TrashIcon } from "lucide-react"
import { ThinkingOrb } from "thinking-orbs"

import { CrawlContextRow } from "~/components/app-navbar/crawl-context-row"
import type { ExportFormat } from "~/components/app-navbar/types"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"

import { CAPSULE_RADIUS, dockTransition, panelContentMotion } from "./constants"

export type ProjectPanelProps = {
  activeProjectId?: string | null
  crawlPanelCrawls: CrawlResponse[]
  currentCrawl: CrawlResponse | null
  cancellingCrawlId: string | null
  deletingCrawlId: string | null
  deletingProjectId: string | null
  exportFormat: ExportFormat
  exportingCrawlId: string | null
  projectActionError: string
  projects: ProjectResponse[]
  onCancelCrawl: (crawl: CrawlResponse) => void
  /** Absent when nothing is selected to compare against. */
  onCompareCrawl?: (crawl: CrawlResponse) => void
  onCreateProjectOpen: () => void
  onDeleteCrawl: (crawl: CrawlResponse) => void
  onDeleteProject: (project: ProjectResponse) => void
  onExportCrawl: (crawl: CrawlResponse, format: ExportFormat) => void
  onExportFormatChange: (format: ExportFormat) => void
  onOpenBusinessProfile: (project: ProjectResponse) => void
  onProjectHover: (projectId: string) => void
  onSelectProject: (projectId: string, crawlId?: string) => void
  reducedMotion: boolean
}

export function ProjectPanel({
  activeProjectId,
  crawlPanelCrawls,
  currentCrawl,
  cancellingCrawlId,
  deletingCrawlId,
  deletingProjectId,
  exportFormat,
  exportingCrawlId,
  projectActionError,
  projects,
  onCancelCrawl,
  onCompareCrawl,
  onCreateProjectOpen,
  onDeleteCrawl,
  onDeleteProject,
  onExportCrawl,
  onExportFormatChange,
  onOpenBusinessProfile,
  onProjectHover,
  onSelectProject,
  reducedMotion,
}: ProjectPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus the search box as soon as the panel mounts; returning focus to the
  // project pill on close is handled by the dock (the pill outlives this tree).
  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLInputElement>("[data-slot=command-input]")
      ?.focus()
  }, [])

  return (
    <motion.div
      aria-label="Projects"
      aria-modal="true"
      className="pointer-events-auto flex h-[min(520px,70vh)] w-full min-w-0 flex-1 flex-col overflow-hidden border border-border/70 bg-card/95 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
      layout
      layoutId="dock-context"
      ref={panelRef}
      role="dialog"
      style={{ borderRadius: CAPSULE_RADIUS, willChange: "transform" }}
      transition={dockTransition(reducedMotion)}
    >
      <motion.div
        className="flex min-h-0 flex-1 flex-col"
        {...panelContentMotion(reducedMotion)}
      >
        <p className="sr-only">Select a project or create a new one.</p>
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)] sm:grid-rows-1">
          <ProjectCommandList
            activeProjectId={activeProjectId}
            deletingProjectId={deletingProjectId}
            projects={projects}
            onCreateProjectOpen={onCreateProjectOpen}
            onDeleteProject={onDeleteProject}
            onOpenBusinessProfile={onOpenBusinessProfile}
            onProjectHover={onProjectHover}
            onSelectProject={onSelectProject}
          />

          <CrawlPanel
            crawlPanelCrawls={crawlPanelCrawls}
            currentCrawl={currentCrawl}
            cancellingCrawlId={cancellingCrawlId}
            deletingCrawlId={deletingCrawlId}
            exportFormat={exportFormat}
            exportingCrawlId={exportingCrawlId}
            onCancelCrawl={onCancelCrawl}
            onCompareCrawl={onCompareCrawl}
            onDeleteCrawl={onDeleteCrawl}
            onExportCrawl={onExportCrawl}
            onExportFormatChange={onExportFormatChange}
            onSelectProject={onSelectProject}
          />
        </div>
        {projectActionError ? (
          <p className="border-t border-border/50 px-4 py-3 text-sm text-destructive">
            {projectActionError}
          </p>
        ) : null}
      </motion.div>
    </motion.div>
  )
}

type ProjectCommandListProps = {
  activeProjectId?: string | null
  deletingProjectId: string | null
  projects: ProjectResponse[]
  onCreateProjectOpen: () => void
  onDeleteProject: (project: ProjectResponse) => void
  onOpenBusinessProfile: (project: ProjectResponse) => void
  onProjectHover: (projectId: string) => void
  onSelectProject: (projectId: string) => void
}

function ProjectCommandList({
  activeProjectId,
  deletingProjectId,
  projects,
  onCreateProjectOpen,
  onDeleteProject,
  onOpenBusinessProfile,
  onProjectHover,
  onSelectProject,
}: ProjectCommandListProps) {
  return (
    <Command className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent sm:border-r sm:border-border/50">
      <div className="border-b border-border/50 px-3 py-3">
        <CommandInput placeholder="Search projects..." />
      </div>
      <CommandList className="max-h-none min-h-0 flex-1 py-2">
        <CommandEmpty>No projects found.</CommandEmpty>
        <CommandGroup heading="Projects">
          <CommandItem
            className="mx-2 rounded-lg py-2.5"
            onSelect={onCreateProjectOpen}
          >
            <PlusIcon />
            Create new project
          </CommandItem>
          {projects.map((project) => (
            <ProjectCommandItem
              activeProjectId={activeProjectId}
              deletingProjectId={deletingProjectId}
              key={project.id}
              project={project}
              onDeleteProject={onDeleteProject}
              onOpenBusinessProfile={onOpenBusinessProfile}
              onProjectHover={onProjectHover}
              onSelectProject={onSelectProject}
            />
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

type ProjectCommandItemProps = {
  activeProjectId?: string | null
  deletingProjectId: string | null
  project: ProjectResponse
  onDeleteProject: (project: ProjectResponse) => void
  onOpenBusinessProfile: (project: ProjectResponse) => void
  onProjectHover: (projectId: string) => void
  onSelectProject: (projectId: string) => void
}

function ProjectCommandItem({
  activeProjectId,
  deletingProjectId,
  project,
  onDeleteProject,
  onOpenBusinessProfile,
  onProjectHover,
  onSelectProject,
}: ProjectCommandItemProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <CommandItem
          className="mx-2 rounded-lg py-2.5 data-[selected=true]:bg-accent/70"
          onMouseEnter={() => onProjectHover(project.id)}
          onSelect={() => onSelectProject(project.id)}
          value={`${project.name} ${project.base_url}`}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium">{project.name}</span>
            <span className="truncate text-muted-foreground">
              {project.base_url}
            </span>
          </div>
          {project.id === activeProjectId ? <CheckIcon /> : null}
        </CommandItem>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuGroup>
          <ContextMenuItem onClick={() => onOpenBusinessProfile(project)}>
            <Building2Icon />
            Business profile
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={deletingProjectId !== null}
            onClick={() => onDeleteProject(project)}
            variant="destructive"
          >
            {deletingProjectId === project.id ? (
              <ThinkingOrb
                aria-label="Deleting project"
                className="shrink-0"
                size={20}
                state="working"
                style={{ width: 16, height: 16 }}
              />
            ) : (
              <TrashIcon />
            )}
            Delete project
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

type CrawlPanelProps = {
  crawlPanelCrawls: CrawlResponse[]
  currentCrawl: CrawlResponse | null
  cancellingCrawlId: string | null
  deletingCrawlId: string | null
  exportFormat: ExportFormat
  exportingCrawlId: string | null
  onCancelCrawl: (crawl: CrawlResponse) => void
  onCompareCrawl?: (crawl: CrawlResponse) => void
  onDeleteCrawl: (crawl: CrawlResponse) => void
  onExportCrawl: (crawl: CrawlResponse, format: ExportFormat) => void
  onExportFormatChange: (format: ExportFormat) => void
  onSelectProject: (projectId: string, crawlId?: string) => void
}

function CrawlPanel({
  crawlPanelCrawls,
  currentCrawl,
  cancellingCrawlId,
  deletingCrawlId,
  exportFormat,
  exportingCrawlId,
  onCancelCrawl,
  onCompareCrawl,
  onDeleteCrawl,
  onExportCrawl,
  onExportFormatChange,
  onSelectProject,
}: CrawlPanelProps) {
  return (
    <div className="flex min-h-0 flex-col border-t border-border/50 bg-muted/20 sm:border-t-0">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {crawlPanelCrawls.length > 0 ? (
          <div className="flex flex-col gap-1">
            {crawlPanelCrawls.map((crawl) => (
              <CrawlContextRow
                crawl={crawl}
                disabled={deletingCrawlId !== null || exportingCrawlId !== null}
                exportFormat={exportFormat}
                isActive={crawl.id === currentCrawl?.id}
                isCancelling={cancellingCrawlId === crawl.id}
                isDeleting={deletingCrawlId === crawl.id}
                isExporting={exportingCrawlId === crawl.id}
                key={crawl.id}
                onCancel={() => onCancelCrawl(crawl)}
                onCompare={
                  onCompareCrawl &&
                  crawl.status === "completed" &&
                  crawl.project_id !== currentCrawl?.project_id
                    ? () => onCompareCrawl(crawl)
                    : undefined
                }
                onDelete={() => onDeleteCrawl(crawl)}
                onExport={(format) => onExportCrawl(crawl, format)}
                onFormatChange={onExportFormatChange}
                onSelect={() => onSelectProject(crawl.project_id, crawl.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border/60 text-center text-sm text-muted-foreground">
            No crawls for this project yet.
          </div>
        )}
      </div>
    </div>
  )
}
