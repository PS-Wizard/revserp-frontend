"use client"

import { useEffect, useRef } from "react"
import type { DriveStep } from "driver.js"
import { toast } from "sonner"

import type { AuditTab, DashboardView } from "~/components/app-navbar/types"
import {
  isOnboardingStepKeyAvailable,
  resolveOnboardingResumeCheckpoint,
  type OnboardingAvailability,
  type OnboardingCheckpoint,
  type OnboardingState,
} from "~/lib/onboarding-state"
import {
  ONBOARDING_BUCKET_DRILL_EVENT,
  ONBOARDING_ISSUE_DRILL_EVENT,
  ONBOARDING_REPLAY_EVENT,
  useOnboardingUi,
  waitForOnboardingElement,
  type OnboardingBucketDrillDetail,
  type OnboardingIssueDrillDetail,
} from "~/components/onboarding/onboarding-ui"
import { loadOnboardingDriver } from "~/components/onboarding/onboarding-driver-loader"
import { lockOnboardingScroll } from "~/components/onboarding/onboarding-scroll-lock"
import "./onboarding-tour.css"

export type OnboardingTourProps = {
  onboarding: OnboardingState | null
  onboardingScopeKey: string | null
  saveOnboardingCheckpoint: (
    checkpoint: OnboardingCheckpoint,
    options?: { projectId?: string; crawlId?: string; force?: boolean },
  ) => Promise<unknown>
  skipOnboardingTour: () => Promise<unknown>
  completeOnboardingTour: () => Promise<unknown>
  hasProjects: boolean
  resultsReady: boolean
  revbotAvailable: boolean
  businessProfileAvailable: boolean
  integrationsAvailable: boolean
  bucketCount: number
  locationScoped: boolean
  projectId?: string | null
  crawlId?: string | null
  view: DashboardView
  auditTab: AuditTab
  onViewChange: (view: DashboardView) => void
  onAuditTabChange: (tab: AuditTab) => void
  setupPanelVisible: boolean
  setupRunning: boolean
}

type TourStepDef = {
  key: string
  checkpoint: OnboardingCheckpoint
  element?: string | (() => Element | null)
  title: string
  description: string
  showNext: boolean
  nextLabel?: string
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}

const HANDBOOK_LINK =
  `<a href="/handbook" target="_blank" rel="noopener noreferrer">Visit our Handbook</a>`

