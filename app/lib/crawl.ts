import type { CrawlResponse } from "~/lib/api.types"

export function getCrawlReferenceTimestamp(crawl: CrawlResponse) {
  return crawl.completed_at || crawl.started_at || crawl.created_at
}

export function getCrawlTimestamp(crawl: CrawlResponse) {
  return new Date(getCrawlReferenceTimestamp(crawl)).getTime()
}
