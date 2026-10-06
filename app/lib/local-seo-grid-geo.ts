import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
  Position,
} from "geojson"

import type { LocalSeoCallStatus, LocalSeoCell } from "~/lib/local-seo-api"
import { LOCAL_SEO_POINT_COUNT, localSeoPointLetter } from "~/lib/local-seo-api"

/** Mean earth radius in metres, the same constant as backend BuildGeoGrid. */
export const LOCAL_SEO_EARTH_RADIUS_M = 6371000

/** Longitude-latitude pair in GeoJSON order. */
export type GridGeoPosition = Position

/** A single grid cell polygon in GeoJSON form. */
export type GridGeoPolygon = Polygon

/** Rank ramp output for one cell, ready to hand to MapLibre paint. */
export type GridGeoCellStyle = {
  fill: string
  stroke: string
  opacity: number
  hatched: boolean
}

/** Paint bucket for one grid cell: a ranked number, an honest absence, a failure, or an unknown. */
export type GridGeoCellStatus = "ranked" | "absent" | "failed" | "pending"

/** What one grid point knows, plus the ramp style and map label for it. */
export type GridGeoCellProperties = GridGeoCellStyle & {
  pointIndex: number
  pointLetter: string
  row: number
  col: number
  /** Found-only mean rank, null unless the point has a real ranked result. */
  rank: number | null
  meanRank?: number
  callStatus: LocalSeoCallStatus
  found: boolean
  status: GridGeoCellStatus
  /** "A · 10" style label: point letter, then the honest value. Absent never shows 0 or 21. */
  label: string
  /** The honest value on its own: a rank number, Not found, Failed, or Unknown. */
  gridValue: string
  /** Exact frozen sample coordinates, or the spherical preview fallback. */
  latitude: number
  longitude: number
}

/** One grid cell feature with real GeoJSON types. */
export type GridGeoFeature = Feature<Polygon, GridGeoCellProperties>

/** Nine grid cell features with real GeoJSON types. */
export type GridGeoFeatureCollection = FeatureCollection<
  Polygon,
  GridGeoCellProperties
>

/** Measurement lattice line kind: the outer square edge or a centre spoke. */
export type GridMeasurementKind = "spoke" | "square"

/** One lattice line: the outer square edge or a centre spoke. */
export type GridMeasurementProperties = {
  kind: GridMeasurementKind
}

/** The measurement lattice drawn over the sampled radius. */
export type GridMeasurementFeatureCollection = FeatureCollection<
  LineString,
  GridMeasurementProperties
>

/** Measurement distance label kind: a corner spoke, an edge spoke, or the radius. */
export type GridMeasurementLabelKind = "corner" | "edge" | "radius"

/** One distance label point and its formatted distance string. */
export type GridMeasurementLabelProperties = {
  kind: GridMeasurementLabelKind
  label: string
}

/** Point candidates for the measurement lattice distance labels. */
export type GridMeasurementLabelFeatureCollection = FeatureCollection<
  Point,
  GridMeasurementLabelProperties
>

/**
 * What gridFeatureCollection reads per cell. Frozen latitude/longitude anchor
 * the historical grid exactly; when absent the spherical preview stands in.
 */
export type GridGeoCellSummary = Pick<
  LocalSeoCell,
  "point_index" | "call_status" | "match_status" | "rank"
> &
  Partial<Pick<LocalSeoCell, "latitude" | "longitude">>

/** lon,lat order: OpenStreetMap places and GeoJSON both put longitude first. */
export type GridGeoCentre = [longitude: number, latitude: number]

const GRID_COLS = 3
/** Cell edge share of the radius step, the same size the backend uses. */
const GRID_CELL_HALF_EXTENT_SHARE = 0.34
const GRID_RADIUS_DIVISOR = 5
const DEFAULT_RING_SEGMENTS = 96
/** The eight outer grid points around the centre, corners at radius and edge midpoints at radius/sqrt(2). */
const GRID_OUTER_POINT_INDICES = [0, 1, 2, 3, 5, 6, 7, 8]
/** Corner points clockwise from the north-west corner, the outer square's ring order. */
const GRID_CORNER_RING = [0, 2, 8, 6]
/** A distance label sits this share along its spoke, never at the midpoint. */
const GRID_MEASUREMENT_LABEL_ALONG_SHARE = 0.45
/** A distance label is pushed this share of its spoke length sideways off the line. */
const GRID_MEASUREMENT_LABEL_LATERAL_SHARE = 0.06
/** The radius label sits this share of the radius inside the circle. */
const GRID_MEASUREMENT_RADIUS_LABEL_INSET_SHARE = 0.1

