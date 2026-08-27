"use client"

import { useMemo } from "react"
import type { UseQueryResult } from "@tanstack/react-query"

import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"

import {
  FoldSection,
  IssueTask,
  StatBadge,
  WorkTask,
  issueKey,
  isWorkItem,
} from "./issue-workspace-ui"
import type {
  IssueWorkspaceChangesResponse,
  IssueWorkspaceIssue,
  IssueWorkspaceSummary,
  IssueWorkspaceWorkItem,
} from "./issue-workspace.types"
import { useIssueWorkspaceChanges } from "./use-issue-workspace-changes"
import type { useIssueWorkMutations } from "./use-issue-work-mutations"

function groupByUrl<T extends { url: string }>(items: T[]) {
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const list = grouped.get(item.url) ?? []
    list.push(item)
    grouped.set(item.url, list)
  }
  return [...grouped.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )
}

function PageGroup({
  children,
  onSelectUrl,
  url,
}: {
  children: React.ReactNode
  onSelectUrl: (url: string) => void
  url: string
}) {
  return (
    <li className="py-4 first:pt-2">
      <button
        className="mb-3 max-w-full text-left text-sm font-medium break-all text-foreground hover:underline"
        onClick={() => onSelectUrl(url)}
        title={`Open ${url} in the issue workspace`}
        type="button"
      >
        {url}
      </button>
      <ul className="divide-y divide-border/50 border-l border-border/40 pl-4">
        {children}
      </ul>
    </li>
  )
}

function ChangesFoldSection({
  children,
  count,
  emptyLabel,
  isError,
  isLoading,
  onRetry,
  title,
}: {
  children: React.ReactNode
  count: number
  emptyLabel: string
  isError?: boolean
  isLoading?: boolean
  onRetry?: () => void
  title: string
}) {
  if (isError) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Could not load this section.
        </p>
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

  return (
    <FoldSection
      count={count}
      emptyLabel={emptyLabel}
      isLoading={isLoading}
      title={title}
    >
      {children}
    </FoldSection>
  )
}

function useChangesItems(query: UseQueryResult<IssueWorkspaceChangesResponse>) {
  return useMemo(() => {
    const items = query.data?.items ?? []
    const issues = items.filter(
      (item): item is IssueWorkspaceIssue => !isWorkItem(item)
    )
    const workItems = items.filter((item): item is IssueWorkspaceWorkItem =>
      isWorkItem(item)
    )
    return { issues, workItems, total: query.data?.pagination.total ?? 0 }
  }, [query.data])
}

