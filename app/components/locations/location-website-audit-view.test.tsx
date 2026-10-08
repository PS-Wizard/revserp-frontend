import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import type { AuditTab } from "~/components/app-navbar/types"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import type { LocalSeoLocation } from "~/lib/local-seo-api"
import {
  LocationWorkspaceProvider,
  type LocationWorkspace,
  type LocationWebsiteScopeRevision,
} from "~/lib/location-workspace"
import {
  locationWebsiteAuditHistoryQueryKey,
  locationWebsiteAuditQueryKey,
  type LocationWebsiteAuditBreakdownResponse,
  type LocationWebsiteAuditHistoryResponse,
} from "~/components/locations/location-website-audit-api"
import { LocationWebsiteAuditView } from "~/components/locations/location-website-audit-view"

function makeLocation(): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: "proj-1",
    name: "Springfield Roastery",
    place_id: "place-1",
    address: "Main Street 1",
    locality: "Springfield",
    localities: [],
    services: [],
    latitude: 39.8,
    longitude: -89.6,
    queries: [],
  }
}

function makeRevision(
  overrides: Partial<LocationWebsiteScopeRevision> = {}
): LocationWebsiteScopeRevision {
  return {
    id: "rev-id-1",
    revision: 1,
    url: null,
    match: "none",
    created_at: "2026-09-01T12:00:00.000Z",
    ...overrides,
  }
}

