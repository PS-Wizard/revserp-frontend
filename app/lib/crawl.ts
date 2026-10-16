import type { CrawlAnalysisProgress, CrawlResponse } from "~/lib/api.types"

export function getCrawlReferenceTimestamp(crawl: CrawlResponse) {
  return crawl.completed_at || crawl.started_at || crawl.created_at
}

export function getCrawlTimestamp(crawl: CrawlResponse) {
  return new Date(getCrawlReferenceTimestamp(crawl)).getTime()
}

/** Completed crawl duration excludes queue time; unavailable timestamps return null. */
export function formatCrawlDuration(crawl: CrawlResponse): string | null {
  if (crawl.status !== "completed" || !crawl.started_at || !crawl.completed_at) {
    return null
  }
  const elapsedMs = Date.parse(crawl.completed_at) - Date.parse(crawl.started_at)
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null
  if (elapsedMs > 0 && elapsedMs < 1000) return "<1s"

  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = totalSeconds % 60
  return [
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    seconds || totalSeconds === 0 ? `${seconds}s` : "",
  ].filter(Boolean).join(" ")
}

// Why one mapping: the crawl toast and the competitor cards must read the same.
export function describeCrawlAnalysisProgress(
  progress: CrawlAnalysisProgress | null | undefined
): { title: string; countText: string | null } | null {
  switch (progress?.stage) {
    case "checking_links":
      return {
        title: "Checking links…",
        countText: formatResolvedLinkCount(progress.links_resolved),
      }
    case "deriving_issues":
      return { title: "Finding issues…", countText: null }
    case "scoring":
      return { title: "Calculating scores…", countText: null }
    default:
      return null
  }
}

// Why null on anything but a genuine count: a negative, fractional, or
// non-safe-integer value is corrupt, and inventing 0/a floor would lie.
export function formatResolvedLinkCount(
  linksResolved: number | null | undefined
): string | null {
  if (
    typeof linksResolved !== "number" ||
    !Number.isSafeInteger(linksResolved) ||
    linksResolved < 0
  ) {
    return null
  }
  const count = linksResolved.toLocaleString("en-US")
  return `${count} link ${linksResolved === 1 ? "status" : "statuses"} resolved`
}