export function IssueWorkspaceSummaryView({
  crawlId,
  currentUserId,
  isActive,
  mutations,
  onSelectUrl,
  summary,
  summaryQuery,
}: {
  crawlId: string
  currentUserId: string
  isActive: boolean
  mutations: ReturnType<typeof useIssueWorkMutations>
  onSelectUrl: (url: string) => void
  summary: IssueWorkspaceSummary
  summaryQuery: { isLoading: boolean }
}) {
  const fixedQuery = useIssueWorkspaceChanges(crawlId, "fixed", isActive)
  const noLongerQuery = useIssueWorkspaceChanges(
    crawlId,
    "no_longer_detected",
    isActive
  )
  const awaitingQuery = useIssueWorkspaceChanges(
    crawlId,
    "awaiting_verification",
    isActive
  )
  const newQuery = useIssueWorkspaceChanges(crawlId, "new", isActive)

  const fixed = useChangesItems(fixedQuery)
  const noLonger = useChangesItems(noLongerQuery)
  const awaiting = useChangesItems(awaitingQuery)
  const newly = useChangesItems(newQuery)

  const fixedByUrl = useMemo(() => groupByUrl(fixed.issues), [fixed.issues])
  const noLongerByUrl = useMemo(
    () => groupByUrl(noLonger.issues),
    [noLonger.issues]
  )
  const awaitingByUrl = useMemo(
    () => groupByUrl(awaiting.workItems),
    [awaiting.workItems]
  )
  const newByUrl = useMemo(() => groupByUrl(newly.issues), [newly.issues])

  const { markDone, undoContribution } = mutations
  const markingIssueId =
    markDone.isPending && markDone.variables ? markDone.variables : null
  const undoingAttemptId =
    undoContribution.isPending && undoContribution.variables
      ? undoContribution.variables
      : null

  const counts = summary.counts

  return (
    <article className="mx-auto w-full max-w-4xl px-6 py-10 sm:px-10 sm:py-12">
      <header className="space-y-5">
        <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-[2rem]">
          Crawl summary
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Changes compared with the previous crawl.
        </p>
        {summaryQuery.isLoading ? (
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-6 w-20" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <StatBadge tone="green">{counts.fixed} verified</StatBadge>
            <StatBadge tone="violet">
              {counts.no_longer_detected} no longer detected
            </StatBadge>
            <StatBadge tone="amber">
              {(summary.work_counts.awaiting_verification ?? 0) +
                (summary.work_counts.not_verified ?? 0)}{" "}
              need verification
            </StatBadge>
            <StatBadge tone="blue">{counts.new} new</StatBadge>
            <StatBadge tone="neutral">{counts.still_open} remaining</StatBadge>
          </div>
        )}
      </header>

      <Separator className="my-10" />

      <section className="flex flex-col gap-6 pb-16">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Changes since last crawl
        </h2>

        <ChangesFoldSection
          count={fixed.total}
          emptyLabel="No contributor-verified fixes in this crawl."
          isError={fixedQuery.isError}
          isLoading={fixedQuery.isLoading}
          onRetry={() => void fixedQuery.refetch()}
          title="Verified fixes"
        >
          {fixedByUrl.map(([url, issues]) => (
            <PageGroup key={url} onSelectUrl={onSelectUrl} url={url}>
              {issues.map((issue) => (
                <IssueTask
                  currentUserId={currentUserId}
                  issue={issue}
                  key={issueKey(issue)}
                  state="done"
                />
              ))}
            </PageGroup>
          ))}
        </ChangesFoldSection>

        <ChangesFoldSection
          count={noLonger.total}
          emptyLabel="No unlogged fixes in this crawl."
          isError={noLongerQuery.isError}
          isLoading={noLongerQuery.isLoading}
          onRetry={() => void noLongerQuery.refetch()}
          title="Unlogged fixes"
        >
          {noLongerByUrl.map(([url, issues]) => (
            <PageGroup key={url} onSelectUrl={onSelectUrl} url={url}>
              {issues.map((issue) => (
                <IssueTask
                  currentUserId={currentUserId}
                  issue={issue}
                  key={issueKey(issue)}
                  note="The crawl confirmed that this issue disappeared, but no work was recorded, so no contributor credit was assigned."
                  state="question"
                />
              ))}
            </PageGroup>
          ))}
        </ChangesFoldSection>

        <ChangesFoldSection
          count={awaiting.total}
          emptyLabel="No recorded work is waiting for crawl verification."
          isError={awaitingQuery.isError}
          isLoading={awaitingQuery.isLoading}
          onRetry={() => void awaitingQuery.refetch()}
          title="Awaiting verification"
        >
          {awaitingByUrl.map(([url, workItems]) => (
            <PageGroup key={url} onSelectUrl={onSelectUrl} url={url}>
              {workItems.map((work) => (
                <WorkTask
                  currentUserId={currentUserId}
                  isMarkPending={undoingAttemptId === work.attempt_id}
                  key={work.attempt_id}
                  onUndo={() => undoContribution.mutate(work.attempt_id)}
                  work={work}
                />
              ))}
            </PageGroup>
          ))}
        </ChangesFoldSection>

        <ChangesFoldSection
          count={newly.total}
          emptyLabel="No new issues in this crawl."
          isError={newQuery.isError}
          isLoading={newQuery.isLoading}
          onRetry={() => void newQuery.refetch()}
          title="New issues"
        >
          {newByUrl.map(([url, issues]) => (
            <PageGroup key={url} onSelectUrl={onSelectUrl} url={url}>
              {issues.map((issue) => (
                <IssueTask
                  currentUserId={currentUserId}
                  isMarkPending={markingIssueId === issue.current_issue_id}
                  issue={issue}
                  key={issueKey(issue)}
                  onMarkDone={
                    issue.current_issue_id
                      ? () => markDone.mutate(issue.current_issue_id as string)
                      : undefined
                  }
                  state="open"
                />
              ))}
            </PageGroup>
          ))}
        </ChangesFoldSection>
      </section>
    </article>
  )
}