function makeBreakdown(): ScoreBreakdownResponse {
  return {
    crawl_id: "",
    scoring_version: "v9-soft-sum",
    coverage_scale: 1,
    total_scored_pages: 2,
    overall_score: 82,
    pillars: [
      {
        id: "seo",
        label: "SEO",
        score: 80,
        weight: 1,
        weighted_contribution: 80,
        total_penalty: 20,
        bucket_count: 1,
        issue_type_count: 1,
        issue_row_count: 1,
        affected_url_count: 1,
        buckets: [
          {
            id: "content",
            label: "Content",
            score: 80,
            weight: 1,
            weighted_contribution: 80,
            total_penalty: 20,
            issue_type_count: 1,
            issue_row_count: 1,
            affected_url_count: 1,
            issues: [
              {
                id: "missing_h1",
                label: "Missing H1",
                severity: "high",
                base_penalty: 10,
                severity_multiplier: 1,
                coverage: 0.5,
                final_penalty: 10,
                issue_row_count: 1,
                affected_url_count: 1,
                message: "Add an H1.",
                details_preview: "One page misses its H1.",
              },
            ],
          },
        ],
      },
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

function makeAuditResponse(
  overrides: Partial<LocationWebsiteAuditBreakdownResponse> = {}
): LocationWebsiteAuditBreakdownResponse {
  return {
    crawl_id: "crawl-1",
    scope_revision: 1,
    scope_url: "https://example.com/locations/springfield/",
    scope_match: "exact",
    scope_status: "ready",
    eligible_pages: 2,
    matched_pages: 2,
    excluded_sitewide_issue_types: ["missing_contact_page"],
    unsupported_buckets: ["psi_cwv"],
    breakdown: makeBreakdown(),
    ...overrides,
  }
}

function makeHistoryResponse(): LocationWebsiteAuditHistoryResponse {
  return {
    crawls: [
      {
        crawl_id: "crawl-1",
        completed_at: "2026-10-01T12:00:00.000Z",
        scope_revision: 1,
        scope_url: "https://example.com/locations/springfield/",
        scope_match: "exact",
        scope_status: "ready",
        eligible_pages: 2,
        matched_pages: 2,
        scores: { overall: 82, seo: 80, aeo: 79, pagespeed: 90 },
      },
    ],
  }
}

function renderView({
  workspace,
  auditTab = "overview",
  currentCrawlId = null,
  audit,
  history,
}: {
  workspace: LocationWorkspace | null
  auditTab?: AuditTab
  currentCrawlId?: string | null
  audit?: LocationWebsiteAuditBreakdownResponse
  history?: LocationWebsiteAuditHistoryResponse
}) {
  const client = new QueryClient()
  if (audit) {
    client.setQueryData(
      locationWebsiteAuditQueryKey("proj-1", "loc-1", currentCrawlId, 1),
      audit
    )
  }
  if (history) {
    client.setQueryData(
      locationWebsiteAuditHistoryQueryKey("proj-1", "loc-1", 1, 20),
      history
    )
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LocationWorkspaceProvider workspace={workspace}>
        <LocationWebsiteAuditView
          projectId="proj-1"
          locationId="loc-1"
          auditTab={auditTab}
          currentCrawlId={currentCrawlId}
        />
      </LocationWorkspaceProvider>
    </QueryClientProvider>
  )
}

function workspaceWith(
  overrides: Partial<LocationWorkspace> = {}
): LocationWorkspace {
  return {
    projectId: "proj-1",
    location: makeLocation(),
    canManage: true,
    websiteScope: null,
    websiteScopeRevisions: [],
    ...overrides,
  }
}

function scopedWorkspace(): LocationWorkspace {
  const scope = makeRevision({
    id: "rev-id-1",
    revision: 1,
    url: "https://example.com/locations/springfield/",
    match: "exact",
    created_at: "2026-09-02T12:00:00.000Z",
  })
  return workspaceWith({ websiteScope: scope, websiteScopeRevisions: [scope] })
}

describe("location website audit view", () => {
  test("without location context it stays minimal instead of showing scores", () => {
    const html = renderView({ workspace: null })
    expect(html).toContain("Location unavailable")
    expect(html.includes("%")).toBe(false)
  })

  test("no scope renders a concise empty state with a settings action", () => {
    const html = renderView({ workspace: workspaceWith() })
    expect(html).toContain("No branch website scope yet")
    expect(html).toContain(">Set branch scope<")
    expect(html.includes("%")).toBe(false)
    expect(html.includes("Current crawl bucket scores")).toBe(false)
  })

  test("read-only viewers see the empty state without the setup action", () => {
    const html = renderView({
      workspace: workspaceWith({ canManage: false }),
    })
    expect(html).toContain("No branch website scope yet")
    expect(html).toContain("Only managers can set the branch scope")
    expect(html.includes(">Set branch scope<")).toBe(false)
  })

  test("scoped pillar tab shows derived scores with no inner chrome", () => {
    const html = renderView({
      workspace: scopedWorkspace(),
      auditTab: "seo",
      audit: makeAuditResponse(),
      history: makeHistoryResponse(),
    })
    expect(html).toContain("80%")
    expect(html).toContain("Content")
    expect(html.includes(">100%<")).toBe(false)
    expect(html.includes('role="tablist"')).toBe(false)
    expect(html.includes("Branch scope")).toBe(false)
    expect(html.includes("Scope history")).toBe(false)
  })

  test("fully unmeasurable pillar tab explains the gap instead of 100%", () => {
    const html = renderView({
      workspace: scopedWorkspace(),
      auditTab: "pagespeed",
      audit: makeAuditResponse(),
      history: makeHistoryResponse(),
    })
    expect(html).toContain("cannot measure psi_cwv")
    expect(html.includes(">100%<")).toBe(false)
  })

  test("overview reuses the shared history chart with a revision caption", () => {
    const html = renderView({
      workspace: scopedWorkspace(),
      audit: makeAuditResponse(),
      history: makeHistoryResponse(),
    })
    expect(html).toContain("Scoped to Rev 1")
    expect(html).toContain("Rev 1 · derived per-crawl scores")
    expect(html.includes("Scope history")).toBe(false)
    expect(html.includes("Branch scope")).toBe(false)
    expect(html.includes(">100%<")).toBe(false)
  })

  test("no matching pages reports no score, not zero", () => {
    const html = renderView({
      workspace: scopedWorkspace(),
      audit: makeAuditResponse({
        scope_status: "no_matching_pages",
        breakdown: null,
        matched_pages: 0,
        eligible_pages: 0,
      }),
      history: { crawls: [] },
    })
    expect(html).toContain("no score")
    expect(html.includes("%")).toBe(false)
  })

  test("pending derivation shows loading, never parent scores", () => {
    const html = renderView({ workspace: scopedWorkspace() })
    expect(html).toContain("Deriving branch scores")
    expect(html.includes("%")).toBe(false)
  })

  test("site graph tab falls back to the overview panel, never a placeholder", () => {
    const html = renderView({
      workspace: scopedWorkspace(),
      auditTab: "site-graph",
      audit: makeAuditResponse(),
      history: makeHistoryResponse(),
    })
    expect(html).toContain("Scoped to Rev 1")
    expect(html.includes("whole-site only")).toBe(false)
  })

  test("pages tab loads scoped pages without parent totals", () => {
    const html = renderView({
      workspace: scopedWorkspace(),
      auditTab: "pages",
      audit: makeAuditResponse(),
      history: makeHistoryResponse(),
    })
    expect(html).toContain("Search branch pages")
    expect(html.includes("Current crawl bucket scores")).toBe(false)
  })
})
