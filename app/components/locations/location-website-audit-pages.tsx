"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { PageAuditEmptyState } from "~/components/page-audit/page-audit-tab"
import { PageHealthView } from "~/components/page-audit/page-health-view"
import { PageSearchBar } from "~/components/page-audit/page-search-bar"
import type { SelectedAuditPage } from "~/components/page-audit/page-audit-context"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import {
  createScopedIssueUrlsFetcher,
  fetchLocationWebsiteAuditPages,
  type LocationScopedPage,
} from "~/components/locations/location-website-audit-api"

const SCOPED_SEARCH_CHUNK = 100

/**
 * Search-first Page scores inside the pinned branch scope. Reuses the parent
 * empty state, bar and health view; the scoped request gathers every stored
 * matching page from the location endpoint (no q param) before filtering, so
 * search never touches the parent-global crawl search.
 */
export function LocationWebsiteAuditPages({
  projectId,
  locationId,
  crawlId,
  parentCrawlId,
  scopeRevision,
  breakdown,
  enabled,
  onOpenPage,
}: {
  projectId: string
  locationId: string
  crawlId: string | null
  parentCrawlId: string | null
  scopeRevision: number | null
  breakdown: ScoreBreakdownResponse | null
  enabled: boolean
  onOpenPage?: (page: LocationScopedPage) => void
}) {
  const [selected, setSelected] = useState<SelectedAuditPage | null>(null)

  useEffect(() => {
    setSelected(null)
  }, [projectId, locationId, crawlId, scopeRevision])

  const issueUrlsFetcher = useMemo(
    () =>
      createScopedIssueUrlsFetcher(projectId, locationId, {
        crawlId,
        scopeRevision,
      }),
    [projectId, locationId, crawlId, scopeRevision]
  )

  const searchKey = `${projectId}::${locationId}::${crawlId ?? "latest"}::rev${scopeRevision ?? "none"}`

  const searchRequest = useCallback(
    async ({
      offset,
      limit,
      query,
      signal,
    }: {
      offset: number
      limit: number
      query: string
      signal: AbortSignal
    }) => {
      const collected: Array<{ crawl_page_id: string; url: string; title: string }> =
        []
      let pageOffset = 0
      for (;;) {
        const response = await fetchLocationWebsiteAuditPages(
          projectId,
          locationId,
          {
            crawlId,
            scopeRevision,
            limit: SCOPED_SEARCH_CHUNK,
            offset: pageOffset,
            signal,
          }
        )
        collected.push(...response.pages)
        pageOffset += response.pagination.count
        if (
          response.pagination.count === 0 ||
          pageOffset >= response.pagination.total
        ) {
          break
        }
      }

      const needle = query.trim().toLowerCase()
      const matches = needle
        ? collected.filter(
            (page) =>
              page.url.toLowerCase().includes(needle) ||
              page.title.toLowerCase().includes(needle)
          )
        : collected
      const slice = matches.slice(offset, offset + limit)
      return {
        crawl_id: crawlId ?? "",
        query,
        pages: slice.map((page) => ({
          id: page.crawl_page_id,
          url: page.url,
          title: page.title,
        })),
        pagination: {
          limit,
          offset,
          count: slice.length,
          total: matches.length,
        },
      }
    },
    [projectId, locationId, crawlId, scopeRevision]
  )

  const handleSelect = useCallback(
    (page: SelectedAuditPage) => {
      setSelected(page)
      onOpenPage?.({
        crawlPageId: page.id,
        url: page.url,
        title: page.title ?? "",
      })
    },
    [onOpenPage]
  )

  const handleClear = useCallback(() => setSelected(null), [])

  if (!selected) {
    return (
      <PageAuditEmptyState
        crawlId={crawlId}
        disabled={!enabled}
        onClearPage={handleClear}
        onSelectPage={handleSelect}
        placeholder="Search branch pages…"
        searchKey={searchKey}
        searchRequest={searchRequest}
        selectedPage={null}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <PageSearchBar
          crawlId={crawlId}
          disabled={!enabled}
          onClearPage={handleClear}
          onSelectPage={handleSelect}
          placeholder="Search branch pages…"
          searchKey={searchKey}
          searchRequest={searchRequest}
          selectedPage={selected}
        />
      </div>
      <PageHealthView
        breakdown={breakdown}
        crawlId={parentCrawlId}
        page={selected}
        scopedIssueUrls={{
          fetchPage: issueUrlsFetcher,
          pageCrawlId: parentCrawlId ?? undefined,
          scopeKey: `${searchKey}::${selected.id}`,
          hideWorkActions: true,
        }}
      />
    </div>
  )
}
