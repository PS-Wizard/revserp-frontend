"use client"

import { useQuery } from "@tanstack/react-query"

import { clientApiFetch } from "~/lib/api"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import type { CrawlResponse } from "~/lib/api.types"
import type {
  CrawlBreakdown,
  CrawlBreakdownScores,
} from "~/components/pillar-audit-view"
import type { IssueUrlsPageFetch } from "~/components/issue-explorer/utils"
import type { LocationWebsiteScopeMatch } from "~/components/locations/location-website-scope"

export type LocationScopeStatus =
  "unconfigured" | "no_matching_pages" | "ready"

/** GET website-audit response. Breakdown shape matches the parent snapshot. */
export type LocationWebsiteAuditBreakdownResponse = {
  crawl_id: string
  scope_revision: number
  scope_url: string
  scope_match: LocationWebsiteScopeMatch
  scope_status: LocationScopeStatus
  eligible_pages: number
  matched_pages: number
  excluded_sitewide_issue_types: string[]
  unsupported_buckets: string[]
  breakdown: ScoreBreakdownResponse | null
}

export type LocationWebsiteAuditHistoryEntry = {
  crawl_id: string
  completed_at: string
  scope_revision: number
  scope_url: string
  scope_match: LocationWebsiteScopeMatch
  scope_status: LocationScopeStatus
  eligible_pages: number
  matched_pages: number
  scores: {
    overall: number
    seo: number
    aeo: number
    pagespeed: number
  } | null
}

/** GET website-audit/history response. Never merge entries across revisions. */
export type LocationWebsiteAuditHistoryResponse = {
  crawls: LocationWebsiteAuditHistoryEntry[]
}

/** GET website-audit/issue-urls response. No work objects; read-only. */
export type LocationWebsiteAuditIssueUrlsResponse = {
  urls: Array<{
    url: string
    crawl_page_id: string
    severity: string
    message: string
    details: string
    issue_id: string
  }>
  work_actions_enabled: false
  pagination: { limit: number; offset: number; count: number; total: number }
}

/** GET website-audit/pages response. */
export type LocationWebsiteAuditPagesResponse = {
  pages: Array<{ crawl_page_id: string; url: string; title: string }>
  pagination: { limit: number; offset: number; count: number; total: number }
}

export type LocationScopedPage = {
  crawlPageId: string
  url: string
  title: string
}

