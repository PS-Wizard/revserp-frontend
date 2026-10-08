import { describe, expect, test } from "bun:test"

import {
  localSeoMapFitPadding,
  describeLocalSeoPinStatus,
  describeLocalSeoUnresolvedMarker,
  frozenLocalSeoRunCenter,
  generatedQueryDrafts,
  isCurrentLocalSeoLocation,
  mergeLocalSeoRefreshedQueryDrafts,
  preserveLocalSeoLandmarkDrafts,
  selectLocalSeoOverlayCells,
  selectLocalSeoOverlayCenter,
  selectLocalSeoReportCenter,
  selectLocalSeoInitialReportLocation,
  selectPendingLocalSeoDrafts,
  upsertLocalSeoLocationInList,
} from "~/components/local-seo-map-page"
import { localSeoLocationsBounds } from "~/components/local-seo-map-position"
import type {
  LocalSeoLocation,
  LocalSeoLocationQueryDraft,
  LocalSeoLocationQueryRecord,
  LocalSeoRun,
} from "~/lib/local-seo-api"

function makeRun(status: LocalSeoRun["status"]): LocalSeoRun {
  return {
    id: "run-1",
    location_id: "loc-1",
    status,
    radius_m: 5000,
    expected_credits: 135,
    credits_used: 0,
    retry_credits: 0,
    queries: ["coffee"],
    cells: [],
  }
}

function makeCell(overrides: Record<string, unknown> = {}) {
  return {
    query_index: 0,
    point_index: 0,
    latitude: 1,
    longitude: 2,
    distance_m: 0,
    ring: "corner",
    sector: "NW",
    call_status: "success_nonempty",
    match_status: "found",
    rank: 3,
    credits: 3,
    credit_known: true,
    error: null,
    ...overrides,
  } as LocalSeoRun["cells"][number]
}

function makeLocation(
  overrides: Partial<LocalSeoLocation> = {}
): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: "proj-1",
    name: "Roastery",
    place_id: null,
    address: "Main St",
    locality: "Downtown",
    localities: [],
    services: [],
    latitude: 27.7,
    longitude: 85.3,
    queries: [],
    ...overrides,
  }
}

function mapQuery(
  text: string,
  overrides: Partial<LocalSeoLocationQueryRecord> = {}
): LocalSeoLocationQueryRecord {
  return {
    id: `q-${text}`,
    text,
    ordinal: 0,
    enabled: true,
    kind: "map",
    source: "manual",
    origin: "service",
    landmark_id: null,
    ...overrides,
  }
}

describe("bound pin status", () => {
  test("unrun pins read as none, never failed", () => {
    expect(describeLocalSeoPinStatus(null).status).toBe("none")
  })

  test("each run status maps to its own colour and label", () => {
    expect(describeLocalSeoPinStatus(makeRun("completed")).color).toBe(
      "#2ee6a8"
    )
    expect(describeLocalSeoPinStatus(makeRun("failed")).label).toBe("Failed")
    expect(describeLocalSeoPinStatus(makeRun("running")).color).toBe("#38bdf8")
  })
})

describe("frozen run centre", () => {
  test("point 4 centre anchors the snapshot, not current edits", () => {
    const run = makeRun("completed")
    run.cells = [
      makeCell({ point_index: 0, ring: "corner", latitude: 1, longitude: 2 }),
      makeCell({
        point_index: 4,
        ring: "centre",
        sector: "centre",
        latitude: 27.7,
        longitude: 85.3,
        rank: 1,
      }),
    ]
    expect(frozenLocalSeoRunCenter(run)).toEqual([85.3, 27.7])
  })

  test("returns null when the stored centre is absent, never a substitute", () => {
    const run = makeRun("completed")
    run.cells = [
      makeCell({ point_index: 0, ring: "corner", latitude: 1, longitude: 2 }),
    ]
    expect(frozenLocalSeoRunCenter(run)).toBeNull()
  })

  test("point 4 with the wrong ring is not a centre", () => {
    const run = makeRun("completed")
    run.cells = [
      makeCell({
        point_index: 4,
        ring: "corner",
        latitude: 27.7,
        longitude: 85.3,
      }),
    ]
    expect(frozenLocalSeoRunCenter(run)).toBeNull()
  })

  test("non-finite stored centre returns null", () => {
    const run = makeRun("completed")
    run.cells = [
      makeCell({
        point_index: 4,
        ring: "centre",
        latitude: Number.NaN,
        longitude: 85.3,
      }),
    ]
    expect(frozenLocalSeoRunCenter(run)).toBeNull()
  })

  test("report centre matches the frozen overlay centre", () => {
    const run = makeRun("completed")
    run.cells = [
      makeCell({
        point_index: 4,
        ring: "centre",
        sector: "centre",
        latitude: 27.7,
        longitude: 85.3,
      }),
    ]
    const reportCenter = selectLocalSeoReportCenter(run)
    const overlayCenter = selectLocalSeoOverlayCenter({
      setupLocation: null,
      reportRun: run,
    })
    expect(reportCenter).toEqual([85.3, 27.7])
    expect(overlayCenter).toEqual(reportCenter)
  })

  test("missing frozen centre yields null overlay centre, not live coords", () => {
    const run = makeRun("completed")
    run.cells = []
    expect(
      selectLocalSeoOverlayCenter({ setupLocation: null, reportRun: run })
    ).toBeNull()
  })
})

