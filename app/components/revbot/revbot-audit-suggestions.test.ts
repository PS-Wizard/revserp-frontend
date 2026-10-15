import { describe, expect, test } from "bun:test"
import { buildRevbotAuditSuggestions } from "./revbot-audit-suggestions"
import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownPillarResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

function bucket(
  id: string,
  score: number,
  issue_row_count: number,
  affected_url_count: number,
  label?: string,
): ScoreBreakdownBucketResponse {
  return {
    id,
    label: label ?? id,
    score,
    weight: 1,
    weighted_contribution: 0,
    total_penalty: 0,
    issue_type_count: 1,
    issue_row_count,
    affected_url_count,
    issues: [],
  }
}

function pillar(
  id: string,
  buckets: ScoreBreakdownBucketResponse[],
  label?: string,
): ScoreBreakdownPillarResponse {
  return {
    id,
    label: label ?? id,
    score: 80,
    weight: 1,
    weighted_contribution: 0,
    total_penalty: 0,
    bucket_count: buckets.length,
    issue_type_count: 1,
    issue_row_count: 1,
    affected_url_count: 1,
    buckets,
  }
}

function breakdown(
  crawl_id: string,
  pillars: ScoreBreakdownPillarResponse[],
): ScoreBreakdownResponse {
  return {
    crawl_id,
    scoring_version: "v3",
    coverage_scale: 1,
    total_scored_pages: 100,
    overall_score: 80,
    pillars,
  }
}

const MESSAGE_PREFIX = "Help me fix the"

describe("buildRevbotAuditSuggestions empty and missing data", () => {
  test("returns [] without data, crawl id, pillars, or issues", () => {
    const cases: Array<ScoreBreakdownResponse | null | undefined> = [
      null,
      undefined,
      breakdown("", [pillar("seo", [bucket("b", 10, 5, 5)])]),
      breakdown("c1", []),
      breakdown("c1", [pillar("seo", []), pillar("aeo", []), pillar("pagespeed", [])]),
      breakdown("c1", [pillar("seo", [bucket("b", 10, 0, 0)])]),
    ]
    for (const input of cases) {
      expect(buildRevbotAuditSuggestions(input)).toEqual([])
    }
  })

  test("ignores unknown pillars and empty-label crawl ids", () => {
    expect(buildRevbotAuditSuggestions(breakdown("c1", [pillar("pages", [bucket("b", 1, 9, 9)])]))).toEqual(
      [],
    )
    const missing = breakdown("c1", []) as unknown as Record<string, unknown>
    delete (missing as { pillars?: unknown }).pillars
    expect(buildRevbotAuditSuggestions(missing as unknown as ScoreBreakdownResponse)).toEqual([])
  })
})

describe("buildRevbotAuditSuggestions ordering and selection", () => {
  test("emits one per pillar in fixed seo/aeo/pagespeed order regardless of input order", () => {
    const input = breakdown("crawl-1", [
      pillar("pagespeed", [bucket("slow", 30, 2, 2, "Slow")], "PageSpeed"),
      pillar("pages", [bucket("other", 1, 99, 99)]),
      pillar("seo", [bucket("meta", 50, 3, 3, "Meta")], "SEO"),
      pillar("aeo", [bucket("schema", 40, 4, 4, "Schema")], "AEO"),
    ])
    const suggestions = buildRevbotAuditSuggestions(input)
    expect(suggestions.map((s) => s.pillarId)).toEqual(["seo", "aeo", "pagespeed"])
    expect(suggestions.map((s) => s.bucketId)).toEqual(["meta", "schema", "slow"])
    expect(suggestions.every((s) => s.crawlId === "crawl-1")).toBe(true)
  })

  test("picks the lowest-score nonempty bucket and skips empty ones", () => {
    const input = breakdown("c1", [
      pillar("seo", [
        bucket("empty-worst", 5, 0, 0, "Empty"),
        bucket("worst", 20, 2, 2, "Worst"),
        bucket("fine", 90, 7, 7, "Fine"),
      ]),
    ])
    const suggestions = buildRevbotAuditSuggestions(input)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.bucketId).toBe("worst")
  })

  test("breaks score ties by higher affected count, then ASCII bucket id, independent of input order", () => {
    const orders = [
      [bucket("b-second", 10, 1, 5, "B"), bucket("a-first", 10, 1, 5, "A")],
      [bucket("a-first", 10, 1, 5, "A"), bucket("b-second", 10, 1, 5, "B")],
    ]
    for (const buckets of orders) {
      const suggestions = buildRevbotAuditSuggestions(
        breakdown("c1", [pillar("seo", buckets, "SEO")]),
      )
      expect(suggestions[0]!.bucketId).toBe("a-first")
    }
    const byReach = buildRevbotAuditSuggestions(
      breakdown("c1", [
        pillar("aeo", [bucket("narrow", 10, 1, 2, "Narrow"), bucket("wide", 10, 1, 9, "Wide")], "AEO"),
      ]),
    )
    expect(byReach[0]!.bucketId).toBe("wide")
  })

  test("skips buckets with nonfinite scores or counts", () => {
    const input = breakdown("c1", [
      pillar("seo", [
        bucket("bad-score", Number.NaN, 4, 4, "Bad"),
        bucket("bad-reach", 10, 4, Number.POSITIVE_INFINITY, "BadReach"),
        bucket("good", 11, 4, 4, "Good"),
      ]),
    ])
    const suggestions = buildRevbotAuditSuggestions(input)
    expect(suggestions.map((s) => s.bucketId)).toEqual(["good"])
  })
})

describe("buildRevbotAuditSuggestions labels, ids, and messages", () => {
  test("uses affected url count, keeps counts above 50, and formats exact messages", () => {
    const input = breakdown("c1", [
      pillar("seo", [bucket("meta", 10, 200, 120, "Meta Tags")], "SEO"),
    ])
    const suggestions = buildRevbotAuditSuggestions(input)
    expect(suggestions).toHaveLength(1)
    const first = suggestions[0]!
    expect(first.affectedUrlCount).toBe(120)
    expect(first.id).toBe("seo:meta")
    expect(first.pillarLabel).toBe("SEO")
    expect(first.bucketLabel).toBe("Meta Tags")
    expect(first.message).toBe(
      "Help me fix the Meta Tags bucket under SEO. Review all recorded issue types in this bucket and give me a prioritized rundown of the issues and recommended fixes.",
    )
    expect(first.message.startsWith(MESSAGE_PREFIX)).toBe(true)
  })

  test("falls back to canonical pillar labels and maps the psi bucket label", () => {
    const input = breakdown("c1", [
      pillar("seo", [bucket("meta", 10, 1, 1)], ""),
      pillar("pagespeed", [bucket("psi_cwv", 10, 1, 3, "psi_cwv")], ""),
    ])
    const suggestions = buildRevbotAuditSuggestions(input)
    expect(suggestions.map((s) => s.pillarLabel)).toEqual(["SEO", "PageSpeed"])
    expect(suggestions[1]!.bucketLabel).toBe("Google PSI")
    expect(suggestions[1]!.id).toBe("pagespeed:psi_cwv")
  })
})
