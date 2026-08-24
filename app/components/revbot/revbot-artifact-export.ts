import type {
  RevbotRankingChart,
  RevbotTrendChart,
} from "./revbot-chart-artifacts"

function isPlainFiniteNumericLiteral(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed))
    return false
  const numeric = Number(trimmed)
  return Number.isFinite(numeric)
}

function isTransparentBackground(color: string): boolean {
  if (!color || color === "transparent") return true
  const rgba = color.match(
    /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/
  )
  if (rgba) return Number.parseFloat(rgba[1] ?? "1") === 0
  const hsla = color.match(
    /hsla\(\s*[\d.]+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*([\d.]+)\s*\)/
  )
  if (hsla) return Number.parseFloat(hsla[1] ?? "1") === 0
  return false
}

function firstGradientColor(backgroundImage: string): string | null {
  if (!backgroundImage || backgroundImage === "none") return null
  return (
    backgroundImage.match(
      /(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)|#[\da-f]{3,8}/i
    )?.[0] ?? null
  )
}

function resolveNearestBackgroundColor(element: HTMLElement): string | null {
  let current: HTMLElement | null = element
  while (current) {
    const styles = getComputedStyle(current)
    const candidate = styles.backgroundColor
    if (candidate && !isTransparentBackground(candidate)) {
      return candidate
    }
    const gradientColor = firstGradientColor(styles.backgroundImage)
    if (gradientColor && !isTransparentBackground(gradientColor)) {
      return gradientColor
    }
    current = current.parentElement
  }
  return null
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return ""
    const cell = String(value)
    if (/[",\r\n]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`
    return cell
  }
  let cell = String(value)
  if (/^\s*[=+\-@]/.test(cell) && !isPlainFiniteNumericLiteral(cell.trim())) {
    cell = `'${cell}`
  }
  if (/[",\r\n]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`
  return cell
}

function buildCsv(
  headers: string[],
  rows: (string | number | null)[][]
): string {
  const head = headers.map((header) => escapeCsvCell(header)).join(",")
  const lines = rows.map((row) =>
    row.map((cell) => escapeCsvCell(cell)).join(",")
  )
  return [head, ...lines].join("\r\n")
}

export function tableToCsv(table: HTMLTableElement): string {
  const lines = Array.from(table.rows).map((row) =>
    Array.from(row.cells)
      .map((cell) => escapeCsvCell(cell.textContent ?? ""))
      .join(",")
  )
  return lines.join("\r\n")
}

export function trendChartToCsv(chart: RevbotTrendChart): string {
  const firstHeader = chart.xKind === "date" ? "Date" : "Category"
  const headers: string[] = [firstHeader]
  for (const series of chart.series) {
    headers.push(series.label)
    if ((series.projectedPoints ?? 0) > 0)
      headers.push(`${series.label} status`)
  }
  const rows: (string | number | null)[][] = chart.x.map((xValue, index) => {
    const row: (string | number | null)[] = [xValue]
    for (const series of chart.series) {
      const raw = series.values[index]
      row.push(raw === null || raw === undefined ? "" : raw)
      if ((series.projectedPoints ?? 0) > 0) {
        const projectedCount = series.projectedPoints ?? 0
        const isProjected = index >= chart.x.length - projectedCount
        row.push(isProjected ? "projected" : "measured")
      }
    }
    return row
  })
  return buildCsv(headers, rows)
}

export function rankingChartToCsv(chart: RevbotRankingChart): string {
  const headers = ["Category", ...chart.series.map((series) => series.label)]
  const rows: (string | number | null)[][] = chart.categories.map(
    (category, index) => {
      const row: (string | number | null)[] = [category]
      for (const series of chart.series) row.push(series.values[index])
      return row
    }
  )
  return buildCsv(headers, rows)
}

export async function copyText(text: string): Promise<void> {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard API is unavailable")
    await navigator.clipboard.writeText(text)
    return
  } catch {}
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.append(textarea)
  let copied = false
  try {
    textarea.select()
    copied = document.execCommand("copy")
  } finally {
    textarea.remove()
  }
  if (!copied) throw new Error("Copy failed")
}

export async function copyPngBlob(blob: Blob | Promise<Blob>): Promise<void> {
  const ClipboardItemCtor = (
    globalThis as unknown as { ClipboardItem?: typeof ClipboardItem }
  ).ClipboardItem
  if (!navigator.clipboard?.write || !ClipboardItemCtor) {
    throw new Error("Clipboard image copy is not supported in this browser")
  }
  await navigator.clipboard.write([
    new ClipboardItemCtor({ "image/png": blob }),
  ])
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadTextInternal(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8"
): void {
  const blob = new Blob([`\uFEFF${text}`], { type: mime })
  triggerDownload(blob, filename)
}

export function downloadCsv(filename: string, csv: string): void {
  const safe = filename.endsWith(".csv") ? filename : `${filename}.csv`
  downloadTextInternal(safe, csv, "text/csv;charset=utf-8")
}

export function downloadPngBlob(filename: string, blob: Blob): void {
  const safe = filename.endsWith(".png") ? filename : `${filename}.png`
  triggerDownload(blob, safe)
}

export function serializeEChartsSvg(container: HTMLElement): string {
  const chartRoot =
    (container.querySelector("[data-chart]") as HTMLElement | null) ??
    (container.matches("[data-chart]") ? container : null)
  if (!chartRoot) throw new Error("Chart container not found")
  const svg = chartRoot.querySelector("svg")
  if (!svg) throw new Error("Chart SVG not available")
  const clone = svg.cloneNode(true) as SVGElement
  if (!clone.getAttribute("xmlns"))
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  let backgroundColor = resolveNearestBackgroundColor(container)
  if (!backgroundColor) {
    backgroundColor = getComputedStyle(document.body).backgroundColor
  }
  if (backgroundColor && !isTransparentBackground(backgroundColor)) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    rect.setAttribute("x", "0")
    rect.setAttribute("y", "0")
    rect.setAttribute("width", "100%")
    rect.setAttribute("height", "100%")
    rect.setAttribute("fill", backgroundColor)
    clone.insertBefore(rect, clone.firstChild)
  }
  return new XMLSerializer().serializeToString(clone)
}

export function downloadSvg(filename: string, svgSource: string): void {
  const safe = filename.endsWith(".svg") ? filename : `${filename}.svg`
  const blob = new Blob([svgSource], { type: "image/svg+xml;charset=utf-8" })
  triggerDownload(blob, safe)
}

export async function captureElementPng(element: HTMLElement): Promise<Blob> {
  const { toBlob } = await import("html-to-image")
  let backgroundColor = resolveNearestBackgroundColor(element)
  if (!backgroundColor) {
    backgroundColor = getComputedStyle(document.body).backgroundColor
  }
  const blob = await toBlob(element, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: backgroundColor ?? undefined,
    filter: (node: HTMLElement) =>
      !(
        node instanceof HTMLElement && node.hasAttribute("data-export-controls")
      ),
  })
  if (!blob) throw new Error("Could not capture image")
  return blob
}

export function slugFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
  return slug || "export"
}
