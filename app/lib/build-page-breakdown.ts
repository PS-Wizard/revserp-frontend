import type { ScoreBreakdownResponse } from "~/lib/api.types"
import type { IssueWorkspaceIssue } from "~/components/summary/issue-workspace.types"

function issueKey(pillar: string, bucket: string, issueType: string) {
  return `${pillar}::${bucket}::${issueType}`
}

/** Restricts a crawl breakdown to issue types that affect one page URL. */
export function buildPageScopedBreakdown(
  breakdown: ScoreBreakdownResponse,
  pageIssues: IssueWorkspaceIssue[]
): ScoreBreakdownResponse {
  const keys = new Set(
    pageIssues.map((issue) =>
      issueKey(issue.pillar, issue.bucket, issue.issue_type)
    )
  )

  const pillars = breakdown.pillars
    .map((pillar) => {
      const buckets = pillar.buckets
        .map((bucket) => {
          const issues = bucket.issues
            .filter((issue) =>
              keys.has(issueKey(pillar.id, bucket.id, issue.id))
            )
            .map((issue) => ({
              ...issue,
              issue_row_count: 1,
              affected_url_count: 1,
            }))

          if (!issues.length) return null

          const totalPenalty = issues.reduce(
            (sum, issue) => sum + issue.final_penalty,
            0
          )

          return {
            ...bucket,
            issue_type_count: issues.length,
            issue_row_count: issues.length,
            affected_url_count: 1,
            total_penalty: totalPenalty,
            issues,
          }
        })
        .filter(
          (bucket): bucket is NonNullable<typeof bucket> => bucket !== null
        )

      if (!buckets.length) return null

      const issueRowCount = buckets.reduce(
        (sum, bucket) => sum + bucket.issue_row_count,
        0
      )
      const totalPenalty = buckets.reduce(
        (sum, bucket) => sum + bucket.total_penalty,
        0
      )

      return {
        ...pillar,
        bucket_count: buckets.length,
        issue_type_count: issueRowCount,
        issue_row_count: issueRowCount,
        affected_url_count: 1,
        total_penalty: totalPenalty,
        buckets,
      }
    })
    .filter((pillar): pillar is NonNullable<typeof pillar> => pillar !== null)

  return {
    ...breakdown,
    pillars,
  }
}

export function countPageIssuesByPillar(pageIssues: IssueWorkspaceIssue[]) {
  const counts: Record<string, number> = { seo: 0, aeo: 0, pagespeed: 0 }
  for (const issue of pageIssues) {
    counts[issue.pillar] = (counts[issue.pillar] ?? 0) + 1
  }
  return counts
}
