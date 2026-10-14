"use client"

import { createContext, useContext } from "react"

/** Transient UI the tour recreates with real React state, never synthetic clicks. */
export type OnboardingUiControls = {
  islandState: "docked" | "minimized" | "maximized"
  openRevbot: () => void
  maximizeRevbot: () => void
  dockRevbot: () => void
  openBusinessProfile: () => void
  closeBusinessProfile: () => void
  isBusinessProfileOpen: boolean
  /** Create-project dialog visibility; the tour tracks modal open/cancel. */
  isCreateProjectOpen: boolean
  /** Controlled NavigationMenu value; null clears the lock on stop/unmount. */
  lockDockItem: (key: string | null) => void
}

export const OnboardingUiContext =
  createContext<OnboardingUiControls | null>(null)

/** Shell provides this above the tour; null outside the app shell. */
export function useOnboardingUi() {
  return useContext(OnboardingUiContext)
}

/** Fired from the profile menu; the tour starts a results-based replay. */
export const ONBOARDING_REPLAY_EVENT = "onboarding:replay"

/** Fired on real bucket drills: card, treemap, and explorer table paths. */
export const ONBOARDING_BUCKET_DRILL_EVENT = "onboarding:bucket-drill"

export type OnboardingBucketDrillDetail = {
  bucketId: string
  /** False when the bucket holds no issues: explain empty, skip detail. */
  hasIssues: boolean
}

/** Fired on real issue drills; the tour advances only once detail renders. */
export const ONBOARDING_ISSUE_DRILL_EVENT = "onboarding:issue-drill"

export type OnboardingIssueDrillDetail = {
  issueTypeId: string
}

export function dispatchOnboardingBucketDrill(detail: OnboardingBucketDrillDetail) {
  window.dispatchEvent(
    new CustomEvent<OnboardingBucketDrillDetail>(ONBOARDING_BUCKET_DRILL_EVENT, {
      detail,
    }),
  )
}

export function dispatchOnboardingIssueDrill(detail: OnboardingIssueDrillDetail) {
  window.dispatchEvent(
    new CustomEvent<OnboardingIssueDrillDetail>(ONBOARDING_ISSUE_DRILL_EVENT, {
      detail,
    }),
  )
}

export function requestOnboardingReplay() {
  window.dispatchEvent(new CustomEvent(ONBOARDING_REPLAY_EVENT))
}

/**
 * Real-readiness wait: resolves with the live element, null on timeout, or
 * null immediately when the run is cancelled via signal. Never rejects.
 */
export function waitForOnboardingElement(
  target: string | (() => Element | null),
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Element | null> {
  const read = () => {
    try {
      return typeof target === "function" ? target() : document.querySelector(target)
    } catch {
      return null
    }
  }
  const found = read()
  if (found || signal?.aborted) return Promise.resolve(signal?.aborted ? null : found)
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: Element | null) => {
      if (settled) return
      settled = true
      observer.disconnect()
      window.clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      resolve(value)
    }
    const onAbort = () => finish(null)
    const observer = new MutationObserver(() => {
      const element = read()
      if (element) finish(element)
    })
    const timer = window.setTimeout(() => finish(read()), timeoutMs)
    signal?.addEventListener("abort", onAbort, { once: true })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    })
  })
}
