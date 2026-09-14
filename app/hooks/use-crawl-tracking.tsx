import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  CancelCrawlDialog,
  type CancelCrawlTarget,
} from "~/components/cancel-crawl-dialog"
import { clientApiFetch } from "~/lib/api"
import type { ActiveCrawlsResponse, CrawlResponse } from "~/lib/api.types"

const POLL_INTERVAL_MS = 3000

// Compact status shape `applyCrawlStatus` needs. Both the org active-crawl
// rows (`ActiveCrawlResponse`) and full `GET /crawls/:id` responses satisfy
// it, so the compact response is used directly without casting.
type CrawlStatusSnapshot = Pick<
  CrawlResponse,
  "status" | "phase" | "project_id" | "urls_discovered" | "urls_crawled" | "source"
> & {
  competitor_label?: string
}

function isCompetitorCrawl(crawl: CrawlStatusSnapshot) {
  return crawl.source === "competitor"
}

function crawlProgressDescription(crawl: CrawlStatusSnapshot) {
  const remaining = Math.max(0, crawl.urls_discovered - crawl.urls_crawled)
  const counts = `${crawl.urls_crawled} / ${crawl.urls_discovered} crawled`
  if (remaining > 0) {
    return `${counts} · ${remaining} left`
  }
  return counts
}

/**
 * Tracks in-flight crawls by id and polls until each reaches a terminal state
 * (completed, failed, or cancelled). Drives one sonner toast per tracked id.
 *
 * Each tick makes ONE org-wide `GET /organizations/:orgId/crawls/active`
 * request that both discovers active crawls (e.g. started in another tab)
 * and refreshes queued/running toasts/progress. Per-id `GET /crawls/:id`
 * requests happen only when a previously tracked id disappears from a
 * successful active list — the only signal it may have gone terminal — so we
 * can OBSERVE the exact status instead of assuming.
 *
 * Ids are seeded two ways:
 *  - `trackCrawl(id)` — called immediately after this tab's own kickoff POST.
 *  - the org-wide `/crawls/active` endpoint while `enabled` is true.
 *
 * Tracked ids are only dropped once we OBSERVE a terminal status, so
 * simultaneous completions, fast crawls, and failed/cancelled crawls are all
 * reported correctly.
 */
