import { describe, expect, test } from "bun:test"

import { ApiError } from "~/lib/api"
import type { AIAuditResponse, AIAuditRunResponse } from "~/lib/api.types"
import type {
  LocalSeoCell,
  LocalSeoLocation,
  LocalSeoRun,
} from "~/lib/local-seo-api"
import type { LocationMapsRunHistoryItem } from "~/components/locations/location-maps-run-history"
import {
  AUDIT_PDF_LOCATION_DETAIL_ATTEMPTS,
  auditPdfShortModelName,
  defaultAuditPdfLocationSources,
  fetchAuditPdfLocations,
  normalizeAuditPdfLocationAi,
  normalizeAuditPdfLocationMaps,
  type AuditPdfLocationSources,
} from "./build-audit-pdf-locations"

let cellSeq = 0

function cell(overrides: Partial<LocalSeoCell> = {}): LocalSeoCell {
  cellSeq += 1
  return {
    query_index: 0,
    point_index: 0,
    latitude: 27.7,
    longitude: 85.3,
    distance_m: 1000,
    ring: "centre",
    sector: "centre",
    call_status: "success_nonempty",
    match_status: "found",
    rank: 3,
    credits: 3,
    credit_known: true,
    error: null,
    ...overrides,
  }
}

function run(overrides: Partial<LocalSeoRun> = {}): LocalSeoRun {
  return {
    id: "run-1",
    location_id: "loc-1",
    status: "completed",
    radius_m: 5000,
    expected_credits: 0,
    credits_used: 0,
    retry_credits: 0,
    queries: ["plumber kathmandu", "emergency plumber"],
    cells: [],
    ...overrides,
  }
}

/** Nine points x two queries, all found with rank 2 and 4. */
function foundGrid(): LocalSeoCell[] {
  const cells: LocalSeoCell[] = []
  const sectors = ["NW", "N", "NE", "W", "centre", "E", "SW", "S", "SE"] as const
  const rings = ["corner", "edge", "corner", "edge", "centre", "edge", "corner", "edge", "corner"] as const
  for (let point = 0; point < 9; point += 1) {
    for (let query = 0; query < 2; query += 1) {
      cells.push(
        cell({
          query_index: query,
          point_index: point,
          ring: rings[point],
          sector: sectors[point],
          rank: query === 0 ? 2 : 4,
        }),
      )
    }
  }
  return cells
}

function historyItem(
  overrides: Partial<LocationMapsRunHistoryItem> = {},
): LocationMapsRunHistoryItem {
  return {
    id: "run-old",
    status: "completed",
    radius_m: 5000,
    expected_credits: 0,
    credits_used: 0,
    query_count: 2,
    grid_point_count: 9,
    total_cells: 18,
    created_at: "",
    ...overrides,
  }
}

function aiRun(overrides: Partial<AIAuditRunResponse> = {}): AIAuditRunResponse {
  return {
    id: `run-${overrides.display_order ?? 1}-${overrides.model_name ?? "m"}`,
    audit_id: "audit-1",
    question_text: `Question ${overrides.display_order ?? 1}`,
    display_order: 1,
    model_name: "openai/gpt-5:tag",
    status: "success",
    mentioned_target: true,
    mentioned_branch: false,
    target_rank: 2,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  }
}

function aiAudit(overrides: Partial<AIAuditResponse> = {}): AIAuditResponse {
  return {
    id: "audit-1",
    project_id: "proj-1",
    location_id: "loc-1",
    status: "completed",
    completed_at: "2026-09-30T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-30T00:00:00Z",
    runs: [],
    ...overrides,
  }
}

function location(overrides: Partial<LocalSeoLocation> = {}): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: "proj-1",
    name: "Lakeside",
    place_id: "place-1",
    address: "1 Lake Rd",
    locality: "Pokhara",
    localities: [],
    services: [],
    latitude: 28.2,
    longitude: 83.9,
    queries: [],
    ...overrides,
  }
}

