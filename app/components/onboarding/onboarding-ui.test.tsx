import { describe, expect, test } from "bun:test"

import { installTestDom } from "~/lib/dom-test-setup"
import {
  dispatchOnboardingBucketDrill,
  dispatchOnboardingIssueDrill,
  ONBOARDING_BUCKET_DRILL_EVENT,
  ONBOARDING_ISSUE_DRILL_EVENT,
  ONBOARDING_REPLAY_EVENT,
  requestOnboardingReplay,
  waitForOnboardingElement,
  type OnboardingBucketDrillDetail,
} from "./onboarding-ui"

installTestDom()

function once<T>(event: string) {
  return new Promise<T>((resolve) => {
    window.addEventListener(
      event,
      (raw) => resolve((raw as CustomEvent<T>).detail),
      { once: true },
    )
  })
}

describe("onboarding tour events", () => {
  test("real bucket drills reach the tour with their empty state", async () => {
    const seen = once<OnboardingBucketDrillDetail>(ONBOARDING_BUCKET_DRILL_EVENT)
    dispatchOnboardingBucketDrill({ bucketId: "thin_content", hasIssues: false })
    expect(await seen).toEqual({ bucketId: "thin_content", hasIssues: false })
  })

  test("real issue drills reach the tour", async () => {
    const seen = once<{ issueTypeId: string }>(ONBOARDING_ISSUE_DRILL_EVENT)
    dispatchOnboardingIssueDrill({ issueTypeId: "missing_titles" })
    expect(await seen).toEqual({ issueTypeId: "missing_titles" })
  })

  test("profile menu replay requests reach the tour", async () => {
    const seen = once<unknown>(ONBOARDING_REPLAY_EVENT)
    requestOnboardingReplay()
    await seen
  })
})

describe("onboarding readiness waits", () => {
  test("resolves live targets without waiting", async () => {
    document.body.innerHTML = `<div data-tour="onboarding-overview"></div>`
    const found = await waitForOnboardingElement(
      '[data-tour="onboarding-overview"]',
      50,
    )
    expect(found?.getAttribute("data-tour")).toBe("onboarding-overview")
    document.body.innerHTML = ""
  })

  test("waits for targets that render after navigation", async () => {
    document.body.innerHTML = ""
    window.setTimeout(() => {
      document.body.innerHTML = `<div data-tour="onboarding-issue-detail"></div>`
    }, 10)
    const found = await waitForOnboardingElement(
      '[data-tour="onboarding-issue-detail"]',
      1000,
    )
    expect(found?.getAttribute("data-tour")).toBe("onboarding-issue-detail")
    document.body.innerHTML = ""
  })

  test("gives up on targets that never render", async () => {
    document.body.innerHTML = ""
    const found = await waitForOnboardingElement(
      '[data-tour="onboarding-never"]',
      20,
    )
    expect(found).toBeNull()
  })
})
