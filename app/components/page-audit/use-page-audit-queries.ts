import { useEffect, useState } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { clientApiFetch } from "~/lib/api"
import type {
  CrawlPageHealthDetailResponse,
  CrawlPageSearchResponse,
} from "~/lib/api.types"
import type { IssueWorkspacePageDetail } from "~/components/summary/issue-workspace.types"

export const PAGE_SEARCH_DEBOUNCE_MS = 250
export const PAGE_SEARCH_PAGE_SIZE = 50

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, value])

  return debounced
}

export function useCrawlPageSearch(
  crawlId: string | null,
  query: string,
  enabled: boolean
) {
  const debouncedQuery = useDebouncedValue(query, PAGE_SEARCH_DEBOUNCE_MS)

  return useInfiniteQuery({
    enabled: Boolean(crawlId && enabled),
    queryKey: ["crawl-page-search", crawlId, debouncedQuery],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SEARCH_PAGE_SIZE),
        offset: String(pageParam),
      })
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim())
      return clientApiFetch<CrawlPageSearchResponse>(
        `/crawls/${crawlId}/pages/search?${params.toString()}`,
        { signal }
      )
    },
    getNextPageParam: (lastPage) => {
      const { offset, count, total } = lastPage.pagination
      const nextOffset = offset + count
      return nextOffset < total ? nextOffset : undefined
    },
    staleTime: 60_000,
  })
}

export function usePageHealthDetail(
  crawlId: string | null,
  pageId: string | null
) {
  return useQuery({
    enabled: Boolean(crawlId && pageId),
    queryKey: ["crawl-page-health", crawlId, pageId],
    queryFn: ({ signal }) =>
      clientApiFetch<CrawlPageHealthDetailResponse>(
        `/crawls/${crawlId}/pages/${pageId}/health`,
        { signal }
      ),
    retry: false,
    staleTime: 60_000,
  })
}

export function usePageIssueDetail(crawlId: string | null, url: string | null) {
  return useQuery({
    enabled: Boolean(crawlId && url),
    queryKey: ["crawl-page-issues", crawlId, url],
    queryFn: ({ signal }) =>
      clientApiFetch<IssueWorkspacePageDetail>(
        `/crawls/${crawlId}/issue-workspace/page?url=${encodeURIComponent(
          url as string
        )}`,
        { signal }
      ),
    staleTime: 60_000,
  })
}
