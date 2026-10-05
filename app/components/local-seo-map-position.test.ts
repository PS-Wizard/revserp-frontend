import { describe, expect, test } from "bun:test";

import {
  chooseLocalSeoSetupSide,
  localSeoLocationsBounds,
  localSeoSetupFitPadding,
  localSeoSetupGeodesicBounds,
  placeLocalSeoSetupPopover,
  projectedLocalSeoRadiusPx,
} from "~/components/local-seo-map-position";

describe("pin popover position", () => {
  test("picks the side with room and stays outside the circle", () => {
    const placement = placeLocalSeoSetupPopover({
      pinX: 120,
      pinY: 300,
      radiusPx: 80,
      viewportW: 1000,
      viewportH: 600,
      popoverW: 320,
      popoverH: 400,
    });
    expect(placement.side).toBe("right");
    expect(placement.x >= 120 + 80).toBe(true);
  });

  test("clamps a card that would leave the viewport", () => {
    const placement = placeLocalSeoSetupPopover({
      pinX: 950,
      pinY: 550,
      radiusPx: 200,
      viewportW: 1000,
      viewportH: 600,
      popoverW: 320,
      popoverH: 400,
      padding: 16,
    });
    expect(placement.x + 320 <= 1000 - 16).toBe(true);
    expect(placement.y + 400 <= 600 - 16).toBe(true);
    expect(placement.x >= 16).toBe(true);
    expect(placement.y >= 16).toBe(true);
  });

  test("projects the radius through map.project, not a screen circle", () => {
    const seen: Array<[number, number]> = [];
    const radiusPx = projectedLocalSeoRadiusPx(
      ([lng, lat]) => {
        seen.push([lng, lat]);
        return { x: (lng - 85) * 1000, y: (28 - lat) * 1000 };
      },
      [85.3, 27.7],
      5000,
    );
    // Center plus four cardinal destinations.
    expect(seen.length).toBe(5);
    expect(radiusPx > 0).toBe(true);
  });

  test("never slides the card over the circle to satisfy the viewport", () => {
    const pinX = 200;
    const pinY = 200;
    const radiusPx = 150;
    const popoverW = 320;
    const popoverH = 400;
    const placement = placeLocalSeoSetupPopover({
      pinX,
      pinY,
      radiusPx,
      viewportW: 360,
      viewportH: 420,
      popoverW,
      popoverH,
      padding: 16,
    });
    const closestX = Math.min(
      Math.max(pinX, placement.x),
      placement.x + popoverW,
    );
    const closestY = Math.min(
      Math.max(pinY, placement.y),
      placement.y + popoverH,
    );
    expect(Math.hypot(pinX - closestX, pinY - closestY) >= radiusPx).toBe(true);
  });
});

describe("geodesic setup fit", () => {
  test("bounds fit the actual geodesic radius around the centre", () => {
    const bounds = localSeoSetupGeodesicBounds([85.3, 27.7], 5000);
    expect(bounds === null).toBe(false);
    const [[west, south], [east, north]] = bounds!;
    expect(west < 85.3).toBe(true);
    expect(east > 85.3).toBe(true);
    expect(south < 27.7).toBe(true);
    expect(north > 27.7).toBe(true);
  });

  test("invalid radius yields no bounds", () => {
    expect(localSeoSetupGeodesicBounds([85.3, 27.7], 0)).toBeNull();
    expect(localSeoSetupGeodesicBounds([85.3, 27.7], Number.NaN)).toBeNull();
  });

  test("asymmetric padding reserves the card side", () => {
    const padding = localSeoSetupFitPadding("right", 320, 520, 16);
    expect(padding.right > padding.left).toBe(true);
    expect(padding.right >= 320).toBe(true);
    const bottom = localSeoSetupFitPadding("bottom", 320, 520, 16);
    expect(bottom.bottom > bottom.top).toBe(true);
  });

  test("side choice keeps the card outside the circle where room allows", () => {
    expect(
      chooseLocalSeoSetupSide({
        pinX: 100,
        pinY: 300,
        viewportW: 1000,
        viewportH: 600,
        popoverW: 320,
        popoverH: 400,
      }),
    ).toBe("right");
    expect(
      chooseLocalSeoSetupSide({
        pinX: 900,
        pinY: 300,
        viewportW: 1000,
        viewportH: 600,
        popoverW: 320,
        popoverH: 400,
      }),
    ).toBe("left");
  });

  test("locations bounds cover real points for the initial fit", () => {
    const bounds = localSeoLocationsBounds([
      { latitude: 27.7, longitude: 85.3 },
      { latitude: 27.8, longitude: 85.4 },
    ]);
    expect(bounds === null).toBe(false);
    expect(bounds![0][0] <= 85.3).toBe(true);
    expect(bounds![1][0] >= 85.4).toBe(true);
  });
});
