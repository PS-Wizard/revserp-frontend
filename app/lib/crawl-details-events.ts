import type { CrawlResponse } from "~/lib/api.types"

/**
 * Opens the crawl details dialog from anywhere. Crawl rows live inside menus
 * and popovers that unmount on close, so the dialog is hosted once in the
 * shell (CrawlDetailsDialogHost) and opened through this event.
 */
export const CRAWL_DETAILS_EVENT = "revserp:crawl-details"

export function requestCrawlDetails(crawl: CrawlResponse): void {
  window.dispatchEvent(
    new CustomEvent<CrawlResponse>(CRAWL_DETAILS_EVENT, { detail: crawl })
  )
}
