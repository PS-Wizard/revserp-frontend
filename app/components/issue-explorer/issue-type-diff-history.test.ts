import { describe, expect, test } from "bun:test"

import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

import {
  buildIssueTypeDiffHistory,
  historicalIssueTypeIdsFor,
} from "./issue-type-diff-history"

function issueType(
  id: string,
  overrides: Partial<ScoreBreakdownIssueTypeResponse> = {}
): ScoreBreakdownIssueTypeResponse {
  return {
    id,
    label: id,
    severity: "warning",
    base_penalty: 5,
    severity_multiplier: 1,
    coverage: 0.5,
    final_penalty: 5,
    issue_row_count: 3,
    affected_url_count: 2,
    message: `${id} message`,
    details_preview: "",
    ...overrides,
  }
}

function bucket(
  id: string,
  issues: ScoreBreakdownIssueTypeResponse[] = []
): ScoreBreakdownBucketResponse {
  return {
    id,
    label: id,
    score: 80,
    weight: 1,
    weighted_contribution: 80,
    total_penalty: 20,
    issue_type_count: issues.length,
    issue_row_count: 3,
    affected_url_count: 2,
    issues,
  }
}

function pillar(
  id: string,
  buckets: ScoreBreakdownBucketResponse[] = []
): ScoreBreakdownPillarResponse {
  return {
    id,
    label: id,
    score: 80,
    weight: 1,
    weighted_contribution: 80,
    total_penalty: 20,
    bucket_count: buckets.length,
    issue_type_count: 1,
    issue_row_count: 3,
    affected_url_count: 2,
    buckets,
  }
}

function breakdown(
  pillars: ScoreBreakdownPillarResponse[]
): ScoreBreakdownResponse {
  return {
    crawl_id: "current",
    scoring_version: "v1",
    coverage_scale: 1,
    total_scored_pages: 10,
    overall_score: 80,
    pillars,
  }
}

