"use client"

import { InfoIcon, TagsIcon } from "lucide-react"
import { useMemo, useState } from "react"
import type { ReactNode } from "react"

import {
  CoverageFilter,
  type FilterState,
} from "~/components/keywords/keywords-coverage"
import { queryMatchRowClassName } from "~/components/gsc-overview/query-match-badges"
import { KEYWORD_KIND_LABELS } from "~/components/keyword-management/keyword-card-parts"
import { SortableTableHead } from "~/components/ui/sortable-table-head"
import { Badge } from "~/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type {
  KeywordAnalysis,
  KeywordCoverageSeed,
  KeywordCoverageState,
} from "~/lib/api.types"
import { KEYWORD_ESTIMATES_TOOLTIP } from "~/lib/keyword-analysis-api"

/** Rows + header/empty overrides so a location tab can reuse this card body. */
export type KeywordEstimatesTableProps = {
  rows: KeywordAnalysis[]
  title?: string
  description?: string
  /** Replaces the AI-generated estimates footer note when set. */
  footerNote?: string
  emptyTitle?: string
  emptyDescription?: string
  /** Header-right slot, e.g. an analyze button. */
  action?: ReactNode
  /** Empty-state slot for CTAs. */
  emptyAction?: ReactNode
  /** Coverage seeds; when set, rows can be filtered by gap / targeted / cannibalized. */
  coverage?: KeywordCoverageSeed[]
  /** Optional per-row action shown beside the keyword on hover/focus. */
  rowAction?: (row: KeywordAnalysis) => ReactNode
}

type EstimatesColumn =
  "keyword" | "kind" | "rank" | "traffic" | "volume" | "kd" | "cpc"

type EstimatesSort = {
  column: EstimatesColumn
  direction: "asc" | "desc"
}

const DASH = "—"

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase()
}

export function formatAnalysisCount(value: number | null) {
  return value === null || value === undefined ? DASH : value.toLocaleString()
}

export function formatAnalysisRank(value: number | null) {
  return value === null || value === undefined ? DASH : value.toLocaleString()
}

export function formatAnalysisKd(value: number | null) {
  return value === null || value === undefined
    ? DASH
    : `${value.toLocaleString()}%`
}

export function formatAnalysisCpc(value: number | null) {
  if (value === null || value === undefined) return DASH
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function isTextColumn(column: EstimatesColumn) {
  return column === "keyword" || column === "kind"
}

function toggleEstimatesSort(
  prev: EstimatesSort | null,
  column: EstimatesColumn
): EstimatesSort {
  if (prev?.column === column) {
    return { column, direction: prev.direction === "asc" ? "desc" : "asc" }
  }
  return { column, direction: isTextColumn(column) ? "asc" : "desc" }
}

function sortValue(row: KeywordAnalysis, column: EstimatesColumn) {
  switch (column) {
    case "keyword":
      return row.keyword
    case "kind":
      return KEYWORD_KIND_LABELS[row.kind]
    case "rank":
      return row.rank
    case "traffic":
      return row.traffic
    case "volume":
      return row.volume
    case "kd":
      return row.kd
    case "cpc":
      return row.cpc
  }
}

function compareEstimatesRows(
  a: KeywordAnalysis,
  b: KeywordAnalysis,
  sort: EstimatesSort
) {
  const av = sortValue(a, sort.column)
  const bv = sortValue(b, sort.column)
  if (av === null || av === undefined) return 1
  if (bv === null || bv === undefined) return -1
  const result =
    typeof av === "string" || typeof bv === "string"
      ? String(av).localeCompare(String(bv))
      : Number(av) - Number(bv)
  return sort.direction === "desc" ? -result : result
}

function KeywordKindBadge({ kind }: { kind: KeywordAnalysis["kind"] }) {
  const isBrand = kind === "brand"
  return (
    <Badge
      variant="outline"
      className={
        isBrand
          ? "border-yellow-500/40 bg-yellow-400/15 text-yellow-800 dark:text-yellow-200"
          : "border-blue-500/40 bg-blue-400/15 text-blue-800 dark:text-blue-200"
      }
    >
      {KEYWORD_KIND_LABELS[isBrand ? "brand" : "non_brand"]}
    </Badge>
  )
}

function EstimatesNote() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={KEYWORD_ESTIMATES_TOOLTIP}
            className="inline-flex shrink-0 items-center text-muted-foreground"
            tabIndex={0}
          />
        }
      >
        <InfoIcon aria-hidden="true" className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs break-words">
        {KEYWORD_ESTIMATES_TOOLTIP}
      </TooltipContent>
    </Tooltip>
  )
}

