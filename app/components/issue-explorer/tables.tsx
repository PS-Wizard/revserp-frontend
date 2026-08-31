import { ThinkingOrb } from "thinking-orbs"
import { useSearchParams } from "react-router"
import { Linkify } from "~/components/linkify"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card"
import { TableHoverPill, useTablePill } from "~/components/ui/hover-pill"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"

import type { ScoreBreakdownIssueTypeResponse } from "~/lib/api.types"

import type { BucketScope, MergedIssueUrlRow, PillarScope } from "./types"
import { formatScore } from "~/components/trend-sparkline"

import type { RowSelectionProps } from "./use-drag-selection"
import { urlRowKey } from "./utils"
import { CheckIcon, Loader2Icon, LockIcon } from "lucide-react"

type HeaderCheckboxProps = {
  checkedCount: number
  totalCount: number
  onToggleAll: (checked: boolean) => void
}

function SelectAllHead({
  checkedCount,
  totalCount,
  onToggleAll,
}: HeaderCheckboxProps) {
  const allChecked = totalCount > 0 && checkedCount === totalCount
  const checkedState = allChecked
    ? true
    : checkedCount > 0
      ? "indeterminate"
      : false
  return (
    <TableHead className="w-10">
      <Checkbox
        aria-label="Select all rows"
        checked={checkedState}
        disabled={totalCount === 0}
        onCheckedChange={(next) => onToggleAll(next)}
      />
    </TableHead>
  )
}

type PillarTableProps = {
  rows: PillarScope[]
  totalRows: number
  checkedKeys: string[]
  onToggleRow: (key: string) => void
  onToggleAll: (checked: boolean) => void
  onDrill: (key: string) => void
  getRowProps: (key: string) => RowSelectionProps
}

