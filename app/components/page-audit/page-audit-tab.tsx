"use client"

import { memo } from "react"

import { FileSearchIcon } from "lucide-react"

import { PageHealthView } from "~/components/page-audit/page-health-view"
import { PageSearchBar } from "~/components/page-audit/page-search-bar"
import { usePageAudit } from "~/components/page-audit/page-audit-context"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import type { ScoreBreakdownResponse } from "~/lib/api.types"

export const PageAuditTab = memo(function PageAuditTab({
  breakdown,
  crawlId,
}: {
  breakdown: ScoreBreakdownResponse | null
  crawlId: string | null
}) {
  const pageAudit = usePageAudit()
  const selectedPage = pageAudit?.selectedPage ?? null

  if (!pageAudit || !selectedPage) {
    return (
      <div className="flex min-h-[calc(100svh_-_7rem)] items-center justify-center px-4 lg:px-6">
        <Empty className="min-h-[320px]">
          <EmptyHeader>
            <EmptyMedia className="size-14" variant="icon">
              <FileSearchIcon aria-hidden="true" className="size-8" />
            </EmptyMedia>
            <EmptyTitle>Page scores</EmptyTitle>
            <EmptyDescription>
              Search for a page to see its health score and issues.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <PageSearchBar
              crawlId={crawlId}
              disabled={!crawlId}
              onClearPage={() => pageAudit?.setSelectedPage(null)}
              onSelectPage={(page) => pageAudit?.setSelectedPage(page)}
              selectedPage={null}
            />
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="px-4 lg:px-6">
        <PageSearchBar
          crawlId={crawlId}
          disabled={!crawlId}
          onClearPage={() => pageAudit.setSelectedPage(null)}
          onSelectPage={pageAudit.setSelectedPage}
          selectedPage={selectedPage}
        />
      </div>
      <PageHealthView
        breakdown={breakdown}
        crawlId={crawlId}
        page={selectedPage}
      />
    </div>
  )
})
