import { useMemo } from "react"

export function MarkdownMessage({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content])

  return (
    <div
      className="markdown-message"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const htmlParts: string[] = []
  let index = 0

  while (index < lines.length) {
    const trimmedLine = lines[index].trim()

    if (!trimmedLine) {
      index += 1
      continue
    }

    if (trimmedLine === "---") {
      htmlParts.push("<hr />")
      index += 1
      continue
    }

    if (isTableStart(lines, index)) {
      const tableRows = [parseTableRow(lines[index])]
      index += 2
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableRows.push(parseTableRow(lines[index]))
        index += 1
      }
      htmlParts.push(renderTable(tableRows))
      continue
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmedLine)
    if (headingMatch) {
      const level = headingMatch[1].length
      htmlParts.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`)
      index += 1
      continue
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      const listItems: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        listItems.push(`<li>${renderInline(lines[index].trim().replace(/^[-*]\s+/, ""))}</li>`)
        index += 1
      }
      htmlParts.push(`<ul>${listItems.join("")}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const listItems: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        listItems.push(`<li>${renderInline(lines[index].trim().replace(/^\d+\.\s+/, ""))}</li>`)
        index += 1
      }
      htmlParts.push(`<ol>${listItems.join("")}</ol>`)
      continue
    }

    const paragraphLines = [trimmedLine]
    index += 1
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    htmlParts.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`)
  }

  return htmlParts.join("")
}

function renderInline(value: string) {
  let escapedValue = escapeHTML(value)
  escapedValue = escapedValue.replace(/`([^`]+)`/g, "<code>$1</code>")
  escapedValue = escapedValue.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  escapedValue = escapedValue.replace(/\*([^*]+)\*/g, "<em>$1</em>")
  return escapedValue
}

function escapeHTML(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function startsBlock(lines: string[], index: number) {
  const trimmedLine = lines[index].trim()
  return (
    trimmedLine === "---" ||
    /^(#{1,4})\s+/.test(trimmedLine) ||
    /^[-*]\s+/.test(trimmedLine) ||
    /^\d+\.\s+/.test(trimmedLine) ||
    isTableStart(lines, index)
  )
}

function isTableStart(lines: string[], index: number) {
  return (
    index + 1 < lines.length &&
    lines[index].trim().startsWith("|") &&
    /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[index + 1].trim())
  )
}

function parseTableRow(line: string) {
  const trimmedLine = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  const cells: string[] = []
  let currentCell = ""
  let isInsideCode = false

  for (const character of trimmedLine) {
    if (character === "`") {
      isInsideCode = !isInsideCode
      currentCell += character
      continue
    }

    if (character === "|" && !isInsideCode) {
      cells.push(currentCell.trim())
      currentCell = ""
      continue
    }

    currentCell += character
  }

  cells.push(currentCell.trim())
  return cells
}

function renderTable(rows: string[][]) {
  const [headings, ...bodyRows] = rows
  const headingHTML = headings.map((heading) => `<th>${renderInline(heading)}</th>`).join("")
  const bodyHTML = bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("")

  return `<div class="markdown-table-wrap"><table><thead><tr>${headingHTML}</tr></thead><tbody>${bodyHTML}</tbody></table></div>`
}
