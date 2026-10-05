import type {
  LocalSeoCell,
  LocalSeoMatchStatus,
  LocalSeoRing,
  LocalSeoSector,
} from "~/lib/local-seo-api"
import { LOCAL_SEO_COMPASS_SECTORS } from "~/lib/local-seo-api"

/**
 * One grid point aggregated over the sampled queries. Mean rank uses found
 * numeric ranks only; absent and unknown samples count but never invent one.
 */
export type LocalSeoPointSummary = {
  pointIndex: number
  ring: LocalSeoRing
  sector: LocalSeoSector
  meanRank: number | null
  foundCount: number
  absentCount: number
  unknownCount: number
  totalCount: number
  focusedRank: number | null
  focusedMatchStatus: LocalSeoMatchStatus | null
}

export type LocalSeoRingSummary = {
  ring: LocalSeoRing
  meanRank: number | null
  foundCount: number
  absentCount: number
  unknownCount: number
  totalCount: number
}

export type LocalSeoSectorSummary = {
  sector: LocalSeoSector
  meanRank: number | null
  foundCount: number
  absentCount: number
  unknownCount: number
  totalCount: number
}

/**
 * Display calculation over loaded run cells. Direction labels describe the
 * sampled points only, never roads or continuous coverage. Every scoped
 * planned cell counts; pending or failed calls are unknown, not coverage.
 */
export type LocalSeoDirectionalSummary = {
  selectedQueryIndex: number | null
  points: LocalSeoPointSummary[]
  centerMeanRank: number | null
  rings: LocalSeoRingSummary[]
  sectors: LocalSeoSectorSummary[]
  directionCounts: LocalSeoDirectionCounts
  rankComparison: LocalSeoDirectionComparison
}

/**
 * Coverage across the eight sampled directions: present has a found rank,
 * absent looked and missed cleanly, and anything else is unresolved.
 */
export type LocalSeoDirectionCounts = {
  present: number
  absent: number
  unknown: number
}

/** Found-only comparison of the eight sampled directions. */
export type LocalSeoDirectionComparison =
  | { kind: "none" }
  | { kind: "single"; direction: LocalSeoSector; meanRank: number }
  | { kind: "tie"; directions: LocalSeoSector[]; meanRank: number }
  | {
      kind: "different"
      strongest: LocalSeoSector[]
      weakest: LocalSeoSector[]
    }

const LOCAL_SEO_RINGS: LocalSeoRing[] = ["centre", "edge", "corner"]

export const LOCAL_SEO_CENTRE_POINT_INDEX = 4

export function findLocalSeoCentreCell(
  cells: LocalSeoCell[]
): LocalSeoCell | null {
  return (
    cells.find(
      (cell) =>
        cell.point_index === LOCAL_SEO_CENTRE_POINT_INDEX &&
        cell.ring === "centre"
    ) ?? null
  )
}

type LocalSeoRankAccumulator = {
  sum: number
  foundCount: number
  absentCount: number
  unknownCount: number
}

function newLocalSeoRankAccumulator(): LocalSeoRankAccumulator {
  return { sum: 0, foundCount: 0, absentCount: 0, unknownCount: 0 }
}

/** Only a finite positive value is a usable rank; anything else is unknown. */
function isValidLocalSeoRank(rank: number | null): rank is number {
  return typeof rank === "number" && Number.isFinite(rank) && rank > 0
}

function addLocalSeoCellToAccumulator(
  accumulator: LocalSeoRankAccumulator,
  cell: LocalSeoCell
) {
  if (
    cell.call_status !== "success_empty" &&
    cell.call_status !== "success_nonempty"
  ) {
    accumulator.unknownCount += 1
    return
  }
  if (cell.match_status === "found" && isValidLocalSeoRank(cell.rank)) {
    accumulator.sum += cell.rank
    accumulator.foundCount += 1
  } else if (cell.match_status === "absent") {
    accumulator.absentCount += 1
  } else {
    accumulator.unknownCount += 1
  }
}

function meanOfLocalSeoAccumulator(
  accumulator: LocalSeoRankAccumulator
): number | null {
  if (accumulator.foundCount === 0) return null
  return accumulator.sum / accumulator.foundCount
}

/**
 * Means are sums over found counts, so two distinct means differ by at least
 * roughly 1/(45 * 45). A 1e-9 tolerance absorbs float noise without merging
 * values that only look equal after rounding to one decimal.
 */
const LOCAL_SEO_MEAN_TOLERANCE = 1e-9

function compareLocalSeoDirectionMeans(
  sectors: LocalSeoSectorSummary[]
): LocalSeoDirectionComparison {
  const found = sectors.filter(
    (sector): sector is LocalSeoSectorSummary & { meanRank: number } =>
      sector.meanRank !== null
  )
  if (found.length === 0) return { kind: "none" }
  if (found.length === 1) {
    return {
      kind: "single",
      direction: found[0].sector,
      meanRank: found[0].meanRank,
    }
  }
  const within = (value: number, target: number) =>
    Math.abs(value - target) <= LOCAL_SEO_MEAN_TOLERANCE
  const lowest = Math.min(...found.map((sector) => sector.meanRank))
  const highest = Math.max(...found.map((sector) => sector.meanRank))
  if (within(highest, lowest)) {
    return {
      kind: "tie",
      directions: found.map((sector) => sector.sector),
      meanRank: found[0].meanRank,
    }
  }
  return {
    kind: "different",
    strongest: found
      .filter((sector) => within(sector.meanRank, lowest))
      .map((sector) => sector.sector),
    weakest: found
      .filter((sector) => within(sector.meanRank, highest))
      .map((sector) => sector.sector),
  }
}

