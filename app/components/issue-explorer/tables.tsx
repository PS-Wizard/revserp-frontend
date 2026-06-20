import { Loader2Icon, SparklesIcon } from "lucide-react"

import { CompileLoader } from "~/components/compile-loader"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"

import type { AIFixTarget, IssueScope, MergedIssueUrlRow } from "./types"
import { formatPenalty } from "./utils"

type IssueTypeTableProps = {
  hasMultipleSources: boolean
  isFixActionPending: (targetKey: string) => boolean
  onFixAction: (target: AIFixTarget) => void
  onSelectIssueType: (value: string) => void
  rows: IssueScope[]
  totalRows: number
}

export function IssueTypeTable({
  hasMultipleSources,
  isFixActionPending,
  onFixAction,
  onSelectIssueType,
  rows,
  totalRows,
}: IssueTypeTableProps) {
  if (!totalRows) {
    return (
      <EmptyMessage message="No issue types found for the selected scope." />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            {hasMultipleSources ? <TableHead>Source</TableHead> : null}
            <TableHead>Issue Type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead className="text-right">Affected URLs</TableHead>
            <TableHead className="text-right">Penalty</TableHead>
            <TableHead className="w-48 text-right">Recommended Fixes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const target = issueScopeToFixTarget(row)
            return (
              <TableRow
                className="cursor-pointer"
                key={row.key}
                onClick={() => onSelectIssueType(row.key)}
              >
                {hasMultipleSources ? (
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {row.pillarLabel} / {row.bucketLabel}
                  </TableCell>
                ) : null}
                <TableCell className="whitespace-normal">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium text-foreground">
                      {row.issueTypeLabel}
                    </span>
                    <span className="line-clamp-2 text-muted-foreground">
                      {row.issueType.details_preview}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={row.issueType.severity} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.issueType.affected_url_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPenalty(row.issueType.final_penalty)}
                </TableCell>
                <TableCell
                  className="text-right"
                  onClick={(event) => event.stopPropagation()}
                >
                  <RecommendFixesButton
                    isPending={isFixActionPending(target.key)}
                    onClick={() => onFixAction(target)}
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

type UrlIssueTableProps = {
  error: string
  hasMultipleSources: boolean
  isFixActionPending: (targetKey: string) => boolean
  isLoading: boolean
  onFixAction: (target: AIFixTarget) => void
  rows: MergedIssueUrlRow[]
  title: string
  totalRows: number
}

export function UrlIssueTable({
  error,
  hasMultipleSources,
  isFixActionPending,
  isLoading,
  onFixAction,
  rows,
  title,
  totalRows,
}: UrlIssueTableProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
        <CompileLoader className="text-foreground" size={40} />
        <div className="flex flex-col gap-1">
          <p className="font-medium">Loading affected URLs</p>
          <p className="text-sm text-muted-foreground">
            Fetching rows for {title}.
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
      <EmptyMessage message="No affected URLs were returned for the selected issue types." />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            {hasMultipleSources ? <TableHead>Source</TableHead> : null}
            <TableHead>URL</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className="w-48 text-right">Recommended Fixes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const target = issueUrlToFixTarget(row, index)
            return (
              <TableRow key={`${row.source}-${row.url}-${index}`}>
                {hasMultipleSources ? (
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {row.source}
                  </TableCell>
                ) : null}
                <TableCell className="max-w-[18rem] font-medium break-all whitespace-normal text-foreground">
                  {row.url}
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={row.severity} />
                </TableCell>
                <TableCell className="max-w-[18rem] whitespace-normal">
                  {row.message}
                </TableCell>
                <TableCell className="max-w-[24rem] whitespace-normal text-muted-foreground">
                  {row.details}
                </TableCell>
                <TableCell className="text-right">
                  <RecommendFixesButton
                    isPending={isFixActionPending(target.key)}
                    onClick={() => onFixAction(target)}
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

export function EmptyMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/30 px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function RecommendFixesButton({
  isPending,
  onClick,
}: {
  isPending: boolean
  onClick: () => void
}) {
  return (
    <Button
      className="h-8 rounded-full px-3 text-xs"
      disabled={isPending}
      onClick={onClick}
      size="sm"
      variant="outline"
    >
      {isPending ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <SparklesIcon className="size-3.5" />
      )}
      Recommend Fixes
    </Button>
  )
}

function issueScopeToFixTarget(issueScope: IssueScope): AIFixTarget {
  return {
    key: issueScope.key,
    pillarId: issueScope.pillarId,
    pillarLabel: issueScope.pillarLabel,
    bucketId: issueScope.bucketId,
    bucketLabel: issueScope.bucketLabel,
    issueTypeId: issueScope.issueTypeId,
    issueTypeLabel: issueScope.issueTypeLabel,
  }
}

function issueUrlToFixTarget(
  row: MergedIssueUrlRow,
  index: number
): AIFixTarget {
  return {
    key: `${row.pillarId}::${row.bucketId}::${row.issueTypeId}::${row.url}::${index}`,
    pillarId: row.pillarId,
    pillarLabel: row.pillarLabel,
    bucketId: row.bucketId,
    bucketLabel: row.bucketLabel,
    issueTypeId: row.issueTypeId,
    issueTypeLabel: row.issueTypeLabel,
    urls: [row.url],
  }
}

function SeverityBadge({ severity }: { severity: string }) {
  return <Badge variant="outline">{severity || "Unknown"}</Badge>
}