export function PillarTable({
  rows,
  totalRows,
  checkedKeys,
  onToggleRow,
  onToggleAll,
  onDrill,
  getRowProps,
}: PillarTableProps) {
  const { clearPill, containerRef, pill, rowRefs, showPill } = useTablePill()
  if (!totalRows) {
    return <EmptyMessage message="No pillars found for the selected scope." />
  }

  const checkedSet = new Set(checkedKeys)
  const actionableRows = rows.filter((r) => r.pillar.issue_row_count !== 0)

  return (
    <div
      className="relative overflow-hidden rounded-lg border select-none"
      onMouseLeave={clearPill}
      ref={containerRef}
    >
      <TableHoverPill pill={pill} />
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <SelectAllHead
              checkedCount={
                actionableRows.filter((r) => checkedSet.has(r.key)).length
              }
              totalCount={actionableRows.length}
              onToggleAll={onToggleAll}
            />
            <TableHead>Pillar</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Buckets</TableHead>
            <TableHead className="text-right">Issue Types</TableHead>
            <TableHead className="text-right">Issues</TableHead>
            <TableHead className="text-right">Affected URLs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const isDisabled = row.pillar.issue_row_count === 0
            return (
              <TableRow
                aria-disabled={isDisabled}
                className={
                  isDisabled
                    ? "cursor-default opacity-50 hover:bg-transparent"
                    : "cursor-pointer hover:bg-transparent"
                }
                key={row.key}
                onDoubleClick={isDisabled ? undefined : () => onDrill(row.key)}
                onMouseEnter={isDisabled ? clearPill : () => showPill(index)}
                ref={(element) => {
                  rowRefs.current[index] = element
                }}
                title={
                  isDisabled
                    ? "No issues in this crawl"
                    : "Double-click to view buckets · drag to select"
                }
                {...(isDisabled ? {} : getRowProps(row.key))}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${row.pillarLabel}`}
                    checked={checkedSet.has(row.key)}
                    disabled={isDisabled}
                    onCheckedChange={() => onToggleRow(row.key)}
                  />
                </TableCell>
                <TableCell className="font-medium whitespace-normal text-foreground">
                  {row.pillarLabel}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatScore(row.pillar.score)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.pillar.bucket_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.pillar.issue_type_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.pillar.issue_row_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.pillar.affected_url_count}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

type BucketTableProps = {
  rows: BucketScope[]
  totalRows: number
  checkedKeys: string[]
  onToggleRow: (key: string) => void
  onToggleAll: (checked: boolean) => void
  onDrill: (key: string) => void
  getRowProps: (key: string) => RowSelectionProps
}

export function BucketTable({
  rows,
  totalRows,
  checkedKeys,
  onToggleRow,
  onToggleAll,
  onDrill,
  getRowProps,
}: BucketTableProps) {
  const { clearPill, containerRef, pill, rowRefs, showPill } = useTablePill()
  if (!totalRows) {
    return <EmptyMessage message="No buckets found for the selected scope." />
  }

  const checkedSet = new Set(checkedKeys)
  const actionableRows = rows.filter((r) => r.bucket.issue_row_count !== 0)

  return (
    <div
      className="relative overflow-hidden rounded-lg border select-none"
      onMouseLeave={clearPill}
      ref={containerRef}
    >
      <TableHoverPill pill={pill} />
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <SelectAllHead
              checkedCount={
                actionableRows.filter((r) => checkedSet.has(r.key)).length
              }
              totalCount={actionableRows.length}
              onToggleAll={onToggleAll}
            />
            <TableHead>Bucket</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Issue Types</TableHead>
            <TableHead className="text-right">Issues</TableHead>
            <TableHead className="text-right">Affected URLs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const isDisabled = row.bucket.issue_row_count === 0
            return (
              <TableRow
                aria-disabled={isDisabled}
                className={
                  isDisabled
                    ? "cursor-default opacity-50 hover:bg-transparent"
                    : "cursor-pointer hover:bg-transparent"
                }
                key={row.key}
                onDoubleClick={isDisabled ? undefined : () => onDrill(row.key)}
                onMouseEnter={isDisabled ? clearPill : () => showPill(index)}
                ref={(element) => {
                  rowRefs.current[index] = element
                }}
                title={
                  isDisabled
                    ? "No issues in this crawl"
                    : "Double-click to view affected URLs · drag to select"
                }
                {...(isDisabled ? {} : getRowProps(row.key))}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${row.bucketLabel}`}
                    checked={checkedSet.has(row.key)}
                    disabled={isDisabled}
                    onCheckedChange={() => onToggleRow(row.key)}
                  />
                </TableCell>
                <TableCell className="font-medium whitespace-normal text-foreground">
                  {row.bucketLabel}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatScore(row.bucket.score)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.bucket.issue_type_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.bucket.issue_row_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.bucket.affected_url_count}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

type IssueTypeTableProps = {
  rows: ScoreBreakdownIssueTypeResponse[]
  totalRows: number
  checkedKeys: string[]
  onToggleRow: (key: string) => void
  onToggleAll: (checked: boolean) => void
  onDrill: (key: string) => void
  getRowProps: (key: string) => RowSelectionProps
}

export function IssueTypeTable({
  rows,
  totalRows,
  checkedKeys,
  onToggleRow,
  onToggleAll,
  onDrill,
  getRowProps,
}: IssueTypeTableProps) {
  const { clearPill, containerRef, pill, rowRefs, showPill } = useTablePill()
  if (!totalRows) {
    return (
      <EmptyMessage message="No issue types found for the selected bucket." />
    )
  }

  const checkedSet = new Set(checkedKeys)
  const actionableRows = rows.filter((r) => r.issue_row_count !== 0)

  return (
    <div
      className="relative overflow-hidden rounded-lg border select-none"
      onMouseLeave={clearPill}
      ref={containerRef}
    >
      <TableHoverPill pill={pill} />
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <SelectAllHead
              checkedCount={
                actionableRows.filter((r) => checkedSet.has(r.id)).length
              }
              totalCount={actionableRows.length}
              onToggleAll={onToggleAll}
            />
            <TableHead>Issue Type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead className="text-right">Affected URLs</TableHead>
            <TableHead className="text-right">Issues</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const isDisabled = row.issue_row_count === 0
            return (
              <TableRow
                aria-disabled={isDisabled}
                className={
                  isDisabled
                    ? "cursor-default opacity-50 hover:bg-transparent"
                    : "cursor-pointer hover:bg-transparent"
                }
                key={row.id}
                onDoubleClick={isDisabled ? undefined : () => onDrill(row.id)}
                onMouseEnter={isDisabled ? clearPill : () => showPill(index)}
                ref={(element) => {
                  rowRefs.current[index] = element
                }}
                title={
                  isDisabled
                    ? "No issues in this crawl"
                    : "Double-click to view affected URLs · drag to select"
                }
                {...(isDisabled ? {} : getRowProps(row.id))}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${row.label}`}
                    checked={checkedSet.has(row.id)}
                    disabled={isDisabled}
                    onCheckedChange={() => onToggleRow(row.id)}
                  />
                </TableCell>
                <TableCell
                  className="max-w-[20rem] truncate font-medium text-foreground"
                  title={row.label}
                >
                  {row.label}
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={row.severity} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.affected_url_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.issue_row_count}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

type UrlIssueTableProps = {
  crawlId: string
  error: string
  isLoading: boolean
  rows: MergedIssueUrlRow[]
  totalRows: number
  checkedKeys: string[]
  onToggleRow: (key: string) => void
  onToggleAll: (checked: boolean) => void
  getRowProps: (key: string) => RowSelectionProps
  workActionsEnabled: boolean
  onMarkDone: (issueId: string) => void
  onUndo: (attemptId: string) => void
  isPending: (key: string) => boolean
}

export function UrlIssueTable({
  crawlId,
  error,
  isLoading,
  rows,
  totalRows,
  checkedKeys,
  onToggleRow,
  onToggleAll,
  getRowProps,
  workActionsEnabled,
  onMarkDone,
  onUndo,
  isPending,
}: UrlIssueTableProps) {
  const { clearPill, containerRef, pill, rowRefs, showPill } = useTablePill()
  const [, setSearchParams] = useSearchParams()
  const openInEditor = (url: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set("editorUrl", url)
      next.set("crawl", crawlId)
      return next
    })
  }
  if (isLoading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
        <ThinkingOrb
          aria-hidden="true"
          className="shrink-0"
          size={64}
          state="searching"
          style={{ width: 40, height: 40 }}
        />
        <div className="flex flex-col gap-1">
          <p className="font-medium">Loading affected URLs</p>
          <p className="text-sm text-muted-foreground">
            Fetching rows for this bucket.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return <EmptyMessage message={error} />
  }

  if (!totalRows) {
    return (
      <EmptyMessage message="No affected URLs were returned for this bucket." />
    )
  }

  const checkedSet = new Set(checkedKeys)

  return (
    <div
      className="relative overflow-hidden rounded-lg border select-none"
      onMouseLeave={clearPill}
      ref={containerRef}
    >
      <TableHoverPill pill={pill} />
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <SelectAllHead
              checkedCount={
                rows.filter((r) => checkedSet.has(urlRowKey(r))).length
              }
              totalCount={rows.length}
              onToggleAll={onToggleAll}
            />
            <TableHead>URL</TableHead>
            <TableHead>Issue Type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className="text-right">Work</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const key = urlRowKey(row)
            return (
              <TableRow
                className="cursor-pointer hover:bg-transparent"
                key={key}
                onMouseEnter={() => showPill(index)}
                ref={(element) => {
                  rowRefs.current[index] = element
                }}
                {...getRowProps(key)}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${row.url}`}
                    checked={checkedSet.has(key)}
                    onCheckedChange={() => onToggleRow(key)}
                  />
                </TableCell>
                <TableCell className="max-w-[18rem] font-medium text-foreground">
                  <HoverCard>
                    <HoverCardTrigger
                      closeDelay={80}
                      delay={50}
                      render={
                        <a
                          className="block max-w-[18rem] truncate text-primary hover:underline"
                          href={row.url}
                          title={row.url}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            openInEditor(row.url)
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                        />
                      }
                    >
                      {row.url}
                    </HoverCardTrigger>
                    <HoverCardContent align="start" className="w-44 p-1">
                      <div className="flex flex-col gap-1">
                        <Button
                          className="justify-start"
                          nativeButton={false}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          render={
                            <a
                              href={row.url}
                              rel="noopener noreferrer"
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                            />
                          }
                          size="sm"
                          variant="ghost"
                        >
                          Open in new tab
                        </Button>
                        <Button
                          className="justify-start"
                          onClick={(e) => {
                            e.stopPropagation()
                            openInEditor(row.url)
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          size="sm"
                          variant="ghost"
                        >
                          Open in editor
                        </Button>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </TableCell>
                <TableCell
                  className="max-w-[14rem] truncate text-muted-foreground"
                  title={row.issueTypeLabel}
                >
                  {row.issueTypeLabel}
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={row.severity} />
                </TableCell>
                <TableCell className="max-w-[18rem]">
                  <span className="block truncate" title={row.message}>
                    {row.message}
                  </span>
                </TableCell>
                <TableCell className="max-w-[24rem] text-muted-foreground">
                  {row.details ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="block max-w-[24rem] truncate" />
                        }
                      >
                        <span className="block truncate">
                          <Linkify text={row.details} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="block max-h-64 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto p-3 text-left leading-relaxed whitespace-normal">
                        <div className="break-words">
                          <Linkify text={row.details} tone="inherit" />
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <UrlWorkCell
                    row={row}
                    workActionsEnabled={workActionsEnabled}
                    isPending={isPending}
                    onMarkDone={onMarkDone}
                    onUndo={onUndo}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function UrlWorkCell({
  row,
  workActionsEnabled,
  isPending,
  onMarkDone,
  onUndo,
}: {
  row: MergedIssueUrlRow
  workActionsEnabled: boolean
  isPending: (key: string) => boolean
  onMarkDone: (issueId: string) => void
  onUndo: (attemptId: string) => void
}) {
  const work = row.work
  const stop = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  }

  const disabledTooltip = "Select the latest completed crawl to update work."

  if (!work) {
    const pending = isPending(`mark:${row.issue_id}`)
    const button = (
      <Button
        aria-label="Mark work done"
        disabled={!workActionsEnabled || pending || !row.issue_id}
        onClick={(e) => {
          stop.onClick(e)
          if (row.issue_id) onMarkDone(row.issue_id)
        }}
        onPointerDown={stop.onPointerDown}
        size="xs"
        variant="secondary"
      >
        {pending ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <CheckIcon data-icon="inline-start" />
        )}
        Mark done
      </Button>
    )
    if (!workActionsEnabled) {
      return (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" {...stop} />}>
            {button}
          </TooltipTrigger>
          <TooltipContent>{disabledTooltip}</TooltipContent>
        </Tooltip>
      )
    }
    return button
  }

  const status = work.status
  const locked = work.locked
  const mine = work.contributed_by_me
  const attemptId = work.attempt_id
  const canUndo = mine && !locked

  if (status === "awaiting_verification") {
    const pendingUndo = isPending(`undo:${attemptId}`)
    const pendingMark = isPending(`mark:${row.issue_id}`)
    const isBusy = pendingUndo || pendingMark
    const undoControl = canUndo ? (
      workActionsEnabled ? (
        <Button
          aria-label="Undo mark done"
          disabled={isBusy}
          onClick={(e) => {
            stop.onClick(e)
            onUndo(attemptId)
          }}
          onPointerDown={stop.onPointerDown}
          size="xs"
          variant="outline"
        >
          {pendingUndo ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : null}
          Undo
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Button
              aria-label="Undo mark done"
              disabled
              size="xs"
              variant="outline"
            >
              Undo
            </Button>
          </TooltipTrigger>
          <TooltipContent>{disabledTooltip}</TooltipContent>
        </Tooltip>
      )
    ) : null
    return (
      <div className="flex items-center justify-end gap-1.5" {...stop}>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Badge className="gap-1 border-sky-500/40 bg-sky-500/15 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-200">
              {isBusy ? (
                <Loader2Icon className="size-3 animate-spin" aria-hidden />
              ) : (
                <span
                  aria-hidden
                  className="font-mono text-[11px] leading-none"
                >
                  /
                </span>
              )}
              <span className="truncate">Awaiting verification</span>
              {locked ? (
                <LockIcon className="size-3 opacity-80" aria-hidden />
              ) : null}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {locked
              ? "Verification is in progress — undo is unavailable until the crawl completes."
              : "Awaiting verification on next crawl."}
          </TooltipContent>
        </Tooltip>
        {undoControl}
      </div>
    )
  }

  if (status === "not_verified") {
    const pendingUndo = isPending(`undo:${attemptId}`)
    const undoControl = canUndo ? (
      workActionsEnabled ? (
        <Button
          aria-label="Undo mark done"
          disabled={pendingUndo}
          onClick={(e) => {
            stop.onClick(e)
            onUndo(attemptId)
          }}
          onPointerDown={stop.onPointerDown}
          size="xs"
          variant="outline"
        >
          {pendingUndo ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : null}
          Undo
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Button
              aria-label="Undo mark done"
              disabled
              size="xs"
              variant="outline"
            >
              Undo
            </Button>
          </TooltipTrigger>
          <TooltipContent>{disabledTooltip}</TooltipContent>
        </Tooltip>
      )
    ) : null
    return (
      <div className="flex items-center justify-end gap-1.5" {...stop}>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Badge className="gap-1 border-amber-400 bg-amber-400 text-amber-950 dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950">
              <span aria-hidden className="font-mono text-[11px] leading-none">
                ?
              </span>
              <span className="truncate">Could not confirm</span>
              {locked ? (
                <LockIcon className="size-3 opacity-80" aria-hidden />
              ) : null}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {locked
              ? "Verification is in progress — will retry on a later crawl."
              : "Will retry on a later crawl."}
          </TooltipContent>
        </Tooltip>
        {undoControl}
      </div>
    )
  }

  if (status === "still_open") {
    const pending = isPending(`mark:${row.issue_id}`)
    const button = (
      <Button
        aria-label="Mark work done again"
        disabled={!workActionsEnabled || pending}
        onClick={(e) => {
          stop.onClick(e)
          if (row.issue_id) onMarkDone(row.issue_id)
        }}
        onPointerDown={stop.onPointerDown}
        size="xs"
        variant="outline"
      >
        {pending ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <CheckIcon data-icon="inline-start" />
        )}
        Mark done again
      </Button>
    )
    return (
      <div className="flex items-center justify-end gap-1.5" {...stop}>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Badge
              variant="destructive"
              className="gap-1 border-destructive/20"
            >
              <span className="truncate">Still detected</span>
              {locked ? (
                <LockIcon className="size-3 opacity-80" aria-hidden />
              ) : null}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {locked
              ? "Verification is in progress — still detected after the last crawl."
              : "Still detected after the last crawl."}
          </TooltipContent>
        </Tooltip>
        {!workActionsEnabled ? (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              {button}
            </TooltipTrigger>
            <TooltipContent>{disabledTooltip}</TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
      </div>
    )
  }

  return (
    <Badge variant="outline" className="gap-1" {...stop}>
      {locked ? <LockIcon className="size-3 opacity-60" aria-hidden /> : null}
      <span className="truncate">{status}</span>
    </Badge>
  )
}

function EmptyMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/30 px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  return <Badge variant="outline">{severity || "Unknown"}</Badge>
}
