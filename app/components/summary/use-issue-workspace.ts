import { useEffect, useMemo, useState } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { clientApiFetch } from "~/lib/api"

import type {
  IssueWorkspaceBrowseTarget,
  IssueWorkspacePageDetail,
  IssueWorkspacePageSearchResponse,
  IssueWorkspaceSummary,
} from "./issue-workspace.types"

const SEARCH_DEBOUNCE_MS = 250
const PAGE_SIZE = 30

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, value])

  return debounced
}

export function getBrowseTargetLabel(target: IssueWorkspaceBrowseTarget) {
  switch (target.kind) {
    case "summary":
      return "Summary"
    case "verified-fixes":
      return "Verified Fixes"
    case "awaiting-verification":
      return "Awaiting Verification"
    case "unclaimed-fixes":
      return "Unlogged Fixes"
    case "url":
      return target.url
  }
}

export function useIssueWorkspace(crawlId: string | null) {
  const [searchInput, setSearchInput] = useState("")
  const [browseTarget, setBrowseTarget] = useState<IssueWorkspaceBrowseTarget>({
    kind: "verified-fixes",
  })
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)

  useEffect(() => {
    setBrowseTarget({ kind: "verified-fixes" })
    setSearchInput("")
  }, [crawlId])

  const selectedUrl = browseTarget.kind === "url" ? browseTarget.url : null
  const isSummarySelected = browseTarget.kind === "summary"
  const isChangesSectionSelected =
    browseTarget.kind === "verified-fixes" ||
    browseTarget.kind === "awaiting-verification" ||
    browseTarget.kind === "unclaimed-fixes"

  const summaryQuery = useQuery({
    enabled: Boolean(crawlId),
    queryKey: ["issue-workspace-summary", crawlId],
    queryFn: ({ signal }) =>
      clientApiFetch<IssueWorkspaceSummary>(
        `/crawls/${crawlId}/issue-workspace/summary`,
        { signal }
      ),
  })

  const pagesQuery = useInfiniteQuery({
    enabled: Boolean(crawlId),
    queryKey: ["issue-workspace-pages", crawlId, debouncedSearch],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      })
      if (debouncedSearch.trim()) qs.set("q", debouncedSearch.trim())
      return clientApiFetch<IssueWorkspacePageSearchResponse>(
        `/crawls/${crawlId}/issue-workspace/pages/search?${qs.toString()}`,
        { signal }
      )
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.pagination.offset + lastPage.pagination.count
      return nextOffset < lastPage.pagination.total ? nextOffset : undefined
    },
  })

  const flatPages = useMemo(
    () => pagesQuery.data?.pages.flatMap((page) => page.pages) ?? [],
    [pagesQuery.data]
  )

  const pageDetailQuery = useQuery({
    enabled: Boolean(crawlId && selectedUrl),
    queryKey: ["issue-workspace-page", crawlId, selectedUrl],
    queryFn: ({ signal }) =>
      clientApiFetch<IssueWorkspacePageDetail>(
        `/crawls/${crawlId}/issue-workspace/page?url=${encodeURIComponent(
          selectedUrl as string
        )}`,
        { signal }
      ),
  })

  const selectUrl = (url: string) => setBrowseTarget({ kind: "url", url })

  return {
    browseTarget,
    debouncedSearch,
    flatPages,
    isChangesSectionSelected,
    isSummarySelected,
    pageDetailQuery,
    pagesQuery,
    searchInput,
    selectedUrl,
    setBrowseTarget,
    setSearchInput,
    selectUrl,
    summaryQuery,
  }
}
