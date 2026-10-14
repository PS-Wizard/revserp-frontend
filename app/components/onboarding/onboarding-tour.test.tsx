import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { setOnboardingDriverLoader } from "~/components/onboarding/onboarding-driver-loader"

import { installTestDom } from "~/lib/dom-test-setup"
import {
  OnboardingUiContext,
  type OnboardingUiControls,
} from "~/components/onboarding/onboarding-ui"
import { OnboardingTour, type OnboardingTourProps } from "./onboarding-tour"
import type { OnboardingState } from "~/lib/onboarding-state"

installTestDom()

/** Mock Driver captures config/steps and drive calls; never touches the DOM. */
type CapturedDriver = {
  config: {
    steps: Array<{
      element?: unknown
      popover?: {
        title?: string
        description?: string
        onNextClick?: () => void
        showButtons?: string[]
        nextBtnText?: string
        side?: string
        align?: string
      }
    }>
    onDestroyStarted?: () => void
    onDestroyed?: () => void
    allowScroll?: boolean
    overlayOpacity?: number
  }
  driveCalls: number[]
  destroyCalls: number
}

let captured: CapturedDriver | null = null

// Injected observing factory: no mock.module (it leaks across test files in
// bun's shared registry). The factory throws on setSteps, which must never
// run on a live tour instance.
function installObservingDriver() {
  const factory = (config: CapturedDriver["config"]) => {
    captured = { config, driveCalls: [], destroyCalls: 0 }
    return {
      drive: (index = 0) => {
        captured?.driveCalls.push(index)
      },
      destroy: () => {
        if (captured) captured.destroyCalls += 1
      },
      moveNext: () => {},
      movePrevious: () => {},
      setConfig: () => {},
      setSteps: () => {
        throw new Error("setSteps must never run on a live tour instance")
      },
    }
  }
  setOnboardingDriverLoader(() =>
    Promise.resolve({ driver: factory }) as unknown as Promise<
      typeof import("driver.js")
    >,
  )
}

const FRESH: OnboardingState = {
  version: 1,
  status: "not_started",
  checkpoint: "new_project",
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let saveCalls: OnboardingCheckpointArg[] = []
let skipCalls = 0
let completeCalls = 0
let completeImpl: () => Promise<unknown> = () => Promise.resolve({})
let viewCalls: string[] = []
let auditCalls: string[] = []
let lockCalls: (string | null)[] = []

type OnboardingCheckpointArg = Parameters<
  OnboardingTourProps["saveOnboardingCheckpoint"]
>

let tourPropState: OnboardingTourProps | null = null
let rerenderHarness: (() => void) | null = null

function baseTourProps(overrides: Partial<OnboardingTourProps> = {}): OnboardingTourProps {
  return {
    onboarding: FRESH,
    onboardingScopeKey: "org-1:user-1",
    saveOnboardingCheckpoint: (...args: OnboardingCheckpointArg) => {
      saveCalls.push(args)
      return Promise.resolve({})
    },
    skipOnboardingTour: () => {
      skipCalls += 1
      return Promise.resolve({})
    },
    completeOnboardingTour: () => {
      completeCalls += 1
      return completeImpl()
    },
    hasProjects: false,
    resultsReady: false,
    revbotAvailable: true,
    businessProfileAvailable: true,
    integrationsAvailable: true,
    bucketCount: 3,
    locationScoped: false,
    projectId: "proj-1",
    crawlId: "crawl-1",
    view: "revserp-audit",
    auditTab: "overview",
    onViewChange: (view) => {
      viewCalls.push(view)
      setTourProps({ view })
    },
    onAuditTabChange: (tab) => {
      auditCalls.push(tab)
      setTourProps({ auditTab: tab })
    },
    setupPanelVisible: false,
    setupRunning: false,
    ...overrides,
  }
}

let uiState = {
  islandState: "docked" as OnboardingUiControls["islandState"],
  isBusinessProfileOpen: false,
  isCreateProjectOpen: false,
}

function setUiState(patch: Partial<typeof uiState>) {
  uiState = { ...uiState, ...patch }
  rerenderHarness?.()
}

function setTourProps(patch: Partial<OnboardingTourProps>) {
  if (tourPropState) tourPropState = { ...tourPropState, ...patch }
  rerenderHarness?.()
}

const uiControls = (): OnboardingUiControls => ({
  islandState: uiState.islandState,
  openRevbot: () => setUiState({ islandState: "minimized" }),
  maximizeRevbot: () => setUiState({ islandState: "maximized" }),
  dockRevbot: () => setUiState({ islandState: "docked" }),
  openBusinessProfile: () => setUiState({ isBusinessProfileOpen: true }),
  closeBusinessProfile: () => setUiState({ isBusinessProfileOpen: false }),
  isBusinessProfileOpen: uiState.isBusinessProfileOpen,
  isCreateProjectOpen: uiState.isCreateProjectOpen,
  lockDockItem: (key) => {
    lockCalls.push(key)
  },
})

function Harness() {
  const [, setTick] = useState(0)
  rerenderHarness = () => setTick((tick) => tick + 1)
  if (!tourPropState) throw new Error("harness rendered without props")
  return (
    <OnboardingUiContext.Provider value={uiControls()}>
      <OnboardingTour {...tourPropState} />
    </OnboardingUiContext.Provider>
  )
}

function fixture(tour: string, extra = "") {
  const div = document.createElement("div")
  div.setAttribute("data-tour", tour)
  if (extra) div.innerHTML = extra
  document.body.appendChild(div)
  return div
}

function renderHarness(overrides: Partial<OnboardingTourProps> = {}) {
  tourPropState = baseTourProps(overrides)
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root?.render(<Harness />)
  })
}

