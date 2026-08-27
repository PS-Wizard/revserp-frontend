"use client"

import { useMemo } from "react"

import { Button } from "~/components/ui/button"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"

import { IssueTask, WorkTask, issueKey, isWorkItem } from "./issue-workspace-ui"
import type {
  IssueWorkspaceChangeStatus,
  IssueWorkspaceIssue,
  IssueWorkspaceWorkItem,
} from "./issue-workspace.types"
import type { useIssueWorkMutations } from "./use-issue-work-mutations"
import { useIssueWorkspaceChanges } from "./use-issue-workspace-changes"
import {
  WorkFixesEmptyState,
  type WorkFixesEmptyVariant,
} from "./work-fixes-empty-state"

function emptyVariantForStatus(
  status: IssueWorkspaceChangeStatus
): WorkFixesEmptyVariant | null {
  switch (status) {
    case "fixed":
      return "verified"
    case "no_longer_detected":
      return "unlogged"
    case "awaiting_verification":
      return "awaiting"
    default:
      return null
  }
}

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

function useChangesItems(
  items: Array<IssueWorkspaceIssue | IssueWorkspaceWorkItem> | undefined
) {
  return useMemo(() => {
    const list = items ?? []
    const issues = list.filter(
      (item): item is IssueWorkspaceIssue => !isWorkItem(item)
    )
    const workItems = list.filter((item): item is IssueWorkspaceWorkItem =>
      isWorkItem(item)
    )
    return { issues, workItems }
  }, [items])
}

export function IssueWorkspaceChangesSectionView({
  crawlId,
  currentUserId,
  description,
  isActive,
  mutations,
  onSelectUrl,
  status,
  title,
}: {
  crawlId: string
  currentUserId: string
  description: string
  isActive: boolean
  mutations: ReturnType<typeof useIssueWorkMutations>
  onSelectUrl: (url: string) => void
  status: IssueWorkspaceChangeStatus
  title: string
}) {
  const changesQuery = useIssueWorkspaceChanges(crawlId, status, isActive)
  const { issues, workItems } = useChangesItems(changesQuery.data?.items)
  const total = changesQuery.data?.pagination.total ?? 0

  const issuesByUrl = useMemo(() => groupByUrl(issues), [issues])
  const workByUrl = useMemo(() => groupByUrl(workItems), [workItems])

  const { undoContribution } = mutations
  const undoingAttemptId =
    undoContribution.isPending && undoContribution.variables
      ? undoContribution.variables
      : null

  const isWorkSection = status === "awaiting_verification"
  const emptyVariant = emptyVariantForStatus(status)

  return (
    <article className="mx-auto w-full max-w-4xl px-6 py-10 sm:px-10 sm:py-12">
      <header className="space-y-5">
        <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-[2rem]">
          {title}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {changesQuery.isLoading ? (
          <Skeleton className="h-6 w-16" />
        ) : (
          <p className="text-sm font-medium text-foreground tabular-nums">
            {total} {total === 1 ? "item" : "items"}
          </p>
        )}
      </header>

      <Separator className="my-10" />

      <section className="pb-16">
        {changesQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-4/5" />
          </div>
        ) : changesQuery.isError ? (
          <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-5">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Could not load this section.
            </p>
            <Button
              className="mt-3"
              onClick={() => void changesQuery.refetch()}
              size="xs"
              type="button"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        ) : total === 0 ? (
          emptyVariant ? (
            <WorkFixesEmptyState variant={emptyVariant} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to show in this section yet.
            </p>
          )
        ) : (
          <ul>
            {isWorkSection
              ? workByUrl.map(([url, items]) => (
                  <PageGroup key={url} onSelectUrl={onSelectUrl} url={url}>
                    {items.map((work) => (
                      <WorkTask
                        currentUserId={currentUserId}
                        isMarkPending={undoingAttemptId === work.attempt_id}
                        key={work.attempt_id}
                        onOpenUrl={() => onSelectUrl(url)}
                        onUndo={() => undoContribution.mutate(work.attempt_id)}
                        work={work}
                      />
                    ))}
                  </PageGroup>
                ))
              : issuesByUrl.map(([url, items]) => (
                  <PageGroup key={url} onSelectUrl={onSelectUrl} url={url}>
                    {items.map((issue) => (
                      <IssueTask
                        currentUserId={currentUserId}
                        issue={issue}
                        key={issueKey(issue)}
                        note={
                          status === "no_longer_detected"
                            ? "The crawl confirmed that this issue disappeared, but no work was recorded, so no contributor credit was assigned."
                            : undefined
                        }
                        onOpenUrl={() => onSelectUrl(url)}
                        state={status === "fixed" ? "done" : "question"}
                      />
                    ))}
                  </PageGroup>
                ))}
          </ul>
        )}
      </section>
    </article>
  )
}
