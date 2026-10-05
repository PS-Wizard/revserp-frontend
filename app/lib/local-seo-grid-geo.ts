import type {
  Feature,
  FeatureCollection,
  Polygon,
  Position,
} from "geojson";

import type { LocalSeoCallStatus, LocalSeoCell } from "~/lib/local-seo-api";
import { LOCAL_SEO_POINT_COUNT } from "~/lib/local-seo-api";

/** Mean earth radius in metres, the same constant as backend BuildGeoGrid. */
export const LOCAL_SEO_EARTH_RADIUS_M = 6371000;

/** Longitude-latitude pair in GeoJSON order. */
export type GridGeoPosition = Position;

/** A single grid cell polygon in GeoJSON form. */
export type GridGeoPolygon = Polygon;

/** Rank ramp output for one cell, ready to hand to MapLibre paint. */
export type GridGeoCellStyle = {
  fill: string;
  stroke: string;
  opacity: number;
  hatched: boolean;
};

/** Paint bucket for one grid cell: a ranked number, an honest absence, a failure, or an unknown. */
export type GridGeoCellStatus = "ranked" | "absent" | "failed" | "pending";

/** What one grid point knows, plus the ramp style and map label for it. */
export type GridGeoCellProperties = GridGeoCellStyle & {
  pointIndex: number;
  row: number;
  col: number;
  /** Found-only mean rank, null unless the point has a real ranked result. */
  rank: number | null;
  meanRank?: number;
  callStatus: LocalSeoCallStatus;
  found: boolean;
  status: GridGeoCellStatus;
  /** Rank number, or "Not found", "Failed", or "Unknown". Absent never shows 0 or 21. */
  label: string;
  /** Exact frozen sample coordinates, or the spherical preview fallback. */
  latitude: number;
  longitude: number;
};

/** One grid cell feature with real GeoJSON types. */
export type GridGeoFeature = Feature<Polygon, GridGeoCellProperties>;

/** Nine grid cell features with real GeoJSON types. */
export type GridGeoFeatureCollection = FeatureCollection<
  Polygon,
  GridGeoCellProperties
>;

/**
 * What gridFeatureCollection reads per cell. Frozen latitude/longitude anchor
 * the historical grid exactly; when absent the spherical preview stands in.
 */
export type GridGeoCellSummary = Pick<
  LocalSeoCell,
  "point_index" | "call_status" | "match_status" | "rank"
> &
  Partial<Pick<LocalSeoCell, "latitude" | "longitude">>;

/** lon,lat order: OpenStreetMap places and GeoJSON both put longitude first. */
export type GridGeoCentre = [longitude: number, latitude: number];

const GRID_COLS = 3;
/** Cell edge share of the radius step, the same size the backend uses. */
const GRID_CELL_HALF_EXTENT_SHARE = 0.34;
const GRID_RADIUS_DIVISOR = 5;
const DEFAULT_RING_SEGMENTS = 96;

const RANK_ACCENT = "#047857";
const MUTED_FILL = "#64748b";
/** Neutral outline shared by absent and pending cells on the light basemap. */
const NEUTRAL_STROKE = "#64748b";
/** Darker outline so the muted rank buckets stay legible on white. */
const MUTED_STROKE = "#475569";
const ABSENT_FILL = "#ffffff";
const PENDING_FILL = "#e2e8f0";
const FAILED_FILL = "#fef3c7";
const FAILED_STROKE = "#b45309";

/**
 * Row-major index over the 3x3 grid. Row 0 is north, column 0 is west, so
 * index 0 is the north-west corner and index 4 is the centre. This matches
 * the backend BuildGeoGrid point order that produced every stored run cell.
 */
export function gridPointIndex(pointIndex: number): {
  row: number;
  col: number;
} {
  const row = Math.floor(pointIndex / GRID_COLS);
  return { row, col: pointIndex % GRID_COLS };
}

/** The nine cells, index 0 at the north-west corner and index 4 at the centre. */
export const GRID_POINT_INDICES: number[] = Array.from(
  { length: LOCAL_SEO_POINT_COUNT },
  (_, index) => index,
);

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
  bearingRad: number,
): GridGeoPosition {
  const [longitude, latitude] = centre;
  const latRad = (latitude * Math.PI) / 180;
  const lonRad = (longitude * Math.PI) / 180;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const angular = distanceM / LOCAL_SEO_EARTH_RADIUS_M;
  const pointLat = Math.asin(
    sinLat * Math.cos(angular) +
      cosLat * Math.sin(angular) * Math.cos(bearingRad),
  );
  const pointLon =
    lonRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angular) * cosLat,
      Math.cos(angular) - sinLat * Math.sin(pointLat),
    );
  let normalized = ((pointLon * 180) / Math.PI + 180) % 360;
  if (normalized < 0) normalized += 360;
  return [normalized - 180, (pointLat * 180) / Math.PI];
}