const RANK_ACCENT = "#047857"
const MUTED_FILL = "#64748b"
/** One light slate outline family for every cell, so the grid reads as map furniture. */
const GRID_STROKE = "#94a3b8"
const ABSENT_FILL = "#ffffff"
const PENDING_FILL = "#f1f5f9"
const FAILED_FILL = "#fef3c7"

/**
 * Row-major index over the 3x3 grid. Row 0 is north, column 0 is west, so
 * index 0 is the north-west corner and index 4 is the centre. This matches
 * the backend BuildGeoGrid point order that produced every stored run cell.
 */
export function gridPointIndex(pointIndex: number): {
  row: number
  col: number
} {
  const row = Math.floor(pointIndex / GRID_COLS)
  return { row, col: pointIndex % GRID_COLS }
}

/** The nine cells, index 0 at the north-west corner and index 4 at the centre. */
export const GRID_POINT_INDICES: number[] = Array.from(
  { length: LOCAL_SEO_POINT_COUNT },
  (_, index) => index
)

/**
 * Spherical destination of a planar sampling offset, the one helper for both
 * the preview grid and the radius circle. Same operation order and longitude
 * normalization as backend BuildGeoGrid: distance is hypot(east, north),
 * bearing is atan2(east, north), then the great-circle destination on the
 * 6371000 m earth, with longitudes wrapped into [-180, 180].
 */
export function gridDestinationPoint(
  centre: GridGeoCentre,
  distanceM: number,
  bearingRad: number
): GridGeoPosition {
  const [longitude, latitude] = centre
  const latRad = (latitude * Math.PI) / 180
  const lonRad = (longitude * Math.PI) / 180
  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  const angular = distanceM / LOCAL_SEO_EARTH_RADIUS_M
  const pointLat = Math.asin(
    sinLat * Math.cos(angular) +
      cosLat * Math.sin(angular) * Math.cos(bearingRad)
  )
  const pointLon =
    lonRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angular) * cosLat,
      Math.cos(angular) - sinLat * Math.sin(pointLat)
    )
  let normalized = ((pointLon * 180) / Math.PI + 180) % 360
  if (normalized < 0) normalized += 360
  return [normalized - 180, (pointLat * 180) / Math.PI]
}

/** Planar east/north offset of one grid point, corners at radius and edges at radius/sqrt(2). */
function gridPointOffsetM(
  pointIndex: number,
  radiusM: number
): {
  eastM: number
  northM: number
} {
  const halfWidth = radiusM / Math.SQRT2
  const { row, col } = gridPointIndex(pointIndex)
  return { eastM: (col - 1) * halfWidth, northM: (1 - row) * halfWidth }
}

/** Spherical preview of one grid point, used only when no frozen coordinates exist. */
function gridPreviewAnchor(
  pointIndex: number,
  centre: GridGeoCentre,
  radiusM: number
): GridGeoCentre {
  const { eastM, northM } = gridPointOffsetM(pointIndex, radiusM)
  const [longitude, latitude] = gridDestinationPoint(
    centre,
    Math.hypot(eastM, northM),
    Math.atan2(eastM, northM)
  )
  return [longitude, latitude]
}

/** First finite frozen coordinate in the group, the exact historical anchor. */
function frozenAnchor(cells: GridGeoCellSummary[]): GridGeoCentre | null {
  for (const cell of cells) {
    if (
      typeof cell.latitude === "number" &&
      typeof cell.longitude === "number" &&
      Number.isFinite(cell.latitude) &&
      Number.isFinite(cell.longitude)
    ) {
      const anchor: GridGeoCentre = [cell.longitude, cell.latitude]
      return anchor
    }
  }
  return null
}

/** Half the cell edge in metres, the same size the backend uses. */
export function gridCellHalfExtentM(radiusM: number): number {
  return (radiusM / GRID_RADIUS_DIVISOR) * GRID_CELL_HALF_EXTENT_SHARE
}

