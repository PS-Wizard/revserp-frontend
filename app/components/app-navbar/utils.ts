import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"
import type { AuditTab, DashboardView } from "./types"
import { getCrawlReferenceTimestamp } from "~/lib/crawl"

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const crawlDateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function getCrawlSelectionTarget(
  location: { pathname: string; search: string },
  crawlId: string
) {
  const params = new URLSearchParams(location.search)
  params.set("crawl", crawlId)
  return {
    pathname: location.pathname,
    search: params.toString(),
    hash: "#overview-tab",
  }
}

export function getInitials(source: string, fallback: string) {
  return (
    source
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase() ?? "")
      .join("") || fallback
  )
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
  const score =
    crawl.overall_score === undefined
      ? "No score"
      : `${crawl.overall_score}/100`
  // Unique/Crawled both read stored rows (post-redirect dedupe); fall back until backend emits page_count.
  const pc = crawl.page_count ?? crawl.urls_crawled
  return `${score} · Discovered: ${crawl.urls_discovered} · Unique: ${pc} · Crawled: ${pc}`
}

export function formatCrawlDate(crawl: CrawlResponse) {
  const timestamp = getCrawlReferenceTimestamp(crawl)
  return timestamp.slice(0, 10)
}

export function formatCrawlDateTime(crawl: CrawlResponse) {
  return crawlDateTimeFormatter.format(
    new Date(getCrawlReferenceTimestamp(crawl))
  )
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

export function getExportFilename(
  contentDispositionHeader: string | null,
  fallbackFilename: string
) {
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

export function getInviteValidationError(
  inviteExpiresAt: string,
  expiresAtDate: Date,
  maxUses: number
) {
  if (!inviteExpiresAt.trim() || Number.isNaN(expiresAtDate.getTime())) {
    return "Expiry must be a valid date and time."
  }

  if (expiresAtDate.getTime() <= Date.now()) {
    return "Expiry must be in the future."
  }

  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    return "Max uses must be greater than zero."
  }

  return ""
}

export function getCrawlValidationError(
  maxDepth: number,
  fetchTimeoutSeconds: number
) {
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    return "Max depth must be zero or greater."
  }

  if (!Number.isInteger(fetchTimeoutSeconds) || fetchTimeoutSeconds <= 0) {
    return "Fetch timeout must be greater than zero."
  }

  return ""
}

export function getProjectFilenameSegment(
  project: ProjectResponse | undefined
) {
  const projectName = project?.name ?? "project"
  const normalizedProjectName = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
  return normalizedProjectName || "project"
}

export function downloadBlob(blob: Blob, filename: string) {
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = downloadUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)
}

export function isLocationsPath(pathname: string) {
  return /^\/app\/projects\/[^/]+\/locations\/?$/.test(pathname)
}

export function getProjectIdFromLocationsPath(pathname: string) {
  const match = pathname.match(/^\/app\/projects\/([^/]+)\/locations\/?$/)
  return match?.[1] ?? null
}

export function getWorkspaceNavigationTarget(
  location: { pathname: string; search: string },
  view: DashboardView,
  auditTab: AuditTab
) {
  const hash =
    view === "revserp-audit"
      ? `#${auditTab}-tab`
      : view === "compare" || view === "revserp-visibility"
        ? ""
        : `#${view}`
  if (isLocationsPath(location.pathname)) {
    const projectId = getProjectIdFromLocationsPath(location.pathname)
    const params = new URLSearchParams(location.search)
    if (projectId) params.set("project", projectId)
    const search = params.toString()
    return { pathname: "/app", search: search ? `?${search}` : "", hash }
  }
  return { pathname: location.pathname, search: location.search, hash }
}
