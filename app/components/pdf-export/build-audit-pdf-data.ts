import type {
  CrawlResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import type {
  AuditPdfData,
  AuditPillar,
} from "~/components/audit-pdf/AuditPdfDocument"

/** One audit commentary section as returned by GET /crawls/{id}/commentary. */
export type AuditCommentarySection = {
  summary?: string | null
  strengths?: string[] | null
  concerns?: string[] | null
  recommendations?: string[] | null
}

/** Commentary payload for the selected crawl, keyed by audit area plus model. */
export type AuditCommentaryResponse = {
  overall?: AuditCommentarySection | null
  seo?: AuditCommentarySection | null
  aeo?: AuditCommentarySection | null
  pagespeed?: AuditCommentarySection | null
  model?: string | null
}

export type AuditPdfMeta = {
  projectName: string
  /** Optional site URL shown in the report header. */
  baseUrl?: string
  /** The selected crawl; only urlsCrawled metadata is read, never scores. */
  currentCrawl?: CrawlResponse | null
  reportDate?: Date
}

const EMPTY_SECTION = { summary: "", strengths: [], concerns: [], recommendations: [] }

/** Normalize one commentary section; missing arrays stay empty, never invented. */
function normalizeCommentarySection(
  section: AuditCommentarySection | null | undefined,
): { summary: string; strengths: string[]; concerns: string[]; recommendations: string[] } {
  if (!section) return { ...EMPTY_SECTION }
  return {
    summary: section.summary ?? "",
    strengths: Array.isArray(section.strengths) ? section.strengths : [],
    concerns: Array.isArray(section.concerns) ? section.concerns : [],
    recommendations: Array.isArray(section.recommendations) ? section.recommendations : [],
  }
}

function pillarScore(
  breakdown: ScoreBreakdownResponse,
  id: string,
): number | null {
  return breakdown.pillars.find((p) => p.id === id)?.score ?? null
}

function quarterOf(date: Date): string {
  return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`
}

/**
 * Build AuditPdfData for the selected crawl audit report.
 * The score breakdown is the source of truth for every score; the crawl row
 * only supplies urlsCrawled metadata. Throws on crawl id mismatch so a stale
 * breakdown can never render under the wrong selected crawl.
 */
export function buildAuditPdfData(
  selectedCrawlId: string,
  breakdown: ScoreBreakdownResponse,
  commentary: AuditCommentaryResponse | null | undefined,
  meta: AuditPdfMeta,
): AuditPdfData {
  if (breakdown.crawl_id !== selectedCrawlId) {
    throw new Error(
      `Audit crawl mismatch for ${selectedCrawlId}: breakdown belongs to ${breakdown.crawl_id}`,
    )
  }

  const now = meta.reportDate ?? new Date()
  const pillars: AuditPillar[] = breakdown.pillars.map((pillar) => ({
    id: pillar.id,
    label: pillar.label,
    score: pillar.score,
    buckets: (pillar.buckets ?? []).map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      score: bucket.score,
      affectedUrlCount: bucket.affected_url_count,
    })),
  }))

  return {
    projectName: meta.projectName,
    baseUrl: meta.baseUrl,
    reportDate: now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    quarter: quarterOf(now),
    urlsCrawled: meta.currentCrawl?.urls_crawled ?? null,
    scores: {
      overall: breakdown.overall_score ?? null,
      seo: pillarScore(breakdown, "seo"),
      aeo: pillarScore(breakdown, "aeo"),
      pagespeed: pillarScore(breakdown, "pagespeed"),
    },
    pillars,
    commentary: {
      overall: normalizeCommentarySection(commentary?.overall),
      seo: normalizeCommentarySection(commentary?.seo),
      aeo: normalizeCommentarySection(commentary?.aeo),
      pagespeed: normalizeCommentarySection(commentary?.pagespeed),
    },
    model: commentary?.model ?? undefined,
  }
}

/** Sanitize a filename so the audit pdf download name is filesystem-safe. */
export function sanitizeAuditFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
}

/** Audit pdf filename for a project: audit-project-date.pdf. */
export function auditPdfFilename(projectName: string, date = new Date()): string {
  const slug = sanitizeAuditFilename(projectName) || "audit"
  const dateStr = date.toISOString().slice(0, 10)
  return `audit-${slug}-${dateStr}.pdf`
}
