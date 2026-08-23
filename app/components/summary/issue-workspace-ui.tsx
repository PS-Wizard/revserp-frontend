"use client"

import { CheckIcon, ChevronDownIcon, Loader2Icon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

import type { IssueWorkspaceIssue, IssueWorkspaceWorkItem } from "./issue-workspace.types"

export type TaskState = "done" | "question" | "partial" | "open"

export function issueKey(
  item: Pick<IssueWorkspaceIssue, "url" | "pillar" | "bucket" | "issue_type">
) {
  return [item.url, item.pillar, item.bucket, item.issue_type].join("\n")
}

export function taskLabel(state: TaskState, interactive?: boolean) {
  switch (state) {
    case "done":
      return "Verified fixed"
    case "question":
      return "Not confirmed"
    case "partial":
      return interactive
        ? "Awaiting verification — click to undo your contribution"
        : "Awaiting verification"
    case "open":
      return interactive
        ? "Open issue — click to mark as done"
        : "Open issue"
  }
}

export function TaskMark({
  disabled,
  interactive,
  isPending,
  onClick,
  state,
}: {
  disabled?: boolean
  interactive?: boolean
  isPending?: boolean
  onClick?: () => void
  state: TaskState
}) {
  const isButton = Boolean(onClick) && !disabled
  const className = cn(
    "mt-0.5 inline-flex size-[17px] shrink-0 items-center justify-center rounded-[3px] border font-mono text-[10px] leading-none font-bold",
    state === "open" &&
      "border-muted-foreground/45 bg-transparent text-transparent",
    state === "done" &&
      "border-sky-500/70 bg-sky-500 text-white shadow-[inset_0_0_0_1px_rgb(14_165_233/0.35)]",
    state === "question" &&
      "border-amber-400 bg-amber-400 text-amber-950",
    state === "partial" &&
      "border-sky-500/70 bg-sky-500/25 text-sky-300",
    isButton &&
      "cursor-pointer transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
  )

  const content =
    isPending ? (
      <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
    ) : state === "done" ? (
      <CheckIcon aria-hidden="true" className="size-3" strokeWidth={3} />
    ) : state === "question" ? (
      <span aria-hidden="true">?</span>
    ) : state === "partial" ? (
      <span aria-hidden="true">/</span>
    ) : null

  if (isButton) {
    return (
      <button
        aria-label={taskLabel(state, interactive)}
        className={className}
        disabled={disabled || isPending}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    )
  }

  return (
    <span aria-label={taskLabel(state)} className={className} role="img">
      {content}
    </span>
  )
}

function severityClassName(severity: string) {
  switch (severity) {
    case "critical":
      return "border-red-500/35 bg-red-500/12 text-red-300"
    case "high":
      return "border-orange-500/35 bg-orange-500/12 text-orange-300"
    case "medium":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200"
    case "low":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300"
    default:
      return "border-border bg-muted/50 text-muted-foreground"
  }
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[11px] font-medium tracking-wide capitalize",
        severityClassName(severity)
      )}
    >
      {severity}
    </span>
  )
}

export function StatBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: "green" | "violet" | "neutral" | "blue" | "amber"
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2.5 text-xs font-medium tabular-nums",
        tone === "green" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        tone === "violet" &&
          "border-violet-500/30 bg-violet-500/10 text-violet-300",
        tone === "blue" && "border-sky-500/30 bg-sky-500/10 text-sky-300",
        tone === "amber" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-200",
        tone === "neutral" &&
          "border-border/80 bg-muted/30 text-muted-foreground"
      )}
    >
      {children}
    </span>
  )
}

function ContributorBadges({
  contributors,
  currentUserId,
}: {
  contributors: string[]
  currentUserId: string
}) {
  const unique = [...new Set(contributors)]
  if (!unique.length) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-xs text-muted-foreground">Contributors</span>
      {unique.map((contributor) => (
        <Badge key={contributor} variant="secondary">
          {contributor === currentUserId
            ? "You"
            : `Contributor · ${contributor.slice(0, 6)}`}
        </Badge>
      ))}
    </div>
  )
}

