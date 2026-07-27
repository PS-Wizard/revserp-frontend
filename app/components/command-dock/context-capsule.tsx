"use client"

import { memo, type RefObject } from "react"
import { motion } from "motion/react"
import {
  Building2Icon,
  ChevronsUpDownIcon,
  CogIcon,
  DownloadIcon,
  PlayIcon,
} from "lucide-react"
import { ThinkingOrb } from "thinking-orbs"

import { ProfileMenu } from "~/components/app-navbar/profile-menu"
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
import type {
  CrawlResponse,
  MeResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"

import {
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
  // --- profile menu ---
  initials: string
  isActiveOrganizationOwner: boolean
  workspaceState: "idle" | "switching" | "leaving" | "logging-out"
  organizationId: string
  organizations: MeResponse["organizations"]
  profileActionError: string
  userName?: string
  isPlatformAdmin: boolean
  onInviteOpen: () => void
  onLeaveWorkspaceOpen: () => void
  onLogout: () => void
  onSelectOrganization: (organizationId: string) => void
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
  initials,
  isActiveOrganizationOwner,
  workspaceState,
  organizationId,
  organizations,
  profileActionError,
  userName,
  isPlatformAdmin,
  onInviteOpen,
  onLeaveWorkspaceOpen,
  onLogout,
  onSelectOrganization,
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
        "pointer-events-auto flex h-14 min-w-0 flex-1 items-center overflow-hidden"
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
        {/* Project pill + gear read as one unit, hence gap-1 and no divider
            between them. */}
        <button
          aria-haspopup="dialog"
          aria-label={
            activeProject
              ? `Project: ${activeProject.name}`
              : "Select a project"
          }
          className={cn(
            PILL_BASE,
            "min-w-0 flex-1 justify-between gap-2.5 bg-muted/35 pl-2 hover:bg-muted/70"
          )}
          onClick={onOpenProjects}
          ref={projectTriggerRef}
          style={{ borderRadius: PILL_RADIUS }}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-background/70 text-[11px] font-semibold text-muted-foreground"
            >
              {activeProject?.name.trim().charAt(0).toUpperCase() || "—"}
            </span>
            <span className="truncate">
              {activeProject?.name || "Select project"}
            </span>
          </span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-60" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                aria-label="Project actions"
                className={cn(
                  PILL_BASE,
                  "w-11 justify-center px-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[popup-open]:bg-muted/60 data-[popup-open]:text-foreground"
                )}
                type="button"
              />
            }
          >
            <CogIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56" side="top">
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={!activeProjectId || isCrawlRunning}
                onClick={onRunCrawlOpen}
              >
                <PlayIcon />
                Run Crawl
              </DropdownMenuItem>
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

        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border/70" />

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
              style={{ width: 16, height: 16 }}
            />
          ) : (
            <PlayIcon className="size-3.5" />
          )}
          <span className="hidden sm:inline">{runCrawlLabel}</span>
        </button>

        <ProfileMenu
          compact
          initials={initials}
          isActiveOrganizationOwner={isActiveOrganizationOwner}
          workspaceState={workspaceState}
          organizationId={organizationId}
          organizations={organizations}
          profileActionError={profileActionError}
          userName={userName}
          isPlatformAdmin={isPlatformAdmin}
          onInviteOpen={onInviteOpen}
          onLeaveWorkspaceOpen={onLeaveWorkspaceOpen}
          onLogout={onLogout}
          onSelectOrganization={onSelectOrganization}
        />
      </motion.div>
    </motion.div>
  )
})
