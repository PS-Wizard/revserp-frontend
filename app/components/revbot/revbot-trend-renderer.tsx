"use client"

import { memo, useCallback, useMemo } from "react"

import { EChartsAreaChart } from "~/components/evilcharts/charts/echarts-area-chart"
import type { ChartConfig } from "~/components/evilcharts/ui/echarts-chart"
import { cn } from "~/lib/utils"

import type { RevbotTrendChart } from "./revbot-chart-artifacts"

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
})

const SERIES_COLORS = [
  { light: ["#2563eb"], dark: ["#60a5fa"] },
  { light: ["#7c3aed"], dark: ["#a78bfa"] },
  { light: ["#db2777"], dark: ["#f472b6"] },
]

function formatX(value: string, kind: RevbotTrendChart["xKind"]) {
  if (kind === "category")
    return value.length > 18 ? `${value.slice(0, 17)}…` : value
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  )
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date)
}

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
  }).format(value)
}

function formatY(value: number, unit: RevbotTrendChart["unit"]) {
  if (unit === "count") {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)
  }
  if (unit === "percent") return `${formatNumber(value)}%`
  if (unit === "milliseconds") {
    return value >= 1000
      ? `${formatNumber(value / 1000)}s`
      : `${formatNumber(value)}ms`
  }
  return formatNumber(value)
}

function RevbotTrendRenderer({
  chart,
  isLoading,
  variant,
}: {
  chart: RevbotTrendChart
  isLoading: boolean
  variant: "default" | "dark"
}) {
  const isDark = variant === "dark"
  const formatLabel = useCallback(
    (value: string) => formatX(value, chart.xKind),
    [chart.xKind]
  )
  const data = useMemo(
    () =>
      chart.x.map((value, index) => {
        const row: Record<string, string | number | null> = { x: value }
        for (const series of chart.series)
          row[series.key] = series.values[index] ?? null
        return row
      }),
    [chart.series, chart.x]
  )
  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        chart.series.map((series, index) => [
          series.key,
          { label: series.label, colors: SERIES_COLORS[index]! },
        ])
      ),
    [chart.series]
  )

  return (
    <figure className="mx-auto mt-4 flex h-72 w-full max-w-4xl min-w-0 flex-col px-4">
      <div className="min-h-0 flex-1">
        <EChartsAreaChart
          className="h-full w-full"
          config={config}
          curveType="bump"
          data={isLoading ? [] : data}
          enableHoverHighlight
          isLoading={isLoading}
          stackType="default"
          xDataKey="x"
        >
          <EChartsAreaChart.Grid />
          <EChartsAreaChart.XAxis dataKey="x" tickFormatter={formatLabel} />
          <EChartsAreaChart.YAxis
            tickFormatter={(value) => formatY(value, chart.unit)}
          />
          <EChartsAreaChart.Tooltip />
          {chart.series.length > 1 ? (
            <EChartsAreaChart.Legend isClickable />
          ) : null}
          {chart.x.length >= 10 ? (
            <EChartsAreaChart.Brush formatLabel={formatLabel} />
          ) : null}
          {chart.series.map((series) => (
            <EChartsAreaChart.Area
              enableBufferLine={series.projectedPoints ?? false}
              isClickable
              key={series.key}
              dataKey={series.key}
              strokeVariant="solid"
              strokeWidth={2}
              variant="hatched"
            >
              <EChartsAreaChart.ActiveDot />
            </EChartsAreaChart.Area>
          ))}
        </EChartsAreaChart>
      </div>
      <figcaption className="mt-3 shrink-0">
        <div
          className={cn(
            "text-center text-sm font-medium",
            isDark && "text-white/90"
          )}
        >
          {chart.title}
        </div>
        {chart.note ? (
          <p
            className={cn(
              "mt-1 text-center text-xs",
              isDark ? "text-white/50" : "text-muted-foreground"
            )}
          >
            {chart.note}
          </p>
        ) : null}
      </figcaption>
    </figure>
  )
}

export default memo(RevbotTrendRenderer)
