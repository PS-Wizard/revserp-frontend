"use client"

import { useMemo } from "react"
import type { UseQueryResult } from "@tanstack/react-query"
import { Maximize2Icon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Skeleton } from "~/components/ui/skeleton"
import {
  IssueTask,
  WorkTask,
  isWorkItem,
  issueKey,
} from "~/components/summary/issue-workspace-ui"
import type {
  IssueWorkspaceBrowseTarget,
  IssueWorkspaceChangesResponse,
  IssueWorkspaceIssue,
  IssueWorkspaceWorkItem,
} from "~/components/summary/issue-workspace.types"
import { useIssueWorkspacePanelOptional } from "~/components/summary/issue-workspace-floating-panel"
import { useIssueWorkMutations } from "~/components/summary/use-issue-work-mutations"
import { useIssueWorkspaceChanges } from "~/components/summary/use-issue-workspace-changes"
import {
  WorkFixesEmptyState,
  type WorkFixesEmptyVariant,
} from "~/components/summary/work-fixes-empty-state"

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

function FixCard({
  children,
  count,
  emptyVariant,
  isError,
  isLoading,
  onMaximize,
  onRetry,
  title,
}: {
  children: React.ReactNode
  count: number
  emptyVariant: WorkFixesEmptyVariant
  isError?: boolean
  isLoading?: boolean
  onMaximize?: () => void
  onRetry?: () => void
  title: string
}) {
  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3 className="truncate font-heading text-base font-semibold tracking-tight">
          {title}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {onMaximize ? (
            <Button
              aria-label={`Expand ${title}`}
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onMaximize}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Maximize2Icon aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
            {isLoading ? "…" : count}
          </span>
        </div>
      </div>
      <hr className="mx-5 shrink-0 border-0 border-t border-border/60" />
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-full flex-col px-3 py-4">
          {isLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-4/5" />
            </div>
          ) : isError ? (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
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
          ) : count > 0 ? (
            <ul className="divide-y divide-border/50">{children}</ul>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <WorkFixesEmptyState size="sm" variant={emptyVariant} />
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}

export function OverviewWorkFixesCards({
  crawlId,
  currentUserId,
}: {
  crawlId: string | null
  currentUserId: string
}) {
  const enabled = Boolean(crawlId)
  const unloggedQuery = useIssueWorkspaceChanges(
    crawlId,
    "no_longer_detected",
    enabled
  )
  const fixedQuery = useIssueWorkspaceChanges(crawlId, "fixed", enabled)
  const awaitingQuery = useIssueWorkspaceChanges(
    crawlId,
    "awaiting_verification",
    enabled
  )

  const { undoContribution } = useIssueWorkMutations({
    crawlId,
    currentUserId,
    selectedUrl: null,
  })

  const unlogged = useChangesItems(unloggedQuery)
  const fixed = useChangesItems(fixedQuery)
  const awaiting = useChangesItems(awaitingQuery)

  const undoingAttemptId =
    undoContribution.isPending && undoContribution.variables
      ? undoContribution.variables
      : null

  const issueWorkspacePanel = useIssueWorkspacePanelOptional()
  const openSection = (target: IssueWorkspaceBrowseTarget) => {
    issueWorkspacePanel?.openPanel(target)
  }
  const openUrl = (url: string) => {
    issueWorkspacePanel?.openPanel({ kind: "url", url })
  }

  if (!crawlId) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-sm text-muted-foreground">
          Complete a crawl to see work fixes.
        </p>
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-5 px-4 max-lg:auto-rows-[32rem] lg:h-[36rem] lg:grid-cols-3 lg:grid-rows-1 lg:px-6">
      <FixCard
        count={unlogged.total}
        emptyVariant="unlogged"
        isError={unloggedQuery.isError}
        isLoading={unloggedQuery.isLoading}
        onMaximize={() => openSection({ kind: "unclaimed-fixes" })}
        onRetry={() => void unloggedQuery.refetch()}
        title="Unlogged Fixes"
      >
        {unlogged.issues.map((issue) => (
          <IssueTask
            currentUserId={currentUserId}
            issue={issue}
            key={issueKey(issue)}
            note="The crawl confirmed that this issue disappeared, but no work was recorded, so no contributor credit was assigned."
            onOpenUrl={() => openUrl(issue.url)}
            state="question"
          />
        ))}
      </FixCard>

      <FixCard
        count={fixed.total}
        emptyVariant="verified"
        isError={fixedQuery.isError}
        isLoading={fixedQuery.isLoading}
        onMaximize={() => openSection({ kind: "verified-fixes" })}
        onRetry={() => void fixedQuery.refetch()}
        title="Verified Fixes"
      >
        {fixed.issues.map((issue) => (
          <IssueTask
            currentUserId={currentUserId}
            issue={issue}
            key={issueKey(issue)}
            onOpenUrl={() => openUrl(issue.url)}
            state="done"
          />
        ))}
      </FixCard>

      <FixCard
        count={awaiting.total}
        emptyVariant="awaiting"
        isError={awaitingQuery.isError}
        isLoading={awaitingQuery.isLoading}
        onMaximize={() => openSection({ kind: "awaiting-verification" })}
        onRetry={() => void awaitingQuery.refetch()}
        title="Awaiting Fixes"
      >
        {awaiting.workItems.map((work) => (
          <WorkTask
            currentUserId={currentUserId}
            isMarkPending={undoingAttemptId === work.attempt_id}
            key={work.attempt_id}
            onOpenUrl={() => openUrl(work.url)}
            onUndo={() => undoContribution.mutate(work.attempt_id)}
            work={work}
          />
        ))}
      </FixCard>
    </div>
  )
}
