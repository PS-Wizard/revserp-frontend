export type ParsedBlock = {
  tag: string
  text: string
  html?: string
}

const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"])
const SUPPORTED_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "blockquote",
  "img",
  "pre",
  "table",
])

function escapeMarkdownText(value: string) {
  return value.replace(/([\\`*_[\]{}#+.!|>~-])/g, "\\$1")
}

function textToMarkdown(value: string) {
  return escapeMarkdownText(value.replace(/\r\n?/g, "\n")).replace(
    /\n/g,
    "\\\n"
  )
}

function trimMarkdownBlock(value: string) {
  return value.replace(/^(?:\s|\\)+/, "").replace(/(?:\s|\\)+$/, "")
}

function escapeMarkdownUrl(value: string) {
  return value.replace(/[\\()]/g, (character) => `\\${character}`)
}

function safeUrl(value: string, pageUrl: string) {
  try {
    const url = new URL(value, pageUrl)
    return SAFE_SCHEMES.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function imageUrl(element: Element, pageUrl: string) {
  for (const attribute of [
    "data-src",
    "data-lazy-src",
    "data-original",
    "src",
  ]) {
    const value = element.getAttribute(attribute)
    const url = value ? safeUrl(value, pageUrl) : null
    if (url) return url
  }
  return null
}

function fencedCode(value: string) {
  const longestRun = Math.max(
    0,
    ...Array.from(value.matchAll(/`+/g), (match) => match[0].length)
  )
  const fence = "`".repeat(Math.max(3, longestRun + 1))
  return `${fence}\n${value.replace(/\r\n?/g, "\n").replace(/\n?$/, "\n")}${fence}`
}

