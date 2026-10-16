import { describe, expect, test } from "bun:test"

import {
  announcementSeenQueryKey,
  hasSeenAnnouncement,
  isAnnouncementOnboardingComplete,
  isUserCreatedBeforeAnnouncement,
  shouldAutoShowAnnouncement,
} from "./announcement-seen-api"

describe("announcement seen scoping", () => {
  test("query keys stay scoped by user id", () => {
    expect(announcementSeenQueryKey("user-a")).toEqual([
      "announcement-seen",
      "user-a",
    ])
    expect(announcementSeenQueryKey("user-a")[1] === announcementSeenQueryKey("user-b")[1]).toBe(
      false,
    )
  })
})

describe("announcement auto eligibility baseline", () => {
  test("eligible when onboarding done and user predates release", () => {
    expect(
      shouldAutoShowAnnouncement({
        seenSuccess: true,
        userCreatedAt: "2026-01-10T00:00:00Z",
        publishedAt: "2026-10-16T00:00:00Z",
        announcementId: "2026-10-october-update",
        seenIds: new Set(),
        onboardingStatus: "completed",
      }),
    ).toBe(true)
  })

  test("skipped onboarding also qualifies for auto display", () => {
    expect(isAnnouncementOnboardingComplete("skipped")).toBe(true)
    expect(isAnnouncementOnboardingComplete("completed")).toBe(true)
    expect(isAnnouncementOnboardingComplete("in_progress")).toBe(false)
    expect(isAnnouncementOnboardingComplete(null)).toBe(false)
  })

  test("seen fetch failure never reads as empty seen", () => {
    expect(
      shouldAutoShowAnnouncement({
        seenSuccess: false,
        userCreatedAt: "2026-01-10T00:00:00Z",
        publishedAt: "2026-10-16T00:00:00Z",
        announcementId: "2026-10-october-update",
        seenIds: [],
        onboardingStatus: "completed",
      }),
    ).toBe(false)
  })

  test("brand-new accounts and seen releases stay quiet", () => {
    expect(
      isUserCreatedBeforeAnnouncement(
        "2026-11-01T00:00:00Z",
        "2026-10-16T00:00:00Z",
      ),
    ).toBe(false)
    expect(isUserCreatedBeforeAnnouncement("bad-date", "2026-10-16T00:00:00Z")).toBe(
      false,
    )
    expect(hasSeenAnnouncement(new Set(["2026-10-october-update"]), "2026-10-october-update")).toBe(
      true,
    )
    expect(
      shouldAutoShowAnnouncement({
        seenSuccess: true,
        userCreatedAt: "2026-01-10T00:00:00Z",
        publishedAt: "2026-10-16T00:00:00Z",
        announcementId: "2026-10-october-update",
        seenIds: ["2026-10-october-update"],
        onboardingStatus: "completed",
      }),
    ).toBe(false)
  })
})
