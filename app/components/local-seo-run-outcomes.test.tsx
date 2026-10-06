import { describe, expect, test } from "bun:test"

import {
  LOCAL_SEO_GENERIC_RUN_ERROR,
  countLocalSeoRunCalls,
  describeLocalSeoRunCalls,
  isGenericLocalSeoRunError,
  listLocalSeoFailedCells,
  listLocalSeoPendingCells,
  localSeoHeldCredits,
  localSeoMayStillCharge,
  localSeoUnconfirmedCalls,
} from "~/components/local-seo-run-outcomes"
import type { LocalSeoCell, LocalSeoRun } from "~/lib/local-seo-api"

function makeCell(overrides: Partial<LocalSeoCell> = {}): LocalSeoCell {
  return {
    query_index: 0,
    point_index: 0,
    latitude: 27.7,
    longitude: 85.3,
    distance_m: 0,
    ring: "centre",
    sector: "centre",
    call_status: "success_nonempty",
    match_status: "absent",
    rank: null,
    credits: 3,
    credit_known: true,
    error: null,
    ...overrides,
  }
}

function makeRun(overrides: Partial<LocalSeoRun> = {}): LocalSeoRun {
  return {
    id: "run-1",
    location_id: "loc-1",
    status: "partial",
    radius_m: 5000,
    expected_credits: 108,
    credits_used: 108,
    retry_credits: 0,
    queries: ["a", "b", "Health Insurance Near Me", "d"],
    cells: [],
    ...overrides,
  }
}

describe("local seo run outcome fields", () => {
  test("a reported zero is known; an absent field is unknown, not zero", () => {
    expect(localSeoHeldCredits(makeRun({ reserved_credits: 0 }))).toBe(0)
    expect(localSeoHeldCredits(makeRun({ reserved_credits: null }))).toBe(null)
    expect(localSeoHeldCredits(makeRun())).toBe(null)
    expect(localSeoUnconfirmedCalls(makeRun({ unconfirmed_calls: 0 }))).toBe(0)
    expect(localSeoUnconfirmedCalls(makeRun({ unconfirmed_calls: null }))).toBe(
      null
    )
    expect(localSeoUnconfirmedCalls(makeRun())).toBe(null)
  })

  test("confirmed spend may only rise with a positive or unknown field", () => {
    expect(
      localSeoMayStillCharge(
        makeRun({ reserved_credits: 0, unconfirmed_calls: 0 })
      )
    ).toBe(false)
    expect(
      localSeoMayStillCharge(
        makeRun({ reserved_credits: 3, unconfirmed_calls: 0 })
      )
    ).toBe(true)
    expect(
      localSeoMayStillCharge(
        makeRun({ reserved_credits: 0, unconfirmed_calls: 1 })
      )
    ).toBe(true)
    expect(localSeoMayStillCharge(makeRun())).toBe(true)
  })

  test("only the exact stored summary string is treated as the generic message", () => {
    expect(isGenericLocalSeoRunError(LOCAL_SEO_GENERIC_RUN_ERROR)).toBe(true)
    expect(
      isGenericLocalSeoRunError(`  ${LOCAL_SEO_GENERIC_RUN_ERROR}  `)
    ).toBe(true)
    expect(isGenericLocalSeoRunError("Worker crashed")).toBe(false)
    expect(isGenericLocalSeoRunError(null)).toBe(false)
  })
})

describe("local seo run call summaries", () => {
  test("counts successful, failed, and pending calls separately", () => {
    const run = makeRun({
      cells: [
        makeCell({ call_status: "success_nonempty" }),
        makeCell({ point_index: 1, call_status: "success_empty" }),
        makeCell({ point_index: 2, call_status: "request_failed" }),
        makeCell({ point_index: 3, call_status: "pending" }),
      ],
    })
    expect(countLocalSeoRunCalls(run)).toEqual({
      total: 4,
      successful: 2,
      failed: 1,
      pending: 1,
      settled: 3,
    })
  })

  test("never asserts every call succeeded when one could not be ranked", () => {
    const cells = Array.from({ length: 36 }, (_, index) =>
      makeCell({ point_index: index % 9, query_index: Math.floor(index / 9) })
    )
    cells[2] = makeCell({
      query_index: 0,
      point_index: 2,
      call_status: "request_failed",
    })
    const summary = describeLocalSeoRunCalls(makeRun({ cells }))
    expect(summary).toContain("All 36 calls have recorded outcomes")
    expect(summary).toContain("35 succeeded and 1 failed")
    expect(summary?.includes("were ranked")).toBe(false)
  })

  test("pending calls are not described as returned or started", () => {
    const summary = describeLocalSeoRunCalls(
      makeRun({
        cells: [
          makeCell({ call_status: "success_empty" }),
          makeCell({ point_index: 1, call_status: "pending" }),
        ],
      })
    )
    expect(summary).toContain("1 of 2 calls have recorded outcomes")
    expect(
      listLocalSeoPendingCells(
        makeRun({
          cells: [makeCell({ point_index: 1, call_status: "pending" })],
        })
      )
    ).toEqual(["Query “a” · point B (centre)"])
  })

  test("failed calls name the query, point, charge, and raw error", () => {
    const run = makeRun({
      queries: ["a", "b", "Health Insurance Near Me", "d"],
      cells: [
        makeCell({
          query_index: 2,
          point_index: 2,
          sector: "NE",
          call_status: "request_failed",
          match_status: "unknown",
          credits: 3,
          credit_known: true,
          error: "serper maps viewport format viewport '@27.74,85.35,13.16z'",
        }),
      ],
    })
    const [failed] = listLocalSeoFailedCells(run)
    expect(failed.label).toBe("Query “Health Insurance Near Me” · point C (NE)")
    expect(failed.explanation).toContain("could not be validated")
    expect(failed.charge).toBe("3 credits charged (confirmed)")
    expect(failed.rawError).toContain("viewport")
  })

  test("an unknown failed charge is never presented as free", () => {
    const [failed] = listLocalSeoFailedCells(
      makeRun({
        cells: [
          makeCell({
            call_status: "request_failed",
            credits: 0,
            credit_known: false,
          }),
        ],
      })
    )
    expect(failed.charge).toBe("charge unknown")
  })
})
