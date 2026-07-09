"use client"

import { memo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  DEPTH_COLORS,
  ForceGraph,
  ORPHAN_COLOR,
} from "~/components/site-graph/force-graph"
import { clientApiFetch } from "~/lib/api"
import type { SiteGraphResponse } from "~/lib/api.types"

type SiteGraphViewProps = {
  currentCrawlId?: string
}

const DEPTH_LEGEND = [
  { color: DEPTH_COLORS[0], label: "home" },
  { color: DEPTH_COLORS[1], label: "1 click" },
  { color: DEPTH_COLORS[2], label: "2" },
  { color: DEPTH_COLORS[3], label: "3" },
  { color: DEPTH_COLORS[4], label: "4+" },
  { color: ORPHAN_COLOR, label: "orphan" },
]

export const SiteGraphView = memo(function SiteGraphView({
  currentCrawlId,
}: SiteGraphViewProps) {
  const graphQuery = useQuery({
    queryKey: ["site-graph", currentCrawlId],
    queryFn: () =>
      clientApiFetch<SiteGraphResponse>(`/crawls/${currentCrawlId}/site-graph`),
    enabled: !!currentCrawlId,
    staleTime: Infinity,
  })

  const graph = graphQuery.data

  return (
    <div className="relative -my-6 h-[calc(100dvh-4.5rem)] w-full overflow-hidden">
      {graphQuery.isPending && currentCrawlId ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            <p className="text-sm text-muted-foreground">Loading site graph…</p>
          </div>
        </div>
      ) : graphQuery.isError ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Failed to load the site graph. Try refreshing the page.
          </p>
        </div>
      ) : !currentCrawlId ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Run a crawl to see the site graph.
          </p>
        </div>
      ) : graph && graph.nodes.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No pages found in this crawl.
          </p>
        </div>
      ) : graph ? (
        <>
          <ForceGraph
            className="absolute inset-0"
            edges={graph.edges}
            nodes={graph.nodes}
          />
          <div className="pointer-events-none absolute top-4 right-4 z-10 text-xs text-muted-foreground lg:right-6">
            {graph.stats.pages.toLocaleString()} pages ·{" "}
            {graph.stats.links.toLocaleString()} internal links
            {graph.stats.broken > 0 ? (
              <>
                {" · "}
                <span className="text-destructive">
                  {graph.stats.broken.toLocaleString()} broken
                </span>
              </>
            ) : null}
          </div>
          <div className="pointer-events-none absolute top-4 left-4 z-10 flex items-center gap-3 text-xs text-muted-foreground lg:left-6">
            <span className="flex items-center gap-2">
              <span className="text-foreground/70">clicks from home</span>
              {DEPTH_LEGEND.map((entry) => (
                <span className="flex items-center gap-1" key={entry.label}>
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.label}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-destructive" />
                broken
              </span>
            </span>
            <span>hover a node for its outgoing links</span>
          </div>
        </>
      ) : null}
    </div>
  )
})
