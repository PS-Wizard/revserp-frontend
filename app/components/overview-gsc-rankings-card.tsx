"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { SearchCheckIcon } from "lucide-react"
import { useLocation, useNavigate } from "react-router"

import { formatNumber } from "~/components/gsc-overview/formatters"
import { Linkify } from "~/components/linkify"
import { useGSCQueries } from "~/components/gsc-overview/use-gsc-queries"
import {
  gscOverviewQueryKey,
  gscStatusQueryKey,
} from "~/components/search-console-view"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { ApiError, clientApiFetch } from "~/lib/api"
import type {
  GSCSearchAnalyticsRowResponse,
  ProjectGSCOverviewResponse,
  ProjectGSCStatusResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"

type RankingsTab = "queries" | "pages"

function rowLabel(row: GSCSearchAnalyticsRowResponse, tab: RankingsTab) {
  return tab === "pages"
    ? row.page?.trim() || "Unknown page"
    : row.query?.trim() || "Unknown query"
}

function sortByImpressions(rows: GSCSearchAnalyticsRowResponse[]) {
  return [...rows].sort((left, right) => right.impressions - left.impressions)
}

function GSCConnectEmptyState() {
  const navigate = useNavigate()
  const location = useLocation()

  const openSearchConsole = () => {
    void navigate({
      pathname: location.pathname,
      search: location.search,
      hash: "#search-console",
    })
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50">
        <SearchCheckIcon aria-hidden="true" className="size-5 text-sky-400" />
      </div>
      <p className="text-base font-medium text-foreground">
        Connect Search Console
      </p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Link Google Search Console to see your top question queries and pages,
        ranked by impressions.
      </p>
      <Button
        className="mt-5"
        onClick={openSearchConsole}
        size="sm"
        type="button"
      >
        Go to Search Console
      </Button>
    </div>
  )
}

function RankingsListHeader({ tab }: { tab: RankingsTab }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border/60 pr-3 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      <span className="w-6 shrink-0 text-center">#</span>
      <span className="min-w-0 flex-1">
        {tab === "pages" ? "Page" : "Query"}
      </span>
      <span className="shrink-0">Impressions</span>
    </div>
  )
}

function RankingRow({
  index,
  label,
  impressions,
  isLast,
  tab,
}: {
  index: number
  label: string
  impressions: number
  isLast: boolean
  tab: RankingsTab
}) {
  return (
    <div
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-md py-4",
        !isLast && "border-b border-border/40"
      )}
    >
      <span className="w-6 shrink-0 text-center text-[13px] text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <p
        className="min-w-0 flex-1 truncate text-[13px] leading-snug font-medium text-foreground/90"
        title={label}
      >
        {tab === "pages" ? <Linkify text={label} /> : label}
      </p>
      <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
        {formatNumber(impressions)}
      </span>
    </div>
  )
}