/** Means always use found numeric ranks only. */
export function summarizeLocalSeoGridCells(
  cells: LocalSeoCell[],
  selectedQueryIndex: number | null
): LocalSeoDirectionalSummary {
  const scoped =
    selectedQueryIndex === null
      ? cells
      : cells.filter((cell) => cell.query_index === selectedQueryIndex)

  const byPoint = new Map<number, LocalSeoCell[]>()
  for (const cell of scoped) {
    const group = byPoint.get(cell.point_index)
    if (group) group.push(cell)
    else byPoint.set(cell.point_index, [cell])
  }

  const points: LocalSeoPointSummary[] = [...byPoint.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pointIndex, group]) => {
      const accumulator = newLocalSeoRankAccumulator()
      for (const cell of group) addLocalSeoCellToAccumulator(accumulator, cell)
      const focusedCell =
        selectedQueryIndex === null
          ? undefined
          : group.find((cell) => cell.query_index === selectedQueryIndex)
      const focusedCallSucceeded =
        focusedCell?.call_status === "success_empty" ||
        focusedCell?.call_status === "success_nonempty"
      return {
        pointIndex,
        ring: group[0].ring,
        sector: group[0].sector,
        meanRank: meanOfLocalSeoAccumulator(accumulator),
        foundCount: accumulator.foundCount,
        absentCount: accumulator.absentCount,
        unknownCount: accumulator.unknownCount,
        totalCount: group.length,
        focusedRank:
          focusedCallSucceeded &&
          focusedCell?.match_status === "found" &&
          isValidLocalSeoRank(focusedCell.rank)
            ? focusedCell.rank
            : null,
        focusedMatchStatus:
          focusedCell === undefined
            ? null
            : focusedCallSucceeded
              ? focusedCell.match_status
              : "unknown",
      }
    })

  const ringAccumulators = new Map<LocalSeoRing, LocalSeoRankAccumulator>()
  const sectorAccumulators = new Map<LocalSeoSector, LocalSeoRankAccumulator>()
  for (const cell of scoped) {
    let ring = ringAccumulators.get(cell.ring)
    if (!ring) {
      ring = newLocalSeoRankAccumulator()
      ringAccumulators.set(cell.ring, ring)
    }
    addLocalSeoCellToAccumulator(ring, cell)
    let sector = sectorAccumulators.get(cell.sector)
    if (!sector) {
      sector = newLocalSeoRankAccumulator()
      sectorAccumulators.set(cell.sector, sector)
    }
    addLocalSeoCellToAccumulator(sector, cell)
  }

  const rings: LocalSeoRingSummary[] = LOCAL_SEO_RINGS.map((ring) => {
    const accumulator =
      ringAccumulators.get(ring) ?? newLocalSeoRankAccumulator()
    return {
      ring,
      meanRank: meanOfLocalSeoAccumulator(accumulator),
      foundCount: accumulator.foundCount,
      absentCount: accumulator.absentCount,
      unknownCount: accumulator.unknownCount,
      totalCount:
        accumulator.foundCount +
        accumulator.absentCount +
        accumulator.unknownCount,
    }
  })

  const sectors: LocalSeoSectorSummary[] = LOCAL_SEO_COMPASS_SECTORS.map(
    (sector) => {
      const accumulator =
        sectorAccumulators.get(sector) ?? newLocalSeoRankAccumulator()
      return {
        sector,
        meanRank: meanOfLocalSeoAccumulator(accumulator),
        foundCount: accumulator.foundCount,
        absentCount: accumulator.absentCount,
        unknownCount: accumulator.unknownCount,
        totalCount:
          accumulator.foundCount +
          accumulator.absentCount +
          accumulator.unknownCount,
      }
    }
  )

  const centrePoint = points.find((point) => point.sector === "centre")

  const directionCounts: LocalSeoDirectionCounts = {
    present: 0,
    absent: 0,
    unknown: 0,
  }
  for (const sector of sectors) {
    if (sector.foundCount > 0) directionCounts.present += 1
    else if (sector.absentCount > 0 && sector.unknownCount === 0)
      directionCounts.absent += 1
    else directionCounts.unknown += 1
  }

  return {
    selectedQueryIndex,
    points,
    centerMeanRank: centrePoint ? centrePoint.meanRank : null,
    rings,
    sectors,
    directionCounts,
    rankComparison: compareLocalSeoDirectionMeans(sectors),
  }
}

export function formatLocalSeoMeanRank(meanRank: number | null): string {
  if (meanRank === null) return "—"
  return meanRank.toFixed(1)
}

/**
 * Display for a scope with no found rank: Absent only when every sample
 * looked and missed; anything unresolved stays an em dash.
 */
export function formatLocalSeoEmptyMeanRank(
  absentCount: number,
  unknownCount: number
): string {
  return absentCount > 0 && unknownCount === 0 ? "Absent" : "—"
}
