import { describe, expect, test } from "bun:test"

import {
  buildContentPrompt,
  CONTENT_PROMPT_PARAM,
  contentWriteTarget,
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
