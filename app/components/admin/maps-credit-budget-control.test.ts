import { describe, expect, test } from "bun:test"

import {
  isValidMapsBudgetValue,
  mapsCreditBudgetPath,
  parseMapsBudgetInput,
} from "~/components/admin/maps-credit-budget-control"

describe("mapsCreditBudgetPath", () => {
  test("org scope targets the organization route", () => {
    expect(mapsCreditBudgetPath({ kind: "org", orgId: "o-1" })).toBe(
      "/admin/organizations/o-1/maps-budget"
    )
  })

  test("platform scope targets the platform route", () => {
    expect(mapsCreditBudgetPath({ kind: "platform" })).toBe(
      "/admin/maps-budget/platform"
    )
  })
})

describe("isValidMapsBudgetValue", () => {
  test("accepts zero and the 1e9 cap", () => {
    expect(isValidMapsBudgetValue(0)).toBe(true)
    expect(isValidMapsBudgetValue(1_000_000_000)).toBe(true)
  })

  test("rejects negatives, fractions, and over-cap values", () => {
    expect(isValidMapsBudgetValue(-1)).toBe(false)
    expect(isValidMapsBudgetValue(1.5)).toBe(false)
    expect(isValidMapsBudgetValue(Number.NaN)).toBe(false)
    expect(isValidMapsBudgetValue(1_000_000_001)).toBe(false)
  })
})

describe("parseMapsBudgetInput", () => {
  test("parses whole credits and rejects anything else", () => {
    expect(parseMapsBudgetInput("135")).toBe(135)
    expect(parseMapsBudgetInput(" 135 ")).toBe(135)
    expect(parseMapsBudgetInput("")).toBeNull()
    expect(parseMapsBudgetInput("-5")).toBeNull()
    expect(parseMapsBudgetInput("1.5")).toBeNull()
    expect(parseMapsBudgetInput("abc")).toBeNull()
    expect(parseMapsBudgetInput("1000000001")).toBeNull()
  })
})
