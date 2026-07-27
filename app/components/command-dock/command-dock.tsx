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
import { cn } from "~/lib/utils"

import { AICapsule, AIPanel } from "./ai-panel"
import { AuditTabs } from "./audit-tabs"
import {
  CAPSULE_EXIT_TRANSITION,
  CAPSULE_HIDDEN,
  CAPSULE_RADIUS,
  CAPSULE_SHELL,
  CAPSULE_SHOWN,
  type DockView,
  dockTransition,
} from "./constants"
import { ContextCapsule } from "./context-capsule"
import { ModeRail } from "./mode-rail"
import { ProjectPanel } from "./project-panel"

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

  /** Bumped by the navbar when a dialog action should also collapse the dock. */
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
  const transition = dockTransition(reducedMotion)

  const [dockView, setDockView] = useState<DockView>("idle")
  // Conversation-history sidebar (maximized view only), collapsed by default.
  const [historyOpen, setHistoryOpen] = useState(false)

  const projectTriggerRef = useRef<HTMLButtonElement>(null)
  const aiTriggerRef = useRef<HTMLButtonElement>(null)

  // The deterministic panel map (ai-dock/panel-map.ts) speaks in PanelState;
  // adapt it onto the dock's single state machine. Tool calls therefore keep
  // full control over maximize/minimize/collapse.
  const setPanelState = useCallback((state: PanelState) => {
    setDockView(
      state === "collapsed" ? "idle" : state === "mini" ? "ai-mini" : "ai-max"
    )
  }, [])

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
    setDockView("ai-max")
    startNewChat()
    void handleSubmit(externalOpen.prompt, { forceNew: true })
    // handleSubmit/startNewChat are re-created each render but this effect only
    // fires when externalOpen changes, capturing the current (fresh) closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalOpen])

  const messageScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (dockView !== "ai-mini" && dockView !== "ai-max") return
    messageScrollRef.current?.scrollTo({
      top: messageScrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, isLoadingConversation, dockView])

  // Clicking outside the card steps the dock down one level. Maximized is
  // handled by its backdrop (-> mini); mini has no backdrop, so watch the
  // document and collapse when the click lands outside the card.
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (dockView !== "ai-mini") return
    const handlePointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setDockView("idle")
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [dockView])

  const closeProjectPanel = useCallback(() => {
    setDockView("idle")
    // The pill remounts with the collapsed capsule, so wait a frame for it.
    requestAnimationFrame(() => projectTriggerRef.current?.focus())
  }, [])

  const openProjectPanel = useCallback(() => setDockView("project"), [])

  const closeAIPanel = useCallback(() => {
    setDockView("idle")
    requestAnimationFrame(() => aiTriggerRef.current?.focus())
  }, [])

  // Escape steps the dock down one level; the page stays put while the modal
  // project panel is open.
  useEffect(() => {
    if (dockView === "idle") return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (dockView === "project") closeProjectPanel()
      else if (dockView === "ai-max") setDockView("ai-mini")
      else closeAIPanel()
    }
    document.addEventListener("keydown", handleKeyDown)
    if (dockView !== "project") {
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [dockView, closeProjectPanel, closeAIPanel])

  const firstDismissTokenRef = useRef(dismissToken)
  useEffect(() => {
    if (dismissToken === firstDismissTokenRef.current) return
    setDockView("idle")
  }, [dismissToken])

  const isIdle = dockView === "idle"

  return (
    <LayoutGroup>
      <AnimatePresence>
        {dockView === "project" ? (
          <motion.div
            key="dock-project-backdrop"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            onClick={closeProjectPanel}
          />
        ) : null}
        {dockView === "ai-max" ? (
          <motion.div
            key="dock-ai-backdrop"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            onClick={() => setDockView("ai-mini")}
          />
        ) : null}
      </AnimatePresence>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-4 sm:pb-5">
        <div className="flex w-full max-w-[1180px] flex-col gap-2">
          <AuditTabs
            auditTab={auditTab}
            onAuditTabChange={onAuditTabChange}
            reducedMotion={reducedMotion}
            view={view}
            visible={isIdle}
          />

          {/* min-h-14 keeps the island's bottom edge fixed once the collapsed
              row has emptied, so an expanding panel grows straight upward. */}
          <div className="relative flex min-h-14 w-full min-w-0 items-stretch gap-2">
            {/* The mode rail has no morph target, so it just blurs away. */}
            <AnimatePresence initial={false}>
              {isIdle ? (
                <motion.div
                  animate={CAPSULE_SHOWN}
                  className={cn(
                    CAPSULE_SHELL,
                    "pointer-events-auto flex h-14 min-w-0 shrink items-center"
                  )}
                  exit={{
                    ...CAPSULE_HIDDEN,
                    transition: CAPSULE_EXIT_TRANSITION,
                  }}
                  initial={CAPSULE_HIDDEN}
                  key="dock-mode-rail"
                  style={{
                    borderRadius: CAPSULE_RADIUS,
                    willChange: "transform",
                  }}
                  transition={transition}
                >
                  <ModeRail
                    compareLabel={compareLabel}
                    onViewChange={onViewChange}
                    reducedMotion={reducedMotion}
                    view={view}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* The two morph pairs are deliberately NOT wrapped in
                AnimatePresence. Unmounting the capsule in the same commit that
                mounts its panel leaves exactly one element per layoutId, which
                is what makes motion project the panel out of the capsule's last
                rect. Keeping both alive (popLayout, exit fades) gives two
                claimants for one layoutId and the projection smears. */}
            {isIdle ? (
              <>
                <ContextCapsule
                  activeCrawls={activeCrawls}
                  activeProject={activeProject}
                  activeProjectId={activeProjectId}
                  crawlStatusLabel={crawlStatusLabel}
                  exportingCrawlId={exportingCrawlId}
                  initials={initials}
                  isActiveOrganizationOwner={isActiveOrganizationOwner}
                  isAutoCrawlEnabled={isAutoCrawlEnabled}
                  isCrawlRunning={isCrawlRunning}
                  isExportingAudit={isExportingAudit}
                  isPlatformAdmin={isPlatformAdmin}
                  onAutoCrawlDisable={onAutoCrawlDisable}
                  onAutoCrawlEnable={onAutoCrawlEnable}
                  onExportAudit={onExportAudit}
                  onExportCrawl={onExportCrawl}
                  onInviteOpen={onInviteOpen}
                  onLeaveWorkspaceOpen={onLeaveWorkspaceOpen}
                  onLogout={onLogout}
                  onOpenBusinessProfile={onOpenBusinessProfile}
                  onOpenProjects={openProjectPanel}
                  onRunCrawlOpen={onRunCrawlOpen}
                  onSelectOrganization={onSelectOrganization}
                  organizationId={organizationId}
                  organizations={organizations}
                  profileActionError={profileActionError}
                  projectTriggerRef={projectTriggerRef}
                  reducedMotion={reducedMotion}
                  userName={userName}
                  workspaceState={workspaceState}
                />

                <AICapsule
                  buttonRef={aiTriggerRef}
                  isSending={isSending}
                  onOpen={() => setDockView("ai-mini")}
                  reducedMotion={reducedMotion}
                />
              </>
            ) : null}

            {/* Panels overlay the collapsed row rather than sitting in its flex
                flow, so they own the full island width the instant they mount
                and are unaffected by the mode rail still animating out. */}
            {dockView === "project" ? (
              <div className="absolute inset-x-0 bottom-0 z-10 flex">
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
                    setDockView("idle")
                    onCompareCrawl(crawl)
                  }}
                  onCreateProjectOpen={() => {
                    setDockView("idle")
                    onCreateProjectOpen()
                  }}
                  onDeleteCrawl={onDeleteCrawl}
                  onDeleteProject={onDeleteProject}
                  onExportCrawl={onExportCrawl}
                  onExportFormatChange={onExportFormatChange}
                  onOpenBusinessProfile={(project) => {
                    setDockView("idle")
                    onOpenBusinessProfile(project)
                  }}
                  onProjectHover={onProjectHover}
                  onSelectProject={(projectId, crawlId) => {
                    setDockView("idle")
                    onSelectProject(projectId, crawlId)
                  }}
                  projectActionError={projectActionError}
                  projects={projects}
                  reducedMotion={reducedMotion}
                />
              </div>
            ) : null}

            {dockView === "ai-mini" ? (
              <div className="absolute inset-x-0 bottom-0 z-10 flex">
                <AIPanel
                  cardRef={cardRef}
                  chat={chat}
                  historyOpen={historyOpen}
                  messageScrollRef={messageScrollRef}
                  onCollapse={closeAIPanel}
                  onHistoryClose={() => setHistoryOpen(false)}
                  onHistoryToggle={() => setHistoryOpen((open) => !open)}
                  onMaximize={() => setDockView("ai-max")}
                  onRestore={() => setDockView("ai-mini")}
                  reducedMotion={reducedMotion}
                  variant="mini"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Rendered after the island so a mode rail still blurring out cannot
          stack above the maximized chat. */}
      {dockView === "ai-max" ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex justify-center p-4 sm:p-6">
          <AIPanel
            cardRef={cardRef}
            chat={chat}
            historyOpen={historyOpen}
            messageScrollRef={messageScrollRef}
            onCollapse={closeAIPanel}
            onHistoryClose={() => setHistoryOpen(false)}
            onHistoryToggle={() => setHistoryOpen((open) => !open)}
            onMaximize={() => setDockView("ai-max")}
            onRestore={() => setDockView("ai-mini")}
            reducedMotion={reducedMotion}
            variant="max"
          />
        </div>
      ) : null}
    </LayoutGroup>
  )
}
