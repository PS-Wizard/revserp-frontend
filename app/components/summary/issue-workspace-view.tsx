"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  CircleHelpIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileSearchIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  SquareCheckIcon,
  XIcon,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { HoverPill, useHoverPill } from "~/components/ui/hover-pill"
import { Input } from "~/components/ui/input"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"

import { IssueWorkspaceChangesSectionView } from "./issue-workspace-changes-section-view"
import type {
  IssueWorkspaceBrowseTarget,
  IssueWorkspaceIssue,
  IssueWorkspacePageSearchResultPage,
  IssueWorkspaceWorkItem,
} from "./issue-workspace.types"
import {
  FoldSection,
  IssueTask,
  StatBadge,
  WorkTask,
  issueKey,
  pagePath,
  pageTitleFromUrl,
} from "./issue-workspace-ui"
import { useIssueWorkMutations } from "./use-issue-work-mutations"
import { getBrowseTargetLabel, useIssueWorkspace } from "./use-issue-workspace"

const PILLARS = [
  ["seo", "SEO"],
  ["aeo", "AEO"],
  ["pagespeed", "PageSpeed"],
] as const

const CHANGES_SECTION_NAV: Array<{
  target: Exclude<
    IssueWorkspaceBrowseTarget,
    { kind: "summary" } | { kind: "url" }
  >
  icon: typeof SquareCheckIcon
}> = [
  {
    target: { kind: "verified-fixes" },
    icon: SquareCheckIcon,
  },
  {
    target: { kind: "awaiting-verification" },
    icon: ClockIcon,
  },
  {
    target: { kind: "unclaimed-fixes" },
    icon: CircleHelpIcon,
  },
]

function BrowseNavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof SquareCheckIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2.5 text-left transition-colors",
        active
          ? "border-border/60 bg-background text-foreground shadow-xs"
          : "border-transparent text-foreground/80 hover:bg-background/50"
      )}
      onClick={onClick}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      />
      <span
        className={cn(
          "text-[13px] leading-5",
          active ? "font-semibold" : "font-medium"
        )}
      >
        {label}
      </span>
    </button>
  )
}

function sidebarPrimaryLine(page: IssueWorkspacePageSearchResultPage) {
  if (page.title?.trim()) return page.title.trim()
  try {
    const parsed = new URL(page.url)
    if (parsed.pathname === "/") return parsed.hostname
    return `${parsed.hostname}${parsed.pathname}`
  } catch {
    return page.url
  }
}

function sidebarSecondaryLine(page: IssueWorkspacePageSearchResultPage) {
  try {
    const parsed = new URL(page.url)
    if (page.title?.trim()) {
      const path = `${parsed.pathname}${parsed.search}`
      return path === "/" ? parsed.hostname : `${parsed.hostname}${path}`
    }
    return parsed.hostname
  } catch {
    return null
  }
}

