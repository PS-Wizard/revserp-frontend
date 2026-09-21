import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

import { Input } from "~/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import type { ProjectAnalyticsRowResponse } from "~/lib/api.types"

import {
  dimensionTabs,
  formatMetricValue,
  type AnalyticsDimensionTab,
  type AnalyticsMetricKey,
  type AnalyticsSort,
  rowLabel,
} from "./types"

export function AnalyticsTableSection({
  activeTab,
  rows,
  search,
  sort,
  onTabChange,
  onSearchChange,
  onSort,
}: {
  activeTab: AnalyticsDimensionTab
  rows: ProjectAnalyticsRowResponse[]
  search: string
  sort: AnalyticsSort
  onTabChange: (tab: AnalyticsDimensionTab) => void
  onSearchChange: (value: string) => void
  onSort: (column: AnalyticsSort["column"]) => void
}) {
  const tabLabel =
    dimensionTabs.find((tab) => tab.key === activeTab)?.label ?? "Analytics"
  return (
    <section className="mx-4 overflow-hidden rounded-xl border border-border/50 bg-card text-foreground sm:mx-6 lg:mx-4">
      <div className="flex flex-col gap-4 border-b border-border/50 px-8 py-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-medium">
            Acquisition and audience table
          </h2>
          <p className="pt-2 text-sm text-muted-foreground">
            Sortable Google Analytics dimensions with client-side filtering.
          </p>
        </div>
        <Input
          aria-label={`Filter ${tabLabel}`}
          className="w-full lg:max-w-sm"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder={`Filter ${tabLabel.toLowerCase()}...`}
          value={search}
        />
      </div>
      <Tabs
        onValueChange={(value) => onTabChange(value as AnalyticsDimensionTab)}
        value={activeTab}
      >
        <TabsList className="mx-8 mt-4 h-auto justify-start gap-2 overflow-x-auto rounded-none border-b border-border/50 bg-transparent p-0">
          {dimensionTabs.map((tab) => (
            <TabsTrigger
              className="rounded-b-none border border-b-0 border-transparent px-4 py-3 data-[state=active]:border-border/50 data-[state=active]:bg-muted"
              key={tab.key}
              value={tab.key}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {dimensionTabs.map((tab) => (
          <TabsContent
            className="flex flex-col gap-4 px-8 py-6"
            key={tab.key}
            value={tab.key}
          >
            <p className="text-xs text-muted-foreground">
              Showing {rows.length} {tab.label.toLowerCase()}.
            </p>
            <RowsTable
              rows={rows}
              sort={sort}
              onSort={onSort}
              primaryLabel={tab.singular}
            />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

function RowsTable({
  rows,
  sort,
  onSort,
  primaryLabel,
}: {
  rows: ProjectAnalyticsRowResponse[]
  sort: AnalyticsSort
  onSort: (column: AnalyticsSort["column"]) => void
  primaryLabel: string
}) {
  if (!rows.length)
    return (
      <div className="rounded-md border border-border/50 bg-background/60 px-4 py-8 text-sm text-muted-foreground">
        No {primaryLabel.toLowerCase()} data is available yet.
      </div>
    )
  return (
    <div className="overflow-x-auto rounded-md border border-border/50 bg-background/40">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 text-muted-foreground">
            <SortableHead column="label" sort={sort} onSort={onSort}>
              {primaryLabel}
            </SortableHead>
            <SortableHead column="active_users" sort={sort} onSort={onSort}>
              Active users
            </SortableHead>
            <SortableHead column="sessions" sort={sort} onSort={onSort}>
              Sessions
            </SortableHead>
            <SortableHead column="engagement_rate" sort={sort} onSort={onSort}>
              Engagement rate
            </SortableHead>
            <SortableHead column="key_events" sort={sort} onSort={onSort}>
              Key events
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              className="border-border/40"
              key={`${row.label}-${index}`}
            >
              <TableCell className="max-w-[34rem] truncate text-foreground">
                {rowLabel(row)}
              </TableCell>
              <TableCell>
                {formatMetricValue("active_users", row.active_users)}
              </TableCell>
              <TableCell>
                {formatMetricValue("sessions", row.sessions)}
              </TableCell>
              <TableCell>
                {formatMetricValue("engagement_rate", row.engagement_rate)}
              </TableCell>
              <TableCell>
                {formatMetricValue("key_events", row.key_events)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SortableHead({
  column,
  sort,
  onSort,
  children,
}: {
  column: AnalyticsSort["column"]
  sort: AnalyticsSort
  onSort: (column: AnalyticsSort["column"]) => void
  children: React.ReactNode
}) {
  const active = sort.column === column
  return (
    <TableHead
      aria-sort={
        active
          ? sort.direction === "desc"
            ? "descending"
            : "ascending"
          : "none"
      }
    >
      <button
        className="inline-flex items-center gap-2"
        onClick={() => onSort(column)}
        type="button"
      >
        {children}
        {active ? (
          sort.direction === "desc" ? (
            <ArrowDownIcon aria-hidden="true" className="size-3.5" />
          ) : (
            <ArrowUpIcon aria-hidden="true" className="size-3.5" />
          )
        ) : null}
      </button>
    </TableHead>
  )
}

export function filterAndSortRows(
  rows: ProjectAnalyticsRowResponse[],
  search: string,
  sort: AnalyticsSort
) {
  const query = search.trim().toLowerCase()
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !query || row.label.toLowerCase().includes(query))
    .sort((left, right) => {
      const a = left.row
      const b = right.row
      const av =
        sort.column === "label" ? a.label : a[sort.column as AnalyticsMetricKey]
      const bv =
        sort.column === "label" ? b.label : b[sort.column as AnalyticsMetricKey]
      const result =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv)
      return (
        (sort.direction === "desc" ? -result : result) ||
        left.index - right.index
      )
    })
    .map(({ row }) => row)
}
