"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"

import type {
  AuditTab,
  DashboardView,
  ExportFormat,
} from "~/components/app-navbar/types"
import { useFeatures } from "~/lib/features"
import type {
  CrawlResponse,
  MeResponse,
  ProjectResponse,
} from "~/lib/api.types"

import { GlobalCommandMenu } from "./global-command-menu"
import { NavIsland } from "./nav-island"

export type CommandDockProps = {
  view: DashboardView
  onViewChange: (view: DashboardView) => void
  compareLabel: string | null
  auditTab: AuditTab
  onAuditTabChange: (tab: AuditTab) => void

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

  dismissToken: number
}

export function CommandDock({
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
  dismissToken,
}: CommandDockProps) {
  const reducedMotion = useReducedMotion() ?? false
  const features = useFeatures()
  const [projectPanelOpen, setProjectPanelOpen] = useState(false)
  const projectTriggerRef = useRef<HTMLButtonElement>(null)

  const closeProjectPanel = useCallback(() => {
    setProjectPanelOpen(false)
    requestAnimationFrame(() => projectTriggerRef.current?.focus())
  }, [])

  const openProjectPanel = useCallback(() => setProjectPanelOpen(true), [])

  useEffect(() => {
    if (!projectPanelOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeProjectPanel()
    }
    document.addEventListener("keydown", handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [projectPanelOpen, closeProjectPanel])

  const firstDismissTokenRef = useRef(dismissToken)
  useEffect(() => {
    if (dismissToken === firstDismissTokenRef.current) return
    setProjectPanelOpen(false)
  }, [dismissToken])

  return (
    <>
      <GlobalCommandMenu
        activeCrawls={activeCrawls}
        activeProject={activeProject}
        activeProjectId={activeProjectId}
        auditTab={auditTab}
        currentCrawl={currentCrawl}
        exportingCrawlId={exportingCrawlId}
        isCrawlRunning={isCrawlRunning}
        isExportingAudit={isExportingAudit}
        onAuditTabChange={onAuditTabChange}
        onCreateProjectOpen={onCreateProjectOpen}
        onExportAudit={onExportAudit}
        onExportCrawl={onExportCrawl}
        onRunCrawlOpen={onRunCrawlOpen}
        onSelectProject={onSelectProject}
        onViewChange={onViewChange}
        projects={projects}
        searchConsoleEnabled={features.gsc_connector}
        view={view}
      />
      <NavIsland
        activeCrawls={activeCrawls}
        activeProject={activeProject}
        activeProjectId={activeProjectId}
        auditTab={auditTab}
        cancellingCrawlId={cancellingCrawlId}
        compareLabel={compareLabel}
        crawlPanelCrawls={crawlPanelCrawls}
        crawlStatusLabel={crawlStatusLabel}
        currentCrawl={currentCrawl}
        deletingCrawlId={deletingCrawlId}
        deletingProjectId={deletingProjectId}
        exportFormat={exportFormat}
        exportingCrawlId={exportingCrawlId}
        initials={initials}
        isActiveOrganizationOwner={isActiveOrganizationOwner}
        isAutoCrawlEnabled={isAutoCrawlEnabled}
        isCrawlRunning={isCrawlRunning}
        isExportingAudit={isExportingAudit}
        isPlatformAdmin={isPlatformAdmin}
        onAuditTabChange={onAuditTabChange}
        onAutoCrawlDisable={onAutoCrawlDisable}
        onAutoCrawlEnable={onAutoCrawlEnable}
        onCancelCrawl={onCancelCrawl}
        onCompareCrawl={onCompareCrawl}
        onCreateProjectOpen={onCreateProjectOpen}
        onDeleteCrawl={onDeleteCrawl}
        onDeleteProject={onDeleteProject}
        onExportAudit={onExportAudit}
        onExportCrawl={onExportCrawl}
        onExportFormatChange={onExportFormatChange}
        onInviteOpen={onInviteOpen}
        onLeaveWorkspaceOpen={onLeaveWorkspaceOpen}
        onLogout={onLogout}
        onOpenBusinessProfile={onOpenBusinessProfile}
        onProjectHover={onProjectHover}
        onProjectPanelClose={closeProjectPanel}
        onProjectPanelOpen={openProjectPanel}
        onRunCrawlOpen={onRunCrawlOpen}
        onSelectOrganization={onSelectOrganization}
        onSelectProject={onSelectProject}
        onViewChange={onViewChange}
        organizationId={organizationId}
        organizations={organizations}
        profileActionError={profileActionError}
        projectActionError={projectActionError}
        projectPanelOpen={projectPanelOpen}
        projectTriggerRef={projectTriggerRef}
        projects={projects}
        reducedMotion={reducedMotion}
        userName={userName}
        view={view}
        workspaceState={workspaceState}
      />
    </>
  )
}
