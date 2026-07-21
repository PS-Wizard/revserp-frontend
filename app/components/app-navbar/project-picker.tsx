"use client"

import { useEffect, useRef } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react"

import { CompileLoader } from "~/components/compile-loader"
import { buttonVariants } from "~/components/ui/button"
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
import { cn } from "~/lib/utils"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"

import { CrawlContextRow } from "./crawl-context-row"
import type { ExportFormat } from "./types"

const CARD_TRANSITION = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.9,
}

type ProjectPickerProps = {
  activeProjectId?: string | null
  activeProjectName?: string
  crawlPanelCrawls: CrawlResponse[]
  currentCrawl: CrawlResponse | null
  cancellingCrawlId: string | null
  deletingCrawlId: string | null
  deletingProjectId: string | null
  exportFormat: ExportFormat
  exportingCrawlId: string | null
  isOpen: boolean
  projectActionError: string
  projects: ProjectResponse[]
  onCancelCrawl: (crawl: CrawlResponse) => void
  onCreateProjectOpen: () => void
  onDeleteCrawl: (crawl: CrawlResponse) => void
  onDeleteProject: (project: ProjectResponse) => void
  onExportCrawl: (crawl: CrawlResponse, format: ExportFormat) => void
  onExportFormatChange: (format: ExportFormat) => void
  onOpenBusinessProfile: (project: ProjectResponse) => void
  onOpenChange: (open: boolean) => void
  onProjectHover: (projectId: string) => void
  onSelectProject: (projectId: string, crawlId?: string) => void
}

export function ProjectPicker({
  activeProjectId,
  activeProjectName,
  crawlPanelCrawls,
  currentCrawl,
  cancellingCrawlId,
  deletingCrawlId,
  deletingProjectId,
  exportFormat,
  exportingCrawlId,
  isOpen,
  projectActionError,
  projects,
  onCancelCrawl,
  onCreateProjectOpen,
  onDeleteCrawl,
  onDeleteProject,
  onExportCrawl,
  onExportFormatChange,
  onOpenBusinessProfile,
  onOpenChange,
  onProjectHover,
  onSelectProject,
}: ProjectPickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)

  // Escape closes, and lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen, onOpenChange])

  // On open focus the search input; on close return focus to the trigger pill.
  useEffect(() => {
    if (isOpen) {
      panelRef.current
        ?.querySelector<HTMLInputElement>("[data-slot=command-input]")
        ?.focus()
    } else if (wasOpenRef.current) {
      triggerRef.current?.focus()
    }
    wasOpenRef.current = isOpen
  }, [isOpen])

  return (
    <>
      {isOpen ? (
        <span aria-hidden className="inline-block h-9 w-72" />
      ) : (
        <motion.button
          ref={triggerRef}
          layout
          layoutId="project-picker-card"
          // Close (panel -> pill) is the entering pill's transition: snap it
          // instantly so the shrink doesn't spring and distort the text.
          transition={{ duration: 0 }}
          type="button"
          data-slot="button"
          onClick={() => onOpenChange(true)}
          className={cn(buttonVariants({ variant: "outline" }), "w-72 justify-between")}
        >
          <span className="min-w-0 truncate">
            {activeProjectName || "Search projects"}
          </span>
          <ChevronsUpDownIcon data-icon="inline-end" />
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="project-picker-backdrop"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onOpenChange(false)}
          />
        ) : null}
      </AnimatePresence>

      {isOpen ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-[72px]">
          <motion.div
            ref={panelRef}
            layout
            layoutId="project-picker-card"
            transition={CARD_TRANSITION}
            role="dialog"
            aria-modal="true"
            aria-label="Projects"
            className="pointer-events-auto flex h-[460px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl shadow-black/40"
          >
            <p className="sr-only">Select a project or create a new one.</p>
            <div className="grid h-[460px] grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] bg-popover">
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
        </div>
      ) : null}
    </>
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
    <Command className="flex h-full w-full flex-col overflow-hidden border-r border-border/50 bg-popover">
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
              <CompileLoader className="text-destructive" size={16} />
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
  onDeleteCrawl,
  onExportCrawl,
  onExportFormatChange,
  onSelectProject,
}: CrawlPanelProps) {
  return (
    <div className="flex min-h-0 flex-col bg-muted/20">
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
