"use client"

import { memo, type RefObject } from "react"
import { motion } from "motion/react"
import { Building2Icon, CogIcon, DownloadIcon, PlayIcon } from "lucide-react"
import { ThinkingOrb } from "thinking-orbs"

import type { ExportFormat } from "~/components/app-navbar/types"
import { formatCrawlDateTime } from "~/components/app-navbar/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"
import { cn } from "~/lib/utils"

import {
  CAPSULE_HEIGHT,
  CAPSULE_RADIUS,
  CAPSULE_SHELL,
  PILL_BASE,
  PILL_RADIUS,
  dockTransition,
  panelContentMotion,
} from "./constants"

export type ContextCapsuleProps = {
  activeProject: ProjectResponse | null
  activeProjectId?: string | null
  activeCrawls: CrawlResponse[]
  isCrawlRunning: boolean
  crawlStatusLabel: string
  exportingCrawlId: string | null
  isExportingAudit: boolean
  isAutoCrawlEnabled: boolean
  projectTriggerRef: RefObject<HTMLButtonElement | null>
  onOpenProjects: () => void
  onRunCrawlOpen: () => void
  onAutoCrawlEnable: () => void
  onAutoCrawlDisable: () => void
  onOpenBusinessProfile: (project: ProjectResponse) => void
  onExportAudit: () => void
  onExportCrawl: (crawl: CrawlResponse, format: ExportFormat) => void
  reducedMotion: boolean
}

export const ContextCapsule = memo(function ContextCapsule({
  activeProject,
  activeProjectId,
  activeCrawls,
  isCrawlRunning,
  crawlStatusLabel,
  exportingCrawlId,
  isExportingAudit,
  isAutoCrawlEnabled,
  projectTriggerRef,
  onOpenProjects,
  onRunCrawlOpen,
  onAutoCrawlEnable,
  onAutoCrawlDisable,
  onOpenBusinessProfile,
  onExportAudit,
  onExportCrawl,
  reducedMotion,
}: ContextCapsuleProps) {
  const runCrawlLabel = isCrawlRunning
    ? crawlStatusLabel === "queued"
      ? "Queued"
      : "Crawling"
    : "Run Crawl"

  return (
    <motion.div
      className={cn(
        CAPSULE_SHELL,
        CAPSULE_HEIGHT,
        "pointer-events-auto flex min-w-0 items-center overflow-hidden"
      )}
      layout
      layoutId="dock-context"
      style={{ borderRadius: CAPSULE_RADIUS, willChange: "transform" }}
      transition={dockTransition(reducedMotion)}
    >
      <motion.div
        className="flex h-full w-full min-w-0 items-center gap-1"
        {...panelContentMotion(reducedMotion)}
      >
        {/* Project selector and gear share one pill-shaped shell so they read
            as a single control. They cannot nest — a menu trigger inside a
            button is invalid — so they are siblings, each rounding only its own
            outer end. */}
        <div
          className="flex h-9 min-w-0 items-center bg-muted/35"
          style={{ borderRadius: PILL_RADIUS }}
        >
          <button
            aria-haspopup="dialog"
            aria-label={
              activeProject
                ? `Project: ${activeProject.name}`
                : "Select a project"
            }
            className={cn(
              PILL_BASE,
              // Fixed width rather than flex-1: the capsule is centre-aligned in
              // its own grid column now, so it has no track to fill.
              "w-[11.5rem] max-w-[calc(100vw-9rem)] min-w-0 justify-start gap-2 rounded-r-none bg-transparent pr-1 pl-1.5 hover:bg-muted/50"
            )}
            onClick={onOpenProjects}
            ref={projectTriggerRef}
            type="button"
          >
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-background/70 text-[11px] font-semibold text-muted-foreground"
            >
              {activeProject?.name.trim().charAt(0).toUpperCase() || "—"}
            </span>
            <span className="truncate">
              {activeProject?.name || "Select project"}
            </span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label="Project settings"
                  className={cn(
                    PILL_BASE,
                    "w-8 justify-center rounded-l-none px-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[popup-open]:bg-muted/60 data-[popup-open]:text-foreground"
                  )}
                  type="button"
                />
              }
            >
              <CogIcon className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56" side="bottom">
              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={!activeProjectId}>
                    <CogIcon />
                    Auto Crawl
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    <DropdownMenuRadioGroup
                      value={isAutoCrawlEnabled ? "enable" : "disable"}
                      onValueChange={(v) => {
                        if (v === "enable") onAutoCrawlEnable()
                        else onAutoCrawlDisable()
                      }}
                    >
                      <DropdownMenuRadioItem value="enable">
                        Enable Auto Crawl
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="disable">
                        Disable Auto Crawl
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  disabled={!activeProject}
                  onClick={() =>
                    activeProject && onOpenBusinessProfile(activeProject)
                  }
                >
                  <Building2Icon />
                  Business Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={!activeProject}>
                    <DownloadIcon />
                    Export
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    <DropdownMenuItem
                      disabled={!activeProject || isExportingAudit}
                      onClick={() => onExportAudit()}
                    >
                      {isExportingAudit ? "Generating audit…" : "Export Audit"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        disabled={activeCrawls.length === 0}
                      >
                        Export Specific Crawl
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
                                  exportingCrawlId !== null
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
                                    exportingCrawlId !== null
                                  }
                                  onClick={() => onExportCrawl(crawl, "xlsx")}
                                >
                                  XLSX
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={
                                    crawl.status !== "completed" ||
                                    exportingCrawlId !== null
                                  }
                                  onClick={() => onExportCrawl(crawl, "csv")}
                                >
                                  CSV
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ))
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border/70" />

        <button
          aria-label={isCrawlRunning ? runCrawlLabel : "Run crawl"}
          className={cn(
            PILL_BASE,
            "text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
          )}
          disabled={!activeProjectId || isCrawlRunning}
          onClick={onRunCrawlOpen}
          type="button"
        >
          {isCrawlRunning ? (
            <ThinkingOrb
              aria-hidden="true"
              className="shrink-0"
              size={20}
              state="solving"
              // Pinned, not "auto": the app is hard-dark (<html class="dark">),
              // so the orb must always draw light ink on this card surface.
              theme="dark"
              style={{ width: 16, height: 16 }}
            />
          ) : (
            <PlayIcon className="size-3.5" />
          )}
          <span className="hidden sm:inline">{runCrawlLabel}</span>
        </button>
      </motion.div>
    </motion.div>
  )
})
