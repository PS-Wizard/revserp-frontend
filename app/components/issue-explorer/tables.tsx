import { ThinkingOrb } from "thinking-orbs"
import { Badge } from "~/components/ui/badge"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"

import type { ScoreBreakdownIssueTypeResponse } from "~/lib/api.types"

import type { BucketScope, MergedIssueUrlRow, PillarScope } from "./types"
import { formatScore } from "~/components/trend-sparkline"

import type { RowSelectionProps } from "./use-drag-selection"
import { urlRowKey } from "./utils"

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
  if (!totalRows) {
    return <EmptyMessage message="No pillars found for the selected scope." />
  }

  const checkedSet = new Set(checkedKeys)

  return (
    <div className="overflow-hidden rounded-lg border select-none">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <SelectAllHead
              checkedCount={rows.filter((r) => checkedSet.has(r.key)).length}
              totalCount={rows.length}
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
          {rows.map((row) => (
            <TableRow
              className="cursor-pointer"
              key={row.key}
              onDoubleClick={() => onDrill(row.key)}
              title="Double-click to view buckets · drag to select"
              {...getRowProps(row.key)}
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select ${row.pillarLabel}`}
                  checked={checkedSet.has(row.key)}
                  onCheckedChange={() => onToggleRow(row.key)}
                />
              </TableCell>
              <TableCell className="whitespace-normal font-medium text-foreground">
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
          ))}
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
  if (!totalRows) {
    return <EmptyMessage message="No buckets found for the selected scope." />
  }

  const checkedSet = new Set(checkedKeys)

  return (
    <div className="overflow-hidden rounded-lg border select-none">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <SelectAllHead
              checkedCount={rows.filter((r) => checkedSet.has(r.key)).length}
              totalCount={rows.length}
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
          {rows.map((row) => (
            <TableRow
              className="cursor-pointer"
              key={row.key}
              onDoubleClick={() => onDrill(row.key)}
              title="Double-click to view affected URLs · drag to select"
              {...getRowProps(row.key)}
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select ${row.bucketLabel}`}
                  checked={checkedSet.has(row.key)}
                  onCheckedChange={() => onToggleRow(row.key)}
                />
              </TableCell>
              <TableCell className="whitespace-normal font-medium text-foreground">
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
          ))}
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
  if (!totalRows) {
    return (
      <EmptyMessage message="No issue types found for the selected bucket." />
    )
  }

  const checkedSet = new Set(checkedKeys)

  return (
    <div className="overflow-hidden rounded-lg border select-none">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <SelectAllHead
              checkedCount={rows.filter((r) => checkedSet.has(r.id)).length}
              totalCount={rows.length}
              onToggleAll={onToggleAll}
            />
            <TableHead>Issue Type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead className="text-right">Affected URLs</TableHead>
            <TableHead className="text-right">Issues</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              className="cursor-pointer"
              key={row.id}
              onDoubleClick={() => onDrill(row.id)}
              title="Double-click to view affected URLs · drag to select"
              {...getRowProps(row.id)}
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select ${row.label}`}
                  checked={checkedSet.has(row.id)}
                  onCheckedChange={() => onToggleRow(row.id)}
                />
              </TableCell>
              <TableCell className="whitespace-normal font-medium text-foreground">
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
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

type UrlIssueTableProps = {
  error: string
  isLoading: boolean
  rows: MergedIssueUrlRow[]
  totalRows: number
  checkedKeys: string[]
  onToggleRow: (key: string) => void
  onToggleAll: (checked: boolean) => void
  getRowProps: (key: string) => RowSelectionProps
}

export function UrlIssueTable({
  error,
  isLoading,
  rows,
  totalRows,
  checkedKeys,
  onToggleRow,
  onToggleAll,
  getRowProps,
}: UrlIssueTableProps) {
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
    <div className="overflow-hidden rounded-lg border select-none">
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = urlRowKey(row)
            return (
              <TableRow
                className="cursor-pointer"
                key={key}
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
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={row.url}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    className="block truncate text-primary hover:underline"
                  >
                    {row.url}
                  </a>
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {row.issueTypeLabel}
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={row.severity} />
                </TableCell>
                <TableCell className="max-w-[18rem] whitespace-normal">
                  {row.message}
                </TableCell>
                <TableCell className="max-w-[24rem] whitespace-normal text-muted-foreground">
                  <Linkify text={row.details} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
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

// Splits text on http(s) URLs and renders the URLs as new-tab links. The
// capturing split yields the matched URLs as their own array entries, so each
// part is either a plain string or exactly one URL.
const URL_SPLIT_PATTERN = /(https?:\/\/[^\s]+)/g

function Linkify({ text }: { text: string }) {
  if (!text) return null
  return (
    <>
      {text.split(URL_SPLIT_PATTERN).map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            className="break-all text-primary hover:underline"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  )
}
