import { describe, expect, test } from "bun:test"
import { normalizeTableMarkdown } from "~/components/content/content-editor"

describe("normalizeTableMarkdown", () => {
  test("joins table rows split by blank lines", () => {
    const input = [
      "| Month | Savings |",
      "",
      "| -------- | ------- |",
      "",
      "| January | $250 |",
      "",
      "| February | $80 |",
      "",
      "| March | $420 |",
    ].join("\n")
    expect(normalizeTableMarkdown(input)).toBe(
      [
        "| Month | Savings |",
        "| -------- | ------- |",
        "| January | $250 |",
        "| February | $80 |",
        "| March | $420 |",
      ].join("\n")
    )
  })

  test("leaves contiguous tables alone", () => {
    const input = [
      "| Month | Savings |",
      "| -------- | ------- |",
      "| January | $250 |",
    ].join("\n")
    expect(normalizeTableMarkdown(input)).toBe(input)
  })

  test("leaves fenced code blocks alone", () => {
    const input = ["```", "| a |", "", "| b |", "```"].join("\n")
    expect(normalizeTableMarkdown(input)).toBe(input)
  })
})