describe("setup preview", () => {
  test("never reuses old run cells; previews from empty results", () => {
    const oldCells = [makeCell({ point_index: 0 })]
    expect(
      selectLocalSeoOverlayCells({ setupActive: true, reportCells: oldCells })
    ).toEqual([])
  })

  test("report keeps frozen cells", () => {
    const oldCells = [makeCell({ point_index: 0 })]
    expect(
      selectLocalSeoOverlayCells({ setupActive: false, reportCells: oldCells })
    ).toBe(oldCells)
  })
})

describe("pending drafts and unresolved markers", () => {
  test("pending drafts are unbound locations only", () => {
    const bound = makeLocation({ id: "b", place_id: "ChIJ1" })
    const draft = makeLocation({ id: "d", place_id: null })
    expect(selectPendingLocalSeoDrafts([bound, draft])).toEqual([draft])
  })

  test("unresolved marker is distinct from every bound pin", () => {
    const draft = makeLocation({ name: "Corner Shop" })
    const unresolved = describeLocalSeoUnresolvedMarker(draft)
    expect(unresolved.status).toBe("unresolved")
    expect(unresolved.label).toBe("Unresolved search area")
    expect(unresolved.ariaLabel).toContain("Unresolved search area")
    expect(unresolved.ariaLabel).toContain("not a business location")
    const boundColors = new Set(
      (["completed", "partial", "failed", "queued", "running"] as const).map(
        (status) => describeLocalSeoPinStatus(makeRun(status)).color
      )
    )
    expect(boundColors.has(unresolved.color)).toBe(false)
    for (const status of [
      "completed",
      "partial",
      "failed",
      "queued",
      "running",
    ] as const) {
      expect(
        (describeLocalSeoPinStatus(makeRun(status)).status as string) ===
          "unresolved"
      ).toBe(false)
    }
  })
})

describe("bind cache sync", () => {
  test("upserts the bound location into the list cache", () => {
    const stale = makeLocation({ id: "loc-1", latitude: 0, longitude: 0 })
    const fresh = makeLocation({ id: "loc-1", latitude: 27.7, longitude: 85.3 })
    expect(upsertLocalSeoLocationInList([stale], fresh)).toEqual([fresh])
  })

  test("appends unknown locations without dropping others", () => {
    const first = makeLocation({ id: "a" })
    const fresh = makeLocation({ id: "b" })
    expect(upsertLocalSeoLocationInList([first], fresh)).toEqual([first, fresh])
  })
})

describe("initial viewport fit", () => {
  test("fits actual locations, not the default viewport", () => {
    const bounds = localSeoLocationsBounds([
      makeLocation({ latitude: 27.7, longitude: 85.3 }),
      makeLocation({ latitude: 27.8, longitude: 85.4 }),
    ])
    expect(bounds === null).toBe(false)
    const [[west, south], [east, north]] = bounds!
    expect(west <= 85.3).toBe(true)
    expect(east >= 85.4).toBe(true)
    expect(south <= 27.7).toBe(true)
    expect(north >= 27.8).toBe(true)
  })

  test("empty locations yield no bounds", () => {
    expect(localSeoLocationsBounds([])).toBeNull()
  })
})