async function settle(rounds = 12) {
  await act(async () => {
    for (let i = 0; i < rounds; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  })
}

function stepIndexByTitle(title: string) {
  const steps = captured?.config.steps ?? []
  return steps.findIndex((step) => step.popover?.title === title)
}

async function clickNext(title: string) {
  const index = stepIndexByTitle(title)
  expect(index >= 0).toBe(true)
  await act(async () => {
    await captured?.config.steps[index].popover?.onNextClick?.()
  })
  await settle()
}

beforeEach(() => {
  installObservingDriver()
})

afterEach(() => {
  setOnboardingDriverLoader(null)
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  tourPropState = null
  rerenderHarness = null
  captured = null
  saveCalls = []
  skipCalls = 0
  completeCalls = 0
  completeImpl = () => Promise.resolve({})
  viewCalls = []
  auditCalls = []
  lockCalls = []
  uiState = {
    islandState: "docked",
    isBusinessProfileOpen: false,
    isCreateProjectOpen: false,
  }
  document.body.innerHTML = ""
})

const RESULTS_PROPS: Partial<OnboardingTourProps> = {
  onboarding: { version: 1, status: "in_progress", checkpoint: "overview" },
  hasProjects: true,
  resultsReady: true,
}

describe("onboarding creation flow", () => {
  test("empty state drives first, modal open highlights the real form", async () => {
    fixture("onboarding-new-project")
    renderHarness()
    await settle()
    expect(captured?.driveCalls[0]).toBe(stepIndexByTitle("Create your first project"))

    fixture("onboarding-create-form")
    await act(async () => {
      setUiState({ isCreateProjectOpen: true })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Name your project"))
  })

  test("modal cancel restores the empty-state guidance", async () => {
    fixture("onboarding-new-project")
    fixture("onboarding-create-form")
    renderHarness()
    await settle()
    await act(async () => {
      setUiState({ isCreateProjectOpen: true })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Name your project"))

    document
      .querySelector('[data-tour="onboarding-create-form"]')
      ?.remove()
    await act(async () => {
      setUiState({ isCreateProjectOpen: false })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Create your first project"))
  })

  test("project creation guides the pre-init setup panel", async () => {
    fixture("onboarding-new-project")
    renderHarness()
    await settle()
    fixture("onboarding-project-details")
    await act(async () => {
      setTourProps({ hasProjects: true, setupPanelVisible: true })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Set up this project"))
  })

  test("creation from another tab lands on Audit Overview with init guidance", async () => {
    fixture("onboarding-new-project")
    renderHarness({ view: "revserp-visibility", auditTab: "seo" })
    await settle()
    expect(captured?.driveCalls[0]).toBe(stepIndexByTitle("Create your first project"))
    fixture("onboarding-project-details")
    await act(async () => {
      setTourProps({ hasProjects: true, setupPanelVisible: true })
    })
    await settle()
    expect(viewCalls).toContain("revserp-audit")
    expect(auditCalls).toContain("overview")
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Set up this project"))
  })

  test("refresh with a ready setup panel shows pre-init guidance", async () => {
    fixture("onboarding-project-details")
    renderHarness({
      onboarding: { version: 1, status: "in_progress", checkpoint: "project_details" },
      hasProjects: true,
      setupPanelVisible: true,
      setupRunning: false,
      resultsReady: false,
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Set up this project"))
    expect(
      saveCalls.some(([checkpoint]) => checkpoint === "waiting_for_results"),
    ).toBe(false)
  })
})

describe("onboarding initialization pause and resume", () => {
  test("setup start hides the overlay and resume returns to results", async () => {
    fixture("onboarding-project-details")
    renderHarness({
      onboarding: { version: 1, status: "in_progress", checkpoint: "project_details" },
      hasProjects: true,
      setupPanelVisible: true,
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Set up this project"))

    await act(async () => {
      setTourProps({ setupRunning: true })
    })
    await settle()
    expect(
      saveCalls.some(([checkpoint]) => checkpoint === "waiting_for_results"),
    ).toBe(true)
    fixture("onboarding-overview")
    fixture("onboarding-score-card-seo")
    await act(async () => {
      setTourProps({
        setupRunning: false,
        setupPanelVisible: false,
        resultsReady: true,
        onboarding: { version: 1, status: "in_progress", checkpoint: "waiting_for_results" },
      })
    })
    await settle()
    expect(captured?.driveCalls).toEqual([
      stepIndexByTitle("Your audit overview"),
    ])
  })
})

describe("onboarding action gating", () => {
  test("score cards advance on real SEO navigation, not the click alone", async () => {
    fixture("onboarding-overview")
    fixture("onboarding-score-card-seo")
    fixture("onboarding-audit-nav")
    renderHarness(RESULTS_PROPS)
    await settle()
    await clickNext("Your audit overview")
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Open the SEO view"))

    fixture("onboarding-bucket-scores")
    await act(async () => {
      setTourProps({ auditTab: "seo" })
    })
    await settle()
    expect(lockCalls.includes("audit")).toBe(true)
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Every audit tab, one menu"))
  })

  test("bucket drill advances only when the selected bucket table renders", async () => {
    fixture("onboarding-bucket-scores")
    fixture("onboarding-issue-table")
    renderHarness({
      ...RESULTS_PROPS,
      onboarding: { version: 1, status: "in_progress", checkpoint: "bucket_scores" },
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Start with a bucket"))
    const drivesBefore = captured?.driveCalls.length ?? 0

    const { dispatchOnboardingBucketDrill } = await import(
      "~/components/onboarding/onboarding-ui"
    )
    await act(async () => {
      dispatchOnboardingBucketDrill({ bucketId: "thin_content", hasIssues: true })
    })
    await settle(4)
    expect(captured?.driveCalls.length).toBe(drivesBefore)

    const bucket = document.createElement("div")
    bucket.setAttribute("data-tour", "onboarding-issue-bucket")
    bucket.setAttribute("data-tour-bucket", "thin_content")
    document.body.appendChild(bucket)
    await act(async () => {
      dispatchOnboardingBucketDrill({ bucketId: "thin_content", hasIssues: true })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Read the issue table"))
  })

  test("issue drill advances only when the matching detail renders", async () => {
    fixture("onboarding-bucket-scores")
    fixture("onboarding-issue-table")
    const bucket = document.createElement("div")
    bucket.setAttribute("data-tour", "onboarding-issue-bucket")
    bucket.setAttribute("data-tour-bucket", "thin_content")
    document.body.appendChild(bucket)
    renderHarness({
      ...RESULTS_PROPS,
      onboarding: { version: 1, status: "in_progress", checkpoint: "bucket_scores" },
    })
    await settle()
    const { dispatchOnboardingBucketDrill, dispatchOnboardingIssueDrill } =
      await import("~/components/onboarding/onboarding-ui")
    await act(async () => {
      dispatchOnboardingBucketDrill({ bucketId: "thin_content", hasIssues: true })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Read the issue table"))
    const drivesBefore = captured?.driveCalls.length ?? 0
    await act(async () => {
      dispatchOnboardingIssueDrill({ issueTypeId: "missing_titles" })
    })
    await settle(4)
    expect(captured?.driveCalls.length).toBe(drivesBefore)

    const detail = document.createElement("div")
    detail.setAttribute("data-tour", "onboarding-issue-detail")
    detail.setAttribute("data-tour-issue", "missing_titles")
    document.body.appendChild(detail)
    await act(async () => {
      dispatchOnboardingIssueDrill({ issueTypeId: "missing_titles" })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(
      stepIndexByTitle("Affected pages and handbook"),
    )
  })

  test("zero findings explain the bucket and skip the detail step", async () => {
    fixture("onboarding-bucket-scores")
    fixture("onboarding-issue-table")
    fixture("onboarding-revbot-launcher")
    renderHarness({
      ...RESULTS_PROPS,
      onboarding: { version: 1, status: "in_progress", checkpoint: "bucket_scores" },
    })
    await settle()
    const { dispatchOnboardingBucketDrill } = await import(
      "~/components/onboarding/onboarding-ui"
    )
    await act(async () => {
      dispatchOnboardingBucketDrill({ bucketId: "empty_bucket", hasIssues: false })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Read the issue table"))

    await clickNext("Read the issue table")
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Meet Revbot"))
  })

  test("issue table Next stays put until a real issue opens", async () => {
    fixture("onboarding-issue-table")
    renderHarness({
      ...RESULTS_PROPS,
      onboarding: { version: 1, status: "in_progress", checkpoint: "issue_table" },
    })
    await settle()
    const drivesBefore = captured?.driveCalls.length ?? 0
    await clickNext("Read the issue table")
    expect(captured?.driveCalls.length).toBe(drivesBefore)
  })
})

describe("onboarding optional features", () => {
  test("unavailable revbot routes forward to the business profile", async () => {
    fixture("onboarding-bucket-scores")
    fixture("onboarding-issue-table")
    fixture("onboarding-business-profile-row")
    const bucket = document.createElement("div")
    bucket.setAttribute("data-tour", "onboarding-issue-bucket")
    bucket.setAttribute("data-tour-bucket", "thin_content")
    document.body.appendChild(bucket)
    const detail = document.createElement("div")
    detail.setAttribute("data-tour", "onboarding-issue-detail")
    detail.setAttribute("data-tour-issue", "missing_titles")
    document.body.appendChild(detail)
    renderHarness({
      ...RESULTS_PROPS,
      revbotAvailable: false,
      onboarding: { version: 1, status: "in_progress", checkpoint: "bucket_scores" },
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Start with a bucket"))
    const { dispatchOnboardingBucketDrill, dispatchOnboardingIssueDrill } =
      await import("~/components/onboarding/onboarding-ui")
    await act(async () => {
      dispatchOnboardingBucketDrill({ bucketId: "thin_content", hasIssues: true })
    })
    await settle()
    await act(async () => {
      dispatchOnboardingIssueDrill({ issueTypeId: "missing_titles" })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(
      stepIndexByTitle("Affected pages and handbook"),
    )
    await clickNext("Affected pages and handbook")
    expect(lockCalls.includes("actions")).toBe(true)
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Business profile"))
  })

  test("saved disabled checkpoints advance instead of stalling", async () => {
    fixture("onboarding-business-profile-row")
    renderHarness({
      ...RESULTS_PROPS,
      revbotAvailable: false,
      onboarding: { version: 1, status: "in_progress", checkpoint: "revbot" },
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Business profile"))
  })

  test("business entry holds the menu open before waiting for the row", async () => {
    renderHarness({
      ...RESULTS_PROPS,
      onboarding: { version: 1, status: "in_progress", checkpoint: "business_profile" },
    })
    await settle()
    expect(lockCalls.includes("actions")).toBe(true)
    expect(lockCalls.indexOf("actions") < 2).toBe(true)
    expect(captured?.driveCalls.length ?? -1).toBe(0)
    fixture("onboarding-business-profile-row")
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Business profile"))
  })
})

describe("onboarding handbook link", () => {
  test("every step routes Next through the action gate", async () => {
    fixture("onboarding-overview")
    renderHarness(RESULTS_PROPS)
    await settle()
    const steps = captured?.config.steps ?? []
    expect(steps.length > 0).toBe(true)
    for (const step of steps) {
      expect(typeof step.popover?.onNextClick).toBe("function")
      expect("advanceOnClick" in step).toBe(false)
    }
  })

  test("issue details carry the exact handbook anchor", async () => {
    fixture("onboarding-issue-detail")
    renderHarness({
      ...RESULTS_PROPS,
      onboarding: { version: 1, status: "in_progress", checkpoint: "issue_details" },
    })
    await settle()
    const step = (captured?.config.steps ?? []).find(
      (entry) => entry.popover?.title === "Affected pages and handbook",
    )
    expect(
      step?.popover?.description?.includes(
        `<a href="/handbook" target="_blank" rel="noopener noreferrer">Visit our Handbook</a>`,
      ) ?? false,
    ).toBe(true)
  })
})

describe("onboarding cancellation", () => {
  test("unmount during a pending wait never drives a stale instance", async () => {
    renderHarness()
    await act(async () => {
      if (root) root.unmount()
      root = null
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(captured?.driveCalls.length ?? 0).toBe(0)
  })

  test("scope change invalidates the stale run", async () => {
    renderHarness()
    await act(async () => {
      setTourProps({
        onboardingScopeKey: "org-1:user-2",
        onboarding: { version: 1, status: "completed", checkpoint: "finish" },
      })
    })
    await settle()
    expect(captured?.driveCalls.length ?? 0).toBe(0)
    expect(lockCalls.includes(null)).toBe(true)
  })

  test("entering location scope stops the active tour", async () => {
    fixture("onboarding-overview")
    renderHarness(RESULTS_PROPS)
    await settle()
    expect((captured?.driveCalls.length ?? 0) > 0).toBe(true)
    const destroysBefore = captured?.destroyCalls ?? 0
    await act(async () => {
      setTourProps({ locationScoped: true })
    })
    await settle()
    expect((captured?.destroyCalls ?? 0) > destroysBefore).toBe(true)
  })
})

describe("onboarding completion and skip", () => {
  test("completion failure stays put and retries", async () => {
    renderHarness({
      ...RESULTS_PROPS,
      onboarding: { version: 1, status: "in_progress", checkpoint: "finish" },
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Tour complete"))

    completeImpl = () => Promise.reject(new Error("offline"))
    await clickNext("Tour complete")
    expect(completeCalls).toBe(1)
    expect(captured?.destroyCalls ?? 0).toBe(0)

    completeImpl = () => Promise.resolve({})
    await clickNext("Tour complete")
    expect(completeCalls).toBe(2)
    expect((captured?.destroyCalls ?? 0) > 0).toBe(true)
  })

  test("dismiss marks skipped and tears down at once", async () => {
    fixture("onboarding-overview")
    renderHarness(RESULTS_PROPS)
    await settle()
    expect((captured?.driveCalls.length ?? 0) > 0).toBe(true)
    await act(async () => {
      captured?.config.onDestroyStarted?.()
    })
    expect(skipCalls).toBe(1)
    expect((captured?.destroyCalls ?? 0) > 0).toBe(true)
    expect(lockCalls.includes(null)).toBe(true)
  })

  test("routine saves preserve the bound project context", async () => {
    fixture("onboarding-overview")
    renderHarness({
      ...RESULTS_PROPS,
      projectId: "proj-1",
      crawlId: "crawl-1",
      onboarding: {
        version: 1,
        status: "in_progress",
        checkpoint: "overview",
        project_id: "proj-1",
        crawl_id: "crawl-1",
      },
    })
    await settle()
    expect(saveCalls.length > 0).toBe(true)
    for (const [, options] of saveCalls) {
      expect(options).toBeUndefined()
    }
  })

  test("creation binds the new project once", async () => {
    fixture("onboarding-new-project")
    renderHarness()
    await settle()
    fixture("onboarding-project-details")
    await act(async () => {
      setTourProps({ hasProjects: true, setupPanelVisible: true })
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Set up this project"))
    const bound = saveCalls.find(([checkpoint]) => checkpoint === "project_details")
    expect(bound?.[1]).toEqual({ projectId: "proj-1" })
  })

  test("ready results bind the crawl for the bound project", async () => {
    fixture("onboarding-overview")
    fixture("onboarding-score-card-seo")
    renderHarness({
      ...RESULTS_PROPS,
      crawlId: "crawl-9",
      onboarding: {
        version: 1,
        status: "in_progress",
        checkpoint: "project_details",
        project_id: "proj-1",
      },
    })
    await settle()
    expect(captured?.driveCalls.at(-1)).toBe(stepIndexByTitle("Your audit overview"))
    const bound = saveCalls.find(([checkpoint]) => checkpoint === "overview")
    expect(bound?.[1]).toEqual({ crawlId: "crawl-9" })
  })

  test("project switch pauses instead of walking foreign results", async () => {
    fixture("onboarding-overview")
    renderHarness({
      ...RESULTS_PROPS,
      onboarding: {
        version: 1,
        status: "in_progress",
        checkpoint: "overview",
        project_id: "proj-1",
      },
    })
    await settle()
    const drivesBefore = captured?.driveCalls.length ?? 0
    const savesBefore = saveCalls.length
    await act(async () => {
      setTourProps({ projectId: "proj-2" })
    })
    await settle()
    expect(captured?.driveCalls.length).toBe(drivesBefore)
    expect(saveCalls.length).toBe(savesBefore)
  })

  test("organization switch restarts without carrying context", async () => {
    fixture("onboarding-new-project")
    renderHarness({
      onboarding: {
        version: 1,
        status: "in_progress",
        checkpoint: "overview",
        project_id: "proj-1",
      },
      hasProjects: true,
      resultsReady: true,
    })
    await settle()
    await act(async () => {
      setTourProps({
        onboardingScopeKey: "org-2:user-1",
        onboarding: null,
        hasProjects: false,
      })
    })
    await settle()
    const drivesAfterSwitch = captured?.driveCalls.length ?? 0
    await act(async () => {
      setTourProps({
        onboarding: { version: 1, status: "not_started", checkpoint: "new_project" },
      })
    })
    await settle()
    expect((captured?.driveCalls.length ?? 0)).toBe(drivesAfterSwitch + 1)
    expect(captured?.driveCalls.at(-1)).toBe(
      stepIndexByTitle("Create your first project"),
    )
  })

  test("explicit replay retargets to the current project", async () => {
    fixture("onboarding-overview")
    fixture("onboarding-score-card-seo")
    renderHarness({
      ...RESULTS_PROPS,
      projectId: "proj-2",
      onboarding: {
        version: 1,
        status: "in_progress",
        checkpoint: "overview",
        project_id: "proj-1",
      },
    })
    await settle()
    const drivesBefore = captured?.driveCalls.length ?? 0
    await act(async () => {
      window.dispatchEvent(new CustomEvent("onboarding:replay"))
    })
    await settle()
    expect((captured?.driveCalls.length ?? 0)).toBe(drivesBefore + 1)
    const replaySave = saveCalls.find(
      ([checkpoint, options]) =>
        checkpoint === "overview" &&
        (options as { force?: boolean } | undefined)?.force === true,
    )
    expect((replaySave?.[1] as { projectId?: string } | undefined)?.projectId).toBe(
      "proj-2",
    )
  })
})

describe("onboarding tour presentation", () => {
  function popover(title: string) {
    return captured?.config.steps.find((step) => step.popover?.title === title)
      ?.popover
  }

  test("driver uses a strong dim with background scroll locked", async () => {
    fixture("onboarding-overview")
    renderHarness(RESULTS_PROPS)
    await settle()
    expect(captured?.config.allowScroll).toBe(false)
    expect(captured?.config.overlayOpacity).toBe(0.75)
  })

  test("popovers declare adjacent placement per step", async () => {
    fixture("onboarding-overview")
    renderHarness(RESULTS_PROPS)
    await settle()
    const placement = (title: string) => {
      const entry = popover(title)
      return `${entry?.side ?? "?"}/${entry?.align ?? "?"}`
    }
    expect(placement("Meet Revbot")).toBe("left/end")
    expect(placement("Ask anything")).toBe("top/end")
    expect(placement("Past chats live here")).toBe("left/start")
    expect(placement("Start with a bucket")).toBe("bottom/center")
    expect(placement("One look, no edits needed")).toBe("left/center")
    expect(placement("Connect Search Console")).toBe("bottom/center")
    expect(placement("Every audit tab, one menu")).toBe("bottom/center")
  })
})
