import { describe, expect, test } from "bun:test"

import { quoteSelectionToMarkdown } from "./content-quote"

describe("quoteSelectionToMarkdown", () => {
  test("blank selections produce no quote", () => {
    expect(quoteSelectionToMarkdown("   \n  ")).toBeNull()
    expect(quoteSelectionToMarkdown("")).toBeNull()
  })

  test("single line gets quoted with a trailing blank line", () => {
    expect(quoteSelectionToMarkdown("local seo tips")).toBe(
      "> local seo tips\n\n"
    )
  })

  test("multiline selections quote every line", () => {
    expect(quoteSelectionToMarkdown("First line\nSecond line  ")).toBe(
      "> First line\n> Second line\n\n"
    )
  })
})
