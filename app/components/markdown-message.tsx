import { useMemo } from "react"
import {
  ClipboardIcon,
  DownloadIcon,
  FileTextIcon,
  SheetIcon,
} from "lucide-react"
import { toast } from "sonner"

import { downloadBlob } from "~/components/app-navbar/utils"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"

type MarkdownBlock =
  { type: "html"; html: string } | { type: "table"; rows: string[][] }

export function MarkdownMessage({ content }: { content: string }) {
  const blocks = useMemo(() => renderMarkdown(content), [content])

  return (
    <div className="markdown-message">
      {blocks.map((block, index) =>
        block.type === "table" ? (
          <MarkdownTable index={index} key={index} rows={block.rows} />
        ) : (
          <div dangerouslySetInnerHTML={{ __html: block.html }} key={index} />
        )
      )}
    </div>
  )
}

function MarkdownTable({ rows, index }: { rows: string[][]; index: number }) {
  const markdown = tableAsMarkdown(rows)
  const filename = `ai-table-${index + 1}`

  const download = (content: string, type: string, extension: string) => {
    downloadBlob(new Blob([content], { type }), `${filename}.${extension}`)
  }

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      toast.success("Table copied as Markdown")
    } catch {
      toast.error("Unable to copy table")
    }
  }

  return (
    <div className="my-3">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Download or copy table"
                size="xs"
                variant="outline"
              />
            }
          >
            <DownloadIcon data-icon="inline-start" />
            Download
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => void copyMarkdown()}>
                <ClipboardIcon />
                Copy as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  download(markdown, "text/markdown;charset=utf-8", "md")
                }
              >
                <FileTextIcon />
                Download Markdown
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  download(tableAsCSV(rows), "text/csv;charset=utf-8", "csv")
                }
              >
                <SheetIcon />
                Download CSV
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        className="markdown-table-wrap mt-1!"
        dangerouslySetInnerHTML={{ __html: renderTable(rows) }}
      />
    </div>
  )
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const blocks: MarkdownBlock[] = []
  const htmlParts: string[] = []
  const flushHTML = () => {
    if (htmlParts.length === 0) return
    blocks.push({ type: "html", html: htmlParts.join("") })
    htmlParts.length = 0
  }
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
      flushHTML()
      blocks.push({ type: "table", rows: tableRows })
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
        listItems.push(
          `<li>${renderInline(lines[index].trim().replace(/^[-*]\s+/, ""))}</li>`
        )
        index += 1
      }
      htmlParts.push(`<ul>${listItems.join("")}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const listItems: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        listItems.push(
          `<li>${renderInline(lines[index].trim().replace(/^\d+\.\s+/, ""))}</li>`
        )
        index += 1
      }
      htmlParts.push(`<ol>${listItems.join("")}</ol>`)
      continue
    }

    const paragraphLines = [trimmedLine]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() &&
      !startsBlock(lines, index)
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    htmlParts.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`)
  }

  flushHTML()
  return blocks
}

function tableAsMarkdown(rows: string[][]) {
  const [headings = [], ...bodyRows] = rows
  const row = (cells: string[]) =>
    `| ${cells.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`
  return [
    row(headings),
    row(headings.map(() => "---")),
    ...bodyRows.map(row),
  ].join("\n")
}

function tableAsCSV(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map(
          (cell) =>
            `"${plainTableCell(cell)
              .replace(/"/g, '""')
              .replace(/\r?\n/g, " ")}"`
        )
        .join(",")
    )
    .join("\r\n")
}

function plainTableCell(value: string) {
  return value
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/\\([^0-9A-Za-z\s])/g, "$1")
}

function renderInline(value: string) {
  // Resolve backslash escapes the LLM emits (e.g. \" \| \* and a trailing
  // hard-break \) before HTML-escaping, so they don't leak through as literal
  // backslashes. CommonMark only escapes punctuation, so leave \<letter> alone.
  const unescaped = value
    .replace(/\\([^0-9A-Za-z\s])/g, "$1")
    .replace(/\\\s*$/, "")
  let escapedValue = escapeHTML(unescaped)
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

  for (let i = 0; i < trimmedLine.length; i += 1) {
    const character = trimmedLine[i]

    if (character === "`") {
      isInsideCode = !isInsideCode
      currentCell += character
      continue
    }

    // An escaped pipe is literal cell text, not a column separator. Consume
    // both chars here so renderInline receives a clean "|".
    if (character === "\\" && !isInsideCode && trimmedLine[i + 1] === "|") {
      currentCell += "|"
      i += 1
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
  const headingHTML = headings
    .map((heading) => `<th>${renderInline(heading)}</th>`)
    .join("")
  const bodyHTML = bodyRows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`
    )
    .join("")

  return `<table><thead><tr>${headingHTML}</tr></thead><tbody>${bodyHTML}</tbody></table>`
}
