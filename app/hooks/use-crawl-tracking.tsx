import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  CancelCrawlDialog,
  type CancelCrawlTarget,
} from "~/components/cancel-crawl-dialog"
import { clientApiFetch } from "~/lib/api"
import type {
  ActiveCrawlsResponse,
  CrawlEventPayload,
  CrawlResponse,
  CrawlStatus,
  OrganizationEventFrame,
} from "~/lib/api.types"

// Compact status shape `applyCrawlStatus` needs. Both the org active-crawl
// rows (`ActiveCrawlResponse`) and full `GET /crawls/:id` responses satisfy
// it, so the compact response is used directly without casting.
type CrawlStatusSnapshot = Pick<
  CrawlResponse,
  | "status"
  | "phase"
  | "project_id"
  | "urls_discovered"
  | "urls_crawled"
  | "source"
> & {
  competitor_label?: string
}

const CRAWL_STATUSES = new Set<CrawlStatus>([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
])

function crawlStatusFromEvent(
  type: string,
  payloadStatus: CrawlStatus | undefined
): CrawlStatus | null {
  if (payloadStatus && CRAWL_STATUSES.has(payloadStatus)) return payloadStatus
  switch (type) {
    case "crawl.queued":
      return "queued"
    case "crawl.started":
    case "crawl.progress":
      return "running"
    case "crawl.completed":
      return "completed"
    case "crawl.failed":
      return "failed"
    case "crawl.cancelled":
      return "cancelled"
    default:
      return null
  }
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
 * Tracks in-flight crawls by id and drives one sonner toast per tracked id.
 *
 * Crawl lifecycle now arrives over the organization events stream:
 * `handleCrawlEvent` feeds `crawl.*` frames through the same apply/status logic
 * the old active-crawl poll used. `syncActiveCrawls` is a one-shot authoritative
 * read used on mount and on every fresh `ready` frame so a page that loads
 * mid-crawl (including externally/MCP/auto/competitor crawls) still discovers it.
 *
 * Ids are seeded two ways:
 *  - `trackCrawl(id)` — called immediately after this tab's own kickoff POST.
 *  - any `crawl.*` SSE frame, plus the one-shot `/crawls/active` sync.
 *
 * Tracked ids are only dropped once a terminal status is applied, so
 * simultaneous completions and fast crawls are reported correctly.
 */
export function useCrawlTracking({
  orgId,
  projectNameById,
  goToCrawl,
  revalidate,
}: {
  orgId: string
  projectNameById: Map<string, string>
  goToCrawl: (
    projectId: string,
    crawlId?: string,
    destination?: "competitors"
  ) => void
  revalidate: () => void
}): {
  trackCrawl: (id: string) => void
  handleCrawlEvent: (event: OrganizationEventFrame) => void
  syncActiveCrawls: () => void
  cancelDialog: React.ReactNode
} {
  const trackedIdsRef = useRef<Set<string>>(new Set())
  // Last status seen per tracked crawl, so a status change (e.g. queued ->
  // running -> terminal) refetches the loader and keeps the navbar in sync
  // with live events instead of showing stale loader data.
  const lastStatusRef = useRef<Map<string, string>>(new Map())
  const [cancelTarget, setCancelTarget] = useState<CancelCrawlTarget | null>(
    null
  )

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

  const applyCrawlStatus = useCallback(
    (id: string, crawl: CrawlStatusSnapshot) => {
      // Refetch loader-backed data (which the navbar reads) whenever the
      // authoritative status changes, so it never lags the live toast.
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
      // toast, so it survives the toast being recreated on every progress event.
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
                  ? (competitorLabel ??
                    "Starting from the competitor homepage.")
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
          toast.error(competitor ? "Competitor crawl failed" : "Crawl failed", {
            id,
            description: competitor
              ? competitorLabel
                ? `${competitorLabel} crawl failed.`
                : "The competitor crawl failed."
              : projectName
                ? `${projectName} crawl failed.`
                : "The crawl failed.",
          })
          break
        case "cancelled":
          trackedIdsRef.current.delete(id)
          lastStatusRef.current.delete(id)
          toast.dismiss(id)
          break
      }
    },
    []
  )

  const handleCrawlEvent = useCallback(
    (event: OrganizationEventFrame) => {
      const crawlId = event.resource_id
      if (!crawlId) return
      const payload = event.payload as CrawlEventPayload
      const status = crawlStatusFromEvent(event.type, payload.status)
      if (!status) return
      trackedIdsRef.current.add(crawlId)
      applyCrawlStatus(crawlId, {
        project_id: event.project_id ?? "",
        status,
        phase: payload.phase ?? null,
        urls_discovered: payload.urls_discovered ?? 0,
        urls_crawled: payload.urls_crawled ?? 0,
        source: payload.source,
        competitor_label: payload.competitor_label,
      })
    },
    [applyCrawlStatus]
  )

  // One-shot authoritative read: discovers already-running crawls (this tab or
  // elsewhere) without polling. `ready` frames call this again on reconnect.
  const syncActiveCrawls = useCallback(async () => {
    try {
      const response = await clientApiFetch<ActiveCrawlsResponse>(
        `/organizations/${orgIdRef.current}/crawls/active`
      )
      for (const crawl of response.crawls) {
        trackedIdsRef.current.add(crawl.id)
        applyCrawlStatus(crawl.id, crawl)
      }
    } catch (error) {
      console.error("Failed to sync active crawls:", error)
    }
  }, [applyCrawlStatus])

  // Cancel is a POST; the crawl keeps being observed, so the next event reports
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
    void syncActiveCrawls()

    return () => {
      for (const id of trackedIdsRef.current) {
        toast.dismiss(id)
      }
      // Org switch: drop old-org ids so they are never applied under the
      // next org.
      trackedIdsRef.current.clear()
      lastStatusRef.current.clear()
    }
  }, [orgId, syncActiveCrawls])

  const cancelDialog = (
    <CancelCrawlDialog
      target={cancelTarget}
      onConfirm={confirmCancel}
      onOpenChange={(open) => {
        if (!open) setCancelTarget(null)
      }}
    />
  )

  return { trackCrawl, handleCrawlEvent, syncActiveCrawls, cancelDialog }
}
