import { describe, expect, test, afterEach } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { RevbotMarkdown } from "~/components/revbot/revbot-markdown"
import { contentBlocksToMarkdown } from "./content-blocks-to-markdown"
import {
  EDITOR_MARKDOWN_COMPONENTS,
  EXTRACTION_EMPTY_MESSAGE,
  EXTRACTION_FAILED_MESSAGE,
  EditorTable,
  LEGACY_MESSAGE,
  getExtractionUnavailableReason,
  getUnavailableMessage,
  resolvePageEditorContent,
  type CrawlPage,
} from "./page-editor"

installTestDom()

afterEach(() => {
  document.body.innerHTML = ""
})

function page(overrides: Partial<CrawlPage> = {}): CrawlPage {
  return {
    url: "https://example.com/page",
    title: "Example",
    content_blocks: [{ tag: "p", text: "Hello", html: "Hello" }],
    ...overrides,
  }
}

describe("extraction status", () => {
  test("only empty/failed reasons are unavailable", () => {
    expect(
      getExtractionUnavailableReason({ content_extraction_status: "failed" })
    ).toBe("failed")
    expect(
      getExtractionUnavailableReason({ content_extraction_status: "empty" })
    ).toBe("empty")
    expect(
      getExtractionUnavailableReason({ content_extraction_status: "ok" })
    ).toBeNull()
    expect(getExtractionUnavailableReason({})).toBeNull()
    expect(
      getExtractionUnavailableReason({ content_extraction_status: null })
    ).toBeNull()
  })

  test("unavailable messages are distinct from the legacy recrawl message", () => {
    expect(LEGACY_MESSAGE.toLowerCase()).toContain("recrawl")
    expect(getUnavailableMessage("empty")).toBe(EXTRACTION_EMPTY_MESSAGE)
    expect(getUnavailableMessage("failed")).toBe(EXTRACTION_FAILED_MESSAGE)
    expect(EXTRACTION_EMPTY_MESSAGE).toContain("unavailable")
    expect(EXTRACTION_FAILED_MESSAGE).toContain("unavailable")
    expect(String(EXTRACTION_EMPTY_MESSAGE) === String(LEGACY_MESSAGE)).toBe(
      false
    )
    expect(String(EXTRACTION_FAILED_MESSAGE) === String(LEGACY_MESSAGE)).toBe(
      false
    )
  })
})

describe("resolvePageEditorContent", () => {
  test("legacy valid blocks still resolve without new fields", () => {
    const resolved = resolvePageEditorContent(page({}))
    expect(resolved.status).toBe("document")
    if (resolved.status === "document") {
      expect(resolved.markdown).toContain("Hello")
    }
  })

  test("invalid blocks stay legacy when no status is reported", () => {
    expect(
      resolvePageEditorContent(page({ content_blocks: null })).status
    ).toBe("legacy")
    expect(resolvePageEditorContent(page({ content_blocks: [] })).status).toBe(
      "legacy"
    )
  })

  test("no version gate: unknown extractor with valid blocks still shows", () => {
    const resolved = resolvePageEditorContent(
      page({
        content_extractor: "go-trafilatura/v2@2.2.6",
        content_extraction_status: "ok",
      })
    )
    expect(resolved.status).toBe("document")
  })

  test("empty/failed extraction maps to unavailable, not legacy", () => {
    expect(
      resolvePageEditorContent(
        page({ content_blocks: null, content_extraction_status: "empty" })
      )
    ).toEqual({ status: "unavailable", reason: "empty" })
    expect(
      resolvePageEditorContent(
        page({ content_blocks: null, content_extraction_status: "failed" })
      )
    ).toEqual({ status: "unavailable", reason: "failed" })
  })

  test("valid blocks win even when status is set", () => {
    const resolved = resolvePageEditorContent(
      page({ content_extraction_status: "empty" })
    )
    expect(resolved.status).toBe("document")
  })

  test("never falls back to visible_text", () => {
    const resolved = resolvePageEditorContent(
      page({
        content_blocks: null,
        visible_text: "should not leak",
        content_extraction_status: "failed",
      })
    )
    expect(resolved.status).toBe("unavailable")
    expect(JSON.stringify(resolved).includes("should not leak")).toBe(false)
  })
})

describe("editor table render", () => {
  test("editor markdown components include a table wrapper", () => {
    expect(EDITOR_MARKDOWN_COMPONENTS.table).toBe(EditorTable)
  })

  test("GFM tables from converted blocks actually render a table", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(
          <RevbotMarkdown components={EDITOR_MARKDOWN_COMPONENTS}>
            {"| Name | Age |\n| --- | --- |\n| Ada | 36 |"}
          </RevbotMarkdown>
        )
        await flushTestDom()
      })
      const table = container.querySelector("table")
      expect(table === null).toBe(false)
      expect(table?.closest(".typeset-scroll") === null).toBe(false)
      expect(container.textContent ?? "").toContain("Ada")
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })

  test("converted cell breaks render as spaces, not literal br text", async () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "table",
          text: "a b",
          html: "<table><tr><th>a</th><th>b</th></tr><tr><td>one<br>two</td><td><p>First</p><p>Second</p></td></tr></table>",
        },
      ],
      "https://example.com/page"
    )
    expect((markdown ?? "").includes("<br")).toBe(false)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(
          <RevbotMarkdown components={EDITOR_MARKDOWN_COMPONENTS}>
            {markdown ?? ""}
          </RevbotMarkdown>
        )
        await flushTestDom()
      })
      const text = container.textContent ?? ""
      expect(text).toContain("one two")
      expect(text).toContain("First Second")
      expect(text.includes("<br")).toBe(false)
      expect(container.querySelector("br") === null).toBe(true)
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })
})