function stubSources(
  overrides: Partial<AuditPdfLocationSources> = {},
): AuditPdfLocationSources {
  return {
    listLocations: async () => [],
    fetchMapsLatestRun: async () => null,
    listMapsRunHistory: async () => ({ total: 0, runs: [] }),
    fetchMapsRun: async () => null,
    listLocationAiAudits: async () => ({
      ai_audits: [],
      pagination: { limit: 1, offset: 0, count: 0, total: 0 },
    }),
    fetchAiAudit: async () => null,
    ...overrides,
  }
}

describe("normalizeAuditPdfLocationMaps saved grid runs", () => {
  test("completed run reports found-only mean rank and per-point coverage", () => {
    const maps = normalizeAuditPdfLocationMaps(
      run({
        cells: [
          ...foundGrid(),
          cell({
            query_index: 0,
            point_index: 0,
            ring: "corner",
            sector: "NW",
            requested_ll: "@27.70000,85.30000,14z",
            echoed_ll: "@27.70100,85.30100,14z",
            viewport_drift_m: 45.2,
          }),
        ],
      }),
    )
    expect(maps?.foundOnlyMeanRank).toBe(3)
    expect(maps?.foundCount).toBe(19)
    expect(maps?.failedCount).toBe(0)
    expect(maps?.points).toHaveLength(9)
    expect(maps?.points[0].letter).toBe("A")
    expect(maps?.failureOnly).toBe(false)
    expect(maps?.driftNote).toContain("Largest centre drift ≈ 45 m across saved cells")
    expect(maps?.driftNote).toContain("Requested @27.70000,85.30000,14z")
    expect(maps?.queries).toEqual(["plumber kathmandu", "emergency plumber"])
  })

  test("queued and running runs read as no run", () => {
    expect(normalizeAuditPdfLocationMaps(run({ status: "queued", cells: foundGrid() }))).toBeNull()
    expect(normalizeAuditPdfLocationMaps(run({ status: "running", cells: foundGrid() }))).toBeNull()
    expect(normalizeAuditPdfLocationMaps(run({ status: "completed", cells: [] }))).toBeNull()
  })

  test("failure-only run keeps honest failed counts and unknown ranks", () => {
    const cells = foundGrid().map((entry) => ({
      ...entry,
      call_status: "request_failed" as const,
      match_status: "unknown" as const,
      rank: null,
      error: null,
    }))
    const maps = normalizeAuditPdfLocationMaps(
      run({ status: "failed", cells, error: "provider blew up" }),
    )
    expect(maps?.failureOnly).toBe(true)
    expect(maps?.foundOnlyMeanRank).toBeNull()
    expect(maps?.failedCount).toBe(cells.length)
    expect(maps?.foundCount).toBe(0)
    expect(maps?.error).toBe("provider blew up")
  })

  test("partial run counts unsettled cells as unknown, never zero ranks", () => {
    const cells = foundGrid()
    cells[0] = { ...cells[0], call_status: "pending", match_status: "unknown", rank: null }
    cells[1] = { ...cells[1], call_status: "request_failed", match_status: "unknown", rank: null }
    cells[2] = { ...cells[2], call_status: "success_empty", match_status: "unknown", rank: null }
    const maps = normalizeAuditPdfLocationMaps(run({ status: "partial", cells }))
    expect(maps?.failedCount).toBe(1)
    expect(maps?.unknownCount).toBe(2)
    expect(maps?.foundOnlyMeanRank).toBe(46 / 15)
  })

  test("unusable drift reads as no note, never a fake zero", () => {
    const maps = normalizeAuditPdfLocationMaps(run({ cells: foundGrid() }))
    expect(maps?.driftNote).toBeNull()
  })

  test("mixed drifts report the largest, not the first calm cell", () => {
    const cells = foundGrid()
    cells[0] = {
      ...cells[0],
      requested_ll: "@27.70000,85.30000,14z",
      echoed_ll: "@27.70010,85.30010,14z",
      viewport_drift_m: 1.2,
    }
    cells[5] = {
      ...cells[5],
      requested_ll: "@27.70000,85.30000,14z",
      echoed_ll: "@27.72000,85.32000,14z",
      viewport_drift_m: 2500.4,
    }
    cells[8] = { ...cells[8], viewport_drift_m: Number.NaN }
    const maps = normalizeAuditPdfLocationMaps(run({ cells }))
    expect(maps?.driftNote).toContain("Largest centre drift ≈ 2500 m across saved cells")
    expect(maps?.driftNote).toContain("Returned @27.72000,85.32000,14z")
  })
})