/** Square cell around one anchor, edges placed by the spherical destination helper. */
function cellPolygonAroundAnchor(
  anchor: GridGeoCentre,
  radiusM: number
): GridGeoPolygon {
  const halfExtent = gridCellHalfExtentM(radiusM)
  const north = gridDestinationPoint(anchor, halfExtent, 0)[1]
  const south = gridDestinationPoint(anchor, halfExtent, Math.PI)[1]
  const east = gridDestinationPoint(anchor, halfExtent, Math.PI / 2)[0]
  const west = gridDestinationPoint(anchor, halfExtent, (3 * Math.PI) / 2)[0]
  const ring: Position[] = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
    [west, north],
  ]
  return { type: "Polygon", coordinates: [ring] }
}

/**
 * Square preview cell for one grid point. The ring is closed because MapLibre
 * drops an open ring, and the corners run north-west, north-east, south-east,
 * south-west so the polygon keeps the GeoJSON winding order.
 */
export function gridCellPolygon(
  pointIndex: number,
  centre: GridGeoCentre,
  radiusM: number
): GridGeoPolygon {
  return cellPolygonAroundAnchor(
    gridPreviewAnchor(pointIndex, centre, radiusM),
    radiusM
  )
}

const ABSENT_STYLE: GridGeoCellStyle = {
  fill: ABSENT_FILL,
  stroke: GRID_STROKE,
  opacity: 0.5,
  hatched: false,
}

const FAILED_STYLE: GridGeoCellStyle = {
  fill: FAILED_FILL,
  stroke: GRID_STROKE,
  opacity: 0.55,
  hatched: true,
}

const PENDING_STYLE: GridGeoCellStyle = {
  fill: PENDING_FILL,
  stroke: GRID_STROKE,
  opacity: 0.6,
  hatched: false,
}

function isGridRank(rank: number | null): rank is number {
  return typeof rank === "number" && Number.isFinite(rank) && rank > 0
}

function isGridSuccess(status: string): boolean {
  return status === "success_empty" || status === "success_nonempty"
}

/**
 * The rank ramp on one accent, tuned for a light Positron basemap. Rank 1 is
 * the deepest accent, ranks through 3 keep the same accent softer (a 1.4
 * found-only mean reads as near-1, not as a new colour), 4 through 10 are
 * muted, and anything lower is muted fainter still. Every state shares the one
 * light slate outline, and a failed call never produces a rank colour while
 * pending never looks failed or absent.
 */
export function rankCellColour(
  rank: number | null,
  status: string
): GridGeoCellStyle {
  if (!isGridSuccess(status)) {
    return status === "pending" ? PENDING_STYLE : FAILED_STYLE
  }
  if (!isGridRank(rank)) return ABSENT_STYLE
  if (rank <= 1) {
    return {
      fill: RANK_ACCENT,
      stroke: GRID_STROKE,
      opacity: 0.32,
      hatched: false,
    }
  }
  if (rank <= 3) {
    return {
      fill: RANK_ACCENT,
      stroke: GRID_STROKE,
      opacity: 0.2,
      hatched: false,
    }
  }
  if (rank <= 10) {
    return {
      fill: MUTED_FILL,
      stroke: GRID_STROKE,
      opacity: 0.14,
      hatched: false,
    }
  }
  return {
    fill: MUTED_FILL,
    stroke: GRID_STROKE,
    opacity: 0.08,
    hatched: false,
  }
}

/**
 * Map label for one cell. Ranked cells show their number, absent cells say
 * Not found (never 0 or 21), failed cells say Failed with no number, and
 * pending cells say Unknown.
 */
export function gridCellLabel(rank: number | null, status: string): string {
  if (!isGridSuccess(status)) {
    return status === "pending" ? "Unknown" : "Failed"
  }
  if (!isGridRank(rank)) return "Not found"
  return Number.isInteger(rank) ? String(rank) : rank.toFixed(1)
}

/**
 * The honest call status for one grid point. A real found rank always wins,
 * so a bad retry never hides a result the table keeps. With no found rank an
 * outstanding pending or failure stays visible as unknown or failed and never
 * masquerades as a completed absence.
 */
function aggregateCallStatus(group: GridGeoCellSummary[]): LocalSeoCallStatus {
  const found = group.some(
    (cell) =>
      isGridSuccess(cell.call_status) &&
      cell.match_status === "found" &&
      isGridRank(cell.rank)
  )
  if (found) return "success_nonempty"
  const statuses = group.map((cell) => cell.call_status)
  if (statuses.includes("pending")) return "pending"
  if (statuses.includes("request_failed")) return "request_failed"
  if (statuses.includes("success_empty")) return "success_empty"
  if (statuses.includes("success_nonempty")) return "success_nonempty"
  return "pending"
}

