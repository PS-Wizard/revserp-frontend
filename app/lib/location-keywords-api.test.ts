import { describe, expect, test } from "bun:test"

import {
  LOCATION_KEYWORD_MAX_PHRASE_RUNES,
  buildLocationSelectedUnionRows,
  emptyLocationKeywordGroup,
  isLocationKeywordSelected,
  isLocationSelectedUnionRowChecked,
  toggleLocationSelectedUnionRow,
  locationKeywordGroupPhrases,
  locationKeywordKindPhrases,
  normalizeLocationKeywordKey,
  normalizeLocationKeywordLists,
  setLocationKeywordKindPhrases,
  toggleLocationKeyword,
  type LocationKeywordListsResponse,
} from "~/lib/location-keywords-api"

describe("location keyword helpers", () => {
  test("normalize collapses case and whitespace so lists compare cleanly", () => {
    expect(normalizeLocationKeywordKey("  Acme   Plumbing ")).toBe(
      "acme plumbing"
    )
  })

  test("toggle adds then removes only the requested kind", () => {
    const start = {
      branded: ["acme"],
      non_branded: ["plumber"],
    }
    const added = toggleLocationKeyword(start, "non_brand", "emergency plumber")
    expect(added.non_branded).toEqual(["plumber", "emergency plumber"])
    expect(added.branded).toEqual(["acme"])

    const removed = toggleLocationKeyword(added, "non_brand", "PLUMBER")
    expect(removed.non_branded).toEqual(["emergency plumber"])
  })

  test("selection detection ignores case without touching other phrases", () => {
    const selected = { branded: ["Acme Plumbing"], non_branded: [] }
    expect(isLocationKeywordSelected(selected, "brand", "acme plumbing")).toBe(
      true
    )
    expect(isLocationKeywordSelected(selected, "brand", "other")).toBe(false)
  })

  test("setKindPhrases leaves the other kind untouched", () => {
    const group = { branded: ["a"], non_branded: ["b"] }
    const next = setLocationKeywordKindPhrases(group, "brand", ["c", "d"])
    expect(next).toEqual({ branded: ["c", "d"], non_branded: ["b"] })
    expect(locationKeywordKindPhrases(next, "non_brand")).toEqual(["b"])
  })

  test("group phrases concatenate both kinds", () => {
    expect(
      locationKeywordGroupPhrases({ branded: ["a"], non_branded: ["b", "c"] })
    ).toEqual(["a", "b", "c"])
    expect(locationKeywordGroupPhrases(emptyLocationKeywordGroup())).toEqual([])
  })

  test("selection helpers impose no per-kind count cap", () => {
    let group = emptyLocationKeywordGroup()
    for (let index = 0; index < 25; index += 1) {
      group = toggleLocationKeyword(group, "brand", `keyword ${index}`)
    }
    expect(group.branded).toHaveLength(25)
    expect(LOCATION_KEYWORD_MAX_PHRASE_RUNES).toBe(200)
  })

  test("normalize tolerates a missing response and drops non-string entries", () => {
    expect(normalizeLocationKeywordLists(undefined)).toEqual({
      can_manage_keywords: false,
      user_defined: emptyLocationKeywordGroup(),
      revserp_suggested: emptyLocationKeywordGroup(),
      selected: emptyLocationKeywordGroup(),
      suggested_origins: {},
    })

    const partial = {
      can_manage_keywords: true,
      user_defined: { branded: ["keep", 5, null], non_branded: "nope" },
    } as unknown as LocationKeywordListsResponse
    const normalized = normalizeLocationKeywordLists(partial)
    expect(normalized.can_manage_keywords).toBe(true)
    expect(normalized.user_defined).toEqual({
      branded: ["keep"],
      non_branded: [],
    })
    expect(normalized.selected).toEqual(emptyLocationKeywordGroup())
    expect(normalized.suggested_origins).toEqual({})
  })

  test("union rows dedupe both sources and keep selected-only leftovers", () => {
    const rows = buildLocationSelectedUnionRows(
      { branded: ["Acme"], non_branded: ["Plumber"] },
      { branded: ["acme", "Acme Plumbing"], non_branded: [] },
      { branded: ["Old Pick"], non_branded: [] }
    )
    expect(rows.map((row) => row.phrase)).toEqual([
      "Acme",
      "Plumber",
      "Acme Plumbing",
      "Old Pick",
    ])
    expect(rows.map((row) => row.origin)).toEqual([
      "user",
      "user",
      "suggested",
      "selected-only",
    ])
    expect(rows.map((row) => row.kind)).toEqual([
      "brand",
      "non_brand",
      "brand",
      "brand",
    ])
  })

  test("union toggle clears either kind and adds back the stored kind", () => {
    const rows = buildLocationSelectedUnionRows(
      { branded: [], non_branded: [] },
      { branded: [], non_branded: ["Plumber"] },
      { branded: [], non_branded: ["Plumber"] }
    )
    expect(rows).toHaveLength(1)
    expect(
      isLocationSelectedUnionRowChecked(
        { branded: [], non_branded: ["Plumber"] },
        rows[0]!
      )
    ).toBe(true)
    expect(
      isLocationSelectedUnionRowChecked(emptyLocationKeywordGroup(), rows[0]!)
    ).toBe(false)
    const off = toggleLocationSelectedUnionRow(
      { branded: ["Plumber"], non_branded: ["Plumber"] },
      rows[0]!
    )
    expect(off).toEqual(emptyLocationKeywordGroup())
    const on = toggleLocationSelectedUnionRow(emptyLocationKeywordGroup(), rows[0]!)
    expect(on.non_branded).toEqual(["Plumber"])
    expect(on.branded).toEqual([])
  })
})
