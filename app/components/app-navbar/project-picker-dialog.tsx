import { Building2Icon, CheckIcon, PlusIcon, TrashIcon } from "lucide-react"

import { CompileLoader } from "~/components/compile-loader"
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"

import { CrawlContextRow } from "./crawl-context-row"
import type { ExportFormat } from "./types"

type ProjectPickerDialogProps = {
  activeProjectId?: string | null
  crawlPanelCrawls: CrawlResponse[]
  currentCrawl: CrawlResponse | null
  deletingCrawlId: string | null
  deletingProjectId: string | null
  exportFormat: ExportFormat
  exportingCrawlId: string | null
  isOpen: boolean
  projectActionError: string
  projects: ProjectResponse[]
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

export function ProjectPickerDialog({
  activeProjectId,
  crawlPanelCrawls,
  currentCrawl,
  deletingCrawlId,
  deletingProjectId,
  exportFormat,
  exportingCrawlId,
  isOpen,
  projectActionError,
  projects,
  onCreateProjectOpen,
  onDeleteCrawl,
  onDeleteProject,
  onExportCrawl,
  onExportFormatChange,
  onOpenBusinessProfile,
  onOpenChange,
  onProjectHover,
  onSelectProject,
}: ProjectPickerDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent
        className="gap-0 overflow-hidden rounded-xl border-border/50 p-0 shadow-lg sm:max-w-4xl"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Projects</DialogTitle>
          <DialogDescription>Select a project or create a new one.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-[460px] grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] bg-popover">
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
            deletingCrawlId={deletingCrawlId}
            exportFormat={exportFormat}
            exportingCrawlId={exportingCrawlId}
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
      </DialogContent>
    </Dialog>
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
      <CommandList className="max-h-[460px] py-2">
        <CommandEmpty>No projects found.</CommandEmpty>
        <CommandGroup heading="Projects">
          <CommandItem className="mx-2 rounded-lg py-2.5" onSelect={onCreateProjectOpen}>
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
            <span className="truncate text-muted-foreground">{project.base_url}</span>
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
  deletingCrawlId: string | null
  exportFormat: ExportFormat
  exportingCrawlId: string | null
  onDeleteCrawl: (crawl: CrawlResponse) => void
  onExportCrawl: (crawl: CrawlResponse, format: ExportFormat) => void
  onExportFormatChange: (format: ExportFormat) => void
  onSelectProject: (projectId: string, crawlId?: string) => void
}

function CrawlPanel({
  crawlPanelCrawls,
  currentCrawl,
  deletingCrawlId,
  exportFormat,
  exportingCrawlId,
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
                isDeleting={deletingCrawlId === crawl.id}
                isExporting={exportingCrawlId === crawl.id}
                key={crawl.id}
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
