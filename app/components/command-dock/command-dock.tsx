"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react"

import type { PanelState } from "~/components/ai-dock/panel-map"
import { useAIChat } from "~/components/ai-dock/use-ai-chat"
import type {
  AIExportAction,
  AINavigationDestination,
} from "~/components/ai-dock/use-ai-chat"
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

import { AICapsule, AIPanel } from "./ai-panel"
import { NavIsland } from "./nav-island"

export type CommandDockProps = {
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

  // --- Revserp AI ---
  projectIds: string[]
  trackCrawl: (id: string) => void
  onNavigate: (destination: AINavigationDestination) => void
  onProjectSwitched: (projectId: string) => void
  onExport: (action: AIExportAction) => void
  onAutoCrawlConfigured: () => void
  externalOpen: { prompt: string; token: number } | null

  /** Bumped by the navbar when a dialog action should also close the panel. */
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
  projectIds,
  trackCrawl,
  onNavigate,
  onProjectSwitched,
  onExport,
  onAutoCrawlConfigured,
  externalOpen,
  dismissToken,
}: CommandDockProps) {
  const reducedMotion = useReducedMotion() ?? false

  // The top project panel and the bottom AI panel occupy different corners of
  // the screen, so they are independent — unlike the single-island layout,
  // opening one does not have to close the other. panelState is the AI dock's
  // own vocabulary, so the deterministic panel map (ai-dock/panel-map.ts) wires
  // straight in and tool calls keep full control over maximize/minimize.
  const [panelState, setPanelState] = useState<PanelState>("collapsed")
  const [projectPanelOpen, setProjectPanelOpen] = useState(false)
  // Conversation-history sidebar (maximized view only), collapsed by default.
  const [historyOpen, setHistoryOpen] = useState(false)

  const projectTriggerRef = useRef<HTMLButtonElement>(null)
  const aiTriggerRef = useRef<HTMLButtonElement>(null)

  const chat = useAIChat({
    orgId: organizationId,
    projectId: activeProjectId ?? undefined,
    crawlId: currentCrawl?.id,
    projectIds,
    trackCrawl,
    onNavigate,
    onProjectSwitched,
    onExport,
    onAutoCrawlConfigured,
    setPanelState,
  })
  const {
    isSending,
    messages,
    isLoadingConversation,
    handleSubmit,
    startNewChat,
  } = chat

  // Seed a fresh chat from an external request (e.g. issue-explorer's
  // "Recommend Fixes"): maximize, start a new conversation, and auto-send the
  // seeded prompt so the model fetches the relevant issues via its tools. The
  // deterministic panel map keeps the dock maximized on those tool calls.
  // Token-gated so repeat requests refire; forceNew makes it immune to the
  // stale-closure timing of startNewChat's state resets.
  const lastOpenTokenRef = useRef(0)
  useEffect(() => {
    if (!externalOpen || externalOpen.token === lastOpenTokenRef.current) return
    lastOpenTokenRef.current = externalOpen.token
    setPanelState("maximized")
    startNewChat()
    void handleSubmit(externalOpen.prompt, { forceNew: true })
    // handleSubmit/startNewChat are re-created each render but this effect only
    // fires when externalOpen changes, capturing the current (fresh) closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalOpen])

  const messageScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (panelState === "collapsed") return
    messageScrollRef.current?.scrollTo({
      top: messageScrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, isLoadingConversation, panelState])

  // Clicking outside the card steps the dock down one level. Maximized is
  // handled by its backdrop (-> mini); mini has no backdrop, so watch the
  // document and collapse when the click lands outside the card.
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (panelState !== "mini") return
    const handlePointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setPanelState("collapsed")
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [panelState])

  const closeProjectPanel = useCallback(() => {
    setProjectPanelOpen(false)
    // The pill remounts with the collapsed capsule, so wait a frame for it.
    requestAnimationFrame(() => projectTriggerRef.current?.focus())
  }, [])

  const openProjectPanel = useCallback(() => setProjectPanelOpen(true), [])

  const collapseAIPanel = useCallback(() => {
    setPanelState("collapsed")
    requestAnimationFrame(() => aiTriggerRef.current?.focus())
  }, [])

  // Escape steps whichever surface is open down one level. The project panel is
  // modal, so it also locks page scroll while it owns the screen.
  useEffect(() => {
    if (!projectPanelOpen && panelState === "collapsed") return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (projectPanelOpen) closeProjectPanel()
      else if (panelState === "maximized") setPanelState("mini")
      else collapseAIPanel()
    }
    document.addEventListener("keydown", handleKeyDown)
    if (!projectPanelOpen) {
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [projectPanelOpen, panelState, closeProjectPanel, collapseAIPanel])

  const firstDismissTokenRef = useRef(dismissToken)
  useEffect(() => {
    if (dismissToken === firstDismissTokenRef.current) return
    setProjectPanelOpen(false)
  }, [dismissToken])

  return (
    <>
      {/* One LayoutGroup per island: the project capsule/panel share
          "dock-context" and the AI button/panel share "dock-ai", and neither
          pair should be measured against the other. */}
      <LayoutGroup id="nav-island">
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
      </LayoutGroup>

      <LayoutGroup id="ai-island">
        <AnimatePresence>
          {panelState === "maximized" ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="dock-ai-backdrop"
              onClick={() => setPanelState("mini")}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
            />
          ) : null}
        </AnimatePresence>

        {panelState === "maximized" ? (
          <div className="pointer-events-none fixed inset-0 z-50 flex justify-center p-4 sm:p-6">
            <AIPanel
              cardRef={cardRef}
              chat={chat}
              historyOpen={historyOpen}
              messageScrollRef={messageScrollRef}
              onCollapse={collapseAIPanel}
              onHistoryClose={() => setHistoryOpen(false)}
              onHistoryToggle={() => setHistoryOpen((open) => !open)}
              onMaximize={() => setPanelState("maximized")}
              onRestore={() => setPanelState("mini")}
              reducedMotion={reducedMotion}
              variant="max"
            />
          </div>
        ) : (
          /* Deliberately not wrapped in AnimatePresence: unmounting the button
             in the same commit that mounts the panel leaves exactly one element
             per layoutId, which is what makes motion project the panel out of
             the button's last rect. */
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex items-end justify-center px-3 pb-5 sm:pb-6">
            {panelState === "collapsed" ? (
              <AICapsule
                buttonRef={aiTriggerRef}
                isSending={isSending}
                onOpen={() => setPanelState("mini")}
                reducedMotion={reducedMotion}
              />
            ) : (
              <AIPanel
                cardRef={cardRef}
                chat={chat}
                historyOpen={historyOpen}
                messageScrollRef={messageScrollRef}
                onCollapse={collapseAIPanel}
                onHistoryClose={() => setHistoryOpen(false)}
                onHistoryToggle={() => setHistoryOpen((open) => !open)}
                onMaximize={() => setPanelState("maximized")}
                onRestore={() => setPanelState("mini")}
                reducedMotion={reducedMotion}
                variant="mini"
              />
            )}
          </div>
        )}
      </LayoutGroup>
    </>
  )
}
