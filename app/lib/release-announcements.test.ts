import { existsSync } from "node:fs"
import { expect, test } from "bun:test"
import { getPublishedReleaseAnnouncements, RELEASE_ANNOUNCEMENTS } from "./release-announcements"

test("scheduled announcements stay hidden until their publication date", () => {
  const firstPublication = Math.min(...RELEASE_ANNOUNCEMENTS.map((release) => Date.parse(release.publishedAt)))
  expect(getPublishedReleaseAnnouncements(firstPublication - 1)).toEqual([])
  expect(getPublishedReleaseAnnouncements(firstPublication).length > 0).toBe(true)
})

test("release IDs are unique, receipt-compatible, and stable across reads", () => {
  const ids = RELEASE_ANNOUNCEMENTS.map((release) => release.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const id of ids) expect(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)).toBe(true)
  const published = getPublishedReleaseAnnouncements(Infinity)
  for (let i = 1; i < published.length; i++) {
    expect(Date.parse(published[i - 1].publishedAt) >= Date.parse(published[i].publishedAt)).toBe(true)
  }
  expect(RELEASE_ANNOUNCEMENTS.map((release) => release.id)).toEqual(ids)
})

test("every release has highlights, full notes, and local artwork", () => {
  for (const release of RELEASE_ANNOUNCEMENTS) {
    expect(release.slides.length > 0).toBe(true)
    expect(release.sections.length > 0).toBe(true)
    expect(new Set(release.slides.map((slide) => slide.id)).size).toBe(release.slides.length)
    for (const image of [release.coverImage, ...release.slides.map((slide) => slide.image)]) {
      expect(image.startsWith("/announcements/")).toBe(true)
      expect(existsSync(new URL(`../../public${image}`, import.meta.url))).toBe(true)
    }
    for (const section of release.sections) expect(section.items.length > 0).toBe(true)
  }
})