describe("normalizeAuditPdfLocationAi saved visibility audits", () => {
  test("completed audit reports per-model mentions consistent with the product", () => {
    const audit = normalizeAuditPdfLocationAi(
      aiAudit({
        runs: [
          aiRun({ display_order: 1, model_name: "openai/gpt-5:tag", mentioned_target: true, target_rank: 1 }),
          aiRun({ display_order: 2, model_name: "openai/gpt-5:tag", mentioned_target: false, target_rank: 0 }),
          aiRun({ display_order: 1, model_name: "other/model", mentioned_target: true, target_rank: 3 }),
          aiRun({ display_order: 2, model_name: "other/model", status: "failed", error_message: "bad" }),
        ],
      }),
    )
    expect(audit?.visibilityRate).toBe(67)
    expect(audit?.totalMentions).toBe(2)
    expect(audit?.totalSuccess).toBe(3)
    expect(audit?.avgRank).toBe(2)
    expect(audit?.failedCount).toBe(1)
    expect(audit?.models.map((model) => model.shortModel)).toEqual(["gpt-5", "model"])
    expect(audit?.rows).toHaveLength(4)
    expect(auditPdfShortModelName("openai/gpt-5:tag")).toBe("gpt-5")
  })

  test("queued, running, runless, and pending-only audits read as no run", () => {
    expect(normalizeAuditPdfLocationAi(aiAudit({ status: "queued", runs: [aiRun()] }))).toBeNull()
    expect(normalizeAuditPdfLocationAi(aiAudit({ status: "running", runs: [aiRun()] }))).toBeNull()
    expect(normalizeAuditPdfLocationAi(aiAudit({ runs: [] }))).toBeNull()
    expect(
      normalizeAuditPdfLocationAi(aiAudit({ runs: [aiRun({ status: "pending" })] })),
    ).toBeNull()
  })

  test("failure-only audit keeps the stored cause and unknown rate", () => {
    const audit = normalizeAuditPdfLocationAi(
      aiAudit({
        status: "failed",
        error_message: "no profile",
        runs: [aiRun({ status: "failed", error_message: "no profile" })],
      }),
    )
    expect(audit?.visibilityRate).toBeNull()
    expect(audit?.avgRank).toBeNull()
    expect(audit?.failedCount).toBe(1)
    expect(audit?.error).toBe("no profile")
  })

  test("pending runs inside a terminal audit count as unknown", () => {
    const audit = normalizeAuditPdfLocationAi(
      aiAudit({
        status: "completed_with_failures",
        runs: [aiRun(), aiRun({ display_order: 2, status: "pending" })],
      }),
    )
    expect(audit?.unknownCount).toBe(1)
    expect(audit?.visibilityRate).toBe(100)
  })
})

