import type {
  AuditPdfLocation,
  AuditPdfLocationAi,
  AuditPdfLocationMaps,
} from "~/components/audit-pdf/AuditPdfDocument"
import { ApiError, clientApiFetch } from "~/lib/api"
import type { AIAuditListResponse, AIAuditResponse } from "~/lib/api.types"
import {
  fetchLocalSeoLatestRun,
  fetchLocalSeoRun,
  fetchLocalSeoLocations,
  localSeoPointLetter,
  type LocalSeoCell,
  type LocalSeoLocation,
  type LocalSeoRun,
} from "~/lib/local-seo-api"
import { summarizeLocalSeoGridCells } from "~/lib/local-seo-directional"
import {
  fetchLocalSeoRunHistory,
  type LocationMapsRunHistory,
} from "~/components/locations/location-maps-run-history"

/** Latest saved terminal Maps run with actual results; queued/running/empty runs read as no run. */
export function normalizeAuditPdfLocationMaps(
  run: LocalSeoRun,
): AuditPdfLocationMaps | null {
  if (
    run.status !== "completed" &&
    run.status !== "partial" &&
    run.status !== "failed"
  ) {
    return null
  }
  if (run.cells.length === 0) return null

  const summary = summarizeLocalSeoGridCells(run.cells, null)
  let foundCount = 0
  let absentCount = 0
  let rankSum = 0
  for (const ring of summary.rings) {
    foundCount += ring.foundCount
    absentCount += ring.absentCount
    if (ring.meanRank !== null) rankSum += ring.meanRank * ring.foundCount
  }
  const failedCount = run.cells.filter(
    (cell) => cell.call_status === "request_failed",
  ).length
  const succeededCount = run.cells.filter(
    (cell) =>
      cell.call_status === "success_empty" ||
      cell.call_status === "success_nonempty",
  ).length
  // Unsettled cells count as unknown, matching the product grid semantics.
  const unknownCount = run.cells.length - foundCount - absentCount - failedCount

  return {
    runId: run.id,
    status: run.status,
    queries: [...run.queries],
    radiusM: run.radius_m,
    foundCount,
    absentCount,
    failedCount,
    unknownCount,
    totalCells: run.cells.length,
    foundOnlyMeanRank: foundCount > 0 ? rankSum / foundCount : null,
    points: summary.points.map((point) => ({
      pointIndex: point.pointIndex,
      letter: localSeoPointLetter(point.pointIndex),
      meanRank: point.meanRank,
      foundCount: point.foundCount,
      absentCount: point.absentCount,
      unknownCount: point.unknownCount,
      totalCount: point.totalCount,
    })),
    driftNote: auditPdfMapsDriftNote(run.cells),
    failureOnly: succeededCount === 0,
    error: run.error ?? null,
  }
}

// ponytail: mirrors describeLocationMapsViewportDrift without pulling UI
// imports into the PDF data module; reports the largest saved drift so one
// calm cell cannot hide kilometre-scale drift elsewhere in the grid.
function auditPdfMapsDriftNote(cells: LocalSeoCell[]): string | null {
  let cell: LocalSeoCell | null = null
  for (const candidate of cells) {
    const drift = candidate.viewport_drift_m
    if (typeof drift !== "number" || !Number.isFinite(drift) || drift < 0) continue
    if (!cell || (cell.viewport_drift_m ?? -1) < drift) cell = candidate
  }
  if (!cell || cell.viewport_drift_m == null) return null
  const parts: string[] = []
  const requested = cell.requested_ll?.trim()
  const returned = cell.echoed_ll?.trim()
  if (requested) parts.push(`Requested ${requested}`)
  if (returned) parts.push(`Returned ${returned}`)
  parts.push(`Largest centre drift ≈ ${Math.round(cell.viewport_drift_m)} m across saved cells`)
  return parts.join(" · ")
}

/** Short model label matching the visibility view (path suffix, no tag). */
export function auditPdfShortModelName(slug: string): string {
  const afterSlash = slug.split("/").pop() ?? slug
  return afterSlash.replace(/:[^:]+$/, "")
}

function isRankedTarget(rank: number | null | undefined): rank is number {
  return typeof rank === "number" && Number.isFinite(rank) && rank > 0
}