function meanGridRank(cells: GridGeoCellSummary[]): number | null {
  let sum = 0
  let foundCount = 0
  for (const cell of cells) {
    if (
      isGridSuccess(cell.call_status) &&
      cell.match_status === "found" &&
      isGridRank(cell.rank)
    ) {
      sum += cell.rank
      foundCount += 1
    }
  }
  return foundCount === 0 ? null : sum / foundCount
}

/**
 * One square feature per grid point, anchored at the frozen sample coordinates
 * when the cells carry them and at the spherical preview otherwise. Pass the
 * frozen run centre (point 4) and run.radius_m; never current location edits.
 * Always returns the whole nine-point grid, including points that never
 * produced a result, so the map shows what was sampled rather than only what
 * answered.
 */
export function gridFeatureCollection(
  cells: GridGeoCellSummary[],
  centre: GridGeoCentre,
  radiusM: number
): GridGeoFeatureCollection {
  const byPoint = new Map<number, GridGeoCellSummary[]>()
  for (const cell of cells) {
    const group = byPoint.get(cell.point_index)
    if (group) group.push(cell)
    else byPoint.set(cell.point_index, [cell])
  }

  const features = GRID_POINT_INDICES.map((pointIndex) => {
    const group = byPoint.get(pointIndex) ?? []
    const { row, col } = gridPointIndex(pointIndex)
    const pointLetter = localSeoPointLetter(pointIndex)
    const callStatus = aggregateCallStatus(group)
    const meanRank = meanGridRank(group)
    const gridValue = gridCellLabel(meanRank, callStatus)
    const anchor =
      frozenAnchor(group) ?? gridPreviewAnchor(pointIndex, centre, radiusM)
    const status: GridGeoCellStatus =
      meanRank !== null
        ? "ranked"
        : callStatus === "pending"
          ? "pending"
          : isGridSuccess(callStatus)
            ? "absent"
            : "failed"
    return {
      type: "Feature" as const,
      geometry: cellPolygonAroundAnchor(anchor, radiusM),
      properties: {
        pointIndex,
        pointLetter,
        row,
        col,
        rank: meanRank,
        callStatus,
        found: meanRank !== null,
        status,
        label: `${pointLetter} · ${gridValue}`,
        gridValue,
        latitude: anchor[1],
        longitude: anchor[0],
        ...(meanRank === null ? {} : { meanRank }),
        ...rankCellColour(meanRank, callStatus),
      },
    }
  })

  return { type: "FeatureCollection", features }
}

/**
 * The sampled search radius around the location, one spherical destination per
 * vertex. It is a sampling radius, never a service area: straight-line
 * distance understates roads, traffic, and terrain, so nothing inside it
 * means "you reach everything here".
 */
export function samplingRadiusPolygon(
  centre: GridGeoCentre,
  radiusM: number,
  segments: number = DEFAULT_RING_SEGMENTS
): GridGeoPolygon {
  const ring: Position[] = []
  for (let step = 0; step < segments; step += 1) {
    const bearing = (step / segments) * Math.PI * 2
    ring.push(gridDestinationPoint(centre, radiusM, bearing))
  }
  const first = ring[0]
  ring.push([first[0], first[1]])
  return { type: "Polygon", coordinates: [ring] }
}

/** Trim trailing zeros from a fixed-point string, so 2.0 becomes 2 and 3.50 becomes 3.5. */
function trimTrailingZero(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value
}

/**
 * Human distance label for the measurement lattice. Metres below 1000 m,
 * otherwise km, one decimal with trailing zeros trimmed, so 2000 m reads
 * "2 km" and 3535.53 m reads "3.5 km".
 */
export function formatGridDistanceLabel(distanceM: number): string {
  if (!Number.isFinite(distanceM)) return ""
  if (distanceM < 1000) {
    return `${trimTrailingZero(distanceM.toFixed(1))} m`
  }
  return `${trimTrailingZero((distanceM / 1000).toFixed(1))} km`
}

/**
 * The measurement lattice over the sampled radius: the outer square through
 * the four corner points (four edges) plus eight spokes from the centre to
 * each outer point. Distances come from radiusM itself, corners at radiusM and
 * edge midpoints at radiusM divided by sqrt(2), never from the rendered map.
 * A non-positive or non-finite radius yields an empty collection.
 */
