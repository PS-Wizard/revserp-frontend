import { afterEach, describe, expect, test } from "bun:test"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Markdown } from "@tiptap/markdown"

import {
  DraftCommentHighlight,
  getLiveDraftCommentRanges,
  updateDraftCommentDecorations,
} from "./content-comments"

afterEach(() => {
  document.body.innerHTML = ""
})

const BODY = "# Hello\n\nSome bold text here."

function mountEditor() {
  const element = document.createElement("div")
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [StarterKit, Markdown, DraftCommentHighlight],
    content: BODY,
    contentType: "markdown",
  })
  return editor
}

describe("draft comment decorations", () => {
  test("highlights render in the view but never leak into markdown or HTML", async () => {
    const editor = mountEditor()
    await flushTestDom()
    try {
      const plain = editor.getMarkdown()
      const plainHtml = editor.getHTML()
      // Comment the word "bold" (paragraph text starts after "# Hello\n\n").
      const from = BODY.indexOf("bold")
      const docFrom = editor.state.doc.textContent.indexOf("bold")
      expect(docFrom > 0).toBe(true)
      expect(from).toBe(BODY.indexOf("bold"))
      updateDraftCommentDecorations(editor, {
        add: [{ id: "c1", from: docFrom + 1, to: docFrom + 1 + "bold".length }],
        activeId: "c1",
      })
      expect(
        editor.view.dom.querySelectorAll(".draft-comment-mark")
      ).toHaveLength(1)
      expect(
        editor.view.dom.querySelector(".draft-comment-mark-active") ===
          null
      ).toBe(false)
      // Serialization is decoration-free.
      expect(editor.getMarkdown()).toBe(plain)
      expect(editor.getHTML()).toBe(plainHtml)
    } finally {
      editor.destroy()
    }
  })

  test("ranges map through typing and drop when their text is deleted", async () => {
    const editor = mountEditor()
    await flushTestDom()
    try {
      const docFrom = editor.state.doc.textContent.indexOf("bold") + 1
      const range = { id: "c1", from: docFrom, to: docFrom + 4 }
      updateDraftCommentDecorations(editor, { add: [range] })

      // Insert before the range: it shifts right by the inserted length.
      editor.commands.insertContentAt(1, "Hi. ")
      const shifted = getLiveDraftCommentRanges(editor).get("c1")
      expect(shifted).toEqual({ from: range.from + 4, to: range.to + 4 })

      // Delete the commented word itself: the comment drops.
      const live = getLiveDraftCommentRanges(editor).get("c1")
      expect(live === undefined).toBe(false)
      editor.commands.deleteRange({ from: live!.from, to: live!.to })
      expect(getLiveDraftCommentRanges(editor).has("c1")).toBe(false)
      expect(editor.getMarkdown().includes("bold")).toBe(false)
    } finally {
      editor.destroy()
    }
  })
})