/** Planar east/north offset of one grid point, corners at radius and edges at radius/sqrt(2). */
function gridPointOffsetM(
  pointIndex: number,
  radiusM: number,
): {
  eastM: number;
  northM: number;
} {
  const halfWidth = radiusM / Math.SQRT2;
  const { row, col } = gridPointIndex(pointIndex);
  return { eastM: (col - 1) * halfWidth, northM: (1 - row) * halfWidth };
}

/** Spherical preview of one grid point, used only when no frozen coordinates exist. */
function gridPreviewAnchor(
  pointIndex: number,
  centre: GridGeoCentre,
  radiusM: number,
): GridGeoCentre {
  const { eastM, northM } = gridPointOffsetM(pointIndex, radiusM);
  const [longitude, latitude] = gridDestinationPoint(
    centre,
    Math.hypot(eastM, northM),
    Math.atan2(eastM, northM),
  );
  return [longitude, latitude];
}

/** First finite frozen coordinate in the group, the exact historical anchor. */
function frozenAnchor(
  cells: GridGeoCellSummary[],
): GridGeoCentre | null {
  for (const cell of cells) {
    if (
      typeof cell.latitude === "number" &&
      typeof cell.longitude === "number" &&
      Number.isFinite(cell.latitude) &&
      Number.isFinite(cell.longitude)
    ) {
      const anchor: GridGeoCentre = [cell.longitude, cell.latitude];
      return anchor;
    }
  }
  return null;
}

/** Half the cell edge in metres, the same size the backend uses. */
export function gridCellHalfExtentM(radiusM: number): number {
  return (radiusM / GRID_RADIUS_DIVISOR) * GRID_CELL_HALF_EXTENT_SHARE;
}

/** Square cell around one anchor, edges placed by the spherical destination helper. */
function cellPolygonAroundAnchor(
  anchor: GridGeoCentre,
  radiusM: number,
): GridGeoPolygon {
  const halfExtent = gridCellHalfExtentM(radiusM);
  const north = gridDestinationPoint(anchor, halfExtent, 0)[1];
  const south = gridDestinationPoint(anchor, halfExtent, Math.PI)[1];
  const east = gridDestinationPoint(anchor, halfExtent, Math.PI / 2)[0];
  const west = gridDestinationPoint(anchor, halfExtent, (3 * Math.PI) / 2)[0];
  const ring: Position[] = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
    [west, north],
  ];
  return { type: "Polygon", coordinates: [ring] };
}

/**
 * Square preview cell for one grid point. The ring is closed because MapLibre
 * drops an open ring, and the corners run north-west, north-east, south-east,
 * south-west so the polygon keeps the GeoJSON winding order.
 */
export function gridCellPolygon(
  pointIndex: number,
  centre: GridGeoCentre,
  radiusM: number,
): GridGeoPolygon {
  return cellPolygonAroundAnchor(
    gridPreviewAnchor(pointIndex, centre, radiusM),
    radiusM,
  );
}

const ABSENT_STYLE: GridGeoCellStyle = {
  fill: ABSENT_FILL,
  stroke: NEUTRAL_STROKE,
  opacity: 0.8,
  hatched: false,
};

const FAILED_STYLE: GridGeoCellStyle = {
  fill: FAILED_FILL,
  stroke: FAILED_STROKE,
  opacity: 0.6,
  hatched: true,
};

const PENDING_STYLE: GridGeoCellStyle = {
  fill: PENDING_FILL,
  stroke: NEUTRAL_STROKE,
  opacity: 0.7,
  hatched: false,
};

function isGridRank(rank: number | null): rank is number {
  return typeof rank === "number" && Number.isFinite(rank) && rank > 0;
}

function isGridSuccess(status: string): boolean {
  return status === "success_empty" || status === "success_nonempty";
}

/**
 * The rank ramp on one accent, tuned for a light Positron basemap. Rank 1 is
 * the deepest accent, ranks through 3 keep the same accent softer (a 1.4
 * found-only mean reads as near-1, not as a new colour), 4 through 10 are
 * muted, and anything lower is muted fainter still. Both muted buckets keep a
 * darker stroke so their outline stays legible, and a failed call never
 * produces a rank colour while pending never looks failed or absent.
 */
