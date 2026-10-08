import { describe, expect, test } from "bun:test"

import {
  validateLocalSeoQueries,
  validateLocalSeoRadiusM,
} from "~/lib/local-seo-api"
import type { LocalSeoCell, LocalSeoSector } from "~/lib/local-seo-api"
import {
  findLocalSeoCentreCell,
  formatLocalSeoEmptyMeanRank,
  formatLocalSeoMeanRank,
  summarizeLocalSeoGridCells,
} from "~/lib/local-seo-directional"

function makeLocalSeoCell(overrides: Partial<LocalSeoCell>): LocalSeoCell {
  return {
    query_index: 0,
    point_index: 0,
    latitude: 0,
    longitude: 0,
    distance_m: 0,
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

const LOCAL_SEO_TEST_BOARD_SECTORS: LocalSeoSector[] = [
  "NW",
  "N",
  "NE",
  "W",
  "centre",
  "E",
  "SW",
  "S",
  "SE",
]

const LOCAL_SEO_TIE_DIRECTION_RANKS: Partial<Record<LocalSeoSector, number[]>> =
  {
    W: [1, 1, 1, 1, 3],
    E: [1, 1, 1, 1, 3],
    centre: [1, 1, 1, 2, 3],
  }

/** Nepal fixture: two tied found directions, six clean misses, no unknowns. */
function makeLocalSeoTieCells(): LocalSeoCell[] {
  const cells: LocalSeoCell[] = []
  LOCAL_SEO_TEST_BOARD_SECTORS.forEach((sector, point) => {
    const ranks = LOCAL_SEO_TIE_DIRECTION_RANKS[sector]
    for (let query = 0; query < 5; query++) {
      const rank = ranks ? ranks[query] : null
      cells.push(
        makeLocalSeoCell({
          point_index: point,
          query_index: query,
          distance_m: point === 4 ? 0 : 5000,
          ring: point === 4 ? "centre" : point % 2 === 0 ? "corner" : "edge",
          sector,
          match_status: rank === null ? "absent" : "found",
          rank,
        })
      )
    }
  })
  return cells
}

describe("validateLocalSeoQueries", () => {
  test("rejects duplicates ignoring case and surrounding spaces", () => {
    expect(
      validateLocalSeoQueries(["Coffee", " coffee ", "tea", "bistro", "diner"])
    ).toBe(
      "Queries must all be distinct, ignoring case and surrounding spaces."
    )
  })

  test("rejects queries over 500 UTF-8 bytes", () => {
    expect(validateLocalSeoQueries(["a".repeat(501), "b", "c", "d", "e"])).toBe(
      "Queries must each fit within 500 bytes."
    )
    expect(validateLocalSeoQueries(["é".repeat(251), "b", "c", "d", "e"])).toBe(
      "Queries must each fit within 500 bytes."
    )
  })

  test("requires at least one query and accepts more than five", () => {
    expect(validateLocalSeoQueries([])).toBe(
      "At least 1 query is required, got 0."
    )
    expect(validateLocalSeoQueries(["a", "b", "c", "d", "e"])).toBeNull()
    expect(
      validateLocalSeoQueries(["a", "b", "c", "d", "e", "f"])
    ).toBeNull()
    expect(
      validateLocalSeoQueries(["a".repeat(500), "b", "c", "d", "e"])
    ).toBeNull()
  })
})

describe("validateLocalSeoRadiusM", () => {
  test("rejects non-integers, non-finite values, and out-of-range radii", () => {
    expect(validateLocalSeoRadiusM(5000.5)).toBe(
      "Radius must be a whole number of metres."
    )
    expect(validateLocalSeoRadiusM(Number.POSITIVE_INFINITY)).toBe(
      "Radius must be a number."
    )
    expect(validateLocalSeoRadiusM(999)).toBe(
      "Radius must be between 1000 and 25000 metres."
    )
    expect(validateLocalSeoRadiusM(5000)).toBeNull()
  })
})

describe("summarizeLocalSeoGridCells mean ranks", () => {
  test("means use found numeric ranks only", () => {
    const cells = [
      makeLocalSeoCell({ point_index: 1, ring: "edge", sector: "N", rank: 2 }),
      makeLocalSeoCell({
        point_index: 1,
        ring: "edge",
        sector: "N",
        query_index: 1,
        rank: 4,
      }),
      makeLocalSeoCell({
        point_index: 1,
        ring: "edge",
        sector: "N",
        query_index: 2,
        match_status: "absent",
        call_status: "success_nonempty",
        rank: null,
      }),
      makeLocalSeoCell({
        point_index: 1,
        ring: "edge",
        sector: "N",
        query_index: 3,
        match_status: "unknown",
        call_status: "request_failed",
        rank: null,
        error: "timeout",
      }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, null)
    const point = summary.points.find((entry) => entry.pointIndex === 1)
    expect(point?.meanRank).toBe(3)
    expect(point?.foundCount).toBe(2)
    expect(point?.absentCount).toBe(1)
    // Failed calls are unknown, not coverage, and never move the mean.
    expect(point?.unknownCount).toBe(1)
    expect(point?.totalCount).toBe(4)
  })

  test("a found match without a numeric rank never invents a rank", () => {
    const cells = [
      makeLocalSeoCell({
        point_index: 4,
        ring: "centre",
        sector: "centre",
        rank: null,
      }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, null)
    expect(summary.points[0].meanRank).toBeNull()
    expect(summary.points[0].unknownCount).toBe(1)
    expect(summary.centerMeanRank).toBeNull()
  })

  test("query focus narrows the aggregation and exposes individual ranks", () => {
    const cells = [
      makeLocalSeoCell({ point_index: 0, ring: "edge", sector: "N", rank: 1 }),
      makeLocalSeoCell({
        point_index: 0,
        ring: "edge",
        sector: "N",
        query_index: 1,
        rank: 9,
      }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, 1)
    expect(summary.points).toHaveLength(1)
    expect(summary.points[0].meanRank).toBe(9)
    expect(summary.points[0].focusedRank).toBe(9)
    expect(summary.points[0].focusedMatchStatus).toBe("found")
  })

  test("different means name the sampled extremes, centre excluded", () => {
    const cells = [
      makeLocalSeoCell({
        point_index: 4,
        ring: "centre",
        sector: "centre",
        rank: 1,
      }),
      makeLocalSeoCell({
        point_index: 0,
        ring: "corner",
        sector: "NE",
        rank: 2,
      }),
      makeLocalSeoCell({ point_index: 1, ring: "edge", sector: "S", rank: 8 }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, null)
    expect(summary.rankComparison).toEqual({
      kind: "different",
      strongest: ["NE"],
      weakest: ["S"],
    })
    expect(summary.centerMeanRank).toBe(1)
  })

  test("empty input stays empty with no comparison", () => {
    const summary = summarizeLocalSeoGridCells([], null)
    expect(summary.points).toHaveLength(0)
    expect(summary.centerMeanRank).toBeNull()
    expect(summary.rankComparison).toEqual({ kind: "none" })
    expect(summary.directionCounts).toEqual({
      present: 0,
      absent: 0,
      unknown: 8,
    })
    expect(summary.sectors).toHaveLength(8)
    expect(summary.rings).toHaveLength(3)
  })

  test("tied found means name every tied direction and no extremes", () => {
    const summary = summarizeLocalSeoGridCells(makeLocalSeoTieCells(), null)
    expect(summary.directionCounts).toEqual({
      present: 2,
      absent: 6,
      unknown: 0,
    })
    expect(summary.rankComparison).toEqual({
      kind: "tie",
      directions: ["E", "W"],
      meanRank: 1.4,
    })
    expect(summary.centerMeanRank).toBe(1.6)
  })

  test("different means name every tied extreme direction", () => {
    const cells = [
      ...[1, 1, 1, 1, 3].map((rank, query) =>
        makeLocalSeoCell({
          point_index: 5,
          sector: "E",
          ring: "edge",
          query_index: query,
          rank,
        })
      ),
      ...[1, 1, 1, 1, 3].map((rank, query) =>
        makeLocalSeoCell({
          point_index: 3,
          sector: "W",
          ring: "edge",
          query_index: query,
          rank,
        })
      ),
      ...[5, 5, 5, 5, 5].map((rank, query) =>
        makeLocalSeoCell({
          point_index: 1,
          sector: "N",
          ring: "edge",
          query_index: query,
          rank,
        })
      ),
    ]
    const summary = summarizeLocalSeoGridCells(cells, null)
    expect(summary.rankComparison).toEqual({
      kind: "different",
      strongest: ["E", "W"],
      weakest: ["N"],
    })
  })

  test("single found direction reports one direction and no comparison", () => {
    const cells = [
      makeLocalSeoCell({ point_index: 5, sector: "E", ring: "edge", rank: 2 }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, null)
    expect(summary.rankComparison).toEqual({
      kind: "single",
      direction: "E",
      meanRank: 2,
    })
    expect(summary.directionCounts).toEqual({
      present: 1,
      absent: 0,
      unknown: 7,
    })
  })

  test("failed and pending calls are unknown and never add a rank", () => {
    const cells = [
      makeLocalSeoCell({ point_index: 5, sector: "E", ring: "edge", rank: 1 }),
      makeLocalSeoCell({
        point_index: 5,
        sector: "E",
        ring: "edge",
        query_index: 1,
        call_status: "request_failed",
        match_status: "found",
        rank: 2,
        error: "timeout",
      }),
      makeLocalSeoCell({
        point_index: 5,
        sector: "E",
        ring: "edge",
        query_index: 2,
        call_status: "pending",
        match_status: "unknown",
        rank: null,
      }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, null)
    const east = summary.sectors.find((entry) => entry.sector === "E")
    expect(east?.meanRank).toBe(1)
    expect(east?.foundCount).toBe(1)
    expect(east?.unknownCount).toBe(2)
    expect(east?.totalCount).toBe(3)
    expect(summary.rankComparison).toEqual({
      kind: "single",
      direction: "E",
      meanRank: 1,
    })
  })

  test("direction counts separate clean misses from unresolved samples", () => {
    const cells = [
      makeLocalSeoCell({ point_index: 5, sector: "E", ring: "edge", rank: 2 }),
      makeLocalSeoCell({
        point_index: 3,
        sector: "W",
        ring: "edge",
        match_status: "absent",
        rank: null,
      }),
      makeLocalSeoCell({
        point_index: 1,
        sector: "N",
        ring: "edge",
        call_status: "request_failed",
        match_status: "unknown",
        rank: null,
      }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, null)
    expect(summary.directionCounts).toEqual({
      present: 1,
      absent: 1,
      unknown: 6,
    })
  })

  test("a found rank that is not finite and positive is unknown", () => {
    const cells = [
      makeLocalSeoCell({ point_index: 1, sector: "N", ring: "edge", rank: 0 }),
      makeLocalSeoCell({
        point_index: 1,
        sector: "N",
        ring: "edge",
        query_index: 1,
        rank: -2,
      }),
      makeLocalSeoCell({
        point_index: 1,
        sector: "N",
        ring: "edge",
        query_index: 2,
        rank: Number.POSITIVE_INFINITY,
      }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, null)
    const north = summary.sectors.find((entry) => entry.sector === "N")
    expect(north?.foundCount).toBe(0)
    expect(north?.unknownCount).toBe(3)
    expect(north?.meanRank).toBeNull()
    expect(summary.rankComparison).toEqual({ kind: "none" })
  })

  test("raw means are compared, so values that format alike stay different", () => {
    const cells = [
      ...[1, 1, 1, 1, 3].map((rank, query) =>
        makeLocalSeoCell({
          point_index: 3,
          sector: "W",
          ring: "edge",
          query_index: query,
          rank,
        })
      ),
      ...[1, 1, 1, 1, 1, 1, 1, 4].map((rank, query) =>
        makeLocalSeoCell({
          point_index: 5,
          sector: "E",
          ring: "edge",
          query_index: query,
          rank,
        })
      ),
    ]
    const summary = summarizeLocalSeoGridCells(cells, null)
    const east = summary.sectors.find((entry) => entry.sector === "E")
    const west = summary.sectors.find((entry) => entry.sector === "W")
    expect(formatLocalSeoMeanRank(east?.meanRank ?? null)).toBe("1.4")
    expect(formatLocalSeoMeanRank(west?.meanRank ?? null)).toBe("1.4")
    expect(summary.rankComparison.kind).toBe("different")
  })
})

describe("formatLocalSeoMeanRank", () => {
  test("null renders an em dash", () => {
    expect(formatLocalSeoMeanRank(null)).toBe("—")
    expect(formatLocalSeoMeanRank(3.25)).toBe("3.3")
  })
})

describe("formatLocalSeoEmptyMeanRank", () => {
  test("all-absent reads Absent, anything unresolved reads em dash", () => {
    expect(formatLocalSeoEmptyMeanRank(5, 0)).toBe("Absent")
    expect(formatLocalSeoEmptyMeanRank(0, 5)).toBe("—")
    expect(formatLocalSeoEmptyMeanRank(3, 2)).toBe("—")
    expect(formatLocalSeoEmptyMeanRank(0, 0)).toBe("—")
  })
})

describe("focused query rank honesty", () => {
  test("failed or pending calls never expose a focused rank or found/absent status", () => {
    const cells = [
      makeLocalSeoCell({
        point_index: 0,
        ring: "edge",
        sector: "N",
        query_index: 2,
        call_status: "request_failed",
        match_status: "found",
        rank: 2,
        error: "timeout",
      }),
      makeLocalSeoCell({
        point_index: 1,
        ring: "edge",
        sector: "S",
        query_index: 2,
        call_status: "pending",
        match_status: "found",
        rank: 3,
      }),
      makeLocalSeoCell({
        point_index: 2,
        ring: "corner",
        sector: "NE",
        query_index: 2,
        call_status: "request_failed",
        match_status: "absent",
        rank: null,
        error: "timeout",
      }),
      makeLocalSeoCell({
        point_index: 3,
        ring: "edge",
        sector: "W",
        query_index: 2,
        rank: 4,
      }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, 2)
    const bySector = new Map(
      summary.points.map((point) => [point.sector, point])
    )
    expect(bySector.get("N")?.focusedRank).toBeNull()
    expect(bySector.get("N")?.focusedMatchStatus).toBe("unknown")
    expect(bySector.get("S")?.focusedRank).toBeNull()
    expect(bySector.get("S")?.focusedMatchStatus).toBe("unknown")
    expect(bySector.get("NE")?.focusedRank).toBeNull()
    expect(bySector.get("NE")?.focusedMatchStatus).toBe("unknown")
    expect(bySector.get("W")?.focusedRank).toBe(4)
    expect(bySector.get("W")?.focusedMatchStatus).toBe("found")
  })

  test("malformed successful focused cells hide the rank but keep their status", () => {
    const cells = [
      makeLocalSeoCell({
        point_index: 0,
        ring: "edge",
        sector: "N",
        query_index: 1,
        rank: null,
      }),
      makeLocalSeoCell({
        point_index: 1,
        ring: "edge",
        sector: "S",
        query_index: 1,
        rank: 0,
      }),
    ]
    const summary = summarizeLocalSeoGridCells(cells, 1)
    const bySector = new Map(
      summary.points.map((point) => [point.sector, point])
    )
    expect(bySector.get("N")?.focusedRank).toBeNull()
    expect(bySector.get("N")?.focusedMatchStatus).toBe("found")
    expect(bySector.get("S")?.focusedRank).toBeNull()
    expect(bySector.get("S")?.focusedMatchStatus).toBe("found")
  })
})

describe("findLocalSeoCentreCell", () => {
  test("returns the centre cell for a normal run", () => {
    const centre = makeLocalSeoCell({ point_index: 4, ring: "centre" })
    const cells = [
      makeLocalSeoCell({ point_index: 0, ring: "corner", sector: "NW" }),
      centre,
      makeLocalSeoCell({ point_index: 8, ring: "corner", sector: "SE" }),
    ]
    expect(findLocalSeoCentreCell(cells)).toBe(centre)
  })

  test("returns null when only non-centre cells exist", () => {
    const cells = [
      makeLocalSeoCell({ point_index: 4, ring: "corner", sector: "NW" }),
      makeLocalSeoCell({ point_index: 0, ring: "centre", sector: "centre" }),
    ]
    expect(findLocalSeoCentreCell(cells)).toBeNull()
  })

  test("returns null for an empty list", () => {
    expect(findLocalSeoCentreCell([])).toBeNull()
  })
})
