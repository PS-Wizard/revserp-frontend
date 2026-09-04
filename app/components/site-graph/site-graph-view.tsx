"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  computeVisible,
  DEFAULT_OPACITY_DECAY,
  ForceGraph,
  type SiteGraphFilter,
} from "~/components/site-graph/force-graph"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Slider } from "~/components/ui/slider"
import { clientApiFetch } from "~/lib/api"
import type { SiteGraphResponse } from "~/lib/api.types"
import { cn } from "~/lib/utils"

type SiteGraphViewProps = {
  currentCrawlId?: string
}

const DEFAULT_FILTER: SiteGraphFilter = {
  query: "",
  maxHops: null,
  showOrphans: true,
  brokenOnly: false,
}

const HOPS_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "All", value: null },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4+", value: 99 },
]

type FilterPanelProps = {
  filter: SiteGraphFilter
  opacityDecay: number
  onChange: React.Dispatch<React.SetStateAction<SiteGraphFilter>>
  onOpacityDecayChange: (decay: number) => void
  visibleCount: number
  total: number
  containerRef: React.RefObject<HTMLDivElement | null>
}

function FilterPanel({
  filter,
  opacityDecay,
  onChange,
  onOpacityDecayChange,
  visibleCount,
  total,
  containerRef,
}: FilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [queryDraft, setQueryDraft] = useState(filter.query)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const dragState = useRef<{
    startX: number
    startY: number
    posX: number
    posY: number
  } | null>(null)

  // Debounce typing into the committed filter so the canvas + count stay smooth.
  useEffect(() => {
    const id = window.setTimeout(() => {
      onChange((prev) => ({ ...prev, query: queryDraft }))
    }, 150)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDraft])

  const reset = () => {
    setQueryDraft("")
    onChange(DEFAULT_FILTER)
    onOpacityDecayChange(0)
  }

  const onHeaderPointerDown = (event: React.PointerEvent) => {
    // Don't start a drag (which captures the pointer and swallows the click)
    // when pressing an interactive control in the header, e.g. Reset.
    if ((event.target as HTMLElement).closest("button")) return
    const panel = panelRef.current
    const container = containerRef.current
    if (!panel || !container) return
    const panelRect = panel.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const x = panelRect.left - containerRect.left
    const y = panelRect.top - containerRect.top
    setDragPos({ x, y })
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      posX: x,
      posY: y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onHeaderPointerMove = (event: React.PointerEvent) => {
    const state = dragState.current
    const panel = panelRef.current
    const container = containerRef.current
    if (!state || !panel || !container) return
    const containerRect = container.getBoundingClientRect()
    const maxX = Math.max(0, containerRect.width - panel.offsetWidth)
    const maxY = Math.max(0, containerRect.height - panel.offsetHeight)
    const nextX = Math.min(
      Math.max(0, state.posX + (event.clientX - state.startX)),
      maxX
    )
    const nextY = Math.min(
      Math.max(0, state.posY + (event.clientY - state.startY)),
      maxY
    )
    setDragPos({ x: nextX, y: nextY })
  }

  const onHeaderPointerUp = (event: React.PointerEvent) => {
    dragState.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "pointer-events-auto absolute z-20 w-60 rounded-lg border bg-popover/95 shadow-lg backdrop-blur",
        dragPos ? null : "top-14 right-4"
      )}
      style={dragPos ? { left: dragPos.x, top: dragPos.y } : undefined}
    >
      <div
        className="flex cursor-grab touch-none items-center justify-between border-b px-3 py-2 active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <span className="text-xs font-medium text-foreground">Filters</span>
        <Button size="xs" variant="ghost" onClick={reset}>
          Reset
        </Button>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3">
        <Input
          className="h-8 text-xs"
          placeholder="Filter by URL…"
          value={queryDraft}
          onChange={(event) => setQueryDraft(event.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Hops from home</span>
          <div className="inline-flex gap-0.5 rounded-md border p-0.5">
            {HOPS_OPTIONS.map((option) => {
              const active = filter.maxHops === option.value
              return (
                <Button
                  key={option.label}
                  size="xs"
                  variant={active ? "default" : "ghost"}
                  className="flex-1"
                  onClick={() => onChange({ ...filter, maxHops: option.value })}
                >
                  {option.label}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <label htmlFor="site-graph-opacity-decay">Opacity decay</label>
            <span className="tabular-nums">
              {Math.round(opacityDecay * 100)}%
            </span>
          </div>
          <Slider
            aria-label="Opacity decay by hop depth"
            id="site-graph-opacity-decay"
            max={0.8}
            min={0}
            onValueChange={(value) =>
              onOpacityDecayChange(Array.isArray(value) ? value[0] : value)
            }
            step={0.05}
            value={[opacityDecay]}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span
            className="cursor-pointer select-none"
            onClick={() =>
              onChange({ ...filter, showOrphans: !filter.showOrphans })
            }
          >
            Show orphans
          </span>
          <Checkbox
            aria-label="Show orphans"
            checked={filter.showOrphans}
            onCheckedChange={(checked) =>
              onChange({ ...filter, showOrphans: checked === true })
            }
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span
            className="cursor-pointer select-none"
            onClick={() =>
              onChange({ ...filter, brokenOnly: !filter.brokenOnly })
            }
          >
            Broken only
          </span>
          <Checkbox
            aria-label="Broken only"
            checked={filter.brokenOnly}
            onCheckedChange={(checked) =>
              onChange({ ...filter, brokenOnly: checked === true })
            }
          />
        </div>

        <div className="border-t pt-2 text-xs text-muted-foreground">
          showing {visibleCount.toLocaleString()} of {total.toLocaleString()}{" "}
          pages
        </div>
      </div>
    </div>
  )
}

export const SiteGraphView = memo(function SiteGraphView({
  currentCrawlId,
}: SiteGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<SiteGraphFilter>(DEFAULT_FILTER)
  const [opacityDecay, setOpacityDecay] = useState(DEFAULT_OPACITY_DECAY)

  const graphQuery = useQuery({
    queryKey: ["site-graph", currentCrawlId],
    queryFn: () =>
      clientApiFetch<SiteGraphResponse>(`/crawls/${currentCrawlId}/site-graph`),
    enabled: !!currentCrawlId,
    staleTime: Infinity,
  })

  const graph = graphQuery.data

  const visibleCount = useMemo(() => {
    if (!graph) return 0
    const visible = computeVisible(graph.nodes, graph.edges, filter)
    let count = 0
    for (const isVisible of visible) if (isVisible) count++
    return count
  }, [graph, filter])

  return (
    <div
      ref={containerRef}
      className="relative -my-6 h-[calc(100dvh-4.5rem)] w-full overflow-hidden"
    >
      {graphQuery.isPending && currentCrawlId ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            <p className="text-sm text-muted-foreground">Loading site graph…</p>
          </div>
        </div>
      ) : graphQuery.isError ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Failed to load the site graph. Try refreshing the page.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void graphQuery.refetch()}
            >
              Retry
            </Button>
          </div>
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
            filter={filter}
            nodes={graph.nodes}
            opacityDecay={opacityDecay}
          />
          <FilterPanel
            containerRef={containerRef}
            filter={filter}
            onChange={setFilter}
            onOpacityDecayChange={setOpacityDecay}
            opacityDecay={opacityDecay}
            total={graph.nodes.length}
            visibleCount={visibleCount}
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
        </>
      ) : null}
    </div>
  )
})
