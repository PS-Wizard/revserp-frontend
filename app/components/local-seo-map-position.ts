import {
  gridDestinationPoint,
  type GridGeoCentre,
} from "~/lib/local-seo-grid-geo";
import type { LocalSeoLocation } from "~/lib/local-seo-api";

/** Side of the pin the setup card sits on, outside the sampling circle. */
export type LocalSeoMapPopoverSide = "left" | "right" | "top" | "bottom";

/** A pin-anchored card position, clamped inside the map viewport. */
export type LocalSeoMapPopoverPlacement = {
  side: LocalSeoMapPopoverSide;
  x: number;
  y: number;
};

/**
 * Radius of the sampling circle in screen pixels, from the projected bounding
 * box of the four cardinal destinations. Uses map.project, never a
 * screen-space SVG circle, so zoom and latitude both stay honest. Kept for the
 * card offset only; viewport fitting uses the geodesic bounds below.
 */
export function projectedLocalSeoRadiusPx(
  project: (lngLat: [number, number]) => { x: number; y: number },
  center: [number, number],
  radiusM: number,
): number {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return 0;
  const origin = project(center);
  const bearings = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  let max = 0;
  for (const bearing of bearings) {
    const edge = gridDestinationPoint(center, radiusM, bearing);
    const point = project([edge[0], edge[1]]);
    const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
    if (distance > max) max = distance;
  }
  return max;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/** Closest-point check: does the card rect intersect the pin circle? */
function popoverOverlapsCircle(args: {
  pinX: number;
  pinY: number;
  radiusPx: number;
  x: number;
  y: number;
  popoverW: number;
  popoverH: number;
}): boolean {
  const { pinX, pinY, radiusPx, x, y, popoverW, popoverH } = args;
  const closestX = clamp(pinX, x, x + popoverW);
  const closestY = clamp(pinY, y, y + popoverH);
  return Math.hypot(pinX - closestX, pinY - closestY) < radiusPx;
}

/**
 * Pin-anchored setup card position outside the sampling circle, on the side
 * with the most room. The card never covers the pin and never leaves the
 * viewport; pass the map viewport size plus the card size and a fit padding.
 * When the viewport cannot hold both, the card stays outside the circle and
 * overflows the viewport so a geodesic fitBounds can make room, instead of
 * sliding over the circle.
 */
export function placeLocalSeoSetupPopover(args: {
  pinX: number;
  pinY: number;
  radiusPx: number;
  viewportW: number;
  viewportH: number;
  popoverW: number;
  popoverH: number;
  padding?: number;
  gap?: number;
}): LocalSeoMapPopoverPlacement {
  const {
    pinX,
    pinY,
    radiusPx,
    viewportW,
    viewportH,
    popoverW,
    popoverH,
    padding = 16,
    gap = 12,
  } = args;
  const radius = Math.max(0, radiusPx);
  const spaces: Array<{ side: LocalSeoMapPopoverSide; room: number }> = [
    { side: "right", room: viewportW - (pinX + radius) },
    { side: "left", room: pinX - radius },
    { side: "bottom", room: viewportH - (pinY + radius) },
    { side: "top", room: pinY - radius },
  ];
  spaces.sort((a, b) => b.room - a.room);
  const side = spaces[0]?.side ?? "right";

  let x: number;
  let y: number;
  if (side === "right") {
    x = pinX + radius + gap;
    y = pinY - popoverH / 2;
  } else if (side === "left") {
    x = pinX - radius - gap - popoverW;
    y = pinY - popoverH / 2;
  } else if (side === "bottom") {
    x = pinX - popoverW / 2;
    y = pinY + radius + gap;
  } else {
    x = pinX - popoverW / 2;
    y = pinY - radius - gap - popoverH;
  }
  const unclamped = { x, y };
  const clamped = {
    x: clamp(x, padding, Math.max(padding, viewportW - popoverW - padding)),
    y: clamp(y, padding, Math.max(padding, viewportH - popoverH - padding)),
  };
  const clampedOverlaps = popoverOverlapsCircle({
    pinX,
    pinY,
    radiusPx: radius,
    x: clamped.x,
    y: clamped.y,
    popoverW,
    popoverH,
  });
  if (clampedOverlaps) return { side, ...unclamped };
  return { side, ...clamped };
}

/** Geodesic bounds of the sampling circle, from cardinal destinations. */
export function localSeoSetupGeodesicBounds(
  center: [number, number],
  radiusM: number,
): [[number, number], [number, number]] | null {
  if (
    !Number.isFinite(center[0]) ||
    !Number.isFinite(center[1]) ||
    !Number.isFinite(radiusM) ||
    radiusM <= 0
  ) {
    return null;
  }
  const geoCenter: GridGeoCentre = [center[0], center[1]];
  const north = gridDestinationPoint(geoCenter, radiusM, 0);
  const east = gridDestinationPoint(geoCenter, radiusM, Math.PI / 2);
  const south = gridDestinationPoint(geoCenter, radiusM, Math.PI);
  const west = gridDestinationPoint(geoCenter, radiusM, (3 * Math.PI) / 2);
  const westLng = Math.min(west[0], east[0], center[0]);
  const eastLng = Math.max(west[0], east[0], center[0]);
  const southLat = Math.min(south[1], north[1], center[1]);
  const northLat = Math.max(south[1], north[1], center[1]);
  return [
    [westLng, southLat],
    [eastLng, northLat],
  ];
}

/** Asymmetric fitBounds padding reserving viewport space for the setup card. */
export function localSeoSetupFitPadding(
  side: LocalSeoMapPopoverSide,
  popoverW: number,
  popoverH: number,
  base = 16,
): { top: number; bottom: number; left: number; right: number } {
  const gap = 12;
  if (side === "right")
    return { top: base, bottom: base, left: base, right: popoverW + gap + base };
  if (side === "left")
    return { top: base, bottom: base, left: popoverW + gap + base, right: base };
  if (side === "bottom")
    return { top: base, bottom: popoverH + gap + base, left: base, right: base };
  return { top: popoverH + gap + base, bottom: base, left: base, right: base };
}

/** Pick the card side from pin position alone, without a screen-space circle. */
export function chooseLocalSeoSetupSide(args: {
  pinX: number;
  pinY: number;
  viewportW: number;
  viewportH: number;
  popoverW: number;
  popoverH: number;
}): LocalSeoMapPopoverSide {
  const { pinX, pinY, viewportW, viewportH, popoverW, popoverH } = args;
  const roomRight = viewportW - pinX;
  const roomLeft = pinX;
  const roomBottom = viewportH - pinY;
  const roomTop = pinY;
  const fitsRight = roomRight >= popoverW + 28;
  const fitsLeft = roomLeft >= popoverW + 28;
  const fitsBottom = roomBottom >= popoverH + 28;
  const fitsTop = roomTop >= popoverH + 28;
  const candidates: Array<{ side: LocalSeoMapPopoverSide; room: number; fits: boolean }> = [
    { side: "right", room: roomRight, fits: fitsRight },
    { side: "left", room: roomLeft, fits: fitsLeft },
    { side: "bottom", room: roomBottom, fits: fitsBottom },
    { side: "top", room: roomTop, fits: fitsTop },
  ];
  const fitting = candidates.filter((candidate) => candidate.fits);
  const pool = fitting.length > 0 ? fitting : candidates;
  pool.sort((a, b) => b.room - a.room);
  return pool[0]?.side ?? "right";
}

/** Bounds of actual finite locations for the one-time initial fit. */
export function localSeoLocationsBounds(
  locations: Pick<LocalSeoLocation, "latitude" | "longitude">[],
): [[number, number], [number, number]] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const location of locations) {
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude))
      continue;
    if (location.latitude < -90 || location.latitude > 90) continue;
    if (location.longitude < -180 || location.longitude > 180) continue;
    west = Math.min(west, location.longitude);
    east = Math.max(east, location.longitude);
    south = Math.min(south, location.latitude);
    north = Math.max(north, location.latitude);
  }
  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;
  if (west === east && south === north) {
    const pad = 0.01;
    return [
      [west - pad, south - pad],
      [east + pad, north + pad],
    ];
  }
  return [
    [west, south],
    [east, north],
  ];
}
