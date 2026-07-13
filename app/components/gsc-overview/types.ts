import type {
  GSCOverviewWindowResponse,
  GSCSearchAnalyticsRowResponse,
} from "~/lib/api.types"

export type GSCMetricKey = "clicks" | "impressions" | "ctr" | "position"
export type GSCDimensionTab = "queries" | "pages" | "countries" | "devices"
export type TableSortColumn =
  "label" | "clicks" | "impressions" | "ctr" | "position"
export type TableSortDirection = "asc" | "desc"

export type TableRow = {
  label: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type MetricSummary = {
  current: number
  previous: number
  hasPreviousWindow: boolean
}

export type MetricConfig = {
  label: string
  color: string
  seriesName: string
}

export type ChartSeries = {
  name: string
  data: Array<{ x: number; y: number | null }>
}

export function toTableRows<RowType extends GSCSearchAnalyticsRowResponse>(
  rows: RowType[],
  buildLabel: (row: RowType) => string
) {
  return rows.map((row) => ({
    label: buildLabel(row),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  })) satisfies TableRow[]
}

function metricValueForRows(
  metricKey: GSCMetricKey,
  rows: GSCSearchAnalyticsRowResponse[]
) {
  if (!rows.length) return 0
  if (metricKey === "clicks")
    return rows.reduce((sum, row) => sum + row.clicks, 0)
  if (metricKey === "impressions") {
    return rows.reduce((sum, row) => sum + row.impressions, 0)
  }
  if (metricKey === "ctr") {
    const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
    return impressions > 0 ? clicks / impressions : 0
  }

  const totalImpressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  if (totalImpressions <= 0) return 0
  return (
    rows.reduce((sum, row) => sum + row.position * row.impressions, 0) /
    totalImpressions
  )
}

export function buildMetricSummary(
  metricKey: GSCMetricKey,
  currentRows: GSCSearchAnalyticsRowResponse[],
  previousRows: GSCSearchAnalyticsRowResponse[]
): MetricSummary {
  return {
    current: metricValueForRows(metricKey, currentRows),
    previous: metricValueForRows(metricKey, previousRows),
    hasPreviousWindow: previousRows.length > 0,
  }
}

export function buildChartSeries(
  windowOverview: GSCOverviewWindowResponse | null,
  chartMetricOrder: GSCMetricKey[],
  metricConfig: Record<GSCMetricKey, MetricConfig>,
  dateTimestamp: (value: string | undefined) => number
): ChartSeries[] {
  if (!windowOverview) return []

  return chartMetricOrder.map((metricKey) => ({
    name: metricConfig[metricKey].seriesName,
    data: windowOverview.trend.map((row) => ({
      x: dateTimestamp(row.date),
      y:
        metricKey === "impressions"
          ? row.impressions
          : metricKey === "clicks"
            ? row.clicks
            : metricKey === "ctr"
              ? Number((row.ctr * 100).toFixed(2))
              : Number(row.position.toFixed(2)),
    })),
  }))
}
