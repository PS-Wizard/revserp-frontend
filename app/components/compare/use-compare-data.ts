import { useQueries } from "@tanstack/react-query"

import { clientApiFetch } from "~/lib/api"
import type {
  CrawlPageHealthResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

/**
 * Both sides are fetched as two independent single-crawl reads. The existing
 * /crawls/{id}/compare/{id} endpoints full-join on URL and are gated to one
 * project, which is wrong here: /pricing on two different domains is not the
 * same page. Everything this view needs — bucket scores, per-issue affected
 * counts, total_scored_pages — is already in each crawl's own breakdown.
 */
export function useCompareData(crawlIdA?: string, crawlIdB?: string) {
  const results = useQueries({
    queries: [crawlIdA, crawlIdB].flatMap((crawlId) =>
      crawlId
        ? [
            {
              queryKey: ["score-breakdown", crawlId],
              queryFn: () =>
                clientApiFetch<ScoreBreakdownResponse>(
                  `/crawls/${crawlId}/score-breakdown`
                ),
              staleTime: Infinity,
            },
            {
              queryKey: ["page-health", crawlId],
              queryFn: () =>
                clientApiFetch<CrawlPageHealthResponse>(
                  `/crawls/${crawlId}/page-health`
                ),
              staleTime: Infinity,
            },
          ]
        : []
    ),
  })

  const ready = crawlIdA && crawlIdB && results.length === 4
  return {
    breakdownA: ready
      ? (results[0].data as ScoreBreakdownResponse | undefined)
      : undefined,
    healthA: ready
      ? (results[1].data as CrawlPageHealthResponse | undefined)
      : undefined,
    breakdownB: ready
      ? (results[2].data as ScoreBreakdownResponse | undefined)
      : undefined,
    healthB: ready
      ? (results[3].data as CrawlPageHealthResponse | undefined)
      : undefined,
    isPending: results.some((r) => r.isPending),
    error: results.find((r) => r.error)?.error ?? null,
  }
}
