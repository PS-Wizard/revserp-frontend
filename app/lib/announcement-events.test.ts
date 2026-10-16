import { describe, expect, test } from "bun:test"

import { installTestDom } from "~/lib/dom-test-setup"
import {
  ANNOUNCEMENT_REPLAY_EVENT,
  requestAnnouncementReplay,
  type AnnouncementReplayDetail,
} from "./announcement-events"
import { getPublishedReleaseAnnouncements } from "./release-announcements"

installTestDom()

function once(detailType: string) {
  return new Promise<AnnouncementReplayDetail>((resolve) => {
    window.addEventListener(
      detailType,
      (raw) => resolve((raw as CustomEvent<AnnouncementReplayDetail>).detail),
      { once: true },
    )
  })
}

describe("announcement replay events", () => {
  test("manual replay without id requests the latest published release", async () => {
    const seen = once(ANNOUNCEMENT_REPLAY_EVENT)
    requestAnnouncementReplay()
    const detail = await seen
    expect(detail).toEqual({ announcementId: undefined })
    expect(getPublishedReleaseAnnouncements().length).toBe(1)
  })

  test("history replay carries the selected release id", async () => {
    const latest = getPublishedReleaseAnnouncements()[0]
    const seen = once(ANNOUNCEMENT_REPLAY_EVENT)
    requestAnnouncementReplay(latest.id)
    expect(await seen).toEqual({ announcementId: latest.id })
  })

  test("unknown replay ids never match the published manifest", () => {
    const published = getPublishedReleaseAnnouncements()
    const match = published.find((release) => release.id === "no-such-release")
    expect(match).toBe(undefined)
  })
})
