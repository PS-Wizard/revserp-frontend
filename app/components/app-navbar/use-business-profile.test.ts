import { describe, expect, test } from "bun:test"

import {
  businessProfileScopedQueryKey,
  locationBusinessProfilePath,
} from "./use-business-profile"

import {
  locationAIQuestionsPath,
  promptGenerationScopeMatches,
} from "./use-business-profile"

describe("business profile location scope", () => {
  test("parent uses the project endpoint and key", () => {
    expect(locationBusinessProfilePath("p-1")).toBe(
      "/projects/p-1/business-profile"
    )
    expect(locationBusinessProfilePath("p-1", null)).toBe(
      "/projects/p-1/business-profile"
    )
    expect(businessProfileScopedQueryKey("p-1")).toEqual(["business-profile", "p-1"])
  })

  test("scoped uses the location endpoint and key with both ids", () => {
    expect(locationBusinessProfilePath("p-1", "l-9")).toBe(
      "/projects/p-1/locations/l-9/business-profile"
    )
    expect(businessProfileScopedQueryKey("p-1", "l-9")).toEqual([
      "business-profile",
      "p-1",
      "l-9",
    ])
  })

  test("location id is never substituted for the project id", () => {
    const path = locationBusinessProfilePath("p-1", "l-9")
    expect(path.startsWith("/projects/p-1/locations/l-9/")).toBe(true)
    expect(path.includes("/projects/l-9")).toBe(false)
  })

describe("location AI question path", () => {
  test("keeps the project id and scopes the location id", () => {
    expect(locationAIQuestionsPath("p-1", "l-9")).toBe(
      "/projects/p-1/locations/l-9/ai-questions"
    )
    expect(locationAIQuestionsPath("p-1", "l-9").includes("/projects/l-9")).toBe(false)
  })
})
})

describe("prompt generation event scope", () => {
  test("parent pending matches only parent/missing location events", () => {
    expect(promptGenerationScopeMatches(null, undefined)).toBe(true)
    expect(promptGenerationScopeMatches(null, null)).toBe(true)
    expect(promptGenerationScopeMatches(null, "")).toBe(true)
    expect(promptGenerationScopeMatches(null, "l-9")).toBe(false)
  })

  test("local pending matches only its own location event", () => {
    expect(promptGenerationScopeMatches("l-a", "l-a")).toBe(true)
    expect(promptGenerationScopeMatches("l-a", "l-b")).toBe(false)
    expect(promptGenerationScopeMatches("l-a", undefined)).toBe(false)
    expect(promptGenerationScopeMatches("l-a", null)).toBe(false)
  })
})