function RankingsList({
  rows,
  tab,
  hasMore,
  isLoading,
  isLoadingMore,
  errorMessage,
  onLoadMore,
  onRetry,
}: {
  rows: GSCSearchAnalyticsRowResponse[]
  tab: RankingsTab
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  errorMessage: string
  onLoadMore: () => void
  onRetry?: () => void
}) {
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = loadMoreRef.current
    const root = scrollRootRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    )
    if (!sentinel || !root || !hasMore) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoading && !isLoadingMore) {
          onLoadMore()
        }
      },
      { root, rootMargin: "160px 0px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoading, isLoadingMore, onLoadMore, rows.length])

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-4/5" />
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="py-4">
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        {onRetry ? (
          <Button
            className="mt-3"
            onClick={onRetry}
            size="xs"
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
        {tab === "queries"
          ? "No question queries found for this property."
          : "No page data available yet."}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RankingsListHeader tab={tab} />
      <div className="min-h-0 flex-1 overflow-hidden" ref={scrollRootRef}>
        <ScrollArea className="h-full">
          <div className="flex flex-col pr-3">
            {rows.map((row, index) => (
              <RankingRow
                impressions={row.impressions}
                index={index}
                isLast={index === rows.length - 1 && !hasMore}
                key={`${rowLabel(row, tab)}::${index}`}
                label={rowLabel(row, tab)}
                tab={tab}
              />
            ))}
            {hasMore ? (
              <div className="flex items-center justify-center py-3">
                {isLoadingMore ? (
                  <span className="text-xs text-muted-foreground">Loading…</span>
                ) : (
                  <div className="h-1" ref={loadMoreRef} />
                )}
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

type RankingsData = {
  rows: GSCSearchAnalyticsRowResponse[]
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  errorMessage: string
  loadMore: () => void
}

function useRankingsQueries({
  projectId,
  siteURL,
  enabled,
}: {
  projectId: string
  siteURL: string
  enabled: boolean
}): RankingsData {
  const query = useGSCQueries({
    projectID: projectId,
    siteURL,
    search: "",
    preset: "questions",
    enabled,
  })

  const rows = useMemo(() => sortByImpressions(query.rows), [query.rows])

  return { ...query, rows }
}

function useRankingsPages({
  projectId,
  enabled,
}: {
  projectId: string
  enabled: boolean
}): RankingsData {
  const {
    data: overview,
    isLoading,
    error,
  } = useQuery({
    queryKey: projectId
      ? gscOverviewQueryKey(projectId)
      : ["gsc-overview-disabled"],
    queryFn: () =>
      clientApiFetch<ProjectGSCOverviewResponse>(
        `/projects/${projectId!}/gsc/overview`
      ),
    enabled: Boolean(projectId) && enabled,
    placeholderData: (prev) => prev,
  })

  const rows = useMemo(() => {
    const topPages = overview?.overview.windows["180"]?.top_pages ?? []
    return sortByImpressions(topPages)
  }, [overview])

  const loadMore = useCallback(() => {}, [])

  return {
    rows,
    hasMore: false,
    isLoading,
    isLoadingMore: false,
    errorMessage:
      error instanceof ApiError
        ? error.message
        : error
          ? "Could not load Search Console pages."
          : "",
    loadMore,
  }
}

export function OverviewGSCRankingsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const [tab, setTab] = useState<RankingsTab>("queries")

  const { data: gscStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: projectId
      ? gscStatusQueryKey(projectId)
      : ["gsc-status-disabled"],
    queryFn: () =>
      clientApiFetch<ProjectGSCStatusResponse>(
        `/projects/${projectId!}/gsc/status`
      ),
    enabled: Boolean(projectId),
    placeholderData: (prev) => prev,
  })

  const gscConnected =
    Boolean(gscStatus?.has_google_connection) && Boolean(gscStatus?.connected)
  const siteURL = gscStatus?.selected_site?.site_url ?? ""
  const dataEnabled = Boolean(projectId) && gscConnected && Boolean(siteURL)

  const queriesData = useRankingsQueries({
    projectId: projectId ?? "",
    siteURL,
    enabled: dataEnabled && tab === "queries",
  })
  const pagesData = useRankingsPages({
    projectId: projectId ?? "",
    enabled: dataEnabled,
  })

  const rankingsBody = !projectId ? (
    <div className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
      Select a project to see Search Console rankings.
    </div>
  ) : isLoadingStatus ? (
    <div className="space-y-3 px-5 py-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  ) : !gscConnected ? (
    <GSCConnectEmptyState />
  ) : (
    <>
      <TabsContent
        className="mt-0 flex min-h-0 flex-1 flex-col px-5 py-4"
        value="queries"
      >
        <RankingsList
          errorMessage={queriesData.errorMessage}
          hasMore={queriesData.hasMore}
          isLoading={queriesData.isLoading}
          isLoadingMore={queriesData.isLoadingMore}
          onLoadMore={queriesData.loadMore}
          rows={queriesData.rows}
          tab="queries"
        />
      </TabsContent>

      <TabsContent
        className="mt-0 flex min-h-0 flex-1 flex-col px-5 py-4"
        value="pages"
      >
        <RankingsList
          errorMessage={pagesData.errorMessage}
          hasMore={pagesData.hasMore}
          isLoading={pagesData.isLoading}
          isLoadingMore={pagesData.isLoadingMore}
          onLoadMore={pagesData.loadMore}
          rows={pagesData.rows}
          tab="pages"
        />
      </TabsContent>
    </>
  )

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0">
      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        onValueChange={(value) => setTab(value as RankingsTab)}
        value={tab}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
          <h3 className="truncate font-heading text-base font-semibold tracking-tight">
            Rankings
          </h3>
          {gscConnected && !isLoadingStatus && projectId ? (
            <TabsList className="h-auto shrink-0 justify-start gap-1 rounded-lg bg-muted/50 p-1">
              <TabsTrigger className="px-3 py-1.5 text-xs" value="queries">
                Queries
              </TabsTrigger>
              <TabsTrigger className="px-3 py-1.5 text-xs" value="pages">
                Pages
              </TabsTrigger>
            </TabsList>
          ) : null}
        </div>
        {rankingsBody}
      </Tabs>
    </Card>
  )
}