function UrlList({
  pages,
  selectedUrl,
  onSelect,
}: {
  pages: IssueWorkspacePageSearchResultPage[]
  selectedUrl: string | null
  onSelect: (url: string) => void
}) {
  const hover = useHoverPill()

  return (
    <div
      className="relative flex flex-col divide-y divide-border/35"
      onMouseLeave={hover.clearPill}
    >
      <HoverPill pill={hover.pill} />
      {pages.map((page, index) => {
        const itemProps = hover.getItemProps(index)
        const selected = page.url === selectedUrl
        const primary = sidebarPrimaryLine(page)
        const secondary = sidebarSecondaryLine(page)
        return (
          <button
            {...itemProps}
            aria-current={selected ? "page" : undefined}
            className={cn(
              itemProps.className,
              "w-full min-w-0 rounded-md border border-transparent px-2.5 py-2.5 text-left transition-colors",
              selected
                ? "border-border/50 bg-background shadow-xs"
                : "text-foreground/80 hover:bg-background/50"
            )}
            key={page.url}
            onClick={() => onSelect(page.url)}
            title={page.url}
            type="button"
          >
            <span
              className={cn(
                "relative z-10 block truncate text-[13px] leading-5",
                selected
                  ? "font-semibold text-foreground"
                  : "font-medium text-foreground/90"
              )}
            >
              {primary}
            </span>
            {secondary ? (
              <span className="relative z-10 mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground/75">
                {secondary}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function DocumentSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10 sm:px-10">
      <Skeleton className="h-9 w-4/5" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Separator />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}

function taskStateForIssue(work?: IssueWorkspaceWorkItem) {
  if (work?.status === "not_verified") return "question" as const
  if (work?.status === "awaiting_verification" || work?.status === "open") {
    return "partial" as const
  }
  return "open" as const
}

export function IssueWorkspaceView({
  crawlId,
  currentUserId,
  onClose,
  requestedBrowseTarget,
}: {
  crawlId: string | null
  currentUserId: string
  onClose?: () => void
  requestedBrowseTarget?: IssueWorkspaceBrowseTarget | null
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const workspace = useIssueWorkspace(crawlId)
  const {
    browseTarget,
    flatPages,
    isChangesSectionSelected,
    pageDetailQuery,
    pagesQuery,
    searchInput,
    selectedUrl,
    setBrowseTarget,
    setSearchInput,
    selectUrl,
    summaryQuery,
  } = workspace
  const mutations = useIssueWorkMutations({
    crawlId,
    currentUserId,
    selectedUrl,
  })

  useEffect(() => {
    if (requestedBrowseTarget) {
      setBrowseTarget(requestedBrowseTarget)
    }
  }, [requestedBrowseTarget, setBrowseTarget])

  useEffect(() => {
    const sentinel = loadMoreRef.current
    const root = listRef.current
    if (!sentinel || !root || !pagesQuery.hasNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !pagesQuery.isFetchingNextPage) {
          void pagesQuery.fetchNextPage()
        }
      },
      { root, rootMargin: "160px 0px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [
    flatPages.length,
    pagesQuery.fetchNextPage,
    pagesQuery.hasNextPage,
    pagesQuery.isFetchingNextPage,
  ])

  const detail = pageDetailQuery.data
  const selectedPage = flatPages.find((page) => page.url === selectedUrl)
  const issueByKey = useMemo(
    () =>
      new Map(detail?.issues.map((issue) => [issueKey(issue), issue]) ?? []),
    [detail?.issues]
  )
  const workByKey = useMemo(() => {
    const result = new Map<string, IssueWorkspaceWorkItem>()
    for (const work of detail?.work_items ?? [])
      result.set(issueKey(work), work)
    return result
  }, [detail?.work_items])
  const awaitingWork = useMemo(
    () =>
      (detail?.work_items ?? []).filter(
        (work) =>
          work.status === "awaiting_verification" ||
          work.status === "not_verified"
      ),
    [detail?.work_items]
  )
  const awaitingKeys = useMemo(
    () => new Set(awaitingWork.map((work) => issueKey(work))),
    [awaitingWork]
  )
  const verifiedFixes =
    detail?.issues.filter((issue) => issue.change_type === "fixed") ?? []
  const noLongerDetected =
    detail?.issues.filter(
      (issue) =>
        issue.change_type === "no_longer_detected" &&
        !awaitingKeys.has(issueKey(issue))
    ) ?? []
  const remainingIssues = useMemo(() => {
    const result = new Map<string, IssueWorkspaceIssue>()
    for (const issue of detail?.current_issues ?? []) {
      if (!awaitingKeys.has(issueKey(issue))) result.set(issueKey(issue), issue)
    }
    for (const issue of detail?.issues ?? []) {
      if (
        (issue.change_type === "new" || issue.change_type === "still_open") &&
        !awaitingKeys.has(issueKey(issue))
      ) {
        result.set(issueKey(issue), issue)
      }
    }
    return [...result.values()]
  }, [awaitingKeys, detail?.current_issues, detail?.issues])

  const { markDone, undoContribution } = mutations
  const markingIssueId =
    markDone.isPending && markDone.variables ? markDone.variables : null
  const undoingAttemptId =
    undoContribution.isPending && undoContribution.variables
      ? undoContribution.variables
      : null

  const focusSearch = () => {
    setSidebarOpen(true)
    window.requestAnimationFrame(() => searchRef.current?.focus())
  }

  const headerTitle =
    browseTarget.kind === "url"
      ? pagePath(browseTarget.url)
      : getBrowseTargetLabel(browseTarget)

  const renderChangesSection = () => {
    if (!crawlId) return null

    const commonProps = {
      crawlId,
      currentUserId,
      isActive: true,
      mutations,
      onSelectUrl: selectUrl,
    }

    switch (browseTarget.kind) {
      case "verified-fixes":
        return (
          <IssueWorkspaceChangesSectionView
            {...commonProps}
            description="Contributor-verified fixes confirmed by this crawl."
            status="fixed"
            title="Verified Fixes"
          />
        )
      case "awaiting-verification":
        return (
          <IssueWorkspaceChangesSectionView
            {...commonProps}
            description="Recorded work waiting for the next crawl to confirm the fix."
            status="awaiting_verification"
            title="Awaiting Verification"
          />
        )
      case "unclaimed-fixes":
        return (
          <IssueWorkspaceChangesSectionView
            {...commonProps}
            description="Issues that disappeared without any recorded work, so no contributor credit was assigned."
            status="no_longer_detected"
            title="Unlogged Fixes"
          />
        )
      default:
        return null
    }
  }

  if (!crawlId) {
    return (
      <Empty className="min-h-[calc(100svh-13rem)] border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileSearchIcon />
          </EmptyMedia>
          <EmptyTitle>No completed crawl selected</EmptyTitle>
          <EmptyDescription>
            Select a completed crawl to review fixes and remaining issues.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const pageCounts = {
    fixed: verifiedFixes.length,
    new: remainingIssues.filter((issue) => issue.change_type === "new").length,
    noLongerDetected: noLongerDetected.length,
    remaining: remainingIssues.length,
    verification: awaitingWork.length,
  }

  const displayHeading = detail
    ? pageTitleFromUrl(detail.page.url, selectedPage?.title)
    : null

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b bg-background px-3">
        <div className="flex items-center justify-start">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={
                    sidebarOpen ? "Collapse URL list" : "Expand URL list"
                  }
                  onClick={() => setSidebarOpen((open) => !open)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                />
              }
            >
              {sidebarOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
            </TooltipTrigger>
            <TooltipContent>
              {sidebarOpen ? "Collapse URL list" : "Expand URL list"}
            </TooltipContent>
          </Tooltip>
        </div>
        <button
          className="flex max-w-full min-w-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-foreground/90 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:hover:bg-transparent"
          onClick={browseTarget.kind === "url" ? focusSearch : undefined}
          title={headerTitle}
          type="button"
        >
          <span className="truncate">{headerTitle}</span>
        </button>
        <div className="flex items-center justify-end">
          {onClose ? (
            <Button
              aria-label="Close issue workspace"
              className="text-muted-foreground hover:text-foreground"
              onClick={onClose}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          aria-hidden={!sidebarOpen}
          aria-label="URLs with issues"
          className={cn(
            "flex min-h-0 shrink-0 flex-col overflow-hidden border-r bg-muted/15 transition-[width] duration-200 ease-out motion-reduce:transition-none",
            sidebarOpen ? "w-64" : "w-0 border-r-0"
          )}
        >
          <div className="flex min-h-0 w-64 flex-1 flex-col px-2.5 py-3">
            <div className="flex shrink-0 items-center justify-between px-1.5 pb-2">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Browse
              </span>
              {summaryQuery.data ? (
                <span className="text-[11px] text-muted-foreground/80 tabular-nums">
                  {summaryQuery.data.pages.length} URLs
                </span>
              ) : summaryQuery.isLoading ? (
                <Skeleton className="h-3 w-16" />
              ) : null}
            </div>

            <div className="mb-3 flex flex-col gap-1">
              {CHANGES_SECTION_NAV.map(({ target, icon }) => {
                const active = browseTarget.kind === target.kind
                return (
                  <BrowseNavButton
                    active={active}
                    icon={icon}
                    key={target.kind}
                    label={getBrowseTargetLabel(target)}
                    onClick={() => setBrowseTarget(target)}
                  />
                )
              })}
            </div>

            <div className="shrink-0 px-0.5 pb-3">
              <div className="relative">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Search URLs"
                  className="h-8 border-border/60 bg-background/80 pl-8 text-xs shadow-none"
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search URLs…"
                  ref={searchRef}
                  tabIndex={sidebarOpen ? undefined : -1}
                  type="search"
                  value={searchInput}
                />
              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5 pt-3"
              ref={listRef}
            >
              {pagesQuery.isLoading ? (
                <div className="flex flex-col gap-2 px-1 py-1">
                  {Array.from({ length: 7 }, (_, index) => (
                    <Skeleton className="h-12 w-full" key={index} />
                  ))}
                </div>
              ) : pagesQuery.isError ? (
                <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    Could not load URLs.
                  </p>
                  <Button
                    onClick={() => void pagesQuery.refetch()}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    Retry
                  </Button>
                </div>
              ) : flatPages.length ? (
                <>
                  <UrlList
                    onSelect={selectUrl}
                    pages={flatPages}
                    selectedUrl={selectedUrl}
                  />
                  <div className="h-1" ref={loadMoreRef} />
                  {pagesQuery.isFetchingNextPage ? (
                    <div className="flex flex-col gap-2 px-1 py-2">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {searchInput.trim()
                    ? "No matching URLs"
                    : "No URLs with issues"}
                </p>
              )}
            </div>
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          {isChangesSectionSelected ? (
            renderChangesSection()
          ) : pageDetailQuery.isLoading ? (
            <DocumentSkeleton />
          ) : pageDetailQuery.isError ? (
            <Empty className="min-h-[28rem] border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSearchIcon />
                </EmptyMedia>
                <EmptyTitle>Could not load this URL</EmptyTitle>
                <EmptyDescription>
                  The issue details request failed. Retry when the API is
                  available.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                onClick={() => void pageDetailQuery.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Retry
              </Button>
            </Empty>
          ) : detail ? (
            <article className="mx-auto w-full max-w-4xl px-6 py-10 sm:px-10 sm:py-12">
              <header className="flex flex-col gap-3">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                  <h1 className="min-w-0 flex-1 font-heading text-[1.75rem] leading-tight font-semibold tracking-tight text-balance break-words text-foreground sm:text-[2rem]">
                    {displayHeading}
                  </h1>
                  <Button
                    nativeButton={false}
                    render={
                      <a
                        href={detail.page.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      />
                    }
                    size="sm"
                    variant="outline"
                  >
                    Open page
                    <ExternalLinkIcon data-icon="inline-end" />
                  </Button>
                </div>
                {selectedPage?.title?.trim() ? (
                  <p
                    className="text-sm break-all text-muted-foreground"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {pagePath(detail.page.url)}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  <StatBadge tone="green">
                    {pageCounts.fixed} verified
                  </StatBadge>
                  <StatBadge tone="violet">
                    {pageCounts.noLongerDetected} no longer detected
                  </StatBadge>
                  <StatBadge tone="neutral">
                    {pageCounts.remaining} remaining
                  </StatBadge>
                  {pageCounts.new ? (
                    <StatBadge tone="blue">{pageCounts.new} new</StatBadge>
                  ) : null}
                  {pageCounts.verification ? (
                    <StatBadge tone="amber">
                      {pageCounts.verification} need verification
                    </StatBadge>
                  ) : null}
                </div>
              </header>

              <Separator className="my-10" />

              <section className="flex flex-col gap-6">
                <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
                  Fixes since last crawl
                </h2>
                <FoldSection
                  count={verifiedFixes.length}
                  emptyLabel="No contributor-verified fixes in this crawl."
                  title="Verified fixes"
                >
                  {verifiedFixes.map((issue) => (
                    <IssueTask
                      contributors={
                        workByKey.get(issueKey(issue))?.contributors
                      }
                      currentUserId={currentUserId}
                      issue={issue}
                      key={issueKey(issue)}
                      state="done"
                    />
                  ))}
                </FoldSection>
                <FoldSection
                  count={noLongerDetected.length}
                  emptyLabel="No unlogged fixes on this URL."
                  title="Unlogged fixes"
                >
                  {noLongerDetected.map((issue) => (
                    <IssueTask
                      currentUserId={currentUserId}
                      issue={issue}
                      key={issueKey(issue)}
                      note="The crawl confirmed that this issue disappeared, but no work was recorded, so no contributor credit was assigned."
                      state="question"
                    />
                  ))}
                </FoldSection>
                <FoldSection
                  count={awaitingWork.length}
                  emptyLabel="No recorded work is waiting for crawl verification."
                  title="Awaiting verification"
                >
                  {awaitingWork.map((work) => (
                    <WorkTask
                      currentUserId={currentUserId}
                      isMarkPending={undoingAttemptId === work.attempt_id}
                      issue={issueByKey.get(issueKey(work))}
                      key={work.attempt_id}
                      onUndo={() => undoContribution.mutate(work.attempt_id)}
                      work={work}
                    />
                  ))}
                </FoldSection>
              </section>

              <Separator className="my-10" />

              <section className="flex flex-col gap-6 pb-16">
                <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
                  Remaining issues
                </h2>
                {PILLARS.map(([pillar, label]) => {
                  const issues = remainingIssues.filter(
                    (issue) => issue.pillar === pillar
                  )
                  return (
                    <FoldSection
                      count={issues.length}
                      emptyLabel={`No remaining ${label} issues on this URL.`}
                      key={pillar}
                      level={3}
                      title={label}
                    >
                      {issues.map((issue) => {
                        const work = workByKey.get(issueKey(issue))
                        const state = taskStateForIssue(work)
                        return (
                          <IssueTask
                            attemptId={work?.attempt_id}
                            contributors={work?.contributors}
                            currentUserId={currentUserId}
                            isMarkPending={
                              (state === "open" &&
                                markingIssueId === issue.current_issue_id) ||
                              (state === "partial" &&
                                undoingAttemptId === work?.attempt_id)
                            }
                            issue={issue}
                            key={issueKey(issue)}
                            onMarkDone={
                              issue.current_issue_id
                                ? () =>
                                    markDone.mutate(
                                      issue.current_issue_id as string
                                    )
                                : undefined
                            }
                            onUndo={
                              work?.attempt_id
                                ? () => undoContribution.mutate(work.attempt_id)
                                : undefined
                            }
                            state={state}
                          />
                        )
                      })}
                    </FoldSection>
                  )
                })}
              </section>
            </article>
          ) : (
            <Empty className="min-h-[28rem] border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSearchIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {searchInput.trim()
                    ? "No matching URL"
                    : "No issue notes yet"}
                </EmptyTitle>
                <EmptyDescription>
                  Search for a URL or select one from the sidebar.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </main>
      </div>
    </section>
  )
}
