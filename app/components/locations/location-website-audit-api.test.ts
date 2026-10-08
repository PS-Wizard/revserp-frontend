import { describe, expect, test, afterEach } from "bun:test"

import {
  buildScopedCrawlBreakdown,
  createScopedIssueUrlsFetcher,
  fetchLocationWebsiteAuditBreakdown,
  fetchLocationWebsiteAuditHistory,
  fetchLocationWebsiteAuditPages,
  filterUnsupportedBuckets,
  locationWebsiteAuditHistoryQueryKey,
  locationWebsiteAuditQueryKey,
} from "~/components/locations/location-website-audit-api"
import type { ScoreBreakdownResponse } from "~/lib/api.types"

const calls: Array<{ url: string; method: string }> = []
const realFetch = globalThis.fetch

function mockFetch(payload: unknown, status = 200) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url, method: "GET" })
    return new Response(JSON.stringify(payload), { status })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  calls.length = 0
})

function makeBreakdown(): ScoreBreakdownResponse {
  return {
    crawl_id: "",
    scoring_version: "v9-soft-sum",
    coverage_scale: 1,
    total_scored_pages: 1,
    overall_score: 82,
    pillars: [
      {
        id: "pagespeed",
        label: "PageSpeed",
        score: 100,
        weight: 1,
        weighted_contribution: 100,
        total_penalty: 0,
        bucket_count: 1,
        issue_type_count: 0,
        issue_row_count: 0,
        affected_url_count: 0,
        buckets: [
          {
            id: "psi_cwv",
            label: "Core Web Vitals",
            score: 100,
            weight: 1,
            weighted_contribution: 100,
            total_penalty: 0,
            issue_type_count: 0,
            issue_row_count: 0,
            affected_url_count: 0,
            issues: [],
          },
        ],
      },
    ],
  }
}

describe("location website audit api", () => {
  test("breakdown calls the scoped endpoint with crawl and revision pins", async () => {
    mockFetch({ scope_status: "ready" })
    await fetchLocationWebsiteAuditBreakdown("proj-1", "loc-1", {
      crawlId: "crawl-1",
      scopeRevision: 3,
    })
    expect(calls.length).toBe(1)
    expect(calls[0]?.url).toContain(
      "/projects/proj-1/locations/loc-1/website-audit"
    )
    expect(calls[0]?.url).toContain("crawl_id=crawl-1")
    expect(calls[0]?.url).toContain("scope_revision=3")
  })

  test("breakdown omits empty pins and never calls providers", async () => {
    mockFetch({ scope_status: "ready" })
    await fetchLocationWebsiteAuditBreakdown("proj-1", "loc-1", {})
    expect(calls[0]?.url?.includes("crawl_id")).toBe(false)
    expect(calls[0]?.url?.includes("scope_revision")).toBe(false)
    expect(calls[0]?.method).toBe("GET")
  })

  test("history and pages hit their scoped endpoints with paging", async () => {
    mockFetch({ crawls: [] })
    await fetchLocationWebsiteAuditHistory("proj-1", "loc-1", {
      scopeRevision: 2,
      limit: 20,
    })
    expect(calls[0]?.url).toContain("website-audit/history")
    expect(calls[0]?.url).toContain("scope_revision=2")

    mockFetch({ pages: [], pagination: { total: 0 } })
    await fetchLocationWebsiteAuditPages("proj-1", "loc-1", {
      scopeRevision: 2,
      limit: 25,
      offset: 25,
    })
    expect(calls[1]?.url).toContain("website-audit/pages")
    expect(calls[1]?.url).toContain("limit=25")
    expect(calls[1]?.url).toContain("offset=25")
  })

  test("scoped issue fetcher mirrors the parent list shape without work", async () => {
    mockFetch({
      urls: [
        {
          url: "https://example.com/a",
          crawl_page_id: "page-1",
          severity: "high",
          message: "Fix it.",
          details: "Details.",
          issue_id: "issue-1",
        },
      ],
      work_actions_enabled: false,
      pagination: { limit: 50, offset: 0, count: 1, total: 1 },
    })
    const fetchPage = createScopedIssueUrlsFetcher("proj-1", "loc-1", {
      crawlId: "crawl-1",
      scopeRevision: 1,
    })
    const result = await fetchPage({
      bucketScope: {
        key: "seo::content",
        pillarId: "seo",
        pillarLabel: "SEO",
        bucketId: "content",
        bucketLabel: "Content",
        bucket: {
          id: "content",
          label: "Content",
          score: 80,
          weight: 1,
          weighted_contribution: 80,
          total_penalty: 20,
          issue_type_count: 1,
          issue_row_count: 1,
          affected_url_count: 1,
          issues: [],
        },
      },
      issueTypeId: "missing_h1",
      issueTypeLabel: "Missing H1",
      limit: 50,
      offset: 0,
    })
    expect(calls[0]?.url).toContain("website-audit/issue-urls")
    expect(calls[0]?.url).toContain("pillar=seo")
    expect(calls[0]?.url).toContain("bucket=content")
    expect(calls[0]?.url).toContain("issue_type=missing_h1")
    expect(result.total).toBe(1)
    expect(result.workActionsEnabled).toBe(false)
    expect(result.rows[0]?.pillarId).toBe("seo")
    expect(result.rows[0]?.issueTypeId).toBe("missing_h1")
    expect(result.rows[0]?.source).toBe("Missing H1")
    expect("work" in (result.rows[0] ?? {})).toBe(false)
  })

  test("query keys pin project, location, crawl, and revision", () => {
    expect(
      locationWebsiteAuditQueryKey("p", "l", "c", 3).join(":")
    ).toBe("location-website-audit:p:l:c:3")
    expect(
      locationWebsiteAuditHistoryQueryKey("p", "l", 2, 20).join(":")
    ).toBe("location-website-audit-history:p:l:2:20")
  })

  test("filterUnsupportedBuckets hides flagged buckets, keeps scores", () => {
    const breakdown = makeBreakdown()
    const filtered = filterUnsupportedBuckets(breakdown, ["psi_cwv"])
    expect(
      filtered.pillars.find((pillar) => pillar.id === "pagespeed")?.buckets
    ).toEqual([])
    expect(filtered.overall_score).toBe(82)
    expect(
      filtered.pillars.find((pillar) => pillar.id === "pagespeed")?.score
    ).toBe(100)
    expect(filterUnsupportedBuckets(breakdown, [])).toBe(breakdown)
  })

  test("scoped crawl breakdown projects scores without rewriting", () => {
    const breakdown = makeBreakdown()
    const entry = buildScopedCrawlBreakdown(
      "crawl-1",
      "2026-10-01T12:00:00.000Z",
      breakdown
    )
    expect(entry.crawl.id).toBe("crawl-1")
    expect(entry.breakdown.overall_score).toBe(82)
    expect(entry.breakdown.pillars[0]?.buckets[0]?.score).toBe(100)
  })
})
