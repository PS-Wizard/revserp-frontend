import { formatBucketLabel } from "~/lib/utils"
import type {
  CrawlPageHealthResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

export const PILLAR_IDS = ["seo", "aeo", "pagespeed"] as const
export type PillarId = (typeof PILLAR_IDS)[number]

export const PILLAR_LABEL: Record<PillarId, string> = {
  seo: "SEO",
  aeo: "AEO",
  pagespeed: "PageSpeed",
}

// Two identity hues, drawn from the palette the audit radials already use.
// Colour marks which site a mark belongs to. Direction is never colour — it is
// bar length — so nothing here needs a red/green convention.
export const PAINT_A = {
  color: "oklch(0.78 0.12 200)",
  soft: "oklch(0.78 0.12 200 / 0.16)",
  dim: "oklch(0.78 0.12 200 / 0.28)",
}
export const PAINT_B = {
  color: "oklch(0.84 0.15 88)",
  soft: "oklch(0.84 0.15 88 / 0.16)",
  dim: "oklch(0.84 0.15 88 / 0.28)",
}

export function pillarScore(
  breakdown: ScoreBreakdownResponse | undefined,
  pillar: PillarId
) {
  return breakdown?.pillars.find((p) => p.id === pillar)?.score ?? null
}

export type BucketPair = {
  id: string
  label: string
  a: number | null
  b: number | null
}

/**
 * One row per bucket, pre-split into the stack segments the diverging chart
 * draws: the score both sides reach, then the leader's overhang. Side B is
 * negated so it renders left of zero.
 */
export function bucketRows(
  a: ScoreBreakdownResponse | undefined,
  b: ScoreBreakdownResponse | undefined,
  pillar: PillarId
) {
  return bucketPairs(a, b, pillar).map((pair) => {
    const scoreA = pair.a ?? 0
    const scoreB = pair.b ?? 0
    const shared = Math.min(scoreA, scoreB)
    return {
      label: pair.label,
      a: pair.a,
      b: pair.b,
      aShared: shared,
      aLead: scoreA - shared,
      bShared: -shared,
      bLead: -(scoreB - shared),
    }
  })
}

/** Buckets of one pillar, unioned across both sides, worst gap first. */
export function bucketPairs(
  a: ScoreBreakdownResponse | undefined,
  b: ScoreBreakdownResponse | undefined,
  pillar: PillarId
): BucketPair[] {
  const left = a?.pillars.find((p) => p.id === pillar)?.buckets ?? []
  const right = b?.pillars.find((p) => p.id === pillar)?.buckets ?? []
  const byId = new Map<string, BucketPair>()

  for (const bucket of left) {
    byId.set(bucket.id, {
      id: bucket.id,
      label: formatBucketLabel(bucket.id, bucket.label),
      a: bucket.score,
      b: null,
    })
  }
  for (const bucket of right) {
    const existing = byId.get(bucket.id)
    if (existing) existing.b = bucket.score
    else
      byId.set(bucket.id, {
        id: bucket.id,
        label: formatBucketLabel(bucket.id, bucket.label),
        a: null,
        b: bucket.score,
      })
  }

  return [...byId.values()].sort(
    (x, y) => gapOf(y) - gapOf(x) || x.label.localeCompare(y.label)
  )
}

function gapOf(pair: BucketPair) {
  return Math.abs((pair.a ?? 0) - (pair.b ?? 0))
}


export type IssuePair = {
  id: string
  label: string
  pillar: PillarId
  /** Percent of that side's scoreable pages affected. */
  a: number
  b: number
}

/**
 * Per-issue prevalence, normalised by each side's own page count. Raw affected
 * counts are meaningless across sites of different size — 14 bad pages out of
 * 40 is a crisis, out of 2,000 it is noise.
 */
function issuePairs(
  a: ScoreBreakdownResponse | undefined,
  b: ScoreBreakdownResponse | undefined
): IssuePair[] {
  const byId = new Map<string, IssuePair>()

  const absorb = (
    breakdown: ScoreBreakdownResponse | undefined,
    side: "a" | "b"
  ) => {
    if (!breakdown) return
    const pages = breakdown.total_scored_pages
    if (pages <= 0) return
    for (const pillar of breakdown.pillars) {
      if (!isPillarId(pillar.id)) continue
      for (const bucket of pillar.buckets) {
        for (const issue of bucket.issues) {
          const key = `${pillar.id}::${bucket.id}::${issue.id}`
          const existing = byId.get(key) ?? {
            id: key,
            label: issue.label,
            pillar: pillar.id,
            a: 0,
            b: 0,
          }
          existing[side] = (issue.affected_url_count / pages) * 100
          byId.set(key, existing)
        }
      }
    }
  }

  absorb(a, "a")
  absorb(b, "b")

  return [...byId.values()]
    .filter((issue) => issue.a > 0 || issue.b > 0)
    .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))
}

export type SpreadFilter = PillarId | "all"

/**
 * Prevalence rows for the spread list. Sorted by widest gap so the rows that
 * separate the two sites come first; ties fall back to the worse absolute
 * share, which keeps "both sites are bad at this" visible near the top.
 */
export function spreadRows(
  a: ScoreBreakdownResponse | undefined,
  b: ScoreBreakdownResponse | undefined,
  filter: SpreadFilter = "all"
) {
  return issuePairs(a, b)
    .filter((issue) => filter === "all" || issue.pillar === filter)
    .map((issue) => ({
      label: issue.label,
      pillar: PILLAR_LABEL[issue.pillar],
      a: issue.a,
      b: issue.b,
    }))
}

function isPillarId(value: string): value is PillarId {
  return (PILLAR_IDS as readonly string[]).includes(value)
}

/** Histogram counts to shares of that side's own total. */
export function healthShares(health: CrawlPageHealthResponse | undefined) {
  if (!health || health.total_pages <= 0) return null
  return health.buckets.map((count) => count / health.total_pages)
}

export type SpreadSummary = {
  total: number
  ahead: number
  behind: number
  level: number
  lead: { label: string; gap: number } | null
  deficit: { label: string; gap: number } | null
}

/** Headline counts for the balance panel. Lower prevalence is the better side. */
export function spreadSummary(
  a: ScoreBreakdownResponse | undefined,
  b: ScoreBreakdownResponse | undefined,
  filter: SpreadFilter = "all"
): SpreadSummary {
  const rows = issuePairs(a, b).filter(
    (issue) => filter === "all" || issue.pillar === filter
  )
  let lead: SpreadSummary["lead"] = null
  let deficit: SpreadSummary["deficit"] = null

  for (const issue of rows) {
    const gap = issue.b - issue.a
    if (gap > 0 && (!lead || gap > lead.gap)) {
      lead = { label: issue.label, gap }
    }
    if (gap < 0 && (!deficit || -gap > deficit.gap)) {
      deficit = { label: issue.label, gap: -gap }
    }
  }

  return {
    total: rows.length,
    ahead: rows.filter((issue) => issue.a < issue.b).length,
    behind: rows.filter((issue) => issue.a > issue.b).length,
    level: rows.filter((issue) => issue.a === issue.b).length,
    lead,
    deficit,
  }
}
