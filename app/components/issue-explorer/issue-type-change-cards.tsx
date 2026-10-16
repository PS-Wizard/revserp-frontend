"use client"

import { useState } from "react"

import { FixCard } from "~/components/summary/fix-summary-card"
import { SeverityBadge, StatBadge, TaskMark } from "~/components/summary/issue-workspace-ui"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

import {
  useIssueTypeDiffBaseline,
  useIssueTypeDiffRows,
  type IssueTypeDiffURL,
} from "./use-issue-type-diff"

export const ISSUE_TYPE_FIXED_CARD_TITLE = "Fixed From Last Crawl"
export const ISSUE_TYPE_NEW_CARD_TITLE = "New In This Crawl"

const ISSUE_TYPE_CHANGE_PAGE_SIZE = 25

function IssueTypeChangeRow({
  fixed,
  row,
}: {
  fixed: boolean
  row: IssueTypeDiffURL
}) {
  const excluded = row.change_type === "excluded"
  const evidence =
    (fixed ? row.baseline : row.current) ?? row.baseline ?? row.current
  return (
    <li className="flex items-start gap-3.5 py-4 first:pt-2">
      <TaskMark state={fixed ? (excluded ? "question" : "done") : "open"} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {evidence?.message ? (
            <p
              className={cn(
                "text-sm leading-6 font-medium text-foreground",
                fixed &&
                  "text-muted-foreground line-through decoration-muted-foreground/40"
              )}
            >
              {evidence.message}
            </p>
          ) : null}
          {evidence?.severity ? (
            <SeverityBadge severity={evidence.severity} />
          ) : null}
          {excluded ? (
            <StatBadge tone="amber">Excluded</StatBadge>
          ) : fixed ? null : (
            <StatBadge tone="amber">New</StatBadge>
          )}
        </div>
        <span
          className={cn(
            "block truncate text-sm text-muted-foreground focus:whitespace-normal focus:break-all",
            fixed && "line-through decoration-muted-foreground/40"
          )}
          tabIndex={0}
          title={row.url}
        >
          {row.url}
        </span>
        {evidence?.details ? (
          <p
            className={cn(
              "text-sm leading-relaxed text-muted-foreground",
              fixed && "opacity-70"
            )}
          >
            {evidence.details}
          </p>
        ) : null}
      </div>
    </li>
  )
}

function IssueTypeChangeListCard({
  baselineCrawlId,
  bucketId,
  changeType,
  crawlId,
  emptyMessage,
  fixed,
  includeExcluded,
  issueTypeId,
  pillarId,
  title,
}: {
  baselineCrawlId: string
  bucketId: string
  changeType: "new" | "resolved"
  crawlId: string
  emptyMessage: string
  fixed: boolean
  includeExcluded?: boolean
  issueTypeId: string
  pillarId: string
  title: string
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const rowsQuery = useIssueTypeDiffRows({
    baselineCrawlId,
    bucketId,
    changeType,
    currentCrawlId: crawlId,
    enabled: Boolean(baselineCrawlId),
    includeExcluded,
    issueTypeId,
    pageIndex,
    pageSize: ISSUE_TYPE_CHANGE_PAGE_SIZE,
    pillarId,
  })
  const rows = (rowsQuery.data?.urls ?? []).filter((row) =>
    fixed
      ? row.change_type === "resolved" ||
        row.change_type === "no_longer_detected" ||
        row.change_type === "excluded"
      : row.change_type === "new"
  )
  const total = rowsQuery.data?.pagination.total ?? 0
  const pageCount = Math.max(
    1,
    Math.ceil(total / ISSUE_TYPE_CHANGE_PAGE_SIZE)
  )
  const footer =
    pageCount > 1 ? (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground tabular-nums">
          Page {pageIndex + 1} of {pageCount}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
            size="xs"
            type="button"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={pageIndex + 1 >= pageCount}
            onClick={() => setPageIndex((index) => index + 1)}
            size="xs"
            type="button"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
    ) : undefined
  return (
    <FixCard
      count={total}
      empty={
        <p className="py-4 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      }
      footer={footer}
      isError={rowsQuery.isError}
      isLoading={rowsQuery.isPending}
      onRetry={() => void rowsQuery.refetch()}
      title={title}
    >
      {rows.map((row) => (
        <IssueTypeChangeRow fixed={fixed} key={row.url} row={row} />
      ))}
    </FixCard>
  )
}

export function IssueTypeChangeCards({
  bucketId,
  crawlId,
  issueTypeId,
  issueTypeLabel,
  pillarId,
}: {
  bucketId: string
  crawlId: string
  issueTypeId: string
  issueTypeLabel: string
  pillarId: string
}) {
  const baselineQuery = useIssueTypeDiffBaseline(crawlId, Boolean(crawlId))
  const baselineCrawlId = baselineQuery.data?.baseline_crawl?.id

  if (baselineQuery.isPending) {
    return (
      <div className="grid min-w-0 gap-5 max-md:auto-rows-[28rem] md:grid-cols-2 md:grid-rows-1 md:max-lg:h-[28rem] lg:h-[32rem]">
        <FixCard
          count={0}
          isLoading
          title={ISSUE_TYPE_FIXED_CARD_TITLE}
        >
          {null}
        </FixCard>
        <FixCard count={0} isLoading title={ISSUE_TYPE_NEW_CARD_TITLE}>
          {null}
        </FixCard>
      </div>
    )
  }

  if (baselineQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 py-4">
        <p className="text-sm text-muted-foreground">
          Could not load crawl changes.
        </p>
        <Button
          onClick={() => void baselineQuery.refetch()}
          size="xs"
          type="button"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    )
  }

  if (!baselineCrawlId) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No previous completed crawl to compare against, so fixed and new URLs
        are unavailable.
      </p>
    )
  }

  return (
    <div className="grid min-w-0 gap-5 max-md:auto-rows-[28rem] md:grid-cols-2 md:grid-rows-1 md:max-lg:h-[28rem] lg:h-[32rem]">
      <IssueTypeChangeListCard
        baselineCrawlId={baselineCrawlId}
        bucketId={bucketId}
        changeType="resolved"
        crawlId={crawlId}
        emptyMessage={`No fixed URLs for ${issueTypeLabel} in this crawl.`}
        fixed
        includeExcluded
        issueTypeId={issueTypeId}
        pillarId={pillarId}
        title={ISSUE_TYPE_FIXED_CARD_TITLE}
      />
      <IssueTypeChangeListCard
        baselineCrawlId={baselineCrawlId}
        bucketId={bucketId}
        changeType="new"
        crawlId={crawlId}
        emptyMessage={`No new URLs for ${issueTypeLabel} in this crawl.`}
        fixed={false}
        issueTypeId={issueTypeId}
        pillarId={pillarId}
        title={ISSUE_TYPE_NEW_CARD_TITLE}
      />
    </div>
  )
}