describe("full-bleed map viewport fit padding", () => {
  test("collapsed, the panel needs no left inset beyond 40px", () => {
    expect(
      localSeoMapFitPadding({ collapsed: true, containerWidth: 340 })
    ).toEqual({
      top: 96,
      bottom: 40,
      left: 40,
      right: 40,
    })
  })

  test("open with nothing measured falls back to 40px", () => {
    expect(
      localSeoMapFitPadding({ collapsed: false, containerWidth: 0 })
    ).toEqual({
      top: 96,
      bottom: 40,
      left: 40,
      right: 40,
    })
  })

  test("list panel only, the left inset clears it plus a gap", () => {
    expect(
      localSeoMapFitPadding({ collapsed: false, containerWidth: 320 })
    ).toEqual({
      top: 96,
      bottom: 40,
      left: 344,
      right: 40,
    })
  })

  test("with the detail panel open, the left inset clears both panels", () => {
    expect(
      localSeoMapFitPadding({ collapsed: false, containerWidth: 688 })
    ).toEqual({
      top: 96,
      bottom: 40,
      left: 712,
      right: 40,
    })
  })

  test("never grows a right inset from the removed sheet", () => {
    for (const containerWidth of [320, 688]) {
      expect(
        localSeoMapFitPadding({ collapsed: false, containerWidth }).right
      ).toBe(40)
    }
  })
})

