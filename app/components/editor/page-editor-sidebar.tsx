"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  LoaderCircleIcon,
  SearchIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import { HoverPill, useHoverPill } from "~/components/ui/hover-pill"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"
import { clientApiFetch } from "~/lib/api"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"

export type CrawlPageLink = {
  url: string
  title?: string | null
}

type CrawlPagesResponse = {
  pages: CrawlPageLink[]
  pagination: {
    count: number
    total: number
  }
}

type PageEditorSidebarProps = {
  crawlId: string
  currentUrl: string
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onSelectUrl: (url: string) => void
  onPagesChange?: (pages: CrawlPageLink[]) => void
}

const PAGE_BATCH_SIZE = 15

export function PageEditorSidebar({
  crawlId,
  currentUrl,
  collapsed,
  onCollapsedChange,
  onSelectUrl,
  onPagesChange,
}: PageEditorSidebarProps) {
  const [pages, setPages] = useState<CrawlPageLink[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const pagePill = useHoverPill()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const fetchPageBatch = useCallback(
    async (offset: number, replace: boolean) => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller

      if (replace) {
        setPages([])
        setTotal(0)
        setIsLoading(true)
        setError(null)
      } else {
        setIsLoadingMore(true)
      }

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_BATCH_SIZE),
          offset: String(offset),
        })
        const response = await clientApiFetch<CrawlPagesResponse>(
          `/crawls/${encodeURIComponent(crawlId)}/pages?${params}`,
          { signal: controller.signal }
        )
        if (controller.signal.aborted) return

        setPages((current) =>
          replace ? response.pages : [...current, ...response.pages]
        )
        setTotal(response.pagination.total)
      } catch (requestError: unknown) {
        if (controller.signal.aborted) return
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load page links."
        )
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
          setIsLoadingMore(false)
        }
      }
    },
    [crawlId]
  )

  useEffect(() => {
    void fetchPageBatch(0, true)
    return () => requestRef.current?.abort()
  }, [fetchPageBatch])

  useEffect(() => {
    onPagesChange?.(pages)
  }, [onPagesChange, pages])

  const hasMore = pages.length < total
  const loadMore = () => {
    if (!isLoading && !isLoadingMore && hasMore) {
      void fetchPageBatch(pages.length, false)
    }
  }

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const visiblePages = normalizedSearch
    ? pages.filter((page) =>
        `${page.title ?? ""} ${page.url}`
          .toLowerCase()
          .includes(normalizedSearch)
      )
    : pages

  return (
    <aside
      aria-label="Crawled page links"
      className={cn(
        "flex min-h-0 shrink-0 flex-col border-r border-white/10 pr-3",
        collapsed ? "w-10" : "w-60"
      )}
    >
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 px-1 pb-2">
        {!collapsed ? (
          <h2 className="min-w-0 flex-1 truncate px-1 text-sm leading-none font-semibold">
            Crawled pages
          </h2>
        ) : null}
        {!collapsed ? (
          <Button
            aria-label="Search crawled pages"
            className="shrink-0"
            onClick={() => setSearchOpen((open) => !open)}
            size="icon-xs"
            title="Search crawled pages"
            type="button"
            variant="ghost"
          >
            <SearchIcon aria-hidden="true" />
          </Button>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={
                  collapsed ? "Expand page links" : "Collapse page links"
                }
                className="shrink-0"
                onClick={() => onCollapsedChange(!collapsed)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                {collapsed ? (
                  <PanelLeftOpenIcon aria-hidden="true" />
                ) : (
                  <PanelLeftCloseIcon aria-hidden="true" />
                )}
              </Button>
            }
          />
          <TooltipContent>
            {collapsed ? "Expand page links" : "Collapse page links"}
          </TooltipContent>
        </Tooltip>
      </div>

      {!collapsed && searchOpen ? (
        <div className="shrink-0 px-1 pb-2">
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search crawled pages"
              autoFocus
              className="h-8 border-white/10 bg-white/5 pl-8 text-xs placeholder:text-white/35"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search pages…"
              value={searchQuery}
            />
          </div>
        </div>
      ) : null}

      {collapsed ? null : (
        <>
          <div className="relative min-h-0 flex-1 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="space-y-2 pt-2">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton className="h-8 w-full" key={index} />
                ))}
              </div>
            ) : error ? (
              <p className="px-2 py-3 text-xs text-destructive">{error}</p>
            ) : visiblePages.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {normalizedSearch ? "No matching pages." : "No crawled pages."}
              </p>
            ) : (
              <nav
                aria-label="Crawled pages"
                className="relative flex flex-col gap-1 pt-2"
                onMouseLeave={pagePill.clearPill}
              >
                <HoverPill className="bg-white/10" pill={pagePill.pill} />
                {visiblePages.map((page, index) => {
                  const itemProps = pagePill.getItemProps(index)
                  const isCurrent = page.url === currentUrl
                  const label = page.title?.trim() || page.url
                  return (
                    <div
                      {...itemProps}
                      className={cn(
                        itemProps.className,
                        "group flex w-full items-center gap-0.5 rounded-md px-1 py-0.5"
                      )}
                      key={page.url}
                    >
                      <button
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-xs leading-tight",
                          isCurrent
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground/80"
                        )}
                        onClick={() => onSelectUrl(page.url)}
                        title={page.url}
                        type="button"
                      >
                        <span className="block w-full truncate">{label}</span>
                        {page.title ? (
                          <span className="mt-0.5 block w-full truncate text-[10px] leading-4 text-muted-foreground/60">
                            {page.url}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  )
                })}
              </nav>
            )}
          </div>

          {hasMore ? (
            <Button
              className="mt-2 h-8 w-full shrink-0 text-xs"
              disabled={isLoadingMore}
              onClick={loadMore}
              size="sm"
              variant="outline"
            >
              {isLoadingMore ? (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : null}
              {isLoadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </>
      )}
    </aside>
  )
}
