import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"

import { NumberPopIn } from "~/components/number-pop-in"
import { clientApiFetch } from "~/lib/api"
import type { ActiveCrawlsResponse, CrawlResponse } from "~/lib/api.types"

const POLL_INTERVAL_MS = 3000

/**
 * Tracks in-flight crawls by id and polls each one's authoritative status
 * from `GET /crawls/:id` until it reaches a terminal state (completed,
 * failed, or cancelled). Drives one sonner toast per tracked id.
 *
 * Ids are seeded two ways:
 *  - `trackCrawl(id)` — called immediately after this tab's own kickoff POST.
 *  - the org-wide `/crawls/active` endpoint, polled purely as a DISCOVERY
 *    source (e.g. for crawls started in another tab) while `enabled` is true.
 *
 * Unlike disappearance-based inference, tracked ids are only dropped once we
 * OBSERVE a terminal status, so simultaneous completions, fast crawls, and
 * failed/cancelled crawls are all reported correctly.
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
  goToCrawl: (projectId: string, crawlId?: string) => void
  revalidate: () => void
}): { trackCrawl: (id: string) => void } {
  const trackedIdsRef = useRef<Set<string>>(new Set())

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

  useEffect(() => {
    let cancelled = false

    function applyCrawlStatus(id: string, crawl: CrawlResponse) {
      const projectName = projectNameByIdRef.current.get(crawl.project_id)
      const viewAction = {
        label: "View",
        onClick: (event: { preventDefault: () => void }) => {
          event.preventDefault()
          goToCrawlRef.current(crawl.project_id, id)
        },
      }

      switch (crawl.status) {
        case "queued":
          toast.loading(<span className="shimmer text-muted-foreground">Queued…</span>, {
            id,
            duration: Infinity,
            description: projectName
              ? `${projectName} is waiting for another crawl to finish.`
              : "Waiting for another crawl to finish.",
            action: viewAction,
          })
          break
        case "running":
          if (crawl.phase === "analyzing") {
            toast.loading(<span className="shimmer text-muted-foreground">Analyzing issues…</span>, {
              id,
              duration: Infinity,
              description: projectName
                ? `${projectName} crawl is being analyzed.`
                : undefined,
              action: viewAction,
            })
          } else if (crawl.urls_discovered === 0) {
            toast.loading(<span className="shimmer text-muted-foreground">Discovering URLs…</span>, {
              id,
              duration: Infinity,
              description: "Analyzing sitemap…",
              action: viewAction,
            })
          } else {
            toast.loading(<span className="shimmer text-muted-foreground">Crawling…</span>, {
              id,
              duration: Infinity,
              description: (
                <span className="t-digit-line">
                  <NumberPopIn value={crawl.urls_crawled} /> /{" "}
                  <NumberPopIn value={crawl.urls_discovered} /> crawled
                </span>
              ),
              action: viewAction,
            })
          }
          break
        case "completed":
          trackedIdsRef.current.delete(id)
          toast.success("Crawl complete", {
            id,
            description: projectName
              ? `${projectName} is ready to review.`
              : undefined,
            action: {
              label: "View",
              onClick: () => goToCrawlRef.current(crawl.project_id, id),
            },
          })
          revalidateRef.current()
          break
        case "failed":
          trackedIdsRef.current.delete(id)
          toast.error("Crawl failed", {
            id,
            description: projectName
              ? `${projectName} crawl failed.`
              : "The crawl failed.",
          })
          break
        case "cancelled":
          trackedIdsRef.current.delete(id)
          toast.dismiss(id)
          break
      }
    }

    async function pollTrackedCrawls() {
      const ids = Array.from(trackedIdsRef.current)
      await Promise.all(
        ids.map(async (id) => {
          try {
            const crawl = await clientApiFetch<CrawlResponse>(`/crawls/${id}`)
            if (cancelled) return
            applyCrawlStatus(id, crawl)
          } catch (error) {
            console.error(`Failed to poll crawl ${id}:`, error)
          }
        })
      )
    }

    async function pollDiscovery() {
      try {
        const response = await clientApiFetch<ActiveCrawlsResponse>(
          `/organizations/${orgIdRef.current}/crawls/active`
        )
        if (cancelled) return
        for (const crawl of response.crawls) {
          trackedIdsRef.current.add(crawl.id)
        }
      } catch (error) {
        console.error("Failed to poll active crawls:", error)
      }
    }

    async function tick() {
      if (enabledRef.current) {
        await pollDiscovery()
      }
      await pollTrackedCrawls()
    }

    void tick()
    const interval = window.setInterval(() => {
      void tick()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      for (const id of trackedIdsRef.current) {
        toast.dismiss(id)
      }
    }
  }, [orgId]) // re-runs only on org switch; `enabled` is read live via a ref

  return { trackCrawl }
}
