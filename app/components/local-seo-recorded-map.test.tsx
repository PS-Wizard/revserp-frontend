import { describe, expect, test } from "bun:test"
import { LocalSeoRecordedMap } from "./local-seo-recorded-map"
import { LocalSeoMap } from "./local-seo-map"
import type { LocalSeoRun } from "~/lib/local-seo-api"

function recordedRun(): LocalSeoRun {
  return {
    id: "offline-run", location_id: "offline-location", status: "completed", radius_m: 5000,
    expected_credits: 27, credits_used: 27, retry_credits: 0, queries: ["offline query"],
    cells: Array.from({ length: 9 }, (_, point_index) => ({
      query_index: 0, point_index, latitude: 27.7 + point_index / 1000, longitude: 85.3,
      distance_m: 0, ring: point_index === 4 ? "centre" : "edge", sector: "centre",
      call_status: "success_nonempty", match_status: "found", rank: 1,
      credits: 3, credit_known: true, error: null,
    })),
  }
}

describe("recorded map", () => {
  test("uses frozen center and radius", () => {
    const run = recordedRun()
    const tree = LocalSeoRecordedMap({ run })
    const map = tree.props.children.props.children
    expect(map.type).toBe(LocalSeoMap)
    expect(map.props.center).toEqual([run.cells[4].longitude, run.cells[4].latitude])
    expect(map.props.radiusM).toBe(run.radius_m)
    expect(map.props.overlayData.features).toHaveLength(9)
  })
  test("never substitutes a fake center for missing recorded coordinates", () => {
    const run = { ...recordedRun(), cells: [] }
    const tree = LocalSeoRecordedMap({ run })
    expect(tree.props.role).toBe("alert")
  })
})
