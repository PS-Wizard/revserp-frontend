import { describe, expect, test } from "bun:test"

import type { LocalSeoCell } from "~/lib/local-seo-api"
import {
  LOCAL_SEO_EARTH_RADIUS_M,
  formatGridDistanceLabel,
  gridCellHalfExtentM,
  gridCellLabel,
  gridCellPolygon,
  gridDestinationPoint,
  gridFeatureCollection,
  gridMeasurementFeatureCollection,
  gridMeasurementLabelCollection,
  gridPointIndex,
  pinVisualForState,
  rankCellColour,
  samplingRadiusPolygon,
  type GridGeoCentre,
  type GridGeoCellSummary,
  type GridGeoPolygon,
} from "~/lib/local-seo-grid-geo"

/**
 * Frozen paid sample points, copied from
 * backend/internal/localvisibility/testdata/nepal-grid-live.json (read-only,
 * run c8bdfb07). Copied here so frontend tests never import the backend
 * fixture at runtime and no 135-credit rerun is needed.
 */
const FROZEN_POINTS: Array<{
  point_index: number
  latitude: number
  longitude: number
}> = [
  {
    point_index: 0,
    latitude: 27.747235182411313,
    longitude: 85.30437893097559,
  },
  { point_index: 1, latitude: 27.74723982030064, longitude: 85.340306 },
  {
    point_index: 2,
    latitude: 27.747235182411313,
    longitude: 85.37623306902441,
  },
  {
    point_index: 3,
    latitude: 27.715439365095264,
    longitude: 85.30438940890343,
  },
  { point_index: 4, latitude: 27.715443999999994, longitude: 85.340306 },
  {
    point_index: 5,
    latitude: 27.715439365095264,
    longitude: 85.37622259109651,
  },
  {
    point_index: 6,
    latitude: 27.683643547776526,
    longitude: 85.30439987335183,
  },
  { point_index: 7, latitude: 27.683648179699365, longitude: 85.340306 },
  {
    point_index: 8,
    latitude: 27.683643547776526,
    longitude: 85.37621212664817,
  },
]

/** Location centre behind the run; point 4 reproduces it to one float ulp. */
const FROZEN_CENTRE: GridGeoCentre = [85.340306, 27.715444]
const FROZEN_RADIUS_M = 5000

/** Real recorded rank states: points 3-5 found on all five queries, the rest absent. */
const FROZEN_RANKS: Record<number, number[]> = {
  3: [1, 1, 1, 1, 3],
  4: [1, 1, 1, 2, 3],
  5: [1, 1, 1, 1, 3],
}

/** Great-circle metres between two lon,lat pairs on the shared earth radius. */
function haversineM(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * LOCAL_SEO_EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Centre of a grid cell in lon,lat, averaged over its four corners. */
function cellCentre(polygon: GridGeoPolygon): [number, number] {
  const corners = polygon.coordinates[0].slice(0, 4)
  const sum = corners.reduce(
    (total, [longitude, latitude]) => [
      total[0] + longitude,
      total[1] + latitude,
    ],
    [0, 0]
  )
  return [sum[0] / 4, sum[1] / 4]
}

/** The repo test types expose only the basic matchers. */
function expectNear(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected) < tolerance).toBe(true)
}

function expectBelow(actual: number, ceiling: number) {
  expect(actual < ceiling).toBe(true)
}

function makeCell(overrides: Partial<LocalSeoCell>): LocalSeoCell {
  return {
    query_index: 0,
    point_index: 0,
    latitude: FROZEN_POINTS[0].latitude,
    longitude: FROZEN_POINTS[0].longitude,
    distance_m: 5000,
    ring: "corner",
    sector: "NW",
    call_status: "success_nonempty",
    match_status: "found",
    rank: 1,
    credits: 3,
    credit_known: true,
    error: null,
    ...overrides,
  }
}

/** All 45 recorded cells: five queries per point with frozen coordinates. */
function frozenRunCells(): LocalSeoCell[] {
  const cells: LocalSeoCell[] = []
  for (const point of FROZEN_POINTS) {
    const ranks = FROZEN_RANKS[point.point_index] ?? null
    for (let query = 0; query < 5; query += 1) {
      const rank = ranks ? ranks[query] : null
      cells.push(
        makeCell({
          query_index: query,
          point_index: point.point_index,
          latitude: point.latitude,
          longitude: point.longitude,
          match_status: rank === null ? "absent" : "found",
          call_status: "success_nonempty",
          rank,
        })
      )
    }
  }
  return cells
}

