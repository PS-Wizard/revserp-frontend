import { describe, expect, test } from "bun:test"

import {
  createProjectKeywordQueryMatcher,
  tokenizeProjectKeywordQueryText,
  truncateProjectKeywordQueryLabel,
} from "./keyword-query-matching"

const userDefined = [
  { keyword: "Revserp", kind: "brand" },
  { keyword: "life insurance", kind: "non_brand" },
]

describe("tokenizeProjectKeywordQueryText", () => {
  test("lowercases and normalizes unicode compatibility characters", () => {
    expect(tokenizeProjectKeywordQueryText("Best \uFB01tness")).toEqual([
      "best",
      "fitness",
    ])
    expect(tokenizeProjectKeywordQueryText("CAFÉ")).toEqual(["café"])
  })

  test("turns punctuation into word boundaries and collapses spaces", () => {
    expect(tokenizeProjectKeywordQueryText("life-insurance,  best!")).toEqual([
      "life",
      "insurance",
      "best",
    ])
    expect(
      tokenizeProjectKeywordQueryText("site.crawler/nepal (2024)")
    ).toEqual(["site", "crawler", "nepal", "2024"])
  })

  test("treats regex metacharacters as literal text, never patterns", () => {
    expect(tokenizeProjectKeywordQueryText("seo (audit)")).toEqual([
      "seo",
      "audit",
    ])
    expect(tokenizeProjectKeywordQueryText("c++")).toEqual(["c++"])
    expect(tokenizeProjectKeywordQueryText("a.b*c?d")).toEqual([
      "a",
      "b",
      "c",
      "d",
    ])
  })
})

describe("createProjectKeywordQueryMatcher", () => {
  test("matches a multi-word phrase consecutively across extra words", () => {
    const matcher = createProjectKeywordQueryMatcher(userDefined)
    expect(matcher.matchProjectKeywordQuery("best life insurance Nepal")).toEqual({
      brand: false,
      nonBrand: true,
    })
  })

  test("rejects non-consecutive tokens across a word boundary", () => {
    const matcher = createProjectKeywordQueryMatcher(userDefined)
    expect(
      matcher.matchProjectKeywordQuery("life jacket insurance plans")
    ).toEqual({ brand: false, nonBrand: false })
  })

  test("rejects substring matches inside a longer word", () => {
    const matcher = createProjectKeywordQueryMatcher([
      { keyword: "cat", kind: "non_brand" },
    ])
    expect(matcher.matchProjectKeywordQuery("education")).toEqual({
      brand: false,
      nonBrand: false,
    })
    expect(matcher.matchProjectKeywordQuery("concatenate strings")).toEqual({
      brand: false,
      nonBrand: false,
    })
    expect(matcher.matchProjectKeywordQuery("cat food")).toEqual({
      brand: false,
      nonBrand: true,
    })
  })

  test("grants both badges when the query contains both kinds", () => {
    const matcher = createProjectKeywordQueryMatcher(userDefined)
    expect(
      matcher.matchProjectKeywordQuery("Revserp life insurance review")
    ).toEqual({ brand: true, nonBrand: true })
  })

  test("preserves Indic vowel marks and rejects matches inside Indic words", () => {
    const matcher = createProjectKeywordQueryMatcher([
      { keyword: "बीमा", kind: "non_brand" },
    ])
    expect(tokenizeProjectKeywordQueryText("जीवन बीमा")).toEqual(["जीवन", "बीमा"])
    expect(matcher.matchProjectKeywordQuery("जीवन बीमा नेपाल").nonBrand).toBe(true)
    expect(matcher.matchProjectKeywordQuery("बीमाको जानकारी").nonBrand).toBe(false)
  })

  test("keeps meaningful technical symbols without interpreting regex", () => {
    const matcher = createProjectKeywordQueryMatcher([
      { keyword: "C++", kind: "non_brand" },
    ])
    expect(matcher.matchProjectKeywordQuery("C++ tutorials").nonBrand).toBe(true)
    expect(matcher.matchProjectKeywordQuery("C tutorials").nonBrand).toBe(false)
    expect(matcher.matchProjectKeywordQuery("C# tutorials").nonBrand).toBe(false)
  })

  test("handles unicode queries and punctuation variants", () => {
    const matcher = createProjectKeywordQueryMatcher([
      { keyword: "café audit", kind: "non_brand" },
      { keyword: "life insurance", kind: "non_brand" },
    ])
    expect(matcher.matchProjectKeywordQuery("Best CAFÉ audit!")).toEqual({
      brand: false,
      nonBrand: true,
    })
    expect(matcher.matchProjectKeywordQuery("best life-insurance Nepal")).toEqual({
      brand: false,
      nonBrand: true,
    })
  })

  test("skips blank keywords and blank queries without throwing", () => {
    const matcher = createProjectKeywordQueryMatcher([
      { keyword: "   ", kind: "brand" },
      { keyword: "c++", kind: "non_brand" },
    ])
    expect(matcher.matchProjectKeywordQuery("")).toEqual({
      brand: false,
      nonBrand: false,
    })
    expect(matcher.matchProjectKeywordQuery("c++ tutorial")).toEqual({
      brand: false,
      nonBrand: true,
    })
  })

  test("matches combined suggested brand terms despite unrelated user-defined entries", () => {
    const userDefinedOnly = [
      { keyword: "Something", kind: "brand" },
      { keyword: "Else", kind: "non_brand" },
      { keyword: "New", kind: "non_brand" },
      { keyword: "Blah Blah", kind: "non_brand" },
    ]
    expect(
      createProjectKeywordQueryMatcher(userDefinedOnly).matchProjectKeywordQuery(
        "revketer — pricing"
      )
    ).toEqual({ brand: false, nonBrand: false })
    const combined = [...userDefinedOnly, { keyword: "RevKeter", kind: "brand" }]
    const matcher = createProjectKeywordQueryMatcher(combined)
    expect(matcher.matchProjectKeywordQuery("revketer — pricing")).toEqual({
      brand: true,
      nonBrand: false,
    })
  })
})

describe("truncateProjectKeywordQueryLabel", () => {
  test("leaves short queries untouched", () => {
    expect(truncateProjectKeywordQueryLabel("best life insurance Nepal")).toBe(
      "best life insurance Nepal"
    )
    expect(truncateProjectKeywordQueryLabel("x".repeat(120))).toBe(
      "x".repeat(120)
    )
  })

  test("truncates at 120 code points plus an ellipsis", () => {
    const truncated = truncateProjectKeywordQueryLabel("x".repeat(121))
    expect(truncated).toBe(`${"x".repeat(120)}…`)
    expect(Array.from(truncated).length).toBe(121)
  })

  test("never splits an emoji surrogate pair at the cutoff", () => {
    const query = "x".repeat(119) + "😀" + "tail"
    expect(truncateProjectKeywordQueryLabel(query)).toBe(
      "x".repeat(119) + "😀…"
    )
  })
})
