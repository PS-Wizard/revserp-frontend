import { describe, expect, test } from "bun:test"

import { installTestDom } from "~/lib/dom-test-setup"
import {
  contentBlocksToMarkdown,
  isValidContentBlocks,
} from "./content-blocks-to-markdown"

installTestDom()

const PAGE_URL = "https://example.com/docs/page"

describe("isValidContentBlocks", () => {
  test("accepts the supported block contract including table", () => {
    expect(
      isValidContentBlocks([
        { tag: "h1", text: "Title", html: "Title" },
        { tag: "p", text: "Body", html: "Body" },
        {
          tag: "table",
          text: "a b",
          html: "<table><tr><th>a</th><th>b</th></tr></table>",
        },
      ])
    ).toBe(true)
  })

  test("accepts legacy blocks without html and mixed case tags", () => {
    expect(
      isValidContentBlocks([
        { tag: "H2", text: "Title" },
        { tag: "P", text: "Body" },
      ])
    ).toBe(true)
  })

  test("rejects unsupported tags and malformed blocks", () => {
    expect(isValidContentBlocks([])).toBe(false)
    expect(isValidContentBlocks([{ tag: "div", text: "x" }])).toBe(false)
    expect(isValidContentBlocks([{ tag: "script", text: "x" }])).toBe(false)
    expect(isValidContentBlocks([{ tag: "p" }])).toBe(false)
    expect(isValidContentBlocks([{ tag: "p", text: 1 }])).toBe(false)
    expect(isValidContentBlocks("nope")).toBe(false)
  })
})

describe("contentBlocksToMarkdown compatibility", () => {
  test("keeps heading, list order/nesting, and inline formatting", () => {
    const markdown = contentBlocksToMarkdown(
      [
        { tag: "h2", text: "Title", html: "Title <strong>bold</strong>" },
        {
          tag: "ul",
          text: "a b",
          html: "<li>first <em>one</em></li><li>second<ul><li>nested</li></ul></li>",
        },
        {
          tag: "ol",
          text: "a b",
          html: "<li>one</li><li>two</li>",
        },
      ],
      PAGE_URL
    )
    expect(markdown).toContain("## Title **bold**")
    expect(markdown).toContain("- first *one*")
    expect(markdown).toContain("- second")
    expect(markdown).toContain("nested")
    expect(markdown).toContain("1. one")
    expect(markdown).toContain("2. two")
  })

  test("keeps images with relative urls and preserves code whitespace", () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "p",
          text: "photo",
          html: 'See <img src=\"/img/photo.png\" alt=\"photo\"> here',
        },
        {
          tag: "pre",
          text: "  indented\n\tcode  ",
          html: "  indented\n\tcode  ",
        },
        {
          tag: "p",
          text: "code",
          html: "Use <code>  spaced  </code> now",
        },
      ],
      PAGE_URL
    )
    expect(markdown).toContain("![photo](https://example.com/img/photo.png)")
    expect(markdown).toContain("  indented")
    expect(markdown).toContain("`   spaced   `")
  })

  test("filters unsafe protocols but keeps relative urls", () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "p",
          text: "links",
          html: '<a href=\"javascript:alert(1)\">bad</a> <a href=\"/ok\">good</a> <a href=\"https://safe.test/x\">safe</a>',
        },
      ],
      PAGE_URL
    )
    expect((markdown ?? "").includes("javascript:")).toBe(false)
    expect(markdown).toContain("good")
    expect(markdown).toContain("https://example.com/ok")
    expect(markdown).toContain("https://safe.test/x")
  })
})

describe("contentBlocksToMarkdown table", () => {
  test("converts headers and cells to GFM", () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "table",
          text: "Name Age Ada 36",
          html: "<table><thead><tr><th>Name</th><th>Age</th></tr></thead><tbody><tr><td>Ada</td><td>36</td></tr></tbody></table>",
        },
      ],
      PAGE_URL
    )
    expect(markdown).toBe("| Name | Age |\n| --- | --- |\n| Ada | 36 |")
  })

  test("keeps inline formatting, links, and relative urls in cells", () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "table",
          text: "Doc Link",
          html: '<table><tr><th>Doc</th><th>Link</th></tr><tr><td><strong>Guide</strong> <code>v2</code></td><td><a href="/docs">open</a></td></tr></table>',
        },
      ],
      PAGE_URL
    )
    expect(markdown).toContain("**Guide**")
    expect(markdown).toContain("`v2`")
    expect(markdown).toContain("[open](https://example.com/docs)")
  })

  test("flattens cell line breaks to spaces (no raw <br />)", () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "table",
          text: "a b",
          html: "<table><tr><th>a</th><th>b</th></tr><tr><td>one<br>two</td><td>three</td></tr></table>",
        },
      ],
      PAGE_URL
    )
    const lines = (markdown ?? "").split("\n")
    expect(lines).toHaveLength(3)
    expect(lines[2]).toContain("one two")
    expect((markdown ?? "").includes("<br")).toBe(false)
  })

  test("keeps word boundaries across block elements in cells", () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "table",
          text: "a b",
          html: "<table><tr><th>a</th><th>b</th></tr><tr><td><p>First</p><p>Second</p></td><td><ul><li>x</li><li>y</li></ul></td></tr></table>",
        },
      ],
      PAGE_URL
    )
    expect(markdown ?? "").toContain("First Second")
    expect((markdown ?? "").includes("FirstSecond")).toBe(false)
    expect(markdown ?? "").toContain("x y")
    expect((markdown ?? "").includes("<br")).toBe(false)
  })

  test("keeps boundaries between mixed inline and block runs in cells", () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "table",
          text: "a",
          html: "<table><tr><th>a</th></tr><tr><td>Intro<div>Block</div>Tail</td></tr></table>",
        },
      ],
      PAGE_URL
    )
    expect(markdown ?? "").toContain("Intro Block Tail")
    expect((markdown ?? "").includes("IntroBlock")).toBe(false)
    expect((markdown ?? "").includes("<br")).toBe(false)
  })

  test("escapes pipes so columns stay intact", () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "table",
          text: "a|b c",
          html: "<table><tr><th>a</th></tr><tr><td>a|b</td></tr></table>",
        },
      ],
      PAGE_URL
    )
    expect(markdown).toContain("a\\|b")
  })

  test("unsafe table links cannot inject javascript or images", () => {
    const markdown = contentBlocksToMarkdown(
      [
        {
          tag: "table",
          text: "bad img",
          html: '<table><tr><th>x</th><th>y</th></tr><tr><td><a href="javascript:alert(1)">bad</a></td><td><img src="javascript:alert(1)" alt="img"></td></tr></table>',
        },
      ],
      PAGE_URL
    )
    expect((markdown ?? "").includes("javascript:")).toBe(false)
    expect(markdown).toContain("bad")
    expect((markdown ?? "").includes("![img]")).toBe(false)
  })

  test("empty tables fall back instead of emitting broken GFM", () => {
    expect(
      contentBlocksToMarkdown(
        [{ tag: "table", text: "", html: "<table></table>" }],
        PAGE_URL
      )
    ).toBeNull()
  })
})
