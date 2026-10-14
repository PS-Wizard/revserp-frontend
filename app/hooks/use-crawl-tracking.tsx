import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  CancelCrawlDialog,
  type CancelCrawlTarget,
} from "~/components/cancel-crawl-dialog"
import { useQueryClient } from "@tanstack/react-query"
import { clientApiFetch } from "~/lib/api"
import { describeCrawlAnalysisProgress } from "~/lib/crawl"
import { isSetupManagedCrawl } from "~/lib/setup-crawl"
import type {
  ActiveCrawlsResponse,
  CrawlAnalysisStage,
  CrawlEventPayload,
  CrawlPhase,
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
  | "analysis_progress"
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
  const suppressedSetupCrawlIdsRef = useRef<Set<string>>(new Set())
  const scopeEpochRef = useRef(0)
  // Why: the navbar reads loader data, so phase/stage changes while running
  // only reach it via refetch; per-batch counts ride the toast instead.
  const lastCrawlStateRef = useRef<
    Map<
      string,
      {
        status: CrawlStatus
        phase: CrawlPhase | null
        stage: CrawlAnalysisStage | null
      }
    >
  >(new Map())
  const [cancelTarget, setCancelTarget] = useState<CancelCrawlTarget | null>(
    null
  )

  const orgIdRef = useRef(orgId)
  const queryClient = useQueryClient()
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
      // Why: a missing phase/stage means the frame carries no new info, so
      // the last seen value carries forward and count-only frames refetch nothing.
      const seen = lastCrawlStateRef.current.get(id)
      const phase = crawl.phase ?? seen?.phase ?? null
      const stage = crawl.analysis_progress?.stage ?? seen?.stage ?? null
      if (
        seen?.status !== crawl.status ||
        (crawl.phase != null && crawl.phase !== seen?.phase) ||
        (crawl.analysis_progress?.stage != null &&
          crawl.analysis_progress.stage !== seen?.stage)
      ) {
        revalidateRef.current()
      }
      lastCrawlStateRef.current.set(id, { status: crawl.status, phase, stage })
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
      const notifyCrawlComplete = () => {
        toast.success("Crawl complete", {
          id,
          description: projectName
            ? `${projectName} is ready to review.`
            : undefined,
          action: { label: "View", onClick: openTrackedCrawl },
        })
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
            const analysis = describeCrawlAnalysisProgress(
              crawl.analysis_progress
            )
            let description: string | undefined = competitor
              ? competitorLabel
                ? `${competitorLabel} is being analyzed.`
                : undefined
              : projectName
                ? `${projectName} crawl is being analyzed.`
                : undefined
            // A confirmed count replaces the generic copy; otherwise the
            // legacy description stays so nothing is fabricated.
            if (analysis?.countText) {
              const subject = competitor ? competitorLabel : projectName
              description = subject
                ? `${subject} · ${analysis.countText}`
                : analysis.countText
            }
            toast.loading(
              <span className="shimmer text-muted-foreground">
                {analysis?.title ??
                  (competitor ? "Analyzing competitor…" : "Analyzing issues…")}
              </span>,
              {
                id,
                duration: Infinity,
                description,
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
          lastCrawlStateRef.current.delete(id)
          if (competitor) {
            toast.success("Competitor crawl complete", {
              id,
              description: competitorLabel
                ? `${competitorLabel} is ready to review.`
                : "Ready to review.",
              action: { label: "View", onClick: openTrackedCrawl },
            })
            break
          }
          if (suppressedSetupCrawlIdsRef.current.has(id)) {
            toast.dismiss(id)
            break
          }
          const epoch = scopeEpochRef.current
          void isSetupManagedCrawl(
            queryClient,
            orgIdRef.current,
            crawl.project_id,
            id
          ).then(
            (setupManaged) => {
              if (epoch !== scopeEpochRef.current) return
              if (setupManaged || suppressedSetupCrawlIdsRef.current.has(id)) {
                suppressedSetupCrawlIdsRef.current.add(id)
                toast.dismiss(id)
              } else {
                notifyCrawlComplete()
              }
            },
            () => {
              if (epoch !== scopeEpochRef.current) return
              notifyCrawlComplete()
            }
          )
          break
        case "failed":
          trackedIdsRef.current.delete(id)
          lastCrawlStateRef.current.delete(id)
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
          lastCrawlStateRef.current.delete(id)
          toast.dismiss(id)
          break
      }
    },
    [queryClient]
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
        analysis_progress: payload.analysis_progress ?? null,
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
      // A fast terminal event can land before the POST resolves and dismiss
      // the toast; only show the interim state while still tracked, or the
      // response recreates an immortal spinner.
      if (!trackedIdsRef.current.has(id)) return
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
      scopeEpochRef.current += 1
      for (const id of trackedIdsRef.current) {
        toast.dismiss(id)
      }
      // Org switch: drop old-org ids so they are never applied under the
      // next org.
      trackedIdsRef.current.clear()
      suppressedSetupCrawlIdsRef.current.clear()
      lastCrawlStateRef.current.clear()
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
