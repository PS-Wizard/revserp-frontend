import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"

import { LocalSeoGrid } from "~/components/local-seo-grid"
import type { LocalSeoCell, LocalSeoSector } from "~/lib/local-seo-api"

const sectors: LocalSeoSector[] = ["NW", "N", "NE", "W", "centre", "E", "SW", "S", "SE"]

function fixtureCells(): LocalSeoCell[] {
  return Array.from({ length: 45 }, (_, index) => {
    const point = index % 9
    const found = point === 3 || point === 4 || point === 5
    const failed = point === 1
    return {
      query_index: Math.floor(index / 9),
      point_index: point,
      latitude: 27.7,
      longitude: 85.3,
      distance_m: point === 4 ? 0 : 5000,
      ring: point === 4 ? "centre" : point % 2 === 0 ? "corner" : "edge",
      sector: sectors[point],
      call_status: failed ? "request_failed" : "success_nonempty",
      match_status: found ? "found" : failed ? "unknown" : "absent",
      rank: found ? (point === 4 ? 1 : point) : null,
      credits: 3,
      credit_known: true,
      error: failed ? "suspect viewport" : null,
    }
  })
}

const tieDirectionRanks: Partial<Record<LocalSeoSector, number[]>> = {
  W: [1, 1, 1, 1, 3],
  E: [1, 1, 1, 1, 3],
  centre: [1, 1, 1, 2, 3],
}

/** Nepal-shaped run: W and E tie at a 1.4 found-only mean, six clean misses. */
function tieFixtureCells(): LocalSeoCell[] {
  const cells: LocalSeoCell[] = []
  sectors.forEach((sector, point) => {
    const ranks = tieDirectionRanks[sector]
    for (let query = 0; query < 5; query++) {
      const rank = ranks ? ranks[query] : null
      cells.push({
        query_index: query,
        point_index: point,
        latitude: 27.7,
        longitude: 85.3,
        distance_m: point === 4 ? 0 : 5000,
        ring: point === 4 ? "centre" : point % 2 === 0 ? "corner" : "edge",
        sector,
        call_status: "success_nonempty",
        match_status: rank === null ? "absent" : "found",
        rank,
        credits: 3,
        credit_known: true,
        error: null,
      })
    }
  })
  return cells
}

describe("local visibility grid rendering", () => {
  test("renders nine points, centre rank, and distinct absence/failure evidence", () => {
    const html = renderToStaticMarkup(
      <LocalSeoGrid cells={fixtureCells()} queries={["one", "two", "three", "four", "five"]} />,
    )
    const window = new Window()
    window.document.body.innerHTML = html
    const board = window.document.querySelector('ul[aria-label="Nine-point visibility board"]')
    expect(board?.children.length).toBe(9)
    expect(board?.children[0].textContent).toContain("Absent")
    // Point 1 has only failed calls: unresolved, counted as unknown samples.
    expect(board?.children[1].textContent).toContain("5 unknown")
    expect(html).toContain("Centre mean 1.0")
    expect(html).toContain("Strongest sampled direction")
    expect(html).toContain("Weakest sampled direction")
    expect(html).toContain("found-only mean")
    expect(html).toContain("Compass")
    window.close()
  })

  test("a found-mean tie reports coverage without strongest or weakest labels", () => {
    const html = renderToStaticMarkup(
      <LocalSeoGrid cells={tieFixtureCells()} queries={["one", "two", "three", "four", "five"]} />,
    )
    expect(html).toContain(
      "Present in 2 of 8 sampled directions; absent in 6; unresolved or not sampled in 0.",
    )
    expect(html).toContain("East and West tie at found-only mean 1.4")
    expect(html.includes("Strongest sampled direction")).toBe(false)
    expect(html.includes("Weakest sampled direction")).toBe(false)
  })
})
