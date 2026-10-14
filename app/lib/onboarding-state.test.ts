import { describe, expect, test } from "bun:test"

import {
  firstOnboardingCheckpoint,
  isOnboardingCheckpointAvailable,
  isOnboardingResultsReady,
  isOnboardingSetupRunning,
  isOnboardingStepKeyAvailable,
  mergeOnboardingCheckpoint,
  replayOnboardingCheckpoint,
  resolveOnboardingResumeCheckpoint,
  type OnboardingAvailability,
} from "./onboarding-state"

const READY: OnboardingAvailability = {
  hasProjects: true,
  resultsReady: true,
  revbotAvailable: true,
  businessProfileAvailable: true,
  integrationsAvailable: true,
  bucketCount: 3,
}

describe("onboarding setup gating", () => {
  test("every backend setup stage hides the tour overlay", () => {
    for (const status of [
      "crawling",
      "profile_generation",
      "prompt_generation",
      "visibility",
    ]) {
      expect(isOnboardingSetupRunning(status)).toBe(true)
    }
    expect(isOnboardingSetupRunning("ready")).toBe(false)
    expect(isOnboardingSetupRunning("completed")).toBe(false)
    expect(isOnboardingSetupRunning("failed")).toBe(false)
    expect(isOnboardingSetupRunning(null)).toBe(false)
  })

  test("results need a completed crawl and pillar scores together", () => {
    expect(
      isOnboardingResultsReady({ hasCompletedCrawl: true, hasPillarScores: true }),
    ).toBe(true)
    expect(
      isOnboardingResultsReady({ hasCompletedCrawl: true, hasPillarScores: false }),
    ).toBe(false)
    expect(
      isOnboardingResultsReady({ hasCompletedCrawl: false, hasPillarScores: true }),
    ).toBe(false)
  })

})

describe("onboarding resume", () => {
  test("issue steps resume at bucket scores", () => {
    expect(resolveOnboardingResumeCheckpoint("issue_table")).toBe("bucket_scores")
    expect(resolveOnboardingResumeCheckpoint("issue_details")).toBe("bucket_scores")
    expect(resolveOnboardingResumeCheckpoint("bucket_scores")).toBe("bucket_scores")
  })

  test("revbot steps resume at the launcher", () => {
    expect(resolveOnboardingResumeCheckpoint("revbot_history")).toBe("revbot")
    expect(resolveOnboardingResumeCheckpoint("revbot_input")).toBe("revbot")
    expect(resolveOnboardingResumeCheckpoint("overview")).toBe("overview")
  })

  test("stale saves never move the checkpoint backwards", () => {
    expect(mergeOnboardingCheckpoint("issue_table", "bucket_scores")).toBe("issue_table")
    expect(mergeOnboardingCheckpoint("overview", "score_cards")).toBe("score_cards")
    expect(mergeOnboardingCheckpoint("overview", "overview")).toBe("overview")
  })
})

describe("onboarding availability", () => {
  test("optional features skip while creation and results block", () => {
    expect(
      isOnboardingCheckpointAvailable("revbot", { ...READY, revbotAvailable: false }),
    ).toBe(false)
    expect(
      isOnboardingCheckpointAvailable("integrations", {
        ...READY,
        integrationsAvailable: false,
      }),
    ).toBe(false)
    expect(
      isOnboardingCheckpointAvailable("business_profile", {
        ...READY,
        businessProfileAvailable: false,
      }),
    ).toBe(false)
    expect(
      isOnboardingCheckpointAvailable("bucket_scores", { ...READY, bucketCount: 0 }),
    ).toBe(false)
    expect(
      isOnboardingCheckpointAvailable("overview", { ...READY, resultsReady: false }),
    ).toBe(false)
    expect(
      isOnboardingCheckpointAvailable("new_project", { ...READY, resultsReady: false }),
    ).toBe(true)
  })

  test("creation substeps split on project existence", () => {
    expect(
      isOnboardingStepKeyAvailable("create_form", "project_details", {
        ...READY,
        hasProjects: false,
      }),
    ).toBe(true)
    expect(
      isOnboardingStepKeyAvailable("create_form", "project_details", READY),
    ).toBe(false)
    expect(
      isOnboardingStepKeyAvailable("project_details", "project_details", READY),
    ).toBe(true)
    expect(
      isOnboardingStepKeyAvailable("project_details", "project_details", {
        ...READY,
        hasProjects: false,
      }),
    ).toBe(false)
    expect(
      isOnboardingStepKeyAvailable("overview", "overview", READY),
    ).toBe(true)
  })

  test("new workspaces start at project creation, replays need results", () => {
    expect(firstOnboardingCheckpoint({ ...READY, hasProjects: false })).toBe(
      "new_project",
    )
    expect(firstOnboardingCheckpoint({ ...READY, resultsReady: false })).toBe(null)
    expect(firstOnboardingCheckpoint(READY)).toBe("overview")
    expect(replayOnboardingCheckpoint(READY)).toBe("overview")
    expect(
      replayOnboardingCheckpoint({ ...READY, resultsReady: false }),
    ).toBe(null)
    expect(
      replayOnboardingCheckpoint({ ...READY, hasProjects: false }),
    ).toBe(null)
  })
})

describe("onboarding completion and skip", () => {
  test("finish follows integrations in checkpoint order", () => {
    expect(mergeOnboardingCheckpoint("integrations", "finish")).toBe("finish")
  })
})
