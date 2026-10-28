import { describe, expect, test } from "bun:test"

import { buildCommentsMessage } from "./content-comments"

describe("buildCommentsMessage", () => {
  test("empty stays empty-shaped", () => {
    expect(buildCommentsMessage([])).toBe(
      "Please address these comments on the draft (use edit_draft):\n\n"
    )
  })

  test("numbers each comment with exact text and note", () => {
    expect(
      buildCommentsMessage([
        { snippet: "local seo for dentists", note: "Too generic, name Austin." },
        { snippet: "Call us today!", note: "Soften the CTA." },
      ])
    ).toBe(
      'Please address these comments on the draft (use edit_draft):\n\n1. On: "local seo for dentists"\n   Comment: Too generic, name Austin.\n\n2. On: "Call us today!"\n   Comment: Soften the CTA.'
    )
  })
})