const TOUR_STEPS: readonly TourStepDef[] = [
  {
    key: "new_project",
    checkpoint: "new_project",
    element: '[data-tour="onboarding-new-project"]',
    title: "Create your first project",
    description: "Click Create project and add your website.",
    showNext: false,
    side: "bottom",
    align: "center",
  },
  {
    key: "create_form",
    checkpoint: "project_details",
    element: '[data-tour="onboarding-create-form"]',
    title: "Name your project",
    description: "Enter a name and URL, then create it.",
    showNext: false,
    side: "bottom",
    align: "center",
  },
  {
    key: "project_details",
    checkpoint: "project_details",
    element: '[data-tour="onboarding-project-details"]',
    title: "Set up this project",
    description:
      "Click Initialize Project to start the first crawl. The tour resumes when results are ready.",
    showNext: false,
    side: "bottom",
    align: "center",
  },
  {
    key: "overview",
    checkpoint: "overview",
    element: '[data-tour="onboarding-overview"]',
    title: "Your audit overview",
    description: "Overall and pillar scores from your latest crawl.",
    showNext: true,
    side: "bottom",
    align: "start",
  },
  {
    key: "score_cards",
    checkpoint: "score_cards",
    element: '[data-tour="onboarding-score-card-seo"]',
    title: "Open the SEO view",
    description: "Click the SEO card for its full view.",
    showNext: true,
    nextLabel: "Open SEO",
    side: "bottom",
    align: "center",
  },
  {
    key: "audit_navigation",
    checkpoint: "audit_navigation",
    element: '[data-tour="onboarding-audit-nav"]',
    title: "Every audit tab, one menu",
    description: "Overview, SEO, AEO, PageSpeed, Pages, Site graph — all live here.",
    showNext: true,
    side: "bottom",
    align: "center",
  },
  {
    key: "bucket_scores",
    checkpoint: "bucket_scores",
    element: '[data-tour="onboarding-bucket-scores"]',
    title: "Start with a bucket",
    description: "Click a bucket card to open its issues.",
    showNext: false,
    side: "bottom",
    align: "center",
  },
  {
    key: "issue_table",
    checkpoint: "issue_table",
    element: '[data-tour="onboarding-issue-table"]',
    title: "Read the issue table",
    description:
      "Severity shows what hurts most. Double-click a row for affected pages, or continue if the bucket is empty.",
    showNext: true,
    nextLabel: "Continue",
    side: "bottom",
    align: "start",
  },
  {
    key: "issue_details",
    checkpoint: "issue_details",
    element: '[data-tour="onboarding-issue-detail"]',
    title: "Affected pages and handbook",
    description: `Affected pages with fix explanations. Deeper guides: ${HANDBOOK_LINK}.`,
    showNext: true,
    side: "bottom",
    align: "start",
  },
  {
    key: "revbot",
    checkpoint: "revbot",
    element: '[data-tour="onboarding-revbot-launcher"]',
    title: "Meet Revbot",
    description: "Click the Revbot button to open the chat.",
    showNext: true,
    nextLabel: "Open Revbot",
    side: "left",
    align: "end",
  },
  {
    key: "revbot_input",
    checkpoint: "revbot_input",
    element: () =>
      document.querySelector('[data-tour="onboarding-revbot-input"]') ??
      document.querySelector("#revbot-prompt"),
    title: "Ask anything",
    description: "Type a question here. Sending is optional.",
    showNext: true,
    side: "top",
    align: "end",
  },
  {
    key: "revbot_history",
    checkpoint: "revbot_history",
    element: '[data-tour="onboarding-revbot-history"]',
    title: "Past chats live here",
    description: "Revisit earlier chats, or close Revbot with ×.",
    showNext: true,
    nextLabel: "Close Revbot",
    side: "left",
    align: "start",
  },
  {
    key: "business_profile_entry",
    checkpoint: "business_profile",
    element: '[data-tour="onboarding-business-profile-row"]',
    title: "Business profile",
    description: "Choose Business profile in this menu.",
    showNext: true,
    nextLabel: "Open Business profile",
    side: "bottom",
    align: "center",
  },
  {
    key: "business_profile_panel",
    checkpoint: "business_profile",
    element: '[data-tour="onboarding-business-profile-panel"]',
    title: "One look, no edits needed",
    description: "Reading is enough.",
    showNext: true,
    side: "left",
    align: "center",
  },
  {
    key: "integrations_gsc",
    checkpoint: "integrations",
    element: '[data-tour="onboarding-integrations-gsc"]',
    title: "Connect Search Console",
    description: "Adds real queries and clicks. Optional — nothing connects now.",
    showNext: true,
    nextLabel: "Show Analytics",
    side: "bottom",
    align: "center",
  },
  {
    key: "integrations_analytics",
    checkpoint: "integrations",
    element: '[data-tour="onboarding-integrations-analytics"]',
    title: "Connect Analytics",
    description: "Adds traffic beside your audit. Optional.",
    showNext: true,
    side: "bottom",
    align: "center",
  },
  {
    key: "finish",
    checkpoint: "finish",
    title: "Tour complete",
    description: "Replay anytime from profile menu → Take the tour.",
    showNext: true,
    nextLabel: "Finish",
  },
]

function stepAvailability(props: OnboardingTourProps): OnboardingAvailability {
  return {
    hasProjects: props.hasProjects,
    resultsReady: props.resultsReady,
    revbotAvailable: props.revbotAvailable,
    businessProfileAvailable: props.businessProfileAvailable && !props.locationScoped,
    integrationsAvailable: props.integrationsAvailable && !props.locationScoped,
    bucketCount: props.bucketCount,
  }
}

function checkpointOfKey(key: string): OnboardingCheckpoint {
  return TOUR_STEPS.find((step) => step.key === key)?.checkpoint ?? "overview"
}

/**
 * Action-driven product tour over a fixed Driver.js step list: transitions
 * run through existing app callbacks on real rendered state. Never call
 * setSteps on the live instance (proven: it orphans overlays); gate by
 * availability at navigation time instead.
 */
