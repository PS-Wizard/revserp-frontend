import type { CrawlResponse } from "~/lib/api.types"

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const crawlDateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function getInitials(source: string, fallback: string) {
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((value) => value[0]?.toUpperCase() ?? "")
    .join("") || fallback
}

export function getWorkspaceInitials(name: string) {
  return getInitials(name, "W")
}

export function getDefaultInviteExpiryValue() {
  const expiryDate = new Date(Date.now() + ONE_WEEK_MS)
  expiryDate.setSeconds(0, 0)

  const year = expiryDate.getFullYear()
  const month = String(expiryDate.getMonth() + 1).padStart(2, "0")
  const day = String(expiryDate.getDate()).padStart(2, "0")
  const hours = String(expiryDate.getHours()).padStart(2, "0")
  const minutes = String(expiryDate.getMinutes()).padStart(2, "0")

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function formatCrawlStats(crawl: CrawlResponse) {
  const score = crawl.overall_score === undefined ? "No score" : `${crawl.overall_score}/100`
  return `${score} · ${crawl.urls_crawled} crawled · ${crawl.urls_discovered} discovered`
}

export function formatCrawlDate(crawl: CrawlResponse) {
  const timestamp = getCrawlReferenceTimestamp(crawl)
  return timestamp.slice(0, 10)
}

export function formatCrawlDateTime(crawl: CrawlResponse) {
  return crawlDateTimeFormatter.format(new Date(getCrawlReferenceTimestamp(crawl)))
}

export function getCrawlTimestamp(crawl: CrawlResponse) {
  return new Date(getCrawlReferenceTimestamp(crawl)).getTime()
}

export async function readExportError(response: Response) {
  const responseText = await response.text()
  if (!responseText.trim()) {
    return "Unable to export crawl issues."
  }

  try {
    const responseBody = JSON.parse(responseText) as { error?: unknown }
    if (typeof responseBody.error === "string" && responseBody.error.trim()) {
      return responseBody.error
    }
  } catch {
    return responseText
  }

  return "Unable to export crawl issues."
}

export function getExportFilename(contentDispositionHeader: string | null, fallbackFilename: string) {
  if (!contentDispositionHeader) {
    return fallbackFilename
  }

  const utf8Match = contentDispositionHeader.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const plainMatch = contentDispositionHeader.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) {
    return plainMatch[1].trim()
  }

  return fallbackFilename
}

function getCrawlReferenceTimestamp(crawl: CrawlResponse) {
  return crawl.completed_at || crawl.started_at || crawl.created_at
}
