import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import ReactMarkdown from "react-markdown"

import detectorManifest from "./detector-manifest.json"
import {
  getHandbookBucket,
  getHandbookGuide,
  getHandbookGuides,
  getHandbookPillar,
  handbookGuidePath,
  handbookGuides,
  handbookPillars,
  searchHandbookGuides,
} from "./handbook-catalog"

const handbookSections = [
  "explanation",
  "detection",
  "causes",
  "fixes",
  "verification",
  "cautions",
] as const

describe("handbook catalog", () => {
  test("covers every detector issue and bucket in its correct pillar", () => {
    expect(handbookPillars.map((pillar) => pillar.id).sort()).toEqual(
      Object.keys(detectorManifest).sort()
    )
    expect(new Set(handbookGuides.map((guide) => guide.issueType)).size).toBe(
      handbookGuides.length
    )
    for (const pillar of handbookPillars) {
      const detector = detectorManifest[pillar.id]
      expect(pillar.buckets.map((bucket) => bucket.id).sort()).toEqual(
        detector.buckets
      )
      expect(
        getHandbookGuides(pillar.id)
          .map((guide) => guide.issueType)
          .sort()
      ).toEqual(detector.issueTypes)
    }
  })

  test("every guide has complete content, valid scope, references, and related guides", () => {
    const issueTypes = new Set(handbookGuides.map((guide) => guide.issueType))
    for (const guide of handbookGuides) {
      const pillar = getHandbookPillar(guide.pillar)!
      expect(pillar.buckets.some((bucket) => bucket.id === guide.bucket)).toBe(
        true
      )
      const scopes: Record<string, string> =
        detectorManifest[guide.pillar].scopes
      expect(guide.scope).toBe(scopes[guide.issueType])
      expect(guide.title.trim().length > 0).toBe(true)
      expect(guide.summary.trim().length > 0).toBe(true)
      for (const section of handbookSections) {
        expect(guide[section].length > 0).toBe(true)
        expect(
          guide[section].every((paragraph) => paragraph.trim().length > 0)
        ).toBe(true)
      }
      expect(guide.references.length > 0).toBe(true)
      for (const reference of guide.references) {
        expect(new URL(reference.url).protocol).toBe("https:")
        expect(reference.label.trim().length > 0).toBe(true)
      }
      for (const related of guide.relatedIssueTypes ?? []) {
        expect(issueTypes.has(related)).toBe(true)
        expect(related === guide.issueType).toBe(false)
      }
    }
  })

  test("canonical paths are unique and resolve only in the right pillar and bucket", () => {
    const paths = handbookGuides.map(handbookGuidePath)
    expect(new Set(paths).size).toBe(handbookGuides.length)
    for (const guide of handbookGuides) {
      const [, base, pillar, bucket, issue] =
        handbookGuidePath(guide).split("/")
      expect(base).toBe("handbook")
      expect(getHandbookGuide(pillar, bucket, issue)).toBe(guide)
      expect(getHandbookGuide(pillar, "wrong-bucket", issue)).toBeUndefined()
      expect(getHandbookGuide("wrong-pillar", bucket, issue)).toBeUndefined()
    }
    expect(getHandbookPillar(undefined)).toBeUndefined()
    expect(
      getHandbookBucket(handbookPillars[0], "serp_metadata")
    ).toBeUndefined()
  })

  test("search accepts human names, issue IDs, punctuation, and pillar names", () => {
    expect(
      searchHandbookGuides(" MISSING_title ").some(
        (guide) => guide.issueType === "missing_title"
      )
    ).toBe(true)
    expect(
      searchHandbookGuides("llms.txt").some(
        (guide) => guide.issueType === "missing_llms_txt"
      )
    ).toBe(true)
    expect(
      searchHandbookGuides("LCP").some(
        (guide) => guide.issueType === "google_psi_lcp"
      )
    ).toBe(true)
    expect(
      searchHandbookGuides("search engine optimization").some(
        (guide) => guide.pillar === "seo"
      )
    ).toBe(true)
    expect(
      searchHandbookGuides("never-match-this-random-token-237891")
    ).toEqual([])
    expect(searchHandbookGuides(" ")).toEqual(handbookGuides)
  })

  test("literal HTML tags remain visible in guide prose", () => {
    const guide = handbookGuides.find(
      (entry) => entry.issueType === "missing_title"
    )!
    const paragraph = guide.explanation.find((text) =>
      text.includes("<title>")
    )!
    const markup = renderToStaticMarkup(
      createElement(ReactMarkdown, null, paragraph)
    )
    expect(markup).toContain("&lt;title&gt;")
    expect(markup.includes("<title>")).toBe(false)
  })
})