describe("spherical destination helper", () => {
  test("earth radius matches the backend constant", () => {
    expect(LOCAL_SEO_EARTH_RADIUS_M).toBe(6371000)
  })

  test("preview from the frozen centre reproduces all nine paid points", () => {
    // Go math and JS Math may differ by one float ulp in sin/cos/asin/atan2,
    // so this allows 1e-12 degrees (about a nanometre). A flat 111320
    // approximation drifts metres (about 1e-5 degrees) and fails loudly here.
    for (const point of FROZEN_POINTS) {
      const { row, col } = gridPointIndex(point.point_index)
      const halfWidth = FROZEN_RADIUS_M / Math.SQRT2
      const eastM = (col - 1) * halfWidth
      const northM = (1 - row) * halfWidth
      const [longitude, latitude] = gridDestinationPoint(
        FROZEN_CENTRE,
        Math.hypot(eastM, northM),
        Math.atan2(eastM, northM)
      )
      expectNear(latitude, point.latitude, 1e-12)
      expectNear(longitude, point.longitude, 1e-12)
    }
  })

  test("corners sit at the full radius and edges at radius over sqrt(2)", () => {
    for (const point of FROZEN_POINTS) {
      const { row, col } = gridPointIndex(point.point_index)
      const halfWidth = FROZEN_RADIUS_M / Math.SQRT2
      const eastM = (col - 1) * halfWidth
      const northM = (1 - row) * halfWidth
      const [longitude, latitude] = gridDestinationPoint(
        FROZEN_CENTRE,
        Math.hypot(eastM, northM),
        Math.atan2(eastM, northM)
      )
      const want =
        row !== 1 && col !== 1
          ? FROZEN_RADIUS_M
          : row === 1 && col === 1
            ? 0
            : halfWidth
      expectNear(haversineM(FROZEN_CENTRE, [longitude, latitude]), want, 1e-6)
    }
  })

  test("longitudes wrap into [-180, 180] past the dateline", () => {
    const [longitude] = gridDestinationPoint([179.999, 0], 5000, Math.PI / 2)
    expect(longitude >= -180 && longitude <= 180).toBe(true)
    expect(longitude < 0).toBe(true)
  })
})

describe("grid point index", () => {
  test("index 4 sits exactly on the centre", () => {
    expect(gridPointIndex(4)).toEqual({ row: 1, col: 1 })
    const [longitude, latitude] = cellCentre(
      gridCellPolygon(4, FROZEN_CENTRE, FROZEN_RADIUS_M)
    )
    expectNear(longitude, FROZEN_CENTRE[0], 1e-12)
    expectNear(latitude, FROZEN_CENTRE[1], 1e-12)
  })

  test("row and column map every index from north-west to south-east", () => {
    const expected = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]
    for (const [index, want] of expected.entries()) {
      expect(gridPointIndex(index)).toEqual(want)
    }
  })
})

describe("grid cell polygon", () => {
  test("ring is closed and uses the backend half extent", () => {
    const ring = gridCellPolygon(4, FROZEN_CENTRE, FROZEN_RADIUS_M)
      .coordinates[0]
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
    expect(gridCellHalfExtentM(FROZEN_RADIUS_M)).toBe(
      (FROZEN_RADIUS_M / 5) * 0.34
    )
  })

  test("edges sit one half extent from the anchor by great-circle distance", () => {
    const anchor = FROZEN_POINTS[4]
    const ring = gridFeatureCollection(
      [
        makeCell({
          point_index: 4,
          latitude: anchor.latitude,
          longitude: anchor.longitude,
        }),
      ],
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    ).features[4].geometry.coordinates[0]
    const half = gridCellHalfExtentM(FROZEN_RADIUS_M)
    const midTop = [(ring[0][0] + ring[1][0]) / 2, ring[0][1]]
    expectNear(
      haversineM(
        [anchor.longitude, anchor.latitude],
        midTop as [number, number]
      ),
      half,
      1e-6
    )
  })
})

