import { useQuery } from "@tanstack/react-query"

import { clientApiFetch } from "~/lib/api"
import type {
  PaginationResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

/** One side of an issue type URL diff row: the evidence seen in one crawl. */
export type IssueTypeDiffURLState = {
  crawl_page_id?: string
  severity: string
  message: string
  details: string
}

/** One URL in the per issue type baseline versus current comparison. */
export type IssueTypeDiffURL = {
  url: string
  change_type: string
  baseline: IssueTypeDiffURLState | null
  current: IssueTypeDiffURLState | null
}

/** One server-paginated page of an issue type URL comparison. */
export type IssueTypeDiffResponse = {
  urls: IssueTypeDiffURL[]
  pagination: PaginationResponse
}

/** One previous issue type whose affected URLs were excluded from the current crawl. */
export type ComparisonBaselineExcludedIssueType = {
  pillar: string
  bucket: string
  issue_type: string
  excluded_url_count: number
}

/** Prior comparable crawl for the issue type URL diff, plus its snapshot. */
export type IssueTypeDiffBaselineResponse = {
  current_crawl_id: string
  baseline_crawl: {
    id: string
    project_id: string
    status: string
    started_at: string | null
    completed_at: string | null
  } | null
  baseline_breakdown: ScoreBreakdownResponse | null
  excluded_issue_types?: ComparisonBaselineExcludedIssueType[] | null
}

/** Baseline for the issue type URL diff: the selected crawl's prior comparable crawl. */
export function useIssueTypeDiffBaseline(
  crawlId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["issue-type-diff-baseline", crawlId],
    queryFn: ({ signal }) =>
      clientApiFetch<IssueTypeDiffBaselineResponse>(
        `/crawls/${encodeURIComponent(crawlId as string)}/comparison-baseline`,
        { signal },
      ),
    enabled: enabled && Boolean(crawlId),
  })
}

/** One server page of an issue type URL diff; the server owns paging, not the client. */
export function useIssueTypeDiffRows({
  baselineCrawlId,
  bucketId,
  changeType,
  currentCrawlId,
  enabled,
  includeExcluded,
  issueTypeId,
  pillarId,
  pageIndex,
  pageSize,
}: {
  baselineCrawlId?: string
  bucketId?: string
  changeType?: "new" | "resolved"
  currentCrawlId?: string
  enabled: boolean
  /** Union excluded rows into the resolved page on the server; send only when true. */
  includeExcluded?: boolean
  issueTypeId?: string
  pillarId?: string
  pageIndex: number
  pageSize: number
}) {
  return useQuery({
    queryKey: [
      "issue-type-diff-rows",
      baselineCrawlId,
      currentCrawlId,
      pillarId,
      bucketId,
      issueTypeId,
      changeType,
      includeExcluded ?? false,
      pageIndex,
      pageSize,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(pageIndex * pageSize),
      })
      if (changeType) params.set("change_type", changeType)
      if (includeExcluded) params.set("include_excluded", "true")
      return clientApiFetch<IssueTypeDiffResponse>(
        `/crawls/${encodeURIComponent(baselineCrawlId as string)}/compare/${encodeURIComponent(currentCrawlId as string)}/score-breakdown/${encodeURIComponent(pillarId as string)}/${encodeURIComponent(bucketId as string)}/${encodeURIComponent(issueTypeId as string)}/urls?${params.toString()}`,
        { signal },
      )
    },
    enabled: Boolean(
      enabled &&
        baselineCrawlId &&
        currentCrawlId &&
        pillarId &&
        bucketId &&
        issueTypeId,
    ),
  })
}
