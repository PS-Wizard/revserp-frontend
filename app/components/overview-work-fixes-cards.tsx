"use client"

import { useMemo } from "react"
import type { UseQueryResult } from "@tanstack/react-query"
import { FixCard } from "~/components/summary/fix-summary-card"
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

const OVERVIEW_PREVIEW_LIMIT = 15

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
    enabled,
    OVERVIEW_PREVIEW_LIMIT
  )
  const fixedQuery = useIssueWorkspaceChanges(
    crawlId,
    "fixed",
    enabled,
    OVERVIEW_PREVIEW_LIMIT
  )
  const awaitingQuery = useIssueWorkspaceChanges(
    crawlId,
    "awaiting_verification",
    enabled,
    OVERVIEW_PREVIEW_LIMIT
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
      <div>
        <p className="text-sm text-muted-foreground">
          Complete a crawl to see work fixes.
        </p>
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-5 max-lg:auto-rows-[32rem] lg:h-[36rem] lg:grid-cols-3 lg:grid-rows-1">
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
