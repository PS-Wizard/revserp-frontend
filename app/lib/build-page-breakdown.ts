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
            .filter((issue) => keys.has(issueKey(pillar.id, bucket.id, issue.id)))
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
        .filter((bucket): bucket is NonNullable<typeof bucket> => bucket !== null)

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

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function penaltyLookup(breakdown: ScoreBreakdownResponse) {
  const lookup = new Map<string, number>()
  for (const pillar of breakdown.pillars) {
    for (const bucket of pillar.buckets) {
      for (const issue of bucket.issues) {
        lookup.set(
          issueKey(pillar.id, bucket.id, issue.id),
          issue.final_penalty
        )
      }
    }
  }
  return lookup
}

export type PagePillarScore = {
  id: string
  label: string
  score: number
  issueCount: number
  buckets: Array<{
    id: string
    label: string
    score: number
    issueCount: number
  }>
}

const PAGE_PILLARS = [
  { id: "seo", label: "SEO" },
  { id: "aeo", label: "AEO" },
  { id: "pagespeed", label: "PageSpeed" },
] as const

/** Derives per-pillar and per-bucket page scores from crawl penalties. */
export function computePagePillarScores(
  breakdown: ScoreBreakdownResponse,
  pageIssues: IssueWorkspaceIssue[]
): PagePillarScore[] {
  const penalties = penaltyLookup(breakdown)

  return PAGE_PILLARS.map((pillar) => {
    const pillarIssues = pageIssues.filter((issue) => issue.pillar === pillar.id)
    const pillarMeta = breakdown.pillars.find((entry) => entry.id === pillar.id)
    const bucketPenalties = new Map<string, Map<string, number>>()

    for (const issue of pillarIssues) {
      const penalty = penalties.get(
        issueKey(issue.pillar, issue.bucket, issue.issue_type)
      )
      if (penalty === undefined) continue

      const bucketMap =
        bucketPenalties.get(issue.bucket) ?? new Map<string, number>()
      const existing = bucketMap.get(issue.issue_type) ?? 0
      bucketMap.set(issue.issue_type, Math.max(existing, penalty))
      bucketPenalties.set(issue.bucket, bucketMap)
    }

    const buckets = (pillarMeta?.buckets ?? []).map((bucketMeta) => {
      const issueMap = bucketPenalties.get(bucketMeta.id)
      const issueCount = issueMap?.size ?? 0

      const isPsiBucket =
        pillar.id === "pagespeed" && bucketMeta.id === "psi_cwv"

      if (issueCount === 0) {
        return {
          id: bucketMeta.id,
          label: bucketMeta.label,
          // psi_cwv is always the PSI performance score; other buckets are 100 when clean.
          score: isPsiBucket ? clampScore(bucketMeta.score) : 100,
          issueCount: 0,
        }
      }

      const bucketPenalty = [...(issueMap?.values() ?? [])].reduce(
        (sum, value) => sum + value,
        0
      )

      // PageSpeed psi_cwv uses the PSI performance score directly (subtract model),
      // not 100 minus summed penalties like SEO/AEO buckets.
      const score = isPsiBucket
        ? clampScore(bucketMeta.score)
        : clampScore(100 - bucketPenalty)

      return {
        id: bucketMeta.id,
        label: bucketMeta.label,
        score,
        issueCount,
      }
    })

    const pillarScore =
      buckets.length === 0
        ? pillarIssues.length === 0
          ? 100
          : 0
        : clampScore(
            buckets.reduce(
              (sum, bucket) =>
                sum +
                bucket.score *
                  (pillarMeta?.buckets.find((entry) => entry.id === bucket.id)
                    ?.weight ?? 0),
              0
            )
          )

    return {
      ...pillar,
      score: pillarScore,
      issueCount: pillarIssues.length,
      buckets,
    }
  })
}

/** Overall page health from issue penalties (matches backend page health when present). */
export function computePageOverallScore(
  breakdown: ScoreBreakdownResponse,
  pageIssues: IssueWorkspaceIssue[]
): number {
  if (!pageIssues.length) return 100

  const penalties = penaltyLookup(breakdown)
  const seen = new Set<string>()
  let totalPenalty = 0

  for (const issue of pageIssues) {
    const key = issueKey(issue.pillar, issue.bucket, issue.issue_type)
    if (seen.has(key)) continue
    seen.add(key)
    const penalty = penalties.get(key)
    if (penalty !== undefined) totalPenalty += penalty
  }

  return clampScore(100 - totalPenalty)
}