describe("fetchAuditPdfLocations parent appendix", () => {
  test("location with both sections appears with independent snapshots", async () => {
    const locations = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        fetchMapsLatestRun: async () => run({ cells: foundGrid() }),
        listLocationAiAudits: async () => ({
          ai_audits: [aiAudit()],
          pagination: { limit: 1, offset: 0, count: 1, total: 1 },
        }),
        fetchAiAudit: async () => aiAudit({ runs: [aiRun()] }),
      }),
    )
    expect(locations).toHaveLength(1)
    expect(locations[0].maps?.runId).toBe("run-1")
    expect(locations[0].aiVisibility?.auditId).toBe("audit-1")
  })

  test("maps-only and AI-only locations each appear alone", async () => {
    const mapsOnly = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        fetchMapsLatestRun: async () => run({ cells: foundGrid() }),
      }),
    )
    expect(mapsOnly[0].maps === null).toBe(false)
    expect(mapsOnly[0].aiVisibility).toBeNull()

    const aiOnly = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        listLocationAiAudits: async () => ({
          ai_audits: [aiAudit()],
          pagination: { limit: 1, offset: 0, count: 1, total: 1 },
        }),
        fetchAiAudit: async () => aiAudit({ runs: [aiRun()] }),
      }),
    )
    expect(aiOnly[0].maps).toBeNull()
    expect(aiOnly[0].aiVisibility === null).toBe(false)
  })

  test("location with neither run is omitted, order is preserved", async () => {
    const locations = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [
          location({ id: "loc-empty", name: "Empty" }),
          location({ id: "loc-maps", name: "Maps" }),
          location({ id: "loc-queued", name: "Queued" }),
        ],
        fetchMapsLatestRun: async (_projectId, locationId) =>
          locationId === "loc-maps"
            ? run({ id: "run-maps", location_id: locationId, cells: foundGrid() })
            : locationId === "loc-queued"
              ? run({ id: "run-q", location_id: locationId, status: "running", cells: foundGrid() })
              : null,
      }),
    )
    expect(locations.map((entry) => entry.id)).toEqual(["loc-maps"])
  })

  test("parent crawl audits and sibling locations never leak in", async () => {
    const locations = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        listLocationAiAudits: async () => ({
          // Parent crawl audit and a sibling location audit only.
          ai_audits: [
            aiAudit({ id: "parent", location_id: undefined, crawl_id: "crawl-1" }),
            aiAudit({ id: "sibling", location_id: "loc-2" }),
          ],
          pagination: { limit: 1, offset: 0, count: 2, total: 2 },
        }),
        fetchAiAudit: async () => {
          throw new Error("must not fetch an out-of-scope audit")
        },
      }),
    )
    expect(locations).toEqual([])

    const mismatchedDetail = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        listLocationAiAudits: async () => ({
          ai_audits: [aiAudit()],
          pagination: { limit: 1, offset: 0, count: 1, total: 1 },
        }),
        fetchAiAudit: async () => aiAudit({ location_id: "loc-2", runs: [aiRun()] }),
      }),
    )
    expect(mismatchedDetail).toEqual([])
  })

  test("real errors throw instead of reading as no run", async () => {
    let thrown: unknown = null
    try {
      await fetchAuditPdfLocations(
        "proj-1",
        stubSources({
          listLocations: async () => [location()],
          fetchMapsLatestRun: async () => {
            throw new ApiError(500, "boom", null)
          },
        }),
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown instanceof ApiError).toBe(true)
  })

  test("running latest falls back to the older completed Maps run", async () => {
    const locations = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        fetchMapsLatestRun: async () =>
          run({ id: "run-new", status: "running", cells: foundGrid() }),
        listMapsRunHistory: async () => ({
          total: 2,
          runs: [
            historyItem({ id: "run-new", status: "running" }),
            historyItem({ id: "run-old", status: "completed" }),
          ],
        }),
        fetchMapsRun: async (_projectId, _locationId, runId) =>
          run({ id: runId, cells: foundGrid() }),
      }),
    )
    expect(locations).toHaveLength(1)
    expect(locations[0].maps?.runId).toBe("run-old")
  })

  test("terminal but empty latest falls back to the older usable Maps run", async () => {
    const locations = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        fetchMapsLatestRun: async () => run({ id: "run-empty", cells: [] }),
        listMapsRunHistory: async () => ({
          total: 2,
          runs: [
            historyItem({ id: "run-empty", status: "completed" }),
            historyItem({ id: "run-old", status: "partial" }),
          ],
        }),
        fetchMapsRun: async (_projectId, _locationId, runId) =>
          runId === "run-old" ? run({ id: runId, cells: foundGrid() }) : null,
      }),
    )
    expect(locations[0].maps?.runId).toBe("run-old")
    expect(locations[0].maps?.status).toBe("completed")
  })

  test("Maps history detail reads stay bounded", async () => {
    let detailCalls = 0
    const locations = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        fetchMapsLatestRun: async () => null,
        listMapsRunHistory: async () => ({
          total: 8,
          runs: Array.from({ length: 8 }, (_, index) =>
            historyItem({ id: `run-${index}`, status: "completed" }),
          ),
        }),
        fetchMapsRun: async (_projectId, _locationId, runId) => {
          detailCalls += 1
          return run({ id: runId, cells: [] })
        },
      }),
    )
    expect(locations).toEqual([])
    expect(detailCalls).toBe(AUDIT_PDF_LOCATION_DETAIL_ATTEMPTS)
  })

  test("queued latest AI audit falls back to the older completed one", async () => {
    const locations = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        listLocationAiAudits: async () => ({
          ai_audits: [
            aiAudit({ id: "audit-new", status: "running", runs: [aiRun({ status: "pending" })] }),
            aiAudit({ id: "audit-old", status: "completed" }),
          ],
          pagination: { limit: 10, offset: 0, count: 2, total: 2 },
        }),
        fetchAiAudit: async (auditId) =>
          auditId === "audit-old" ? aiAudit({ id: auditId, runs: [aiRun()] }) : aiAudit({ id: auditId, status: "running", runs: [] }),
      }),
    )
    expect(locations[0].aiVisibility?.auditId).toBe("audit-old")
  })

  test("gone AI detail falls through to the next candidate, errors still throw", async () => {
    const locations = await fetchAuditPdfLocations(
      "proj-1",
      stubSources({
        listLocations: async () => [location()],
        listLocationAiAudits: async () => ({
          ai_audits: [aiAudit({ id: "audit-gone" }), aiAudit({ id: "audit-old" })],
          pagination: { limit: 10, offset: 0, count: 2, total: 2 },
        }),
        fetchAiAudit: async (auditId) =>
          auditId === "audit-old" ? aiAudit({ id: auditId, runs: [aiRun()] }) : null,
      }),
    )
    expect(locations[0].aiVisibility?.auditId).toBe("audit-old")

    let thrown: unknown = null
    try {
      await fetchAuditPdfLocations(
        "proj-1",
        stubSources({
          listLocations: async () => [location()],
          listLocationAiAudits: async () => ({
            ai_audits: [aiAudit()],
            pagination: { limit: 10, offset: 0, count: 1, total: 1 },
          }),
          fetchAiAudit: async () => {
            throw new ApiError(500, "boom", null)
          },
        }),
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown instanceof ApiError).toBe(true)
  })
})

describe("defaultAuditPdfLocationSources 404 handling", () => {
  test("404 on saved-run reads means no run; other statuses throw", async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: "not found" }), { status: 404 })) as typeof fetch
      const empty = await defaultAuditPdfLocationSources.listLocationAiAudits("proj-1", "loc-1")
      expect(empty.ai_audits).toEqual([])
      expect(await defaultAuditPdfLocationSources.fetchAiAudit("audit-1")).toBeNull()

      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: "boom" }), { status: 500 })) as typeof fetch
      let listThrown: unknown = null
      try {
        await defaultAuditPdfLocationSources.listLocationAiAudits("proj-1", "loc-1")
      } catch (error) {
        listThrown = error
      }
      expect(listThrown instanceof ApiError).toBe(true)
      let detailThrown: unknown = null
      try {
        await defaultAuditPdfLocationSources.fetchAiAudit("audit-1")
      } catch (error) {
        detailThrown = error
      }
      expect(detailThrown instanceof ApiError).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
