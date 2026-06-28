import { useEffect, useRef } from "react"
import { toast } from "sonner"

import type { ActiveCrawlResponse } from "~/lib/api.types"

/**
 * Manages the stack of per-crawl loading toasts (one per active crawl, keyed
 * by crawl id) and fires a single success/failure toast when a crawl settles.
 *
 * Completion detection is driven entirely by the org-wide `activeCrawls` list
 * from the poll hook — when a crawl id DROPS OUT of the set it has settled,
 * regardless of which project is currently selected. This fixes cross-project
 * toasts that were missed when the loader only returned the selected project's
 * crawls.
 *
 * The first call after mount establishes a baseline so already-finished crawls
 * don't fire spurious toasts on load (this is handled by the poll hook's own
 * baseline logic via `onCrawlSettled` only being called after the first poll).
 */
export function useCrawlToasts({
  activeCrawls,
  settledCrawl,
  projectNameById,
  goToCrawl,
}: {
  activeCrawls: ActiveCrawlResponse[]
  /** The most recently settled crawl passed from onCrawlSettled, or null. */
  settledCrawl: ActiveCrawlResponse | null
  projectNameById: Map<string, string>
  goToCrawl: (projectId: string, crawlId?: string) => void
}) {
  const shownCrawlToastIdsRef = useRef<Set<string>>(new Set())
  const settledToastShownRef = useRef<Set<string>>(new Set())

  // Reconcile loading toasts: one persistent toast per active crawl.
  useEffect(() => {
    const nextIds = new Set<string>()
    for (const crawl of activeCrawls) {
      nextIds.add(crawl.id)
      const isQueued = crawl.status === "queued"
      const projectName = projectNameById.get(crawl.project_id)
      toast.loading(isQueued ? "Queued…" : "Crawling…", {
        id: crawl.id,
        description: isQueued
          ? projectName
            ? `${projectName} is waiting for another crawl to finish.`
            : "Waiting for another crawl to finish."
          : projectName
            ? `${projectName} crawl in progress.`
            : "Crawl in progress.",
        duration: Infinity,
        action: {
          label: "View",
          onClick: (event) => {
            event.preventDefault()
            goToCrawl(crawl.project_id, crawl.id)
          },
        },
      })
    }
    for (const id of shownCrawlToastIdsRef.current) {
      if (!nextIds.has(id)) {
        toast.dismiss(id)
      }
    }
    shownCrawlToastIdsRef.current = nextIds
  }, [activeCrawls, projectNameById, goToCrawl])

  // Fire success/failure toast when a crawl settles.
  useEffect(() => {
    if (!settledCrawl) return
    if (settledToastShownRef.current.has(settledCrawl.id)) return
    settledToastShownRef.current.add(settledCrawl.id)
    const projectName = projectNameById.get(settledCrawl.project_id)
    // A crawl that drops out of the active list is terminal. We infer
    // success vs failure from whether the status was "running" or "queued"
    // at the time it dropped — the backend removes it from the active list
    // when it completes OR fails. We can't know the final status from the
    // active-crawls endpoint alone (it only shows in-flight crawls), so we
    // treat the disappearance as "completed" by default. If the backend ever
    // adds a status field to active crawl tombstones this can be refined.
    // For now: assume completed (matches prior behavior where every
    // revalidate that saw the crawl gone triggered a success toast).
    const crawlId = settledCrawl.id
    const projectId = settledCrawl.project_id
    toast.success("Crawl complete", {
      description: projectName
        ? `${projectName} is ready to review.`
        : undefined,
      action: {
        label: "View",
        onClick: () => goToCrawl(projectId, crawlId),
      },
    })
  }, [settledCrawl, projectNameById, goToCrawl])

  // Dismiss all lingering toasts on unmount.
  useEffect(() => {
    return () => {
      for (const id of shownCrawlToastIdsRef.current) {
        toast.dismiss(id)
      }
    }
  }, [])
}