export function OnboardingTour(props: OnboardingTourProps) {
  const ui = useOnboardingUi()
  const propsRef = useRef(props)
  propsRef.current = props
  const uiRef = useRef(ui)
  uiRef.current = ui
  const driverRef = useRef<import("driver.js").Driver | null>(null)
  const phaseRef = useRef<"idle" | "driving" | "paused">("idle")
  const activeKeyRef = useRef<string | null>(null)
  const dismissedRef = useRef(false)
  const finishedRef = useRef(false)
  const startedScopeRef = useRef<string | null>(null)
  const prevProjectRef = useRef<string | null | undefined>(undefined)
  const zeroIssueRef = useRef<string | null>(null)
  const drilledIssueRef = useRef<string | null>(null)
  const bindIdsRef = useRef<{ projectId?: string; crawlId?: string } | null>(null)
  const mismatchToastRef = useRef<string | null>(null)
  const runIdRef = useRef(0)
  const waitCtlRef = useRef<AbortController | null>(null)
  const scrollUnlockRef = useRef<(() => void) | null>(null)

  const invalidateRun = () => {
    runIdRef.current += 1
    waitCtlRef.current?.abort()
    waitCtlRef.current = null
  }

  const startRun = () => {
    invalidateRun()
    const id = runIdRef.current
    const ctl = new AbortController()
    waitCtlRef.current = ctl
    return { id, signal: ctl.signal }
  }

  const isCurrentRun = (id: number) => runIdRef.current === id

  const destroyDriver = (phase: "idle" | "paused") => {
    invalidateRun()
    phaseRef.current = phase
    activeKeyRef.current = null
    uiRef.current?.lockDockItem(null)
    scrollUnlockRef.current?.()
    scrollUnlockRef.current = null
    // destroy() skips onDestroyStarted, so teardown never records a skip.
    driverRef.current?.destroy()
    driverRef.current = null
  }

  const isStepAvailable = (key: string) => {
    const live = propsRef.current
    return isOnboardingStepKeyAvailable(
      key,
      checkpointOfKey(key),
      stepAvailability(live),
    )
  }

  /** Next available step after the given key; null when nothing can show. */
  const nextAvailableStepKey = (fromKey: string | null): string | null => {
    const live = propsRef.current
    const availability = stepAvailability(live)
    const fromIndex = fromKey
      ? TOUR_STEPS.findIndex((step) => step.key === fromKey)
      : -1
    for (let index = fromIndex + 1; index < TOUR_STEPS.length; index++) {
      const step = TOUR_STEPS[index]
      if (isOnboardingStepKeyAvailable(step.key, step.checkpoint, availability)) {
        return step.key
      }
    }
    return null
  }

  /** Saved checkpoint to step key; unavailable keys advance forward. */
  const resolveResumeKey = (saved: OnboardingCheckpoint): string | null => {
    const live = propsRef.current
    const availability = stepAvailability(live)
    if (
      saved === "new_project" ||
      saved === "project_details" ||
      saved === "waiting_for_results"
    ) {
      if (!availability.hasProjects) return "new_project"
      if (!availability.resultsReady) return "project_details"
      return "overview"
    }
    let key: string = resolveOnboardingResumeCheckpoint(saved)
    if (key === "business_profile") key = "business_profile_entry"
    if (key === "integrations") key = "integrations_gsc"
    if (isOnboardingStepKeyAvailable(key, checkpointOfKey(key), availability)) {
      return key
    }
    return nextAvailableStepKey(key)
  }

  /** One-time bind of project/crawl ids; routine saves preserve them. */
  const computeBindIds = (): { projectId?: string; crawlId?: string } | null => {
    const live = propsRef.current
    const saved = live.onboarding
    if (!live.hasProjects || !live.projectId) return null
    const ids: { projectId?: string; crawlId?: string } = {}
    if (!saved?.project_id) ids.projectId = live.projectId
    const projectMatches = (saved?.project_id ?? ids.projectId) === live.projectId
    if (live.resultsReady && live.crawlId && !saved?.crawl_id && projectMatches) {
      ids.crawlId = live.crawlId
    }
    return ids.projectId || ids.crawlId ? ids : null
  }

  /** Mismatch with saved context pauses; never walk foreign results. */
  const checkContextMismatch = (): string | null => {
    const live = propsRef.current
    const saved = live.onboarding
    if (
      saved?.project_id &&
      live.projectId &&
      saved.project_id !== live.projectId &&
      live.hasProjects
    ) {
      return `project:${saved.project_id}`
    }
    if (
      saved?.crawl_id &&
      live.crawlId &&
      saved.crawl_id !== live.crawlId &&
      live.resultsReady
    ) {
      return `crawl:${saved.crawl_id}`
    }
    return null
  }

  const pauseOnMismatch = (): boolean => {
    const mismatch = checkContextMismatch()
    if (!mismatch) return false
    const scope = propsRef.current.onboardingScopeKey ?? ""
    const toastKey = `${scope}:${mismatch}`
    if (mismatchToastRef.current !== toastKey) {
      mismatchToastRef.current = toastKey
      toast.message("Tour paused", {
        description:
          "This tour checkpoint belongs to another project or crawl. Select it to resume, or Take the tour to restart here.",
      })
    }
    phaseRef.current = "paused"
    return true
  }

  /** Entry decision for autostart and resume; null means stay paused. */
  const decideStartKey = (): string | null => {
    const live = propsRef.current
    if (!live.hasProjects) return "new_project"
    if (live.setupRunning) return null
    if (live.setupPanelVisible) {
      return isStepAvailable("project_details") ? "project_details" : null
    }
    if (!live.resultsReady) {
      return isStepAvailable("project_details") ? "project_details" : null
    }
    return resolveResumeKey(live.onboarding?.checkpoint ?? "overview")
  }

  const toDriveStep = (step: TourStepDef): DriveStep => ({
    element: step.element as DriveStep["element"],
    popover: {
      title: step.title,
      description: step.description,
      showButtons: step.showNext
        ? (["next", "close"] as ("next" | "close")[])
        : (["close"] as ("close")[]),
      nextBtnText: step.nextLabel ?? (step.key === "finish" ? "Finish" : "Next"),
      side: step.side,
      align: step.align,
      // Every Next (mouse, touch, arrow keys) routes through goNext.
      onNextClick: () => void goNext(step.key),
    },
    disableActiveInteraction: false,
    waitForElement: 4000,
    skipMissingElement:
      step.checkpoint === "business_profile" || step.checkpoint === "integrations",
  })

  const showStep = async (key: string): Promise<void> => {
    const run = startRun()
    const controls = uiRef.current
    if (!isStepAvailable(key)) {
      const next = nextAvailableStepKey(key)
      if (next && isCurrentRun(run.id)) await showStep(next)
      else if (isCurrentRun(run.id)) destroyDriver("paused")
      return
    }
    const index = TOUR_STEPS.findIndex((step) => step.key === key)
    if (index < 0) return
    const step = TOUR_STEPS[index]

    if (!driverRef.current) {
      const [driver] = await Promise.all([
        loadOnboardingDriver(),
        import("driver.js/dist/driver.css"),
      ])
      if (!isCurrentRun(run.id)) return
      if (dismissedRef.current) return
      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
      driverRef.current = driver({
        animate: !reducedMotion,
        duration: 300,
        overlayColor: "#000",
        overlayOpacity: 0.75,
        smoothScroll: false,
        allowClose: true,
        allowScroll: false,
        overlayClickBehavior: "none" as const,
        stagePadding: 8,
        stageRadius: 12,
        showProgress: false,
        popoverClass: "onboarding-tour-popover",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Finish",
        closeBtnLabel: "Not now",
        allowKeyboardControl: true,
        showButtons: ["next", "close"] as ("next" | "previous" | "close")[],
        onDestroyStarted: () => {
          // User dismiss: tear down now, persist skipped in the background.
          if (finishedRef.current || dismissedRef.current) {
            driverRef.current?.destroy()
            return
          }
          dismissedRef.current = true
          destroyDriver("idle")
          void propsRef.current
            .skipOnboardingTour()
            .then(undefined, () => {
              toast.error("Tour dismissed, but progress did not save.", {
                id: "onboarding-save-failed",
                description: "Your progress may reappear on the next visit.",
              })
            })
        },
        onDestroyed: () => {
          uiRef.current?.lockDockItem(null)
          if (phaseRef.current === "driving") phaseRef.current = "idle"
          activeKeyRef.current = null
        },
        steps: TOUR_STEPS.map(toDriveStep),
      })
    }

    const prepared = await prepareStep(step.key, run.signal)
    if (!isCurrentRun(run.id)) return
    if (phaseRef.current !== "driving" && phaseRef.current !== "paused") return
    if (!prepared) {
      // Optional targets skip forward; required ones pause for readiness.
      const lenient =
        step.checkpoint === "business_profile" ||
        step.checkpoint === "integrations"
      if (lenient) {
        const next = nextAvailableStepKey(step.key)
        if (next) await showStep(next)
        else destroyDriver("idle")
      } else {
        destroyDriver("paused")
      }
      return
    }

    phaseRef.current = "driving"
    activeKeyRef.current = step.key
    const bind = bindIdsRef.current
    bindIdsRef.current = null
    void propsRef.current
      .saveOnboardingCheckpoint(
        step.checkpoint,
        bind
          ? {
              ...(bind.projectId ? { projectId: bind.projectId } : {}),
              ...(bind.crawlId ? { crawlId: bind.crawlId } : {}),
            }
          : undefined,
      )
      .then(undefined, () => {
        toast.error("Tour progress did not save.", {
          id: "onboarding-save-failed",
          description: "It will retry on the next step.",
        })
      })

    const driver = driverRef.current
    if (!driver || !isCurrentRun(run.id)) return
    if (step.key === "audit_navigation" || step.key === "business_profile_entry") {
      controls?.lockDockItem(step.key === "audit_navigation" ? "audit" : "actions")
    } else {
      controls?.lockDockItem(null)
    }
    driver.drive(index)
    scrollUnlockRef.current?.()
    scrollUnlockRef.current = lockOnboardingScroll()
  }

  const goNext = async (key: string): Promise<void> => {
    const run = startRun()
    const live = propsRef.current
    const controls = uiRef.current
    const checkRun = () => isCurrentRun(run.id)
    switch (key) {
      case "overview":
        if (checkRun()) await showStep("score_cards")
        return
      case "score_cards":
        live.onAuditTabChange("seo")
        if (checkRun()) await showStep("audit_navigation")
        return
      case "audit_navigation":
        if (live.auditTab !== "seo") live.onAuditTabChange("seo")
        if (checkRun()) await showStep("bucket_scores")
        return
      case "issue_table": {
        const wanted = drilledIssueRef.current
        const detail = wanted
          ? await waitForOnboardingElement(
              () =>
                document.querySelector(
                  `[data-tour="onboarding-issue-detail"][data-tour-issue="${CSS.escape(wanted)}"]`,
                ),
              1200,
              run.signal,
            )
          : null
        if (!checkRun()) return
        if (detail) {
          await showStep("issue_details")
          return
        }
        if (zeroIssueRef.current) {
          const next = nextAvailableStepKey("issue_details")
          if (next) await showStep(next)
          else destroyDriver("idle")
          return
        }
        toast.message("Open an issue first", {
          description: "Double-click an issue row to see its affected pages.",
        })
        return
      }
      case "issue_details": {
        const next = nextAvailableStepKey("issue_details")
        if (checkRun()) {
          if (next) await showStep(next)
          else destroyDriver("idle")
        }
        return
      }
      case "revbot":
        controls?.openRevbot()
        if (checkRun()) await showStep("revbot_input")
        return
      case "revbot_input":
        controls?.maximizeRevbot()
        if (checkRun()) await showStep("revbot_history")
        return
      case "revbot_history":
        controls?.dockRevbot()
        if (checkRun()) {
          const next = nextAvailableStepKey("revbot_history")
          if (next) await showStep(next)
          else destroyDriver("idle")
        }
        return
      case "business_profile_entry":
        controls?.openBusinessProfile()
        if (checkRun()) await showStep("business_profile_panel")
        return
      case "business_profile_panel": {
        controls?.closeBusinessProfile()
        if (live.view !== "search-console") live.onViewChange("search-console")
        if (checkRun()) await showStep("integrations_gsc")
        return
      }
      case "integrations_gsc":
        if (live.view !== "analytics") live.onViewChange("analytics")
        if (checkRun()) await showStep("integrations_analytics")
        return
      case "integrations_analytics":
      case "finish":
        break
    }
    if (key === "finish") {
      if (!checkRun()) return
      try {
        await live.completeOnboardingTour()
      } catch {
        toast.error("Could not finish the tour.", {
          id: "onboarding-save-failed",
          description: "Check your connection and press Finish again.",
        })
        return
      }
      if (!checkRun()) return
      finishedRef.current = true
      dismissedRef.current = true
      destroyDriver("idle")
      if (live.view !== "revserp-audit") live.onViewChange("revserp-audit")
      if (live.auditTab !== "overview") live.onAuditTabChange("overview")
      return
    }
    const next = nextAvailableStepKey(key)
    if (checkRun()) {
      if (next) await showStep(next)
      else destroyDriver("idle")
    }
  }

  const prepareStep = async (key: string, signal: AbortSignal): Promise<boolean> => {
    const live = propsRef.current
    const controls = uiRef.current
    switch (key) {
      case "new_project":
        if (live.hasProjects) return false
        break
      case "create_form":
        break
      case "project_details":
        if (live.setupRunning) return false
        if (live.view !== "revserp-audit") live.onViewChange("revserp-audit")
        if (live.auditTab !== "overview") live.onAuditTabChange("overview")
        break
      case "overview":
      case "score_cards":
        if (live.view !== "revserp-audit") live.onViewChange("revserp-audit")
        if (live.auditTab !== "overview") live.onAuditTabChange("overview")
        break
      case "audit_navigation":
        controls?.lockDockItem("audit")
        if (live.view !== "revserp-audit") live.onViewChange("revserp-audit")
        if (live.auditTab !== "seo") live.onAuditTabChange("seo")
        break
      case "bucket_scores":
      case "issue_table":
      case "issue_details":
        if (live.view !== "revserp-audit") live.onViewChange("revserp-audit")
        if (live.auditTab !== "seo") live.onAuditTabChange("seo")
        break
      case "revbot":
        if ((controls?.islandState ?? "docked") !== "docked") controls?.dockRevbot()
        break
      case "revbot_input":
        if ((controls?.islandState ?? "docked") === "docked") controls?.openRevbot()
        break
      case "revbot_history":
        if ((controls?.islandState ?? "docked") !== "maximized")
          controls?.maximizeRevbot()
        break
      case "business_profile_entry":
        // The portalled row renders only while the menu is held.
        controls?.lockDockItem("actions")
        break
      case "business_profile_panel":
        if (!controls?.isBusinessProfileOpen) controls?.openBusinessProfile()
        break
      case "integrations_gsc":
        controls?.closeBusinessProfile()
        if (live.view !== "search-console") live.onViewChange("search-console")
        break
      case "integrations_analytics":
        if (live.view !== "analytics") live.onViewChange("analytics")
        break
      case "finish":
        controls?.dockRevbot()
        controls?.closeBusinessProfile()
        if (live.view !== "revserp-audit") live.onViewChange("revserp-audit")
        if (live.auditTab !== "overview") live.onAuditTabChange("overview")
        return true
    }
    const step = TOUR_STEPS.find((entry) => entry.key === key)
    if (!step?.element) return true
    const target = await waitForOnboardingElement(step.element, 4000, signal)
    return target !== null
  }

  const driveAt = (key: string) => {
    if (dismissedRef.current && !finishedRef.current) return
    phaseRef.current = "driving"
    void showStep(key).catch(() => destroyDriver("idle"))
  }

  const ctrlRef = useRef({
    showStep,
    goNext,
    driveAt,
    decideStartKey,
    computeBindIds,
    pauseOnMismatch,
  })
  ctrlRef.current = {
    showStep,
    goNext,
    driveAt,
    decideStartKey,
    computeBindIds,
    pauseOnMismatch,
  }

  useEffect(() => {
    const scope = props.onboardingScopeKey
    if (startedScopeRef.current !== scope) {
      startedScopeRef.current = scope
      dismissedRef.current = false
      finishedRef.current = false
      zeroIssueRef.current = null
      drilledIssueRef.current = null
      bindIdsRef.current = null
      mismatchToastRef.current = null
      destroyDriver("idle")
    }
  }, [props.onboardingScopeKey])

  // Location scope or project switch stops the tour; autostart resumes safely.
  useEffect(() => {
    if (props.locationScoped) {
      destroyDriver("idle")
    }
  }, [props.locationScoped])

  useEffect(() => {
    if (prevProjectRef.current === undefined) {
      prevProjectRef.current = props.projectId ?? null
      return
    }
    if (prevProjectRef.current !== (props.projectId ?? null)) {
      prevProjectRef.current = props.projectId ?? null
      destroyDriver("idle")
    }
  }, [props.projectId])

  useEffect(() => () => destroyDriver("idle"), [])

  const saveWaitingForResults = () => {
    void propsRef.current
      .saveOnboardingCheckpoint("waiting_for_results")
      .then(undefined, () => {
        toast.error("Tour progress did not save.", {
          id: "onboarding-save-failed",
          description: "It will retry on the next step.",
        })
      })
  }

  // Autostart and resume share one entry decision (see decideStartKey).
  useEffect(() => {
    if (!props.onboarding || !props.onboardingScopeKey) return
    if (props.locationScoped) return
    if (dismissedRef.current) return
    if (phaseRef.current !== "idle" && phaseRef.current !== "paused") return
    const status = props.onboarding.status
    if (status === "skipped" || status === "completed") return
    if (props.onboarding.version !== 1) return
    if (ctrlRef.current.pauseOnMismatch()) return
    const bind = ctrlRef.current.computeBindIds()
    if (bind) bindIdsRef.current = bind
    const key = ctrlRef.current.decideStartKey()
    if (key) {
      ctrlRef.current.driveAt(key)
      return
    }
    if (props.setupRunning) {
      saveWaitingForResults()
      phaseRef.current = "paused"
      return
    }
    if (props.hasProjects) {
      phaseRef.current = "paused"
    }
  }, [
    props.onboarding,
    props.onboardingScopeKey,
    props.hasProjects,
    props.resultsReady,
    props.setupPanelVisible,
    props.setupRunning,
    props.locationScoped,
    props.projectId,
  ])

  useEffect(() => {
    if (phaseRef.current !== "driving") return
    if (!props.setupRunning) return
    saveWaitingForResults()
    destroyDriver("paused")
  }, [props.setupRunning])

  useEffect(() => {
    if (phaseRef.current !== "driving") return
    if (!ui?.isCreateProjectOpen) return
    if (activeKeyRef.current !== "new_project") return
    void ctrlRef.current.showStep("create_form").catch(() => destroyDriver("idle"))
  }, [ui?.isCreateProjectOpen])

  useEffect(() => {
    if (phaseRef.current !== "driving") return
    if (ui?.isCreateProjectOpen !== false) return
    if (props.hasProjects) return
    if (activeKeyRef.current !== "create_form") return
    void ctrlRef.current.showStep("new_project").catch(() => destroyDriver("idle"))
  }, [ui?.isCreateProjectOpen, props.hasProjects])

  useEffect(() => {
    if (phaseRef.current !== "driving" && phaseRef.current !== "paused") return
    if (!props.hasProjects) return
    if (activeKeyRef.current !== "new_project" && activeKeyRef.current !== "create_form") {
      return
    }
    if (props.setupRunning) {
      saveWaitingForResults()
      destroyDriver("paused")
      return
    }
    if (ctrlRef.current.pauseOnMismatch()) return
    const bind = ctrlRef.current.computeBindIds()
    if (bind) bindIdsRef.current = bind
    void ctrlRef.current.showStep("project_details").catch(() => destroyDriver("idle"))
  }, [props.hasProjects, props.setupRunning])

  useEffect(() => {
    if (phaseRef.current !== "driving") return
    if (props.auditTab !== "seo" || activeKeyRef.current !== "score_cards") return
    void ctrlRef.current.showStep("audit_navigation").catch(() => destroyDriver("idle"))
  }, [props.auditTab])

  useEffect(() => {
    if (phaseRef.current !== "driving" || !ui) return
    if (activeKeyRef.current === "revbot" && ui.islandState !== "docked") {
      void ctrlRef.current.showStep("revbot_input").catch(() => destroyDriver("idle"))
    } else if (
      activeKeyRef.current === "revbot_history" &&
      ui.islandState === "docked"
    ) {
      const next = nextAvailableStepKey("revbot_history")
      if (next) {
        void ctrlRef.current.showStep(next).catch(() => destroyDriver("idle"))
      } else {
        destroyDriver("idle")
      }
    }
  }, [ui?.islandState])

  useEffect(() => {
    if (phaseRef.current !== "driving" || !ui?.isBusinessProfileOpen) return
    if (activeKeyRef.current !== "business_profile_entry") return
    void ctrlRef.current.showStep("business_profile_panel").catch(() => destroyDriver("idle"))
  }, [ui?.isBusinessProfileOpen])

  // Waits match drilled bucket/issue ids; the table wrapper alone proves nothing.
  useEffect(() => {
    const onBucket = async (event: Event) => {
      if (phaseRef.current !== "driving") return
      if (activeKeyRef.current !== "bucket_scores") return
      const detail = (event as CustomEvent<OnboardingBucketDrillDetail>).detail
      if (!detail) return
      const run = startRun()
      if (!detail.hasIssues) {
        zeroIssueRef.current = detail.bucketId
        if (isCurrentRun(run.id)) {
          await ctrlRef.current.showStep("issue_table").catch(() => destroyDriver("idle"))
        }
        return
      }
      zeroIssueRef.current = null
      const table = await waitForOnboardingElement(
        () =>
          document.querySelector(
            `[data-tour="onboarding-issue-bucket"][data-tour-bucket="${CSS.escape(detail.bucketId)}"]`,
          ),
        4000,
        run.signal,
      )
      if (!table || !isCurrentRun(run.id)) return
      if (activeKeyRef.current !== "bucket_scores") return
      await ctrlRef.current.showStep("issue_table").catch(() => destroyDriver("idle"))
    }
    const onIssue = async (event: Event) => {
      if (phaseRef.current !== "driving") return
      if (activeKeyRef.current !== "issue_table") return
      const detail = (event as CustomEvent<OnboardingIssueDrillDetail>).detail
      if (!detail) return
      drilledIssueRef.current = detail.issueTypeId
      const run = startRun()
      const rendered = await waitForOnboardingElement(
        () =>
          document.querySelector(
            `[data-tour="onboarding-issue-detail"][data-tour-issue="${CSS.escape(detail.issueTypeId)}"]`,
          ),
        4000,
        run.signal,
      )
      if (!rendered || !isCurrentRun(run.id)) return
      if (activeKeyRef.current !== "issue_table") return
      await ctrlRef.current.showStep("issue_details").catch(() => destroyDriver("idle"))
    }
    window.addEventListener(ONBOARDING_BUCKET_DRILL_EVENT, onBucket)
    window.addEventListener(ONBOARDING_ISSUE_DRILL_EVENT, onIssue)
    return () => {
      window.removeEventListener(ONBOARDING_BUCKET_DRILL_EVENT, onBucket)
      window.removeEventListener(ONBOARDING_ISSUE_DRILL_EVENT, onIssue)
    }
  }, [])

  useEffect(() => {
    const onReplay = () => {
      const live = propsRef.current
      if (live.locationScoped) return
      if (!live.hasProjects || !live.resultsReady) {
        toast.message("Tour needs results first", {
          description:
            "Finish a project crawl so the audit views exist, then take the tour.",
        })
        return
      }
      dismissedRef.current = false
      finishedRef.current = false
      zeroIssueRef.current = null
      drilledIssueRef.current = null
      bindIdsRef.current = null
      mismatchToastRef.current = null
      destroyDriver("idle")
      void live
        .saveOnboardingCheckpoint(
          "overview",
          {
            projectId: live.projectId ?? undefined,
            crawlId: live.crawlId ?? undefined,
            force: true,
          },
        )
        .then(undefined, () => {
          toast.error("Tour progress did not save.", {
            id: "onboarding-save-failed",
            description: "It will retry on the next step.",
          })
        })
      phaseRef.current = "driving"
      void ctrlRef.current.showStep("overview").catch(() => destroyDriver("idle"))
    }
    window.addEventListener(ONBOARDING_REPLAY_EVENT, onReplay)
    return () => window.removeEventListener(ONBOARDING_REPLAY_EVENT, onReplay)
  }, [])

  return null
}
