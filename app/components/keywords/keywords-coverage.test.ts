import { describe, expect, test } from "bun:test"

import {
  buildBulkContentPrompt,
  buildContentPrompt,
  CONTENT_PROMPT_PARAM,
  contentBulkWriteTarget,
  contentWriteTarget,
  MAX_BULK_CONTENT_KEYWORDS,
} from "~/components/keywords/keywords-coverage"

describe("buildContentPrompt", () => {
  test("names the keyword without auto-send wording", () => {
    expect(buildContentPrompt("emergency plumber")).toBe(
      'Help me write a blog post about "emergency plumber"'
    )
  })
})

describe("contentWriteTarget", () => {
  test("stays in the shell with the prompt param and content hash", () => {
    const target = contentWriteTarget(
      { pathname: "/app", search: "?project=p-1" },
      "emergency plumber"
    )
    const url = new URL(target, "http://localhost")
    expect(url.pathname).toBe("/app")
    expect(url.hash).toBe("#content")
    expect(url.searchParams.get("project")).toBe("p-1")
    expect(url.searchParams.get(CONTENT_PROMPT_PARAM)).toBe(
      buildContentPrompt("emergency plumber")
    )
    expect(url.searchParams.has("draft")).toBe(false)
  })

  test("reroutes a locations pathname into the project shell", () => {
    const target = contentWriteTarget(
      { pathname: "/app/projects/p-1/locations", search: "" },
      "drain cleaning"
    )
    const url = new URL(target, "http://localhost")
    expect(url.pathname).toBe("/app")
    expect(url.hash).toBe("#content")
    expect(url.searchParams.get("project")).toBe("p-1")
    expect(url.searchParams.get(CONTENT_PROMPT_PARAM)).toBe(
      buildContentPrompt("drain cleaning")
    )
  })
})

describe("buildBulkContentPrompt", () => {
  test("formats four keywords and asks for the primary focus", () => {
    expect(buildBulkContentPrompt(["A", "B", "C", "D"])).toBe(
      'Help me write content encapsulating "A", "B", "C", "D". Also help me decide which one is the best primary focus keyword for this content.'
    )
  })

  test("uses singular wording for one keyword", () => {
    const prompt = buildBulkContentPrompt(["A"])
    expect(prompt).toContain('"A"')
    expect(prompt).toContain("primary focus")
    expect(prompt.includes("which one is")).toBe(false)
  })

  test("caps at 20 keywords", () => {
    const keywords = Array.from({ length: 25 }, (_, index) => `kw-${index}`)
    const prompt = buildBulkContentPrompt(keywords)
    expect(prompt).toContain('"kw-19"')
    expect(prompt.includes('"kw-20"')).toBe(false)
    expect(MAX_BULK_CONTENT_KEYWORDS).toBe(20)
  })
})

describe("contentBulkWriteTarget", () => {
  test("sets the bulk prompt param and content hash", () => {
    const target = contentBulkWriteTarget(
      { pathname: "/app", search: "?project=p-1" },
      ["A", "B", "C", "D"]
    )
    const url = new URL(target, "http://localhost")
    expect(url.pathname).toBe("/app")
    expect(url.hash).toBe("#content")
    expect(url.searchParams.get("project")).toBe("p-1")
    expect(url.searchParams.get(CONTENT_PROMPT_PARAM)).toBe(
      buildBulkContentPrompt(["A", "B", "C", "D"])
    )
    expect(url.searchParams.has("draft")).toBe(false)
  })

  test("reroutes a locations pathname into the project shell", () => {
    const target = contentBulkWriteTarget(
      { pathname: "/app/projects/p-1/locations", search: "" },
      ["A", "B"]
    )
    const url = new URL(target, "http://localhost")
    expect(url.pathname).toBe("/app")
    expect(url.hash).toBe("#content")
    expect(url.searchParams.get("project")).toBe("p-1")
    expect(url.searchParams.get(CONTENT_PROMPT_PARAM)).toBe(
      buildBulkContentPrompt(["A", "B"])
    )
  })
})
