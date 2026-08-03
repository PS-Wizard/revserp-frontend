import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow as UITableRow,
} from "~/components/ui/table"

import { formatNumber, formatPercent, formatPosition } from "./formatters"
import { dimensionTabLabel, sortIndicator, type TableSortState } from "./table"
import type { GSCDimensionTab, TableRow, TableSortColumn } from "./types"
import type { GSCQueryPreset } from "./use-gsc-queries"

const dimensionTabs: Array<{ key: GSCDimensionTab; label: string }> = [
  { key: "queries", label: "Queries" },
  { key: "pages", label: "Pages" },
  { key: "countries", label: "Countries" },
  { key: "devices", label: "Devices" },
]

const queryPresets: Array<{ key: GSCQueryPreset; label: string; hint: string }> =
  [
    { key: "all", label: "All queries", hint: "Every query, most clicks first" },
    {
      key: "questions",
      label: "Questions",
      hint: "Queries phrased as a question or a comparison",
    },
  ]

export function GSCTableSection({
  activeDimensionTab,
  tableSearch,
  activeTableRows,
  tableSort,
  queryPreset,
  queriesErrorMessage,
  queriesHasMore,
  isLoadingQueries,
  isLoadingMoreQueries,
  onTableSearchChange,
  onDimensionTabChange,
  onToggleTableSort,
  onQueryPresetChange,
  onLoadMoreQueries,
}: {
  activeDimensionTab: GSCDimensionTab
  tableSearch: string
  activeTableRows: TableRow[]
  tableSort: TableSortState
  queryPreset: GSCQueryPreset
  queriesErrorMessage: string
  queriesHasMore: boolean
  isLoadingQueries: boolean
  isLoadingMoreQueries: boolean
  onTableSearchChange: (value: string) => void
  onDimensionTabChange: (value: string) => void
  onToggleTableSort: (column: TableSortColumn) => void
  onQueryPresetChange: (value: GSCQueryPreset) => void
  onLoadMoreQueries: () => void
}) {
  const isQueriesTab = activeDimensionTab === "queries"

  return (
    <section className="mx-4 rounded-xl border border-border/50 bg-card text-foreground sm:mx-6 lg:mx-4">
      <div className="flex flex-col gap-4 border-b border-border/50 px-8 py-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-medium">Search performance table</h2>
          <p className="pt-2 text-sm text-muted-foreground">
            One GSC-style table with sortable columns and dimension tabs.
          </p>
        </div>
        <Input
          className="w-full lg:max-w-sm"
          onChange={(event) => onTableSearchChange(event.currentTarget.value)}
          placeholder={
            isQueriesTab
              ? "Search all queries..."
              : `Filter ${activeDimensionTab}...`
          }
          value={tableSearch}
        />
      </div>

      <Tabs onValueChange={onDimensionTabChange} value={activeDimensionTab}>
        <TabsList className="mx-8 mt-4 h-auto justify-start gap-2 rounded-none border-b border-border/50 bg-transparent p-0">
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
            className="space-y-4 px-8 py-6"
            key={tab.key}
            value={tab.key}
          >
            {tab.key === "queries" ? (
              <div className="flex flex-wrap gap-2">
                {queryPresets.map((preset) => (
                  <Button
                    key={preset.key}
                    onClick={() => onQueryPresetChange(preset.key)}
                    size="sm"
                    title={preset.hint}
                    type="button"
                    variant={queryPreset === preset.key ? "default" : "outline"}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Showing {activeTableRows.length}{" "}
              {dimensionTabLabel(tab.key).toLowerCase()}
              {tab.key === "queries" && queriesHasMore ? " so far" : ""}.
            </p>

            {tab.key === "queries" && queriesErrorMessage ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {queriesErrorMessage}
              </div>
            ) : null}

            <RowsTable
              emptyMessage={
                tab.key === "queries" && isLoadingQueries
                  ? "Loading queries..."
                  : emptyMessage(tab.key)
              }
              onToggleTableSort={onToggleTableSort}
              primaryColumnLabel={dimensionTabLabel(tab.key).slice(0, -1)}
              rows={activeTableRows}
              tableSort={tableSort}
            />

            {tab.key === "queries" && queriesHasMore ? (
              <Button
                disabled={isLoadingQueries || isLoadingMoreQueries}
                onClick={onLoadMoreQueries}
                type="button"
                variant="outline"
              >
                {isLoadingMoreQueries ? "Loading..." : "Load more queries"}
              </Button>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

function RowsTable({
  primaryColumnLabel,
  rows,
  emptyMessage,
  tableSort,
  onToggleTableSort,
}: {
  primaryColumnLabel: string
  rows: TableRow[]
  emptyMessage: string
  tableSort: TableSortState
  onToggleTableSort: (column: TableSortColumn) => void
}) {
  if (!rows.length) {
    return (
      <div className="rounded-md border border-border/50 bg-background/60 px-4 py-8 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border/50 bg-background/40">
      <Table>
        <TableHeader>
          <UITableRow className="border-border/50 text-muted-foreground">
            <SortableHead
              column="label"
              onToggle={onToggleTableSort}
              tableSort={tableSort}
            >
              {primaryColumnLabel}
            </SortableHead>
            <SortableHead
              column="clicks"
              onToggle={onToggleTableSort}
              tableSort={tableSort}
            >
              Clicks
            </SortableHead>
            <SortableHead
              column="impressions"
              onToggle={onToggleTableSort}
              tableSort={tableSort}
            >
              Impressions
            </SortableHead>
            <SortableHead
              column="ctr"
              onToggle={onToggleTableSort}
              tableSort={tableSort}
            >
              CTR
            </SortableHead>
            <SortableHead
              column="position"
              onToggle={onToggleTableSort}
              tableSort={tableSort}
            >
              Position
            </SortableHead>
          </UITableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <UITableRow className="border-border/40" key={row.label}>
              <TableCell className="max-w-[34rem] truncate text-foreground">
                {row.label || "Unknown"}
              </TableCell>
              <TableCell>{formatNumber(row.clicks)}</TableCell>
              <TableCell>{formatNumber(row.impressions)}</TableCell>
              <TableCell>{formatPercent(row.ctr)}</TableCell>
              <TableCell>{formatPosition(row.position)}</TableCell>
            </UITableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SortableHead({
  column,
  tableSort,
  onToggle,
  children,
}: {
  column: TableSortColumn
  tableSort: TableSortState
  onToggle: (column: TableSortColumn) => void
  children: React.ReactNode
}) {
  return (
    <TableHead>
      <button
        className="inline-flex items-center gap-2"
        onClick={() => onToggle(column)}
        type="button"
      >
        {children} <span>{sortIndicator(tableSort, column)}</span>
      </button>
    </TableHead>
  )
}

function emptyMessage(tab: GSCDimensionTab) {
  return tab === "queries"
    ? "No query rows available."
    : tab === "pages"
      ? "No landing page data available yet."
      : tab === "countries"
        ? "No country data is available yet."
        : "No device data is available yet."
}
