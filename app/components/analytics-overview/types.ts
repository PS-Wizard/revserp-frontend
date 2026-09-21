import type {
  ProjectAnalyticsRowResponse,
  ProjectAnalyticsTrendResponse,
} from "~/lib/api.types"

export type AnalyticsMetricKey =
  "active_users" | "sessions" | "engagement_rate" | "key_events"
export type AnalyticsDimensionTab =
  "landing_pages" | "channels" | "sources" | "countries" | "devices"
export type AnalyticsSortColumn = AnalyticsMetricKey | "label"
export type AnalyticsSort = {
  column: AnalyticsSortColumn
  direction: "asc" | "desc"
}
export type AnalyticsMetricConfig = {
  label: string
  color: string
  seriesName: string
}
export type AnalyticsChartSeries = {
  name: string
  data: Array<{ x: number; y: number | null }>
}

export const metricOrder: AnalyticsMetricKey[] = [
  "active_users",
  "sessions",
  "engagement_rate",
  "key_events",
]

export const metricConfig: Record<AnalyticsMetricKey, AnalyticsMetricConfig> = {
  active_users: {
    label: "Active users",
    color: "#7dd3fc",
    seriesName: "Active users",
  },
  sessions: {
    label: "Sessions",
    color: "#c084fc",
    seriesName: "Sessions",
  },
  engagement_rate: {
    label: "Engagement rate",
    color: "#34d399",
    seriesName: "Engagement rate",
  },
  key_events: {
    label: "Key events",
    color: "#fbbf24",
    seriesName: "Key events",
  },
}

export const dimensionTabs: Array<{
  key: AnalyticsDimensionTab
  label: string
  singular: string
}> = [
  { key: "landing_pages", label: "Landing pages", singular: "Landing page" },
  { key: "channels", label: "Channels", singular: "Channel" },
  { key: "sources", label: "Sources", singular: "Source / medium" },
  { key: "countries", label: "Countries", singular: "Country" },
  { key: "devices", label: "Devices", singular: "Device" },
]

export function dateTimestamp(value: string) {
  return new Date(`${value}T00:00:00`).getTime()
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

export function formatMetricValue(metric: AnalyticsMetricKey, value: number) {
  return metric === "engagement_rate"
    ? `${(value * 100).toFixed(2)}%`
    : numberFormatter.format(value)
}

export function formatDelta(current: number, previous: number) {
  if (current === 0 && previous === 0) return ""
  if (previous === 0) return "New vs previous window"
  const delta = ((current - previous) / previous) * 100
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs previous window`
}

export function deltaTone(current: number, previous: number) {
  if (current === previous) return "text-muted-foreground"
  return current > previous ? "text-emerald-300" : "text-rose-300"
}

export function chartSeriesFor(
  trend: ProjectAnalyticsTrendResponse[]
): AnalyticsChartSeries[] {
  return metricOrder.map((metric) => ({
    name: metricConfig[metric].seriesName,
    data: trend.map((row) => ({
      x: dateTimestamp(row.date),
      y:
        metric === "engagement_rate"
          ? Number((row.engagement_rate * 100).toFixed(2))
          : row[metric],
    })),
  }))
}

export function rowLabel(row: ProjectAnalyticsRowResponse) {
  return row.label || "Unknown"
}
