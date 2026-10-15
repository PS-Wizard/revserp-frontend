import type { ScoreBreakdownResponse } from "~/lib/api.types"
import { formatBucketLabel } from "~/lib/utils"

export type RevbotAuditSuggestion = {
  id: string
  crawlId: string
  pillarId: "seo" | "aeo" | "pagespeed"
  pillarLabel: string
  bucketId: string
  bucketLabel: string
  affectedUrlCount: number
  message: string
}

const SUPPORTED_PILLARS = ["seo", "aeo", "pagespeed"] as const

const PILLAR_LABELS: Record<(typeof SUPPORTED_PILLARS)[number], string> = {
  seo: "SEO",
  aeo: "AEO",
  pagespeed: "PageSpeed",
}

export function buildRevbotAuditSuggestions(
  breakdown: ScoreBreakdownResponse | null | undefined,
): RevbotAuditSuggestion[] {
  const crawlId = breakdown?.crawl_id
  if (typeof crawlId !== "string" || crawlId.length === 0) return []
  const pillars = breakdown?.pillars
  if (!Array.isArray(pillars)) return []
  const suggestions: RevbotAuditSuggestion[] = []
  for (const pillarId of SUPPORTED_PILLARS) {
    const pillar = pillars.find((entry) => entry?.id === pillarId)
    if (!pillar) continue
    const buckets = Array.isArray(pillar.buckets) ? pillar.buckets : []
    let best: { id: string; label: string; score: number; affected: number } | null = null
    for (const bucket of buckets) {
      if (!bucket || typeof bucket.id !== "string" || bucket.id.length === 0) continue
      if (typeof bucket.score !== "number" || !Number.isFinite(bucket.score)) continue
      if (
        typeof bucket.issue_row_count !== "number" ||
        !Number.isFinite(bucket.issue_row_count) ||
        bucket.issue_row_count <= 0
      )
        continue
      const affected = bucket.affected_url_count
      if (typeof affected !== "number" || !Number.isFinite(affected) || affected < 0) continue
      if (
        best === null ||
        bucket.score < best.score ||
        (bucket.score === best.score &&
          (affected > best.affected || (affected === best.affected && bucket.id < best.id)))
      ) {
        best = {
          id: bucket.id,
          label:
            typeof bucket.label === "string" && bucket.label.length > 0 ? bucket.label : bucket.id,
          score: bucket.score,
          affected,
        }
      }
    }
    if (!best) continue
    const pillarLabel =
      typeof pillar.label === "string" && pillar.label.length > 0
        ? pillar.label
        : PILLAR_LABELS[pillarId]
    const bucketLabel = formatBucketLabel(best.id, best.label)
    suggestions.push({
      id: `${pillarId}:${best.id}`,
      crawlId,
      pillarId,
      pillarLabel,
      bucketId: best.id,
      bucketLabel,
      affectedUrlCount: best.affected,
      message: `Help me fix the ${bucketLabel} bucket under ${pillarLabel}. Review all recorded issue types in this bucket and give me a prioritized rundown of the issues and recommended fixes.`,
    })
  }
  return suggestions
}
