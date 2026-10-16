import { describe, expect, test } from "bun:test"

import {
  LOCATION_KEYWORD_MAX_PHRASE_RUNES,
  buildLocationCombinedRows,
  emptyLocationKeywordGroup,
  isLocationKeywordSelected,
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

  test("combined rows dedupe sources, keep legacy leftovers, source kind wins", () => {
    const rows = buildLocationCombinedRows(
      { branded: ["Acme"], non_branded: ["Plumber"] },
      { branded: ["acme", "Acme Plumbing"], non_branded: [] },
      { branded: ["Old Pick"], non_branded: ["ACME"] }
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
      "legacy",
    ])
    expect(rows.map((row) => row.kind)).toEqual([
      "brand",
      "non_brand",
      "brand",
      "brand",
    ])
  })

  test("normalize promotes legacy saved terms into user-defined", () => {
    const normalized = normalizeLocationKeywordLists({
      can_manage_keywords: true,
      user_defined: { branded: ["Acme"], non_branded: [] },
      revserp_suggested: { branded: [], non_branded: ["Plumber"] },
      selected: { branded: ["Old Pick", "acme"], non_branded: ["plumber"] },
      suggested_origins: {},
    })
    expect(normalized.user_defined.branded).toEqual(["Acme", "Old Pick"])
    expect(normalized.user_defined.non_branded).toEqual([])
    expect(normalized.selected.branded).toEqual(["Old Pick", "acme"])
  })
})
