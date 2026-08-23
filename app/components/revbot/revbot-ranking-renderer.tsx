"use client"

import { memo, useCallback, useMemo } from "react"

import {
  EChartsBarChart,
  type ChartConfig,
} from "~/components/evilcharts/charts/echarts-bar-chart"
import { cn } from "~/lib/utils"

import type { ChartUnit, RevbotRankingChart } from "./revbot-chart-artifacts"

const SERIES_COLORS = [
  { light: ["#047857"], dark: ["#10b981"] },
  { light: ["#be123c"], dark: ["#f43f5e"] },
  { light: ["#6d28d9"], dark: ["#8b5cf6"] },
]

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
  }).format(value)
}

function formatValue(value: number, unit: ChartUnit) {
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

function RevbotRankingRenderer({
  chart,
  isLoading,
  variant,
}: {
  chart: RevbotRankingChart
  isLoading: boolean
  variant: "default" | "dark"
}) {
  const isDark = variant === "dark"
  const formatCategory = useCallback(
    (value: string) => (value.length > 14 ? `${value.slice(0, 13)}…` : value),
    []
  )
  const formatAxisValue = useCallback(
    (value: string) => formatValue(Number(value), chart.unit),
    [chart.unit]
  )
  const data = useMemo(
    () =>
      chart.categories.map((category, index) => {
        const row: Record<string, string | number> = { category }
        for (const series of chart.series)
          row[series.key] = series.values[index]!
        return row
      }),
    [chart.categories, chart.series]
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
    <figure className="mx-auto mt-4 flex h-72 w-full max-w-3xl min-w-0 flex-col px-4">
      <div className="min-h-0 flex-1">
        <EChartsBarChart
          className="h-full w-full"
          config={config}
          data={isLoading ? [] : data}
          isLoading={isLoading}
          loadingBars={chart.categories.length}
          xDataKey="category"
        >
          <EChartsBarChart.Grid />
          <EChartsBarChart.XAxis
            dataKey="category"
            tickFormatter={formatCategory}
          />
          <EChartsBarChart.YAxis tickFormatter={formatAxisValue} />
          <EChartsBarChart.Tooltip />
          {chart.series.length > 1 ? (
            <EChartsBarChart.Legend isClickable />
          ) : null}
          {chart.series.map((series) => (
            <EChartsBarChart.Bar
              dataKey={series.key}
              enableHoverHighlight
              isClickable
              key={series.key}
              variant="hatched"
            />
          ))}
        </EChartsBarChart>
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

export default memo(RevbotRankingRenderer)