/** Latest saved terminal AI audit with actual results; queued/running/runless audits read as no run. */
export function normalizeAuditPdfLocationAi(
  audit: AIAuditResponse,
): AuditPdfLocationAi | null {
  if (audit.status === "queued" || audit.status === "running") return null
  const runs = audit.runs ?? []
  const successRuns = runs.filter((run) => run.status === "success")
  const failedRuns = runs.filter((run) => run.status === "failed")
  const unknownRuns = runs.filter(
    (run) => run.status !== "success" && run.status !== "failed",
  )
  // Unrun or in-progress-only: nothing terminal to report.
  if (successRuns.length + failedRuns.length === 0) return null

  const mentionedRuns = successRuns.filter((run) => run.mentioned_target)
  const rankedRuns = mentionedRuns.filter((run) =>
    isRankedTarget(run.target_rank),
  )
  const models = [...new Set(runs.map((run) => run.model_name))].sort()
  const orders = [...new Set(runs.map((run) => run.display_order))].sort(
    (a, b) => a - b,
  )
  const runByOrderModel = new Map(
    runs.map((run) => [`${run.display_order}:${run.model_name}`, run] as const),
  )

  return {
    auditId: audit.id,
    status: audit.status,
    completedAt: audit.completed_at ?? null,
    visibilityRate:
      successRuns.length > 0
        ? Math.round((mentionedRuns.length / successRuns.length) * 100)
        : null,
    totalMentions: mentionedRuns.length,
    totalSuccess: successRuns.length,
    avgRank:
      rankedRuns.length > 0
        ? Math.round(
            rankedRuns.reduce((sum, run) => sum + (run.target_rank ?? 0), 0) /
              rankedRuns.length,
          )
        : null,
    failedCount: failedRuns.length,
    unknownCount: unknownRuns.length,
    models: models.map((model) => {
      const modelSuccess = successRuns.filter(
        (run) => run.model_name === model,
      )
      const modelMentioned = modelSuccess.filter((run) => run.mentioned_target)
      const modelRanked = modelMentioned.filter((run) =>
        isRankedTarget(run.target_rank),
      )
      return {
        model,
        shortModel: auditPdfShortModelName(model),
        mentionedCount: modelMentioned.length,
        successCount: modelSuccess.length,
        failedCount: failedRuns.filter((run) => run.model_name === model)
          .length,
        unknownCount: unknownRuns.filter((run) => run.model_name === model)
          .length,
        avgRank:
          modelRanked.length > 0
            ? Math.round(
                modelRanked.reduce(
                  (sum, run) => sum + (run.target_rank ?? 0),
                  0,
                ) / modelRanked.length,
              )
            : null,
      }
    }),
    rows: orders.flatMap((order) =>
      models.flatMap((model) => {
        const run = runByOrderModel.get(`${order}:${model}`)
        if (!run) return []
        return [
          {
            order,
            question: run.question_text,
            model,
            status: run.status,
            mentioned: run.mentioned_target ?? null,
            rank: isRankedTarget(run.target_rank) ? run.target_rank : null,
            branchMention: run.mentioned_branch ?? null,
          },
        ]
      }),
    ),
    // Failure-only runs keep the stored cause; mixed runs report counts only.
    error: successRuns.length === 0 ? (audit.error_message ?? null) : null,
  }
}

export type AuditPdfLocationSources = {
  listLocations: (projectId: string) => Promise<LocalSeoLocation[]>
  fetchMapsLatestRun: (
    projectId: string,
    locationId: string,
  ) => Promise<LocalSeoRun | null>
  listMapsRunHistory: (
    projectId: string,
    locationId: string,
    latest: LocalSeoRun | null,
  ) => Promise<LocationMapsRunHistory>
  fetchMapsRun: (
    projectId: string,
    locationId: string,
    runId: string,
  ) => Promise<LocalSeoRun | null>
  listLocationAiAudits: (
    projectId: string,
    locationId: string,
  ) => Promise<AIAuditListResponse>
  fetchAiAudit: (auditId: string) => Promise<AIAuditResponse | null>
}

// ponytail: fixed windows bound the history fanout; raise them only if
// location exports measurably stall.
export const AUDIT_PDF_LOCATION_HISTORY_LIMIT = 20
export const AUDIT_PDF_LOCATION_DETAIL_ATTEMPTS = 5
export const AUDIT_PDF_LOCATION_AI_LIST_LIMIT = 10

/** Newest-first AI list window; the loader below walks candidates in order. */
async function defaultListLocationAiAudits(
  projectId: string,
  locationId: string,
): Promise<AIAuditListResponse> {
  try {
    return await clientApiFetch<AIAuditListResponse>(
      `/projects/${projectId}/ai-audits?limit=${AUDIT_PDF_LOCATION_AI_LIST_LIMIT}&offset=0&location_id=${locationId}`,
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return {
        ai_audits: [],
        pagination: { limit: AUDIT_PDF_LOCATION_AI_LIST_LIMIT, offset: 0, count: 0, total: 0 },
      }
    }
    throw error
  }
}