export function IssueTask({
  attemptId,
  contributors = [],
  currentUserId,
  isMarkPending,
  issue,
  note,
  onMarkDone,
  onUndo,
  state,
}: {
  attemptId?: string
  contributors?: string[]
  currentUserId: string
  isMarkPending?: boolean
  issue: IssueWorkspaceIssue
  note?: string
  onMarkDone?: () => void
  onUndo?: () => void
  state: TaskState
}) {
  const isMuted = state === "done"
  const canMarkDone =
    state === "open" && Boolean(onMarkDone) && Boolean(issue.current_issue_id)
  const canUndo =
    state === "partial" &&
    Boolean(onUndo) &&
    Boolean(attemptId) &&
    contributors.includes(currentUserId)

  return (
    <li className="flex items-start gap-3.5 py-4 first:pt-2">
      <TaskMark
        disabled={!canMarkDone && !canUndo}
        interactive={canMarkDone || canUndo}
        isPending={isMarkPending}
        onClick={
          canMarkDone
            ? onMarkDone
            : canUndo
              ? onUndo
              : undefined
        }
        state={state}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p
            className={cn(
              "text-[15px] leading-6 font-medium text-foreground",
              isMuted &&
                "text-muted-foreground line-through decoration-muted-foreground/40"
            )}
          >
            {issue.message}
          </p>
          <SeverityBadge severity={issue.severity} />
          {issue.change_type === "new" ? (
            <StatBadge tone="blue">New</StatBadge>
          ) : null}
        </div>
        {issue.details ? (
          <p
            className={cn(
              "text-sm leading-relaxed text-muted-foreground",
              isMuted && "opacity-70"
            )}
          >
            {issue.details}
          </p>
        ) : null}
        {note ? (
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            {note}
          </p>
        ) : null}
        <ContributorBadges
          contributors={contributors}
          currentUserId={currentUserId}
        />
      </div>
    </li>
  )
}

export function humanizeIssueType(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function WorkTask({
  attemptId,
  currentUserId,
  isMarkPending,
  issue,
  onUndo,
  work,
}: {
  attemptId?: string
  currentUserId: string
  isMarkPending?: boolean
  issue?: IssueWorkspaceIssue
  onUndo?: () => void
  work: IssueWorkspaceWorkItem
}) {
  const fallback: IssueWorkspaceIssue = {
    url: work.url,
    pillar: work.pillar,
    bucket: work.bucket,
    issue_type: work.issue_type,
    severity: "pending",
    message: humanizeIssueType(work.issue_type),
    change_type: "not_verified",
  }

  return (
    <IssueTask
      attemptId={attemptId ?? work.attempt_id}
      contributors={work.contributors}
      currentUserId={currentUserId}
      isMarkPending={isMarkPending}
      issue={issue ?? fallback}
      note={
        work.status === "not_verified"
          ? "The last crawl did not provide enough evidence. This will be checked again."
          : "Work is recorded and will be checked by the next crawl."
      }
      onUndo={onUndo}
      state={work.status === "not_verified" ? "question" : "partial"}
    />
  )
}

export function FoldSection({
  children,
  count,
  emptyLabel,
  isLoading,
  level = 2,
  title,
}: {
  children: React.ReactNode
  count: number
  emptyLabel: string
  isLoading?: boolean
  level?: 2 | 3
  title: string
}) {
  const headingClass =
    level === 2
      ? "font-heading text-lg font-semibold tracking-tight text-foreground"
      : "font-heading text-[15px] font-semibold tracking-tight text-foreground/95"

  return (
    <details className="group/fold" open>
      <summary className="flex list-none cursor-pointer items-center gap-2.5 rounded-md py-2.5 outline-none marker:content-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open/fold:rotate-0 group-not-open/fold:-rotate-90 motion-reduce:transition-none"
        />
        {level === 2 ? (
          <h2 className={headingClass}>{title}</h2>
        ) : (
          <h3 className={headingClass}>{title}</h3>
        )}
        <span className="ml-auto rounded-md bg-muted/40 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {isLoading ? "…" : count}
        </span>
      </summary>
      <div className="pl-6 pt-1">
        {isLoading ? (
          <p className="py-5 text-sm text-muted-foreground">Loading…</p>
        ) : count ? (
          <ul className="divide-y divide-border/50">{children}</ul>
        ) : (
          <p className="py-5 text-sm text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </details>
  )
}

export function pagePath(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

export function pageTitleFromUrl(url: string, title?: string | null) {
  if (title?.trim()) return title.trim()
  try {
    const parsed = new URL(url)
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname
  } catch {
    return url
  }
}

export function isWorkItem(
  item: IssueWorkspaceIssue | IssueWorkspaceWorkItem
): item is IssueWorkspaceWorkItem {
  return "attempt_id" in item && "work_item_id" in item
}
