import { useEffect, useRef, useState } from "react"

import { clientApiFetch } from "~/lib/api"
import type { ActiveCrawlResponse, ActiveCrawlsResponse } from "~/lib/api.types"

/**
 * Polls the org-wide active-crawls endpoint at a steady 3 s interval while
 * any crawl is in flight (or `isStartingCrawl` is true).
 *
 * The interval is created once and kept stable — it does NOT depend on the
 * revalidator object, so revalidations don't tear it down.
 *
 * `onCrawlSettled` is fired (once per crawl) only when a crawl LEAVES the
 * active set, i.e. reaches a terminal state. The callback receives the crawl
 * that settled. For mere status transitions within the active set
 * (queued → running) the local `activeCrawls` state is updated directly
 * without triggering a loader revalidation.
 */
export function useActiveCrawlsPoll({
  orgId,
  enabled,
  onCrawlSettled,
}: {
  orgId: string
  enabled: boolean
  onCrawlSettled: (crawl: ActiveCrawlResponse) => void
}): { activeCrawls: ActiveCrawlResponse[] } {
  const [activeCrawls, setActiveCrawls] = useState<ActiveCrawlResponse[]>([])

  // Stable ref for the callback so the interval closure never goes stale.
  const onCrawlSettledRef = useRef(onCrawlSettled)
  onCrawlSettledRef.current = onCrawlSettled

  // Track the previous active set by id so we can detect removals.
  const prevCrawlMapRef = useRef<Map<string, ActiveCrawlResponse>>(new Map())

  // Track whether we've done the initial baseline poll (to avoid firing
  // onCrawlSettled for already-finished crawls on mount).
  const isBaselineRef = useRef(true)

  // Stable ref for the org id to avoid re-creating the interval on org change
  // (unlikely, but safer).
  const orgIdRef = useRef(orgId)
  orgIdRef.current = orgId

  useEffect(() => {
    if (!enabled) {
      // Reset baseline flag when polling stops so next enable is treated fresh.
      isBaselineRef.current = true
      prevCrawlMapRef.current = new Map()
      return
    }

    let cancelled = false

    async function poll() {
      try {
        const response = await clientApiFetch<ActiveCrawlsResponse>(
          `/organizations/${orgIdRef.current}/crawls/active`
        )
        if (cancelled) return

        const nextMap = new Map(response.crawls.map((c) => [c.id, c]))

        if (!isBaselineRef.current) {
          // Fire onCrawlSettled for any crawl that dropped out of the active set.
          for (const [id, crawl] of prevCrawlMapRef.current) {
            if (!nextMap.has(id)) {
              onCrawlSettledRef.current(crawl)
            }
          }
        }

        isBaselineRef.current = false
        prevCrawlMapRef.current = nextMap
        setActiveCrawls(response.crawls)
      } catch (error) {
        console.error("Failed to poll active crawls:", error)
      }
    }

    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [enabled]) // stable — only re-runs when enabled flips

  return { activeCrawls }
}