describe("buildIssueTypeDiffHistory", () => {
  test("empty current buckets and pillars remain drillable without changing their scores", () => {
    const currentBucket = { ...bucket("meta"), score: 100, issue_row_count: 0 }
    const currentPillar = { ...pillar("seo", [currentBucket]), score: 100, issue_row_count: 0 }
    const current = breakdown([currentPillar])
    const baseline = breakdown([
      pillar("seo", [bucket("meta", [issueType("missing_title")])]),
    ])
    const history = buildIssueTypeDiffHistory(current, baseline)
    expect(history.historicalPillarIds.has("seo")).toBe(true)
    expect(history.historicalBucketKeys.has("seo::meta")).toBe(true)
    expect(history.historicalIssueTypeKeys.has("seo::meta::missing_title")).toBe(true)
    expect(history.pillars[0].score).toBe(100)
    expect(history.pillars[0].buckets[0].score).toBe(100)
    expect(currentBucket.issues).toEqual([])
  })

  test("no baseline keeps the current catalog with no historical entries", () => {
    const current = breakdown([pillar("seo", [bucket("meta")])])
    const history = buildIssueTypeDiffHistory(current, null)
    expect(history.pillars).toEqual(current.pillars)
    expect(history.historicalPillarIds.size).toBe(0)
    expect(history.historicalBucketKeys.size).toBe(0)
    expect(history.historicalIssueTypeKeys.size).toBe(0)
  })

  test("a fully resolved pillar stays discoverable with zeroed current counts", () => {
    const current = breakdown([pillar("aeo")])
    const baseline = breakdown([
      pillar("aeo"),
      pillar("seo", [bucket("meta", [issueType("missing_title")])]),
    ])
    const history = buildIssueTypeDiffHistory(current, baseline)
    expect(history.pillars.map((entry) => entry.id)).toEqual(["aeo", "seo"])
    expect(history.historicalPillarIds.has("seo")).toBe(true)

    const resolved = history.pillars.find((entry) => entry.id === "seo")
    expect(resolved?.label).toBe("seo")
    expect(resolved?.issue_row_count).toBe(0)
    expect(resolved?.affected_url_count).toBe(0)
    expect(resolved?.score).toBe(0)
    expect(history.historicalBucketKeys.has("seo::meta")).toBe(true)
    expect(
      history.historicalIssueTypeKeys.has("seo::meta::missing_title")
    ).toBe(true)
    const resolvedBucket = resolved?.buckets.find(
      (entry) => entry.id === "meta"
    )
    expect(resolvedBucket?.issue_row_count).toBe(0)
    expect(resolvedBucket?.issues.map((issue) => issue.id)).toEqual([
      "missing_title",
    ])
    expect(resolvedBucket?.issues[0].affected_url_count).toBe(0)
  })

  test("baseline-only buckets and issue types merge into current scopes without mutating them", () => {
    const currentBucket = bucket("meta", [issueType("missing_title")])
    const currentPillar = pillar("seo", [currentBucket])
    const current = breakdown([currentPillar])
    const baseline = breakdown([
      pillar("seo", [
        bucket("meta", [
          issueType("missing_title"),
          issueType("missing_description"),
        ]),
        bucket("headings", [issueType("missing_h1")]),
      ]),
    ])

    const history = buildIssueTypeDiffHistory(current, baseline)
    const union = history.pillars.find((entry) => entry.id === "seo")
    expect(union?.buckets.map((entry) => entry.id)).toEqual([
      "meta",
      "headings",
    ])
    const meta = union?.buckets.find((entry) => entry.id === "meta")
    expect(meta?.issues.map((issue) => issue.id)).toEqual([
      "missing_title",
      "missing_description",
    ])
    // Current rows keep their real counts; only appended entries are zeroed.
    expect(
      meta?.issues.find((issue) => issue.id === "missing_title")
        ?.issue_row_count
    ).toBe(3)
    expect(
      meta?.issues.find((issue) => issue.id === "missing_description")
        ?.issue_row_count
    ).toBe(0)
    expect(currentBucket.issues.map((issue) => issue.id)).toEqual([
      "missing_title",
    ])
    expect(currentPillar.buckets.map((entry) => entry.id)).toEqual(["meta"])
    expect(history.historicalBucketKeys.has("seo::headings")).toBe(true)
    expect(
      history.historicalIssueTypeKeys.has("seo::meta::missing_description")
    ).toBe(true)
    expect(history.historicalIssueTypeKeys.has("seo::meta::missing_title")).toBe(
      false
    )
  })

  test("identical catalogs produce no historical entries", () => {
    const current = breakdown([
      pillar("seo", [bucket("meta", [issueType("missing_title")])]),
    ])
    const baseline = breakdown([
      pillar("seo", [bucket("meta", [issueType("missing_title")])]),
    ])
    const history = buildIssueTypeDiffHistory(current, baseline)
    expect(history.historicalPillarIds.size).toBe(0)
    expect(history.historicalBucketKeys.size).toBe(0)
    expect(history.historicalIssueTypeKeys.size).toBe(0)
  })

  test("historical issue type ids narrow to one pillar and bucket scope", () => {
    const current = breakdown([pillar("seo", [bucket("meta")])])
    const baseline = breakdown([
      pillar("seo", [
        bucket("meta", [issueType("missing_title")]),
        bucket("other", [issueType("missing_title")]),
      ]),
    ])
    const history = buildIssueTypeDiffHistory(current, baseline)
    expect(
      Array.from(historicalIssueTypeIdsFor(history, "seo", "meta"))
    ).toEqual(["missing_title"])
    expect(
      Array.from(historicalIssueTypeIdsFor(history, "seo", "other"))
    ).toEqual(["missing_title"])
    expect(
      historicalIssueTypeIdsFor(history, "seo", "missing").size
    ).toBe(0)
  })
})