describe("sampling radius polygon", () => {
  test("ring is closed with 97 coordinates", () => {
    const ring = samplingRadiusPolygon(FROZEN_CENTRE, FROZEN_RADIUS_M)
      .coordinates[0]
    expect(ring).toHaveLength(97)
    expect(ring[0]).toEqual(ring[96])
  })

  test("segment count is configurable and the ring still closes", () => {
    const ring = samplingRadiusPolygon(FROZEN_CENTRE, FROZEN_RADIUS_M, 12)
      .coordinates[0]
    expect(ring).toHaveLength(13)
    expect(ring[0]).toEqual(ring[12])
  })

  test("every vertex sits one great-circle radius from the centre", () => {
    for (const vertex of samplingRadiusPolygon(FROZEN_CENTRE, FROZEN_RADIUS_M)
      .coordinates[0]) {
      expectNear(
        haversineM(FROZEN_CENTRE, vertex as [number, number]),
        FROZEN_RADIUS_M,
        1e-6
      )
    }
  })
})

describe("rank ramp on one accent", () => {
  test("rank 1 is the deepest accent on the light basemap", () => {
    expect(rankCellColour(1, "success_nonempty")).toEqual({
      fill: "#047857",
      stroke: "#94a3b8",
      opacity: 0.32,
      hatched: false,
    })
  })

  test("ranks 2 and 3 keep the same accent softer, including a 1.4 mean", () => {
    const strongest = rankCellColour(1, "success_nonempty")
    for (const rank of [1.4, 2, 3]) {
      const softer = rankCellColour(rank, "success_nonempty")
      expect(softer.fill).toBe(strongest.fill)
      expect(softer.hatched).toBe(false)
      expectBelow(softer.opacity, strongest.opacity)
    }
  })

  test("rank 7 is muted and rank 18 is muted fainter still", () => {
    const third = rankCellColour(3, "success_nonempty")
    const seventh = rankCellColour(7, "success_nonempty")
    const faint = rankCellColour(18, "success_nonempty")
    expect(seventh.fill).toBe("#64748b")
    expect(third.fill === seventh.fill).toBe(false)
    expect(seventh.hatched).toBe(false)
    // Every rank bucket keeps the one light slate outline.
    expect(seventh.stroke).toBe("#94a3b8")
    expect(faint.stroke).toBe("#94a3b8")
    expect(seventh.stroke === seventh.fill).toBe(false)
    expectBelow(seventh.opacity, third.opacity)
    expectBelow(faint.opacity, seventh.opacity)
  })

  test("a successful call with no rank is absent, not failed", () => {
    const absent = rankCellColour(null, "success_empty")
    expect(absent.hatched).toBe(false)
    expect(absent.fill).toBe("#ffffff")
    expect(absent.fill === rankCellColour(null, "request_failed").fill).toBe(
      false
    )
  })

  test("a failed call is hatched and never shows a rank colour", () => {
    expect(rankCellColour(null, "request_failed")).toEqual({
      fill: "#fef3c7",
      stroke: "#94a3b8",
      opacity: 0.55,
      hatched: true,
    })
    const failedWithRank = rankCellColour(1, "request_failed")
    expect(failedWithRank.hatched).toBe(true)
    expect(failedWithRank.fill).toBe("#fef3c7")
  })

  test("every rank state shares one light slate outline", () => {
    const strokes = [
      rankCellColour(1, "success_nonempty").stroke,
      rankCellColour(7, "success_nonempty").stroke,
      rankCellColour(null, "success_empty").stroke,
      rankCellColour(null, "request_failed").stroke,
      rankCellColour(null, "pending").stroke,
    ]
    for (const stroke of strokes) expect(stroke).toBe("#94a3b8")
  })

  test("a pending call is unknown, neither failed nor absent", () => {
    const pending = rankCellColour(null, "pending")
    expect(pending.hatched).toBe(false)
    expect(pending.fill).toBe("#f1f5f9")
    expect(pending.fill === rankCellColour(null, "success_empty").fill).toBe(
      false
    )
  })
})