export function useCrawlTracking({
  orgId,
  enabled,
  projectNameById,
  goToCrawl,
  revalidate,
}: {
  orgId: string
  enabled: boolean
  projectNameById: Map<string, string>
  goToCrawl: (
    projectId: string,
    crawlId?: string,
    destination?: "competitors"
  ) => void
  revalidate: () => void
}): { trackCrawl: (id: string) => void; cancelDialog: React.ReactNode } {
  const trackedIdsRef = useRef<Set<string>>(new Set())
  // Last status seen per tracked crawl, so a status change (e.g. queued ->
  // running -> terminal) refetches the loader and keeps the navbar in sync
  // with the live poll instead of showing stale loader data.
  const lastStatusRef = useRef<Map<string, string>>(new Map())
  const [cancelTarget, setCancelTarget] = useState<CancelCrawlTarget | null>(
    null
  )

  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const orgIdRef = useRef(orgId)
  orgIdRef.current = orgId
  const projectNameByIdRef = useRef(projectNameById)
  projectNameByIdRef.current = projectNameById
  const goToCrawlRef = useRef(goToCrawl)
  goToCrawlRef.current = goToCrawl
  const revalidateRef = useRef(revalidate)
  revalidateRef.current = revalidate

  const trackCrawl = useCallback((id: string) => {
    trackedIdsRef.current.add(id)
  }, [])

  // Cancel is a POST; the crawl keeps being polled, so the next tick observes
  // status 'cancelled' and dismisses the toast. Show an interim state meanwhile.
  const confirmCancel = useCallback(async (id: string) => {
    try {
      await clientApiFetch(`/crawls/${id}/cancel`, { method: "POST" })
      toast.loading(
        <span className="shimmer text-muted-foreground">Cancelling…</span>,
        { id, duration: Infinity }
      )
    } catch (error) {
      console.error(`Failed to cancel crawl ${id}:`, error)
      toast.error("Couldn't cancel crawl", { id: `${id}-cancel-error` })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let tickInFlight = false

    function applyCrawlStatus(id: string, crawl: CrawlStatusSnapshot) {
      // Refetch loader-backed data (which the navbar reads) whenever the
      // authoritative status changes, so it never lags the live poll/toast.
      if (lastStatusRef.current.get(id) !== crawl.status) {
        lastStatusRef.current.set(id, crawl.status)
        revalidateRef.current()
      }
      const projectName = projectNameByIdRef.current.get(crawl.project_id)
      const competitorLabel = crawl.competitor_label?.trim() || undefined
      const competitor = isCompetitorCrawl(crawl)
      const openTrackedCrawl = () => {
        if (competitor) {
          goToCrawlRef.current(crawl.project_id, undefined, "competitors")
          return
        }
        goToCrawlRef.current(crawl.project_id, id)
      }
      // In-flight crawls get View + Cancel side by side. Rendered as a raw
      // element (not sonner's {label,onClick}) so the Cancel click opens the
      // confirm dialog instead of dismissing the toast. data-button/data-cancel
      // pick up sonner's own button styling. The dialog state lives outside the
      // toast, so it survives the toast being recreated on every poll tick.
      // shrink-0 keeps the pair intact; the description column shrinks instead
      // (see the `content` override in ui/sonner.tsx). ml-0! cancels the
      // `margin-left:auto` sonner puts on every [data-button] — meant for a
      // lone action, it fights this wrapper's own ml-auto and shoves the last
      // button past the toast's right padding.
      const cancellableAction = (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            className="ml-0!"
            type="button"
            data-button=""
            data-cancel=""
            onClick={() => setCancelTarget({ id, projectName })}
          >
            Cancel
          </button>
          <button
            className="ml-0!"
            type="button"
            data-button=""
            onClick={openTrackedCrawl}
          >
            View
          </button>
        </div>
      )

      switch (crawl.status) {
        case "queued":
          toast.loading(
            <span className="shimmer text-muted-foreground">
              {competitor ? "Queued competitor crawl…" : "Queued…"}
            </span>,
            {
              id,
              duration: Infinity,
              description: competitor
                ? competitorLabel
                  ? `${competitorLabel} is waiting to crawl.`
                  : "Waiting to crawl this competitor."
                : projectName
                  ? `${projectName} is waiting for another crawl to finish.`
                  : "Waiting for another crawl to finish.",
              action: cancellableAction,
            }
          )
          break
        case "running":
          if (crawl.phase === "analyzing") {
            toast.loading(
              <span className="shimmer text-muted-foreground">
                {competitor ? "Analyzing competitor…" : "Analyzing issues…"}
              </span>,
              {
                id,
                duration: Infinity,
                description: competitor
                  ? competitorLabel
                    ? `${competitorLabel} is being analyzed.`
                    : undefined
                  : projectName
                    ? `${projectName} crawl is being analyzed.`
                    : undefined,
                action: cancellableAction,
              }
            )
          } else if (crawl.urls_discovered === 0) {
            toast.loading(
              <span className="shimmer text-muted-foreground">
                {competitor
                  ? "Discovering competitor pages…"
                  : "Discovering URLs…"}
              </span>,
              {
                id,
                duration: Infinity,
                description: competitor
                  ? competitorLabel ?? "Starting from the competitor homepage."
                  : "Analyzing sitemap…",
                action: cancellableAction,
              }
            )
          } else {
            toast.loading(
              <span className="shimmer text-muted-foreground">
                {competitor ? "Crawling competitors…" : "Crawling…"}
              </span>,
              {
                id,
                duration: Infinity,
                description: competitor ? (
                  <span>
                    {competitorLabel ? `${competitorLabel} · ` : null}
                    {crawlProgressDescription(crawl)}
                  </span>
                ) : (
                  <span>
                    {crawl.urls_crawled} / {crawl.urls_discovered} crawled
                  </span>
                ),
                action: cancellableAction,
              }
            )
          }
          break
        case "completed":
          trackedIdsRef.current.delete(id)
          lastStatusRef.current.delete(id)
          toast.success(
            competitor ? "Competitor crawl complete" : "Crawl complete",
            {
              id,
              description: competitor
                ? competitorLabel
                  ? `${competitorLabel} is ready to review.`
                  : "Ready to review."
                : projectName
                  ? `${projectName} is ready to review.`
                  : undefined,
              action: {
                label: "View",
                onClick: openTrackedCrawl,
              },
            }
          )
          break
        case "failed":
          trackedIdsRef.current.delete(id)
          lastStatusRef.current.delete(id)
          toast.error(
            competitor ? "Competitor crawl failed" : "Crawl failed",
            {
              id,
              description: competitor
                ? competitorLabel
                  ? `${competitorLabel} crawl failed.`
                  : "The competitor crawl failed."
                : projectName
                  ? `${projectName} crawl failed.`
                  : "The crawl failed.",
            }
          )
          break
        case "cancelled":
          trackedIdsRef.current.delete(id)
          lastStatusRef.current.delete(id)
          toast.dismiss(id)
          break
      }
    }

    async function tick() {
      // One simple guard keeps the interval, visibility, and initial ticks
      // from overlapping; also pauses all polling network work while hidden.
      if (tickInFlight || document.hidden) return
      // Poll while discovery is enabled or any crawl is still tracked — a
      // locally started crawl must keep polling even during loader lag.
      if (!enabledRef.current && trackedIdsRef.current.size === 0) return
      tickInFlight = true
      try {
        const idsBefore = Array.from(trackedIdsRef.current)
        const response = await clientApiFetch<ActiveCrawlsResponse>(
          `/organizations/${orgIdRef.current}/crawls/active`
        ).catch((error: unknown) => {
          // A failed org request tells us nothing about tracked crawls:
          // keep them tracked and skip per-id lookups until a later tick.
          console.error("Failed to poll active crawls:", error)
          return null
        })
        if (cancelled || !response) return

        // One request drives discovery AND live toast/progress updates, so
        // nothing still present in it needs a per-id fetch.
        const activeIds = new Set<string>()
        for (const crawl of response.crawls) {
          activeIds.add(crawl.id)
          trackedIdsRef.current.add(crawl.id)
          applyCrawlStatus(crawl.id, crawl)
        }

        // Ids that vanished from a SUCCESSFUL active list may have gone
        // terminal; observe the exact status once via the authoritative
        // endpoint instead of assuming from disappearance.
        await Promise.all(
          idsBefore
            .filter((id) => !activeIds.has(id))
            .map(async (id) => {
              try {
                const crawl = await clientApiFetch<CrawlResponse>(
                  `/crawls/${id}`
                )
                if (cancelled) return
                applyCrawlStatus(id, crawl)
              } catch (error) {
                console.error(`Failed to poll crawl ${id}:`, error)
              }
            })
        )
      } finally {
        tickInFlight = false
      }
    }

    function onVisibilityChange() {
      if (!document.hidden) void tick()
    }

    void tick()
    const interval = window.setInterval(() => {
      void tick()
    }, POLL_INTERVAL_MS)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      for (const id of trackedIdsRef.current) {
        toast.dismiss(id)
      }
      // Org switch: drop old-org ids so they are never fetched under the
      // next org.
      trackedIdsRef.current.clear()
      lastStatusRef.current.clear()
    }
  }, [orgId]) // re-runs only on org switch; `enabled` is read live via a ref

  const cancelDialog = (
    <CancelCrawlDialog
      target={cancelTarget}
      onConfirm={confirmCancel}
      onOpenChange={(open) => {
        if (!open) setCancelTarget(null)
      }}
    />
  )

  return { trackCrawl, cancelDialog }
}