/** A 404 on the audit detail means the listed run is gone; anything else throws. */
async function defaultFetchAiAudit(
  auditId: string,
): Promise<AIAuditResponse | null> {
  try {
    return await clientApiFetch<AIAuditResponse>(`/ai-audits/${auditId}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Newest-first Maps history; a 404 falls back to a latest-only page. */
async function defaultListMapsRunHistory(
  projectId: string,
  locationId: string,
  latest: LocalSeoRun | null,
): Promise<LocationMapsRunHistory> {
  return fetchLocalSeoRunHistory(
    projectId,
    locationId,
    AUDIT_PDF_LOCATION_HISTORY_LIMIT,
    0,
    latest,
  )
}

/** A 404 on a full Maps run means the listed run is gone; anything else throws. */
async function defaultFetchMapsRun(
  projectId: string,
  locationId: string,
  runId: string,
): Promise<LocalSeoRun | null> {
  try {
    return await fetchLocalSeoRun(projectId, locationId, runId)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export const defaultAuditPdfLocationSources: AuditPdfLocationSources = {
  listLocations: fetchLocalSeoLocations,
  fetchMapsLatestRun: fetchLocalSeoLatestRun,
  listMapsRunHistory: defaultListMapsRunHistory,
  fetchMapsRun: defaultFetchMapsRun,
  listLocationAiAudits: defaultListLocationAiAudits,
  fetchAiAudit: defaultFetchAiAudit,
}

// ponytail: fixed chunk size bounds the fanout for many locations; raise it
// only if location exports measurably stall.
export const AUDIT_PDF_LOCATION_FETCH_CONCURRENCY = 4

/** Newest saved Maps run with actual results; walks history when the
latest run is unsettled or has no usable cells. */
async function loadAuditPdfLocationMaps(
  projectId: string,
  locationId: string,
  sources: AuditPdfLocationSources,
): Promise<AuditPdfLocationMaps | null> {
  const latest = await sources.fetchMapsLatestRun(projectId, locationId)
  const direct = latest ? normalizeAuditPdfLocationMaps(latest) : null
  if (direct) return direct
  const seen = new Set(latest ? [latest.id] : [])
  const history = await sources.listMapsRunHistory(projectId, locationId, latest)
  let attempts = 0
  for (const item of history.runs) {
    if (attempts >= AUDIT_PDF_LOCATION_DETAIL_ATTEMPTS) break
    if (seen.has(item.id)) continue
    if (item.status === "queued" || item.status === "running") continue
    seen.add(item.id)
    attempts += 1
    const full = await sources.fetchMapsRun(projectId, locationId, item.id)
    const normalized = full ? normalizeAuditPdfLocationMaps(full) : null
    if (normalized) return normalized
  }
  return null
}

/** Newest saved AI audit with actual results; walks the list window when the
latest audit is unsettled, gone, or has no usable runs. */
async function loadAuditPdfLocationAi(
  projectId: string,
  locationId: string,
  sources: AuditPdfLocationSources,
): Promise<AuditPdfLocationAi | null> {
  const list = await sources.listLocationAiAudits(projectId, locationId)
  let attempts = 0
  for (const candidate of list.ai_audits) {
    if (attempts >= AUDIT_PDF_LOCATION_DETAIL_ATTEMPTS) break
    // Scope check mirrors the visibility view: a parent or sibling audit
    // must never leak into this location's appendix.
    if (candidate.location_id !== locationId || candidate.project_id !== projectId) continue
    attempts += 1
    const detail = await sources.fetchAiAudit(candidate.id)
    if (!detail || detail.project_id !== projectId || detail.location_id !== locationId) continue
    const normalized = normalizeAuditPdfLocationAi(detail)
    if (normalized) return normalized
  }
  return null
}

async function loadOneAuditPdfLocation(
  projectId: string,
  location: LocalSeoLocation,
  sources: AuditPdfLocationSources,
): Promise<AuditPdfLocation | null> {
  const [maps, aiVisibility] = await Promise.all([
    loadAuditPdfLocationMaps(projectId, location.id, sources),
    loadAuditPdfLocationAi(projectId, location.id, sources),
  ])
  if (!maps && !aiVisibility) return null
  return { id: location.id, name: location.name, maps, aiVisibility }
}

/**
 * Read-only parent appendix: every project location with at least one usable
 * saved Maps or AI visibility run. Each section falls back through history to
 * the newest terminal run with actual results, so a queued latest run never
 * hides an older completed one. Never starts runs or spends credits.
 */
export async function fetchAuditPdfLocations(
  projectId: string,
  sources: AuditPdfLocationSources = defaultAuditPdfLocationSources,
): Promise<AuditPdfLocation[]> {
  const locations = await sources.listLocations(projectId)
  const included: AuditPdfLocation[] = []
  for (
    let at = 0;
    at < locations.length;
    at += AUDIT_PDF_LOCATION_FETCH_CONCURRENCY
  ) {
    const chunk = await Promise.all(
      locations
        .slice(at, at + AUDIT_PDF_LOCATION_FETCH_CONCURRENCY)
        .map((location) => loadOneAuditPdfLocation(projectId, location, sources)),
    )
    for (const location of chunk) {
      if (location) included.push(location)
    }
  }
  return included
}