function auditBase(projectId: string, locationId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(locationId)}/website-audit`
}

function withParams(
  path: string,
  params: Record<string, string | number | null | undefined>
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value))
    }
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

/** Breakdown query key. Scope revision is an immutable integer pin. */
export function locationWebsiteAuditQueryKey(
  projectId: string,
  locationId: string,
  crawlId: string | null,
  scopeRevision: number | null
) {
  return [
    "location-website-audit",
    projectId,
    locationId,
    crawlId,
    scopeRevision,
  ] as const
}

export function locationWebsiteAuditHistoryQueryKey(
  projectId: string,
  locationId: string,
  scopeRevision: number | null,
  limit: number
) {
  return [
    "location-website-audit-history",
    projectId,
    locationId,
    scopeRevision,
    limit,
  ] as const
}

/** Derived snapshot for one parent crawl under a pinned scope revision. */
export function fetchLocationWebsiteAuditBreakdown(
  projectId: string,
  locationId: string,
  options?: { crawlId?: string | null; scopeRevision?: number | null }
): Promise<LocationWebsiteAuditBreakdownResponse> {
  return clientApiFetch<LocationWebsiteAuditBreakdownResponse>(
    withParams(auditBase(projectId, locationId), {
      crawl_id: options?.crawlId,
      scope_revision: options?.scopeRevision,
    })
  )
}

/** Per-crawl derived scores under a pinned scope revision. */
export function fetchLocationWebsiteAuditHistory(
  projectId: string,
  locationId: string,
  options?: { scopeRevision?: number | null; limit?: number }
): Promise<LocationWebsiteAuditHistoryResponse> {
  return clientApiFetch<LocationWebsiteAuditHistoryResponse>(
    withParams(`${auditBase(projectId, locationId)}/history`, {
      scope_revision: options?.scopeRevision,
      limit: options?.limit,
    })
  )
}

/** Scoped page list under a pinned scope revision. */
export function fetchLocationWebsiteAuditPages(
  projectId: string,
  locationId: string,
  options?: {
    crawlId?: string | null
    scopeRevision?: number | null
    limit?: number
    offset?: number
    signal?: AbortSignal
  }
): Promise<LocationWebsiteAuditPagesResponse> {
  return clientApiFetch<LocationWebsiteAuditPagesResponse>(
    withParams(`${auditBase(projectId, locationId)}/pages`, {
      crawl_id: options?.crawlId,
      scope_revision: options?.scopeRevision,
      limit: options?.limit,
      offset: options?.offset,
    }),
    { signal: options?.signal }
  )
}

export function locationWebsiteAuditPagesQueryKey(
  projectId: string,
  locationId: string,
  crawlId: string | null,
  scopeRevision: number | null,
  offset: number
) {
  return [
    "location-website-audit-pages",
    projectId,
    locationId,
    crawlId,
    scopeRevision,
    offset,
  ] as const
}

/** Invalidates every cached branch audit read after a scope revision lands. */
export function invalidateLocationWebsiteAudit(
  invalidate: (filters: { queryKey: readonly unknown[] }) => unknown,
  projectId: string,
  locationId: string
) {
  invalidate({ queryKey: ["location-website-audit", projectId, locationId] })
  invalidate({
    queryKey: ["location-website-audit-history", projectId, locationId],
  })
  invalidate({
    queryKey: ["location-website-audit-pages", projectId, locationId],
  })
}

export function useLocationWebsiteAuditBreakdown(
  projectId: string,
  locationId: string,
  options: {
    crawlId: string | null
    scopeRevision: number | null
    enabled: boolean
  }
) {
  return useQuery({
    queryKey: locationWebsiteAuditQueryKey(
      projectId,
      locationId,
      options.crawlId,
      options.scopeRevision
    ),
    queryFn: () =>
      fetchLocationWebsiteAuditBreakdown(projectId, locationId, {
        crawlId: options.crawlId,
        scopeRevision: options.scopeRevision,
      }),
    enabled: options.enabled,
    staleTime: 60_000,
  })
}

export function useLocationWebsiteAuditHistory(
  projectId: string,
  locationId: string,
  options: { scopeRevision: number | null; limit: number; enabled: boolean }
) {
  return useQuery({
    queryKey: locationWebsiteAuditHistoryQueryKey(
      projectId,
      locationId,
      options.scopeRevision,
      options.limit
    ),
    queryFn: () =>
      fetchLocationWebsiteAuditHistory(projectId, locationId, {
        scopeRevision: options.scopeRevision,
        limit: options.limit,
      }),
    enabled: options.enabled,
    staleTime: 60_000,
  })
}

export type ScopedIssueUrlsFetch = IssueUrlsPageFetch

/**
 * Builds the scoped issue-URL fetcher for nested issue tables. Shape mirrors
 * the parent issue-URL list minus work objects; site-wide types 400 and
 * surface as the fetcher error.
 */
export function createScopedIssueUrlsFetcher(
  projectId: string,
  locationId: string,
  options: { crawlId: string | null; scopeRevision: number | null }
): ScopedIssueUrlsFetch {
  return async ({
    bucketScope,
    issueTypeId,
    issueTypeLabel,
    limit,
    offset,
    signal,
  }) => {
    const response =
      await clientApiFetch<LocationWebsiteAuditIssueUrlsResponse>(
        withParams(`${auditBase(projectId, locationId)}/issue-urls`, {
          pillar: bucketScope.pillarId,
          bucket: bucketScope.bucketId,
          issue_type: issueTypeId,
          crawl_id: options.crawlId,
          scope_revision: options.scopeRevision,
          limit,
          offset,
        }),
        { signal }
      )
    return {
      rows: response.urls.map((row) => ({
        ...row,
        source: issueTypeLabel,
        pillarId: bucketScope.pillarId,
        pillarLabel: bucketScope.pillarLabel,
        bucketId: bucketScope.bucketId,
        bucketLabel: bucketScope.bucketLabel,
        issueTypeId,
        issueTypeLabel,
      })),
      total: response.pagination.total,
      workActionsEnabled: response.work_actions_enabled,
    }
  }
}

/**
 * Removes backend-flagged unsupported buckets (today psi_cwv, which scores
 * 100 from absence of page issues) so branch UI never displays them as real
 * 100% readings. Pillar scores stay exactly as derived.
 */
export function filterUnsupportedBuckets<
  T extends { pillars: Array<{ buckets: Array<{ id: string }> }> },
>(breakdown: T, unsupportedBucketIds: string[]): T {
  if (unsupportedBucketIds.length === 0) return breakdown
  const unsupported = new Set(unsupportedBucketIds)
  return {
    ...breakdown,
    pillars: breakdown.pillars.map((pillar) => ({
      ...pillar,
      buckets: pillar.buckets.filter((bucket) => !unsupported.has(bucket.id)),
    })),
  }
}

/**
 * Projects a derived snapshot to the light breakdown shape parent
 * chart/card components render. Scores stay exactly as derived.
 */
export function toCrawlBreakdownScores(
  breakdown: ScoreBreakdownResponse
): CrawlBreakdownScores {
  return {
    overall_score: breakdown.overall_score,
    pillars: breakdown.pillars.map((pillar) => ({
      id: pillar.id,
      label: pillar.label,
      score: pillar.score,
      buckets: pillar.buckets.map((bucket) => ({
        id: bucket.id,
        label: bucket.label,
        score: bucket.score,
      })),
    })),
  }
}

/**
 * Single-entry breakdown list for parent chart/card components from a
 * derived snapshot. The crawl shell carries only the real parent crawl id
 * and the real completed_at from history: no fabricated evidence, and the
 * empty derived crawl_id from the backend snapshot is never rewritten.
 */
export function buildScopedCrawlBreakdown(
  parentCrawlId: string,
  completedAt: string,
  breakdown: ScoreBreakdownResponse
): CrawlBreakdown {
  return {
    crawl: {
      id: parentCrawlId,
      completed_at: completedAt,
      created_at: completedAt,
    } as CrawlResponse,
    breakdown: toCrawlBreakdownScores(breakdown),
  }
}
