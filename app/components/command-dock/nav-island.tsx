"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import { AnimatePresence, motion } from "motion/react"

import { ProfileMenu } from "~/components/app-navbar/profile-menu"
import type {
  AuditTab,
  DashboardView,
  ExportFormat,
} from "~/components/app-navbar/types"
import type {
  CrawlResponse,
  MeResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"

import { AuditTabs } from "./audit-tabs"
import {
  AUDIT_FLYOUT_CLOSE_DELAY_MS,
  CAPSULE_HEIGHT,
  CAPSULE_RADIUS,
  CAPSULE_SHELL,
} from "./constants"
import { ContextCapsule } from "./context-capsule"
import { ModeRail } from "./mode-rail"
import { ProjectPanel } from "./project-panel"

export type NavIslandProps = {
  // --- navigation ---
  view: DashboardView
  onViewChange: (view: DashboardView) => void
  compareLabel: string | null
  auditTab: AuditTab
  onAuditTabChange: (tab: AuditTab) => void

  // --- context capsule ---
  activeProject: ProjectResponse | null
  activeProjectId?: string | null
  activeCrawls: CrawlResponse[]
  isCrawlRunning: boolean
  crawlStatusLabel: string
  isExportingAudit: boolean
  isAutoCrawlEnabled: boolean
  onRunCrawlOpen: () => void
  onAutoCrawlEnable: () => void
  onAutoCrawlDisable: () => void
  onOpenBusinessProfile: (project: ProjectResponse) => void
  onExportAudit: () => void

  // --- project panel ---
  projectPanelOpen: boolean
  onProjectPanelOpen: () => void
  onProjectPanelClose: () => void
  projectTriggerRef: RefObject<HTMLButtonElement | null>
  projects: ProjectResponse[]
  crawlPanelCrawls: CrawlResponse[]
  currentCrawl: CrawlResponse | null
  cancellingCrawlId: string | null
  deletingCrawlId: string | null
  deletingProjectId: string | null
  exportFormat: ExportFormat
  exportingCrawlId: string | null
  projectActionError: string
  onCancelCrawl: (crawl: CrawlResponse) => void
  onCompareCrawl: (crawl: CrawlResponse) => void
  onCreateProjectOpen: () => void
  onDeleteCrawl: (crawl: CrawlResponse) => void
  onDeleteProject: (project: ProjectResponse) => void
  onExportCrawl: (crawl: CrawlResponse, format: ExportFormat) => void
  onExportFormatChange: (format: ExportFormat) => void
  onProjectHover: (projectId: string | null) => void
  onSelectProject: (projectId: string, crawlId?: string) => void

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

/** Header padding, duplicated by the project panel so their top edges align. */
const ROW_INSET = "px-4 pt-3 sm:px-6 sm:pt-4"

export function NavIsland({
  view,
  onViewChange,
  compareLabel,
  auditTab,
  onAuditTabChange,
  activeProject,
  activeProjectId,
  activeCrawls,
  isCrawlRunning,
  crawlStatusLabel,
  isExportingAudit,
  isAutoCrawlEnabled,
  onRunCrawlOpen,
  onAutoCrawlEnable,
  onAutoCrawlDisable,
  onOpenBusinessProfile,
  onExportAudit,
  projectPanelOpen,
  onProjectPanelOpen,
  onProjectPanelClose,
  projectTriggerRef,
  projects,
  crawlPanelCrawls,
  currentCrawl,
  cancellingCrawlId,
  deletingCrawlId,
  deletingProjectId,
  exportFormat,
  exportingCrawlId,
  projectActionError,
  onCancelCrawl,
  onCompareCrawl,
  onCreateProjectOpen,
  onDeleteCrawl,
  onDeleteProject,
  onExportCrawl,
  onExportFormatChange,
  onProjectHover,
  onSelectProject,
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
}: NavIslandProps) {
  const [auditFlyoutOpen, setAuditFlyoutOpen] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelPendingClose = useCallback(() => {
    if (closeTimerRef.current === null) return
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  const openAuditFlyout = useCallback(() => {
    cancelPendingClose()
    setAuditFlyoutOpen(true)
  }, [cancelPendingClose])

  // Delayed rather than immediate so the pointer can cross from the Audit pill
  // into the flyout, and so brushing past Audit on the way to another mode
  // doesn't leave the flyout hanging open.
  const closeAuditFlyout = useCallback(() => {
    cancelPendingClose()
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      setAuditFlyoutOpen(false)
    }, AUDIT_FLYOUT_CLOSE_DELAY_MS)
  }, [cancelPendingClose])

  useEffect(() => cancelPendingClose, [cancelPendingClose])

  // The flyout floats over the page, so it must not survive the project panel
  // taking over the row.
  useEffect(() => {
    if (projectPanelOpen) setAuditFlyoutOpen(false)
  }, [projectPanelOpen])

  useEffect(() => {
    if (!auditFlyoutOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      cancelPendingClose()
      setAuditFlyoutOpen(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [auditFlyoutOpen, cancelPendingClose])

  return (
    <>
      <AnimatePresence>
        {projectPanelOpen ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="nav-project-backdrop"
            onClick={onProjectPanelClose}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
          />
        ) : null}
      </AnimatePresence>

      {/* Sticky so the project capsule keeps a stable viewport rect: the panel
          morphs out of it from a fixed overlay, which only lines up while the
          capsule is on screen. Transparent and pointer-transparent so the page
          scrolls under the capsules the same way it did under the bottom dock. */}
      <header
        className={cn(
          "pointer-events-none sticky top-0 z-30 w-full pb-3 sm:pb-4",
          ROW_INSET
        )}
      >
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4">
          {/* Anchor for the audit flyout. Cannot live inside the mode rail
              itself — that scrolls horizontally and would clip it. */}
          <div
            className="relative flex min-w-0 items-center justify-self-start"
            // Focus opens the flyout, so focus leaving the rail has to close
            // it: tabbing away fires no pointer event.
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                closeAuditFlyout()
              }
            }}
          >
            <div
              className={cn(
                CAPSULE_SHELL,
                CAPSULE_HEIGHT,
                "pointer-events-auto flex min-w-0 items-center"
              )}
              style={{ borderRadius: CAPSULE_RADIUS }}
            >
              <ModeRail
                auditFlyoutOpen={auditFlyoutOpen}
                auditTab={auditTab}
                compareLabel={compareLabel}
                onAuditHoverEnd={closeAuditFlyout}
                onAuditHoverStart={openAuditFlyout}
                onViewChange={onViewChange}
                reducedMotion={reducedMotion}
                view={view}
              />
            </div>

            <AnimatePresence initial={false}>
              {auditFlyoutOpen ? (
                <AuditTabs
                  auditTab={auditTab}
                  key="nav-audit-flyout"
                  onAuditTabChange={onAuditTabChange}
                  onHoverEnd={closeAuditFlyout}
                  onHoverStart={openAuditFlyout}
                  onViewChange={onViewChange}
                  reducedMotion={reducedMotion}
                />
              ) : null}
            </AnimatePresence>
          </div>

          {/* Deliberately not wrapped in AnimatePresence: unmounting the
              capsule in the same commit that mounts the panel leaves exactly
              one element per layoutId, which is what makes motion project the
              panel out of the capsule's last rect. */}
          <div className="flex min-w-0 items-center justify-self-center">
            {projectPanelOpen ? null : (
              <ContextCapsule
                activeCrawls={activeCrawls}
                activeProject={activeProject}
                activeProjectId={activeProjectId}
                crawlStatusLabel={crawlStatusLabel}
                exportingCrawlId={exportingCrawlId}
                isAutoCrawlEnabled={isAutoCrawlEnabled}
                isCrawlRunning={isCrawlRunning}
                isExportingAudit={isExportingAudit}
                onAutoCrawlDisable={onAutoCrawlDisable}
                onAutoCrawlEnable={onAutoCrawlEnable}
                onExportAudit={onExportAudit}
                onExportCrawl={onExportCrawl}
                onOpenBusinessProfile={onOpenBusinessProfile}
                onOpenProjects={onProjectPanelOpen}
                onRunCrawlOpen={onRunCrawlOpen}
                projectTriggerRef={projectTriggerRef}
                reducedMotion={reducedMotion}
              />
            )}
          </div>

          <div
            className={cn(
              CAPSULE_SHELL,
              CAPSULE_HEIGHT,
              "pointer-events-auto flex items-center justify-self-end"
            )}
            style={{ borderRadius: CAPSULE_RADIUS }}
          >
            <ProfileMenu
              compact
              initials={initials}
              isActiveOrganizationOwner={isActiveOrganizationOwner}
              isPlatformAdmin={isPlatformAdmin}
              onInviteOpen={onInviteOpen}
              onLeaveWorkspaceOpen={onLeaveWorkspaceOpen}
              onLogout={onLogout}
              onSelectOrganization={onSelectOrganization}
              organizationId={organizationId}
              organizations={organizations}
              profileActionError={profileActionError}
              userName={userName}
              workspaceState={workspaceState}
            />
          </div>
        </div>
      </header>

      {/* Fixed rather than absolute inside the header: the header is a stacking
          context at z-30, so a child could never rise above the backdrop. */}
      {projectPanelOpen ? (
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center",
            ROW_INSET
          )}
        >
          <ProjectPanel
            activeProjectId={activeProjectId}
            cancellingCrawlId={cancellingCrawlId}
            crawlPanelCrawls={crawlPanelCrawls}
            currentCrawl={currentCrawl}
            deletingCrawlId={deletingCrawlId}
            deletingProjectId={deletingProjectId}
            exportFormat={exportFormat}
            exportingCrawlId={exportingCrawlId}
            onCancelCrawl={onCancelCrawl}
            onCompareCrawl={(crawl) => {
              onProjectPanelClose()
              onCompareCrawl(crawl)
            }}
            onCreateProjectOpen={() => {
              onProjectPanelClose()
              onCreateProjectOpen()
            }}
            onDeleteCrawl={onDeleteCrawl}
            onDeleteProject={onDeleteProject}
            onExportCrawl={onExportCrawl}
            onExportFormatChange={onExportFormatChange}
            onOpenBusinessProfile={(project) => {
              onProjectPanelClose()
              onOpenBusinessProfile(project)
            }}
            onProjectHover={onProjectHover}
            onSelectProject={(projectId, crawlId) => {
              onProjectPanelClose()
              onSelectProject(projectId, crawlId)
            }}
            projectActionError={projectActionError}
            projects={projects}
            reducedMotion={reducedMotion}
          />
        </div>
      ) : null}
    </>
  )
}