export function KeywordEstimatesTable({
  rows,
  title = "Keyword estimates",
  description,
  footerNote,
  emptyTitle = "No estimates yet",
  emptyDescription = "Let Revbot estimate rank, traffic, volume, KD, and CPC for this site's keywords.",
  action,
  emptyAction,
  coverage,
  rowAction,
}: KeywordEstimatesTableProps) {
  const [sort, setSort] = useState<EstimatesSort | null>(null)
  const [filter, setFilter] = useState<FilterState>("all")

  const stateByKeyword = useMemo(
    () =>
      new Map(
        (coverage ?? []).map((seed) => [
          normalizeKeyword(seed.keyword),
          seed.state,
        ])
      ),
    [coverage]
  )
  const coverageCounts = useMemo(() => {
    const counts: Record<KeywordCoverageState, number> = {
      likely_targeted: 0,
      no_landing_page: 0,
      cannibalized: 0,
    }
    for (const row of rows) {
      const state = stateByKeyword.get(normalizeKeyword(row.keyword))
      if (state) counts[state] += 1
    }
    return counts
  }, [rows, stateByKeyword])
  const filteredRows = useMemo(
    () =>
      filter === "all"
        ? rows
        : rows.filter(
            (row) =>
              stateByKeyword.get(normalizeKeyword(row.keyword)) === filter
          ),
    [rows, filter, stateByKeyword]
  )

  const brandCount = useMemo(
    () => rows.filter((row) => row.kind === "brand").length,
    [rows]
  )
  const nonBrandCount = useMemo(
    () => rows.filter((row) => row.kind === "non_brand").length,
    [rows]
  )
  const sortedRows = useMemo(
    () =>
      sort
        ? [...filteredRows].sort((a, b) => compareEstimatesRows(a, b, sort))
        : filteredRows,
    [filteredRows, sort]
  )

  function head(column: EstimatesColumn, label: string, alignRight?: boolean) {
    return (
      <SortableTableHead
        active={sort?.column === column}
        className={alignRight ? "text-right" : undefined}
        direction={sort?.direction ?? (isTextColumn(column) ? "asc" : "desc")}
        onToggle={() => setSort((prev) => toggleEstimatesSort(prev, column))}
      >
        {label}
      </SortableTableHead>
    )
  }

  return (
    <>
      <div className="flex min-h-20 shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-semibold tracking-tight">
            {title}
            <EstimatesNote />
          </h3>
          {description ? (
            <p className="text-xs text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            {brandCount} brand · {nonBrandCount} non-brand
          </p>
          {action}
        </div>
      </div>
      {coverage && rows.length > 0 ? (
        <div className="shrink-0 px-5 pb-3">
          <CoverageFilter
            counts={coverageCounts}
            filter={filter}
            onFilter={setFilter}
            total={rows.length}
          />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <Empty className="min-h-48 border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TagsIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
          {emptyAction}
        </Empty>
      ) : (
        <div
          aria-label={`${title} table`}
          className="min-h-0 flex-1 overflow-auto border-t border-border/40 [&>[data-slot=table-container]]:overflow-visible"
          role="region"
          tabIndex={0}
        >
          <Table className="min-w-[40rem] [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                {head("keyword", "Keyword")}
                {head("kind", "Type")}
                {head("rank", "Rank", true)}
                {head("traffic", "Traffic", true)}
                {head("volume", "Volume", true)}
                {head("kd", "KD", true)}
                {head("cpc", "CPC", true)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="py-8 text-center text-xs text-muted-foreground"
                    colSpan={7}
                  >
                    No keywords in this group.
                  </TableCell>
                </TableRow>
              ) : null}
              {sortedRows.map((row) => {
                const isBrand = row.kind === "brand"
                return (
                  <TableRow
                    key={`${row.kind}:${row.keyword}`}
                    className={queryMatchRowClassName({
                      brand: isBrand,
                      nonBrand: !isBrand,
                    })}
                  >
                    <TableCell className="max-w-56 font-medium">
                      {rowAction ? (
                        <div className="group flex items-center gap-1">
                          <span className="truncate">{row.keyword}</span>
                          {rowAction(row)}
                        </div>
                      ) : (
                        <span className="block truncate">{row.keyword}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <KeywordKindBadge kind={row.kind} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisRank(row.rank)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisCount(row.traffic)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisCount(row.volume)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisKd(row.kd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisCpc(row.cpc)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {rows.length > 0 ? (
        <p className="shrink-0 border-t border-border/40 px-5 py-3 text-center text-xs text-muted-foreground">
          {footerNote ?? KEYWORD_ESTIMATES_TOOLTIP}
        </p>
      ) : null}
    </>
  )
}
