import { describe, expect, test } from "bun:test"

import { buildLocationFindKeywordsPrompt } from "~/components/locations/location-keywords-revbot-prompt"

describe("buildLocationFindKeywordsPrompt", () => {
  const prompt = buildLocationFindKeywordsPrompt({
    projectId: "proj-7",
    locationId: "loc-9",
  })

  test("scopes Revbot to one location and names that location", () => {
    expect(prompt).toContain("loc-9")
    expect(prompt).toContain("proj-7")
    expect(prompt).toContain(
      "Never touch the parent project or any sibling location."
    )
  })

  test("writes only Revserp-suggested keywords through update_project_keywords", () => {
    expect(prompt).toContain("update_project_keywords")
    expect(prompt).toContain('source: "revserp"')
    expect(prompt).toContain("brand_keywords")
    expect(prompt).toContain("non_brand_keywords")
    expect(prompt).toContain("must not change user-defined keywords")
    expect(prompt).toContain("must not select or enable anything")
  })

  test("localizes from saved evidence without paid side effects", () => {
    expect(prompt).toContain("get_business_profile")
    expect(prompt).toContain("get_project_keywords")
    expect(prompt).toContain("get_location_landmarks")
    expect(prompt).toContain("include_seed_prompts: true")
    expect(prompt).toContain("omit product_description")
    expect(prompt).toContain("saved landmarks")
    expect(prompt).toContain("seed prompts")
    expect(prompt).toContain("Preserve product_description")
    expect(prompt).toContain("Never charge credits")
    expect(prompt).toContain("regenerate AI questions")
  })
})