export function rankCellColour(
  rank: number | null,
  status: string,
): GridGeoCellStyle {
  if (!isGridSuccess(status)) {
    return status === "pending" ? PENDING_STYLE : FAILED_STYLE;
  }
  if (!isGridRank(rank)) return ABSENT_STYLE;
  if (rank <= 1) {
    return { fill: RANK_ACCENT, stroke: RANK_ACCENT, opacity: 0.35, hatched: false };
  }
  if (rank <= 3) {
    return { fill: RANK_ACCENT, stroke: RANK_ACCENT, opacity: 0.22, hatched: false };
  }
  if (rank <= 10) {
    return { fill: MUTED_FILL, stroke: MUTED_STROKE, opacity: 0.18, hatched: false };
  }
  return { fill: MUTED_FILL, stroke: MUTED_STROKE, opacity: 0.1, hatched: false };
}

/**
 * Map label for one cell. Ranked cells show their number, absent cells say
 * Not found (never 0 or 21), failed cells say Failed with no number, and
 * pending cells say Unknown.
 */
export function gridCellLabel(
  rank: number | null,
  status: string,
): string {
  if (!isGridSuccess(status)) {
    return status === "pending" ? "Unknown" : "Failed";
  }
  if (!isGridRank(rank)) return "Not found";
  return Number.isInteger(rank) ? String(rank) : rank.toFixed(1);
}

/**
 * The honest call status for one grid point. A real found rank always wins,
 * so a bad retry never hides a result the table keeps. With no found rank an
 * outstanding pending or failure stays visible as unknown or failed and never
 * masquerades as a completed absence.
 */
function aggregateCallStatus(
  group: GridGeoCellSummary[],
): LocalSeoCallStatus {
  const found = group.some(
    (cell) =>
      isGridSuccess(cell.call_status) &&
      cell.match_status === "found" &&
      isGridRank(cell.rank),
  );
  if (found) return "success_nonempty";
  const statuses = group.map((cell) => cell.call_status);
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("request_failed")) return "request_failed";
  if (statuses.includes("success_empty")) return "success_empty";
  if (statuses.includes("success_nonempty")) return "success_nonempty";
  return "pending";
}

function meanGridRank(cells: GridGeoCellSummary[]): number | null {
  let sum = 0;
  let foundCount = 0;
  for (const cell of cells) {
    if (
      isGridSuccess(cell.call_status) &&
      cell.match_status === "found" &&
      isGridRank(cell.rank)
    ) {
      sum += cell.rank;
      foundCount += 1;
    }
  }
  return foundCount === 0 ? null : sum / foundCount;
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
  radiusM: number,
): GridGeoFeatureCollection {
  const byPoint = new Map<number, GridGeoCellSummary[]>();
  for (const cell of cells) {
    const group = byPoint.get(cell.point_index);
    if (group) group.push(cell);
    else byPoint.set(cell.point_index, [cell]);
  }

  const features = GRID_POINT_INDICES.map((pointIndex) => {
    const group = byPoint.get(pointIndex) ?? [];
    const { row, col } = gridPointIndex(pointIndex);
    const callStatus = aggregateCallStatus(group);
    const meanRank = meanGridRank(group);
    const anchor =
      frozenAnchor(group) ?? gridPreviewAnchor(pointIndex, centre, radiusM);
    const status: GridGeoCellStatus =
      meanRank !== null
        ? "ranked"
        : callStatus === "pending"
          ? "pending"
          : isGridSuccess(callStatus)
            ? "absent"
            : "failed";
    return {
      type: "Feature" as const,
      geometry: cellPolygonAroundAnchor(anchor, radiusM),
      properties: {
        pointIndex,
        row,
        col,
        rank: meanRank,
        callStatus,
        found: meanRank !== null,
        status,
        label: gridCellLabel(meanRank, callStatus),
        latitude: anchor[1],
        longitude: anchor[0],
        ...(meanRank === null ? {} : { meanRank }),
        ...rankCellColour(meanRank, callStatus),
      },
    };
  });

  return { type: "FeatureCollection", features };
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
  segments: number = DEFAULT_RING_SEGMENTS,
): GridGeoPolygon {
  const ring: Position[] = [];
  for (let step = 0; step < segments; step += 1) {
    const bearing = (step / segments) * Math.PI * 2;
    ring.push(gridDestinationPoint(centre, radiusM, bearing));
  }
  const first = ring[0];
  ring.push([first[0], first[1]]);
  return { type: "Polygon", coordinates: [ring] };
}