describe("no paid requests on mount", () => {
  test("viewport and preview helpers are pure and never fetch", async () => {
    const calls: string[] = []
    const originalFetch = globalThis.fetch
    ;(globalThis as Record<string, unknown>).fetch = (...args: unknown[]) => {
      calls.push(String(args[0]))
      throw new Error("network must stay idle")
    }
    try {
      localSeoLocationsBounds([makeLocation()])
      selectPendingLocalSeoDrafts([makeLocation()])
      selectLocalSeoOverlayCells({ setupActive: true, reportCells: [] })
      frozenLocalSeoRunCenter(makeRun("completed"))
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(calls).toEqual([])
  })
})

describe("initial recorded grid", () => {
  test("selects a saved bound location with frozen samples without a click", () => {
    const draft = makeLocation({ id: "draft" })
    const empty = makeLocation({ id: "empty", place_id: "google-empty" })
    const bound = makeLocation({
      place_id: "google-bound",
      latitude: 30,
      longitude: 90,
    })
    const recorded = makeRun("completed")
    recorded.cells = [
      makeCell({
        point_index: 4,
        ring: "centre",
        latitude: 27.7,
        longitude: 85.3,
      }),
    ]
    const runs = new Map([
      [draft.id, recorded],
      [empty.id, makeRun("queued")],
      [bound.id, recorded],
    ])
    expect(
      selectLocalSeoInitialReportLocation([draft, empty, bound], runs)
    ).toBe(bound)
    expect(frozenLocalSeoRunCenter(recorded)).toEqual([85.3, 27.7])
    expect(selectLocalSeoInitialReportLocation([draft, empty], runs)).toBeNull()
  })
})

describe("generated query drafts", () => {
  test("a regenerated text reuses the existing map record id and metadata", () => {
    const existing = mapQuery("Coffee Shop", {
      id: "q-existing",
      source: "generated",
      enabled: false,
    })
    const drafts = generatedQueryDrafts(["  coffee   shop "], [existing])
    expect(drafts[0].id).toBe("q-existing")
    expect(drafts[0].text).toBe("  coffee   shop ")
    expect(drafts[0].enabled).toBe(false)
    expect(drafts[0].source).toBe("generated")
  })

  test("a new text stays a new generated candidate without an id", () => {
    const drafts = generatedQueryDrafts(
      ["plumber"],
      [mapQuery("coffee", { id: "q-coffee" })]
    )
    expect(drafts[0].id).toBeUndefined()
    expect(drafts[0]).toEqual({
      text: "plumber",
      enabled: true,
      kind: "map",
      source: "generated",
    })
  })
})

describe("landmark refresh query drafts", () => {
  test("a newly created candidate keeps its disabled state, id, and source", () => {
    const drafts: LocalSeoLocationQueryDraft[] = [
      {
        id: "q-saved",
        text: "coffee",
        enabled: true,
        kind: "map",
        source: "manual",
      },
    ]
    const records = [
      mapQuery("coffee", { id: "q-saved" }),
      mapQuery("coffee near Boudhanath", {
        id: "q-land",
        enabled: false,
        source: "generated",
        origin: "landmark",
        landmark_id: "lm-1",
      }),
    ]
    const merged = mergeLocalSeoRefreshedQueryDrafts({
      drafts,
      records,
      previousRecordIds: new Set(["q-saved"]),
    })
    expect(merged.map((draft) => draft.id)).toEqual(["q-saved", "q-land"])
    expect(merged[1]).toEqual({
      id: "q-land",
      text: "coffee near Boudhanath",
      enabled: false,
      kind: "map",
      source: "generated",
    })
  })

  test("user edits, removals, and enablement survive the merge", () => {
    const edited: LocalSeoLocationQueryDraft = {
      id: "q-edited",
      text: "coffee edited",
      enabled: false,
      kind: "map",
      source: "manual",
    }
    const records = [
      mapQuery("coffee", { id: "q-edited" }),
      mapQuery("tea", { id: "q-removed" }),
      mapQuery("bread", {
        id: "q-new",
        enabled: false,
        source: "generated",
        origin: "landmark",
      }),
    ]
    const merged = mergeLocalSeoRefreshedQueryDrafts({
      drafts: [edited],
      records,
      previousRecordIds: new Set(["q-edited", "q-removed"]),
    })
    expect(merged[0]).toBe(edited)
    expect(merged.map((draft) => draft.id)).toEqual(["q-edited", "q-new"])
  })

  test("an unchanged merge returns the same draft reference", () => {
    const drafts: LocalSeoLocationQueryDraft[] = [
      { id: "q-1", text: "a", enabled: true, kind: "map", source: "manual" },
    ]
    expect(
      mergeLocalSeoRefreshedQueryDrafts({
        drafts,
        records: [],
        previousRecordIds: new Set(["q-1"]),
      })
    ).toBe(drafts)
  })

  test("a late response for a location the user left is not current", () => {
    expect(isCurrentLocalSeoLocation("loc-2", "loc-1")).toBe(false)
    expect(isCurrentLocalSeoLocation(null, "loc-1")).toBe(false)
    expect(isCurrentLocalSeoLocation("loc-1", "loc-1")).toBe(true)
  })

  test("service/locality generation carries saved landmark candidates forward", () => {
    const records = [
      mapQuery("coffee", { id: "q-svc", origin: "service" }),
      mapQuery("coffee near Boudhanath", {
        id: "q-land",
        enabled: false,
        source: "generated",
        origin: "landmark",
        landmark_id: "lm-1",
      }),
    ]
    const generated = generatedQueryDrafts(["coffee"], records)
    const drafts: LocalSeoLocationQueryDraft[] = [
      {
        id: "q-svc",
        text: "coffee",
        enabled: true,
        kind: "map",
        source: "manual",
      },
      {
        id: "q-land",
        text: "coffee near Boudhanath",
        enabled: false,
        kind: "map",
        source: "generated",
      },
    ]
    const preserved = preserveLocalSeoLandmarkDrafts({
      generated,
      drafts,
      records,
    })
    expect(preserved.map((draft) => draft.id)).toEqual(["q-svc", "q-land"])
    expect(preserved.at(-1)?.enabled).toBe(false)
  })
})

test("generation keeps every enabled generated query with preserved landmarks", () => {
  const record = mapQuery("coffee near temple", {
    id: "land",
    origin: "landmark",
  })
  const drafts: LocalSeoLocationQueryDraft[] = [
    {
      id: record.id,
      text: record.text,
      enabled: true,
      kind: "map",
      source: "generated",
    },
  ]
  const result = preserveLocalSeoLandmarkDrafts({
    generated: generatedQueryDrafts(
      ["coffee", "tea", "bread", "cake", "milk"],
      []
    ),
    drafts,
    records: [record],
  })
  expect(result.length).toBe(6)
  expect(result.filter((draft) => draft.enabled).length).toBe(6)
  expect(result.at(-1)).toBe(drafts[0])
})

test("generation keeps an edited landmark ID when its text matches a generated query", () => {
  const record = mapQuery("coffee near temple", {
    id: "land",
    origin: "landmark",
  })
  const edited: LocalSeoLocationQueryDraft = {
    id: "land",
    text: "coffee",
    enabled: false,
    kind: "map",
    source: "generated",
  }
  const result = preserveLocalSeoLandmarkDrafts({
    generated: generatedQueryDrafts(["coffee"], []),
    drafts: [edited],
    records: [record],
  })
  expect(result).toEqual([edited])
})