export function gridMeasurementFeatureCollection(
  center: GridGeoCentre,
  radiusM: number
): GridMeasurementFeatureCollection {
  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    return { type: "FeatureCollection", features: [] }
  }
  const features: Feature<LineString, GridMeasurementProperties>[] = []

  GRID_CORNER_RING.forEach((pointIndex, order) => {
    const to = gridPreviewAnchor(
      GRID_CORNER_RING[(order + 1) % GRID_CORNER_RING.length],
      center,
      radiusM
    )
    features.push({
      type: "Feature",
      properties: { kind: "square" },
      geometry: {
        type: "LineString",
        coordinates: [gridPreviewAnchor(pointIndex, center, radiusM), to],
      },
    })
  })

  GRID_OUTER_POINT_INDICES.forEach((pointIndex) => {
    features.push({
      type: "Feature",
      properties: { kind: "spoke" },
      geometry: {
        type: "LineString",
        coordinates: [center, gridPreviewAnchor(pointIndex, center, radiusM)],
      },
    })
  })

  return { type: "FeatureCollection", features }
}

/** Planar offset of one spoke's distance label, pushed sideways off the line. */
function gridMeasurementLabelOffsetM(
  pointIndex: number,
  radiusM: number
): {
  eastM: number
  northM: number
} {
  const { eastM, northM } = gridPointOffsetM(pointIndex, radiusM)
  const length = Math.hypot(eastM, northM)
  if (length === 0) return { eastM: 0, northM: 0 }
  const lateral = length * GRID_MEASUREMENT_LABEL_LATERAL_SHARE
  return {
    eastM:
      eastM * GRID_MEASUREMENT_LABEL_ALONG_SHARE + (-northM / length) * lateral,
    northM:
      northM * GRID_MEASUREMENT_LABEL_ALONG_SHARE + (eastM / length) * lateral,
  }
}

/** Spherical point for one spoke's distance label, off the dashed line. */
function gridMeasurementLabelPoint(
  pointIndex: number,
  center: GridGeoCentre,
  radiusM: number
): GridGeoPosition {
  const { eastM, northM } = gridMeasurementLabelOffsetM(pointIndex, radiusM)
  return gridDestinationPoint(
    center,
    Math.hypot(eastM, northM),
    Math.atan2(eastM, northM)
  )
}

/**
 * The distance labels for the measurement lattice: one per spoke, edge spokes
 * at radius divided by sqrt(2) and corner spokes at radiusM, plus one radius
 * label just south of the circle. Labels are Point features so the map places
 * each one off its line instead of along it. A non-positive radius yields none.
 */
export function gridMeasurementLabelCollection(
  center: GridGeoCentre,
  radiusM: number
): GridMeasurementLabelFeatureCollection {
  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    return { type: "FeatureCollection", features: [] }
  }
  const cornerLabel = formatGridDistanceLabel(radiusM)
  const edgeLabel = formatGridDistanceLabel(radiusM / Math.SQRT2)
  const features: Feature<Point, GridMeasurementLabelProperties>[] = []

  GRID_OUTER_POINT_INDICES.forEach((pointIndex) => {
    const corner = GRID_CORNER_RING.includes(pointIndex)
    features.push({
      type: "Feature",
      properties: {
        kind: corner ? "corner" : "edge",
        label: corner ? cornerLabel : edgeLabel,
      },
      geometry: {
        type: "Point",
        coordinates: gridMeasurementLabelPoint(pointIndex, center, radiusM),
      },
    })
  })

  features.push({
    type: "Feature",
    properties: { kind: "radius", label: `${cornerLabel} radius` },
    geometry: {
      type: "Point",
      coordinates: gridDestinationPoint(
        center,
        radiusM * (1 - GRID_MEASUREMENT_RADIUS_LABEL_INSET_SHARE),
        Math.PI
      ),
    },
  })

  return { type: "FeatureCollection", features }
}

/**
 * Diameter and ring stroke width in CSS pixels for a business pin, so the page
 * can size markers without repeating the numbers. Selected pins sit a step
 * larger with a heavier ring than idle ones.
 */
export function pinVisualForState(state: "selected" | "idle"): {
  size: number
  ring: number
} {
  return state === "selected" ? { size: 32, ring: 3 } : { size: 28, ring: 2 }
}