function inlineCode(value: string) {
  const longestRun = Math.max(
    0,
    ...Array.from(value.matchAll(/`+/g), (match) => match[0].length)
  )
  const fence = "`".repeat(longestRun + 1)
  const padded = /^\s|\s$|^`|`$/.test(value) ? ` ${value} ` : value
  return `${fence}${padded}${fence}`
}

function inlineChildren(node: Node, pageUrl: string): string {
  if (node.nodeType === Node.TEXT_NODE)
    return textToMarkdown(node.nodeValue ?? "")
  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const element = node as Element
  const tag = element.tagName.toLowerCase()
  const children = Array.from(element.childNodes)
    .map((child) => inlineChildren(child, pageUrl))
    .join("")

  switch (tag) {
    case "strong":
    case "b":
      return children ? `**${children}**` : ""
    case "em":
    case "i":
      return children ? `*${children}*` : ""
    case "del":
    case "s":
    case "strike":
      return children ? `~~${children}~~` : ""
    case "code":
      return inlineCode(element.textContent ?? "")
    case "a": {
      const href = element.getAttribute("href")
      const url = href ? safeUrl(href, pageUrl) : null
      return url && children
        ? `[${children}](${escapeMarkdownUrl(url)})`
        : children
    }
    case "img": {
      const url = imageUrl(element, pageUrl)
      const alt = textToMarkdown(element.getAttribute("alt") ?? "")
      return url ? `![${alt}](${escapeMarkdownUrl(url)})` : alt
    }
    case "br":
      return "\\\n"
    default:
      return children
  }
}

function listToMarkdown(element: Element, pageUrl: string): string {
  const ordered = element.tagName.toLowerCase() === "ol"
  return Array.from(element.children)
    .filter((child) => child.tagName.toLowerCase() === "li")
    .map((item, index) => {
      const content = trimMarkdownBlock(
        Array.from(item.childNodes)
          .filter(
            (child) =>
              !(
                child.nodeType === Node.ELEMENT_NODE &&
                /^(ul|ol)$/i.test((child as Element).tagName)
              )
          )
          .map((child) => inlineChildren(child, pageUrl))
          .join("")
      ).replace(/\n/g, "\n  ")
      const nested: string = Array.from(item.children)
        .filter((child) => /^(ul|ol)$/i.test(child.tagName))
        .map((child) =>
          listToMarkdown(child, pageUrl)
            .split("\n")
            .map((line) => `    ${line}`)
            .join("\n")
        )
        .join("\n")
      const marker = ordered ? `${index + 1}.` : "-"
      return `${marker} ${content}${nested ? `\n${nested}` : ""}`
    })
    .join("\n")
}

const TABLE_CELL_BLOCKS = new Set([
  "p",
  "div",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "ul",
  "ol",
])

// GFM table cells must stay on one line and the renderer has no raw-HTML
// plugin, so block boundaries and line breaks inside a cell flatten to a
// space instead of <br /> (which would render as literal text).
function tableCellChildren(node: Node, pageUrl: string): string {
  if (node.nodeType === Node.TEXT_NODE)
    return textToMarkdown(node.nodeValue ?? "")
  if (node.nodeType !== Node.ELEMENT_NODE) return ""
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (tag === "br") return "\n"
  if (TABLE_CELL_BLOCKS.has(tag)) {
    const text = trimMarkdownBlock(
      Array.from(element.childNodes)
        .map((child) => tableCellChildren(child, pageUrl))
        .join("")
    )
    return text ? `\n${text}\n` : ""
  }
  return inlineChildren(node, pageUrl)
}

function tableCellToMarkdown(cell: Element, pageUrl: string): string {
  const raw = trimMarkdownBlock(
    Array.from(cell.childNodes)
      .map((child) => tableCellChildren(child, pageUrl))
      .join("")
  )
  if (!raw) return ""
  return raw
    .replace(/\\\n/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/(?<!\\)\|/g, "\\|")
}

function tableToMarkdown(table: Element, pageUrl: string): string | null {
  const rows = Array.from(table.querySelectorAll("tr")).filter(
    (row) => row.closest("table") === table
  )
  const parsed = rows
    .map((row) =>
      Array.from(row.children)
        .filter((cell) => /^(th|td)$/i.test(cell.tagName))
        .map((cell) => tableCellToMarkdown(cell, pageUrl))
    )
    .filter((cells) => cells.length > 0)
  if (parsed.length === 0) return null
  if (parsed.every((cells) => cells.every((cell) => !cell))) return null
  const columnCount = Math.max(...parsed.map((cells) => cells.length))
  const padded = parsed.map((cells) =>
    cells.length < columnCount
      ? [...cells, ...Array<string>(columnCount - cells.length).fill("")]
      : cells
  )
  const [header, ...body] = padded
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((cells) => `| ${cells.join(" | ")} |`),
  ].join("\n")
}

function elementToMarkdown(element: Element, pageUrl: string) {
  const tag = element.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) {
    return `${"#".repeat(Number(tag[1]))} ${trimMarkdownBlock(
      inlineChildren(element, pageUrl)
    )}`
  }
  if (tag === "blockquote") {
    return trimMarkdownBlock(inlineChildren(element, pageUrl))
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
  }
  if (tag === "ul" || tag === "ol") return listToMarkdown(element, pageUrl)
  if (tag === "table") return tableToMarkdown(element, pageUrl) ?? ""
  if (tag === "pre") return fencedCode(element.textContent ?? "")
  return trimMarkdownBlock(inlineChildren(element, pageUrl))
}

function fallbackBlockToMarkdown(block: ParsedBlock) {
  const tag = block.tag.toLowerCase()
  const text = trimMarkdownBlock(textToMarkdown(block.text))
  if (!text) return ""
  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${text}`
  if (tag === "blockquote") {
    return text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
  }
  if (tag === "ul") return `- ${text.replace(/\n/g, "\n  ")}`
  if (tag === "ol") return `1. ${text.replace(/\n/g, "\n   ")}`
  if (tag === "pre") return fencedCode(block.text)
  return text
}

function blockToMarkdown(block: ParsedBlock, pageUrl: string) {
  const tag = block.tag.toLowerCase()
  if (!SUPPORTED_TAGS.has(tag) || !block.html) {
    return fallbackBlockToMarkdown(block)
  }

  const document = new DOMParser().parseFromString("", "text/html")
  if (tag === "img") {
    const imageDocument = new DOMParser().parseFromString(
      block.html,
      "text/html"
    )
    const image = imageDocument.body.querySelector("img")
    return image
      ? elementToMarkdown(image, pageUrl)
      : fallbackBlockToMarkdown(block)
  }

  if (tag === "table") {
    const tableDocument = new DOMParser().parseFromString(
      block.html,
      "text/html"
    )
    const found = tableDocument.querySelector("table")
    if (found)
      return tableToMarkdown(found, pageUrl) ?? fallbackBlockToMarkdown(block)
    const tableWrapper = document.createElement("table")
    tableWrapper.innerHTML = block.html
    return (
      tableToMarkdown(tableWrapper, pageUrl) ?? fallbackBlockToMarkdown(block)
    )
  }

  const wrapper = document.createElement(tag)
  wrapper.innerHTML = block.html
  return elementToMarkdown(wrapper, pageUrl)
}

export function isValidContentBlocks(value: unknown): value is ParsedBlock[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (block) =>
        typeof block === "object" &&
        block !== null &&
        typeof (block as ParsedBlock).tag === "string" &&
        SUPPORTED_TAGS.has((block as ParsedBlock).tag.toLowerCase()) &&
        typeof (block as ParsedBlock).text === "string" &&
        (typeof (block as ParsedBlock).html === "undefined" ||
          typeof (block as ParsedBlock).html === "string")
    )
  )
}

export function contentBlocksToMarkdown(
  blocks: ParsedBlock[],
  pageUrl: string
) {
  if (!isValidContentBlocks(blocks)) return null
  const markdown = blocks
    .map((block) => blockToMarkdown(block, pageUrl))
    .filter(Boolean)
    .join("\n\n")
    .trim()
  return markdown || null
}
