import { describe, expect, test } from "bun:test"

import {
  locationWebsiteScopeMatchesPage,
  normalizeLocationWebsiteScopeUrl,
  validateLocationWebsiteScopeInput,
} from "~/components/locations/location-website-scope"

function expectInvalid(url: string, match: "exact" | "subtree" | "none") {
  expect(typeof validateLocationWebsiteScopeInput(url, match)).toBe("string")
}

describe("validateLocationWebsiteScopeInput", () => {
  test("exact and subtree require an absolute http(s) URL", () => {
    expectInvalid("", "exact")
    expectInvalid("", "subtree")
    expectInvalid("/locations/springfield/", "exact")
    expectInvalid("ftp://example.com/a", "exact")
    expect(
      validateLocationWebsiteScopeInput(
        "https://example.com/locations/springfield/",
        "exact"
      )
    ).toBeNull()
    expect(
      validateLocationWebsiteScopeInput("https://example.com/blog/", "subtree")
    ).toBeNull()
  })

  test("rejects ambiguous encoded slash, dot, and dot-segment paths", () => {
    expectInvalid("https://example.com/a%2Fb", "subtree")
    expectInvalid("https://example.com/a%2Eb", "exact")
    expectInvalid("https://example.com/a/../b", "subtree")
  })

  test("clearing the scope needs match none and an empty URL", () => {
    expect(validateLocationWebsiteScopeInput("", "none")).toBeNull()
    expectInvalid("https://example.com/a", "none")
  })
})

describe("normalizeLocationWebsiteScopeUrl", () => {
  test("ignores query and fragment and trailing slash", () => {
    expect(
      normalizeLocationWebsiteScopeUrl(
        "https://Example.com/locations/springfield/?utm=x#top"
      )
    ).toBe("https://example.com/locations/springfield")
    expect(normalizeLocationWebsiteScopeUrl("https://example.com/")).toBe(
      "https://example.com/"
    )
  })

  test("returns null when unparseable", () => {
    expect(normalizeLocationWebsiteScopeUrl("not a url")).toBeNull()
  })
})

describe("locationWebsiteScopeMatchesPage", () => {
  test("exact matches one page regardless of query or fragment", () => {
    expect(
      locationWebsiteScopeMatchesPage(
        "https://example.com/locations/springfield/",
        "exact",
        "https://example.com/locations/springfield/?utm=x#top"
      )
    ).toBe(true)
    expect(
      locationWebsiteScopeMatchesPage(
        "https://example.com/locations/springfield/",
        "exact",
        "https://example.com/locations/springfield/menu"
      )
    ).toBe(false)
  })

  test("exact ignores trailing slashes like the backend matcher", () => {
    expect(
      locationWebsiteScopeMatchesPage(
        "https://example.com/about",
        "exact",
        "https://example.com/about/"
      )
    ).toBe(true)
    expect(
      locationWebsiteScopeMatchesPage(
        "https://example.com/about/",
        "exact",
        "https://example.com/about"
      )
    ).toBe(true)
    expect(
      locationWebsiteScopeMatchesPage(
        "https://example.com",
        "exact",
        "https://example.com/"
      )
    ).toBe(true)
  })

  test("subtree respects path segment boundaries", () => {
    const scope = "https://example.com/blog/"
    expect(
      locationWebsiteScopeMatchesPage(scope, "subtree", "https://example.com/blog/")
    ).toBe(true)
    expect(
      locationWebsiteScopeMatchesPage(
        scope,
        "subtree",
        "https://example.com/blog/hello-world"
      )
    ).toBe(true)
    expect(
      locationWebsiteScopeMatchesPage(
        scope,
        "subtree",
        "https://example.com/blog-post"
      )
    ).toBe(false)
    expect(
      locationWebsiteScopeMatchesPage(scope, "subtree", "https://example.com/")
    ).toBe(false)
  })

  test("root subtree matches every same-origin page only", () => {
    expect(
      locationWebsiteScopeMatchesPage(
        "https://example.com/",
        "subtree",
        "https://example.com/anything/deep"
      )
    ).toBe(true)
    expect(
      locationWebsiteScopeMatchesPage(
        "https://example.com/",
        "subtree",
        "https://other.com/anything"
      )
    ).toBe(false)
  })

  test("foreign origins never match and none never matches", () => {
    expect(
      locationWebsiteScopeMatchesPage(
        "https://example.com/blog/",
        "subtree",
        "https://other.com/blog/x"
      )
    ).toBe(false)
    expect(
      locationWebsiteScopeMatchesPage(
        "https://example.com/blog/",
        "none",
        "https://example.com/blog/x"
      )
    ).toBe(false)
  })
})