describe("grid cell labels", () => {
  test("ranked cells show their number, fractional means with one decimal", () => {
    expect(gridCellLabel(1, "success_nonempty")).toBe("1")
    expect(gridCellLabel(1.4, "success_nonempty")).toBe("1.4")
    expect(gridCellLabel(18, "success_nonempty")).toBe("18")
  })

  test("absent says Not found, never 0 or 21", () => {
    expect(gridCellLabel(null, "success_empty")).toBe("Not found")
    expect(gridCellLabel(null, "success_nonempty")).toBe("Not found")
    expect(/\d/.test(gridCellLabel(null, "success_empty"))).toBe(false)
    expect(/\d/.test(gridCellLabel(null, "success_nonempty"))).toBe(false)
  })

  test("failed says Failed with no number, pending says Unknown", () => {
    expect(gridCellLabel(1, "request_failed")).toBe("Failed")
    expect(gridCellLabel(null, "request_failed")).toBe("Failed")
    expect(/\d/.test(gridCellLabel(1, "request_failed"))).toBe(false)
    expect(gridCellLabel(null, "pending")).toBe("Unknown")
  })
})

describe("grid feature collection on frozen anchors", () => {
  test("all nine properties anchor exactly at the frozen paid coordinates", () => {
    const collection = gridFeatureCollection(
      frozenRunCells(),
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    expect(collection.type).toBe("FeatureCollection")
    expect(collection.features).toHaveLength(9)
    for (const feature of collection.features) {
      const frozen = FROZEN_POINTS[feature.properties.pointIndex]
      expect(feature.geometry.type).toBe("Polygon")
      expect(feature.properties.latitude).toBe(frozen.latitude)
      expect(feature.properties.longitude).toBe(frozen.longitude)
      const [longitude, latitude] = cellCentre(feature.geometry)
      expectNear(longitude, frozen.longitude, 1e-12)
      expectNear(latitude, frozen.latitude, 1e-12)
    }
  })

  test("recorded found points carry their mean rank and number label", () => {
    const collection = gridFeatureCollection(
      frozenRunCells(),
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    const west = collection.features[3].properties
    expect(west.rank).toBe(1.4)
    expect(west.meanRank).toBe(1.4)
    expect(west.label).toBe("D · 1.4")
    expect(west.pointLetter).toBe("D")
    expect(west.status).toBe("ranked")
    expect(west.found).toBe(true)
    expect(west.fill).toBe(rankCellColour(1, "success_nonempty").fill)
    const centre = collection.features[4].properties
    expect(centre.rank).toBe(1.6)
    expect(centre.label).toBe("E · 1.6")
    expect(centre.status).toBe("ranked")
  })

  test("recorded absent points are hollow with a Not found label", () => {
    const collection = gridFeatureCollection(
      frozenRunCells(),
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    const letters = ["A", "B", "C", "G", "H", "I"]
    for (const [offset, index] of [0, 1, 2, 6, 7, 8].entries()) {
      const properties = collection.features[index].properties
      expect(properties.pointLetter).toBe(letters[offset])
      expect(properties.rank).toBeNull()
      expect(properties.callStatus).toBe("success_nonempty")
      expect(properties.found).toBe(false)
      expect(properties.status).toBe("absent")
      expect(properties.label).toBe(`${letters[offset]} · Not found`)
      expect(/\d/.test(properties.label)).toBe(false)
      expect(properties.hatched).toBe(false)
      expect("meanRank" in properties).toBe(false)
    }
  })

  test("cells without frozen coordinates fall back to the spherical preview", () => {
    const bare: GridGeoCellSummary[] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
      (point_index) => ({
        point_index,
        call_status: "success_empty",
        match_status: "absent",
        rank: null,
      })
    )
    const collection = gridFeatureCollection(
      bare,
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    for (const feature of collection.features) {
      const frozen = FROZEN_POINTS[feature.properties.pointIndex]
      expectNear(feature.properties.latitude, frozen.latitude, 1e-12)
      expectNear(feature.properties.longitude, frozen.longitude, 1e-12)
    }
  })

  test("an unsampled point is unknown, never a completed absence", () => {
    const collection = gridFeatureCollection([], FROZEN_CENTRE, FROZEN_RADIUS_M)
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
    for (const [index, feature] of collection.features.entries()) {
      expect(feature.properties.pointLetter).toBe(letters[index])
      expect(feature.properties.rank).toBeNull()
      expect(feature.properties.status).toBe("pending")
      expect(feature.properties.label).toBe(`${letters[index]} · Unknown`)
      expect(/\d/.test(feature.properties.label)).toBe(false)
      expect(feature.properties.hatched).toBe(false)
    }
    const centreFeature = collection.features[4].properties
    expect(centreFeature.pointIndex).toBe(4)
    expect(centreFeature.row).toBe(1)
    expect(centreFeature.col).toBe(1)
  })

  test("an absent retry beside a failure stays failed, not absent", () => {
    const collection = gridFeatureCollection(
      [
        makeCell({
          point_index: 1,
          query_index: 0,
          call_status: "success_empty",
          match_status: "absent",
          rank: null,
        }),
        makeCell({
          point_index: 1,
          query_index: 1,
          call_status: "request_failed",
          match_status: "unknown",
          rank: null,
        }),
      ],
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    const properties = collection.features[1].properties
    expect(properties.rank).toBeNull()
    expect(properties.callStatus).toBe("request_failed")
    expect(properties.status).toBe("failed")
    expect(properties.pointLetter).toBe("B")
    expect(properties.label).toBe("B · Failed")
    expect(/\d/.test(properties.label)).toBe(false)
    expect(properties.hatched).toBe(true)
  })

  test("an absent retry beside a pending call stays unknown, not absent", () => {
    const collection = gridFeatureCollection(
      [
        makeCell({
          point_index: 2,
          query_index: 0,
          call_status: "success_empty",
          match_status: "absent",
          rank: null,
        }),
        makeCell({
          point_index: 2,
          query_index: 1,
          call_status: "pending",
          match_status: "unknown",
          rank: null,
        }),
      ],
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    const properties = collection.features[2].properties
    expect(properties.pointLetter).toBe("C")
    expect(properties.status).toBe("pending")
    expect(properties.label).toBe("C · Unknown")
    expect(properties.hatched).toBe(false)
  })

  test("a found rank beside a failed retry keeps its honest success", () => {
    const collection = gridFeatureCollection(
      [
        makeCell({ point_index: 8, query_index: 0, rank: 1 }),
        makeCell({
          point_index: 8,
          query_index: 1,
          call_status: "request_failed",
          match_status: "unknown",
          rank: null,
        }),
      ],
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    const properties = collection.features[8].properties
    expect(properties.rank).toBe(1)
    expect(properties.label).toBe("I · 1")
    expect(properties.pointLetter).toBe("I")
    expect(properties.status).toBe("ranked")
    expect(properties.callStatus).toBe("success_nonempty")
    expect(properties.found).toBe(true)
    expect(properties.hatched).toBe(false)
  })

  test("mean rank uses found ranks only across queries", () => {
    const collection = gridFeatureCollection(
      [
        makeCell({ point_index: 6, query_index: 0, rank: 2 }),
        makeCell({ point_index: 6, query_index: 1, rank: 6 }),
        makeCell({
          point_index: 6,
          query_index: 2,
          call_status: "success_empty",
          match_status: "absent",
          rank: null,
        }),
        makeCell({
          point_index: 6,
          query_index: 3,
          call_status: "request_failed",
          match_status: "unknown",
          rank: null,
        }),
      ],
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    const properties = collection.features[6].properties
    expect(properties.meanRank).toBe(4)
    expect(properties.label).toBe("G · 4")
    expect(properties.pointLetter).toBe("G")
    expect(properties.callStatus).toBe("success_nonempty")
    expect(properties.hatched).toBe(false)
  })
})

describe("measurement lattice", () => {
  test("builds four square edges and eight spokes", () => {
    const collection = gridMeasurementFeatureCollection(
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    const squares = collection.features.filter(
      (feature) => feature.properties.kind === "square"
    )
    const spokes = collection.features.filter(
      (feature) => feature.properties.kind === "spoke"
    )
    expect(squares).toHaveLength(4)
    expect(spokes).toHaveLength(8)
    expect(collection.features).toHaveLength(12)
  })

  test("adds eight spoke labels and one radius label with honest distances", () => {
    const collection = gridMeasurementLabelCollection(
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    expect(collection.features).toHaveLength(9)
    const labelsFor = (kind: string) =>
      collection.features
        .filter((feature) => feature.properties.kind === kind)
        .map((feature) => feature.properties.label)
    expect(labelsFor("corner")).toEqual(["5 km", "5 km", "5 km", "5 km"])
    expect(labelsFor("edge")).toEqual(["3.5 km", "3.5 km", "3.5 km", "3.5 km"])
    expect(labelsFor("radius")).toEqual(["5 km radius"])
  })

  test("label strings follow the radius at 1000, 5000, and 25000 m", () => {
    const cases = [
      { radiusM: 1000, corner: "1 km", edge: "707.1 m" },
      { radiusM: 5000, corner: "5 km", edge: "3.5 km" },
      { radiusM: 25000, corner: "25 km", edge: "17.7 km" },
    ]
    for (const { radiusM, corner, edge } of cases) {
      const labels = gridMeasurementLabelCollection(
        FROZEN_CENTRE,
        radiusM
      ).features.map((feature) => feature.properties.label)
      expect(labels.filter((label) => label === corner)).toHaveLength(4)
      expect(labels.filter((label) => label === edge)).toHaveLength(4)
      expect(labels).toContain(`${corner} radius`)
    }
  })

  test("spoke labels sit short of the outer ring, off the dashed line", () => {
    const collection = gridMeasurementLabelCollection(
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    for (const feature of collection.features) {
      if (feature.properties.kind === "radius") continue
      const distance = haversineM(
        FROZEN_CENTRE,
        feature.geometry.coordinates as [number, number]
      )
      expectBelow(distance, FROZEN_RADIUS_M)
      expect(distance > FROZEN_RADIUS_M * 0.3).toBe(true)
    }
  })

  test("the radius label sits just south inside the circle", () => {
    const collection = gridMeasurementLabelCollection(
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    const radiusLabel = collection.features.find(
      (feature) => feature.properties.kind === "radius"
    )
    const [longitude, latitude] = radiusLabel!.geometry.coordinates
    expect(latitude < FROZEN_CENTRE[1]).toBe(true)
    expectNear(longitude, FROZEN_CENTRE[0], 1e-6)
    const distance = haversineM(FROZEN_CENTRE, [longitude, latitude] as [
      number,
      number,
    ])
    expectBelow(distance, FROZEN_RADIUS_M)
    expect(distance > FROZEN_RADIUS_M * 0.8).toBe(true)
  })

  test("square edges touch the full radius and spokes end on an outer point", () => {
    const collection = gridMeasurementFeatureCollection(
      FROZEN_CENTRE,
      FROZEN_RADIUS_M
    )
    for (const feature of collection.features) {
      if (feature.properties.kind === "square") {
        for (const vertex of feature.geometry.coordinates) {
          expectNear(
            haversineM(FROZEN_CENTRE, vertex as [number, number]),
            FROZEN_RADIUS_M,
            1e-6
          )
        }
      } else {
        const [start, end] = feature.geometry.coordinates
        expectNear(
          haversineM(FROZEN_CENTRE, start as [number, number]),
          0,
          1e-6
        )
        const distance = haversineM(FROZEN_CENTRE, end as [number, number])
        const edge = Math.abs(distance - FROZEN_RADIUS_M / Math.SQRT2) < 1e-6
        const corner = Math.abs(distance - FROZEN_RADIUS_M) < 1e-6
        expect(edge || corner).toBe(true)
      }
    }
  })

  test("a non-positive radius yields no lattice or labels", () => {
    expect(
      gridMeasurementFeatureCollection(FROZEN_CENTRE, 0).features
    ).toHaveLength(0)
    expect(
      gridMeasurementLabelCollection(FROZEN_CENTRE, 0).features
    ).toHaveLength(0)
  })
})

describe("grid distance label formatter", () => {
  test("trims trailing zeros and switches to metres below 1000 m", () => {
    expect(formatGridDistanceLabel(1000)).toBe("1 km")
    expect(formatGridDistanceLabel(5000)).toBe("5 km")
    expect(formatGridDistanceLabel(25000)).toBe("25 km")
    expect(formatGridDistanceLabel(1500)).toBe("1.5 km")
    expect(formatGridDistanceLabel(3535.5339)).toBe("3.5 km")
    expect(formatGridDistanceLabel(17677.669)).toBe("17.7 km")
    expect(formatGridDistanceLabel(500)).toBe("500 m")
    expect(formatGridDistanceLabel(707.1067)).toBe("707.1 m")
  })
})

describe("pin visual", () => {
  test("idle pins are smaller with a thinner ring than selected pins", () => {
    expect(pinVisualForState("idle")).toEqual({ size: 28, ring: 2 })
    expect(pinVisualForState("selected")).toEqual({ size: 32, ring: 3 })
  })
})
