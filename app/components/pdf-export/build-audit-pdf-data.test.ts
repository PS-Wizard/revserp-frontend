import { describe, expect, test } from "bun:test"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import {
  auditPdfFilename,
  buildAuditPdfData,
  sanitizeAuditFilename,
} from "./build-audit-pdf-data"

function breakdown(overrides: Partial<ScoreBreakdownResponse> = {}): ScoreBreakdownResponse {
  return {
    crawl_id: "crawl-selected",
    scoring_version: "v1",
    coverage_scale: 1,
    total_scored_pages: 10,
    overall_score: 78,
    pillars: [
      {
        id: "seo",
        label: "SEO",
        score: 82,
        weight: 0.4,
        weighted_contribution: 32,
        total_penalty: 0,
        bucket_count: 1,
        issue_type_count: 0,
        issue_row_count: 0,
        affected_url_count: 0,
        buckets: [
          {
            id: "titles",
            label: "Titles",
            score: 88,
            weight: 1,
            weighted_contribution: 88,
            total_penalty: 0,
            issue_type_count: 0,
            issue_row_count: 0,
            affected_url_count: 9,
            issues: [],
          },
        ],
      },
      {
        id: "aeo",
        label: "AEO",
        score: 76,
        weight: 0.3,
        weighted_contribution: 22,
        total_penalty: 0,
        bucket_count: 0,
        issue_type_count: 0,
        issue_row_count: 0,
        affected_url_count: 0,
        buckets: [],
      },
    ],
    ...overrides,
  } as ScoreBreakdownResponse
}

describe("buildAuditPdfData selected crawl consistency", () => {
  test("uses breakdown scores, not the latest crawl row", () => {
    const data = buildAuditPdfData("crawl-selected", breakdown(), null, {
      projectName: "Acme",
      // Stale/different crawl row must never leak scores into the report.
      currentCrawl: {
        id: "crawl-newer",
        overall_score: 99,
        seo_score: 99,
        urls_crawled: 148,
      } as never,
    })
    expect(data.scores.overall).toBe(78)
    expect(data.scores.seo).toBe(82)
    expect(data.urlsCrawled).toBe(148)
  })

  test("throws when the breakdown belongs to another crawl", () => {
    let thrown: unknown = null
    try {
      buildAuditPdfData("crawl-selected", breakdown({ crawl_id: "crawl-other" }), null, {
        projectName: "Acme",
      })
    } catch (error) {
      thrown = error
    }
    expect(thrown instanceof Error && thrown.message.includes("Audit crawl mismatch")).toBe(true)
  })

  test("missing commentary arrays stay empty, nothing invented", () => {
    const data = buildAuditPdfData(
      "crawl-selected",
      breakdown(),
      { overall: { summary: "ok" }, model: "m" },
      { projectName: "Acme" },
    )
    expect(data.commentary.overall).toEqual({
      summary: "ok",
      strengths: [],
      concerns: [],
      recommendations: [],
    })
    expect(data.commentary.seo).toEqual({
      summary: "",
      strengths: [],
      concerns: [],
      recommendations: [],
    })
    expect(data.model).toBe("m")
  })

  test("null scores and missing pillars render as null", () => {
    const b = breakdown({ overall_score: null as never, pillars: [] })
    const data = buildAuditPdfData("crawl-selected", b, null, { projectName: "Acme" })
    expect(data.scores).toEqual({ overall: null, seo: null, aeo: null, pagespeed: null })
    expect(data.pillars).toEqual([])
  })
})

describe("audit pdf filename", () => {
  test("sanitizes unsafe chars and keeps audit-project-date shape", () => {
    expect(sanitizeAuditFilename("Acme Inc./Blog?")).toBe("acme-inc.-blog")
    expect(auditPdfFilename("Acme Inc.", new Date("2026-09-30T00:00:00Z"))).toBe(
      "audit-acme-inc-2026-09-30.pdf",
    )
  })
})
