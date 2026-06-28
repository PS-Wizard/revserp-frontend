"use client"

import { memo, useMemo, useRef } from "react"
import type { ApexOptions } from "apexcharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import type { GSCOverviewWindowResponse } from "~/lib/api.types"

import {
  formatNumber,
  formatPercentFromWholeNumber,
  formatPosition,
} from "./formatters"
import type { ChartSeries, GSCMetricKey, MetricConfig } from "./types"
import { useApexChart } from "~/hooks/use-apex-chart"

export const GSCPerformanceChart = memo(function GSCPerformanceChart({
  windowOverview,
  chartSeries,
  visibleMetrics,
  chartMetricOrder,
  metricConfig,
}: {
  windowOverview: GSCOverviewWindowResponse | null
  chartSeries: ChartSeries[]
  visibleMetrics: Record<GSCMetricKey, boolean>
  chartMetricOrder: GSCMetricKey[]
  metricConfig: Record<GSCMetricKey, MetricConfig>
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null)

  const visibleMetricKeys = useMemo(
    () => chartMetricOrder.filter((metricKey) => visibleMetrics[metricKey]),
    [chartMetricOrder, visibleMetrics]
  )
  const visibleSeries = useMemo(
    () =>
      visibleMetricKeys
        .map((metricKey) => {
          const seriesName = metricConfig[metricKey].seriesName
          return (
            chartSeries.find((series) => series.name === seriesName) ?? null
          )
        })
        .filter((series): series is ChartSeries => series !== null),
    [chartSeries, metricConfig, visibleMetricKeys]
  )
  const yRange = useMemo(() => getMetricRange(visibleSeries), [visibleSeries])

  const chartOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "area",
        height: 360,
        background: "transparent",
        parentHeightOffset: 0,
        toolbar: {
          show: true,
          tools: {
            download: false,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true,
          },
          autoSelected: "zoom",
        },
        zoom: { enabled: true, type: "x", autoScaleYaxis: true },
        animations: { speed: 300 },
      },
      colors: visibleMetricKeys.map(
        (metricKey) => metricConfig[metricKey].color
      ),
      dataLabels: { enabled: false },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 0.2,
          opacityFrom: 0.34,
          opacityTo: 0.03,
          stops: [0, 92, 100],
        },
      },
      grid: {
        borderColor: "rgba(255,255,255,0.08)",
        strokeDashArray: 4,
        padding: { bottom: 0, left: 8, right: 14, top: 0 },
      },
      legend: { show: false },
      stroke: { curve: "smooth", width: 2.5 },
      theme: { mode: "dark" },
      tooltip: {
        theme: "dark",
        shared: true,
        x: { formatter: (value) => formatTooltipDate(Number(value)) },
        y: {
          formatter: (value, context) => {
            const apexSeries = context?.w?.config?.series as
              Array<{ name?: string }> | undefined
            const seriesName =
              apexSeries?.[context?.seriesIndex ?? -1]?.name ?? ""
            if (seriesName === "CTR")
              return formatPercentFromWholeNumber(Number(value))
            if (seriesName === "Position") return formatPosition(Number(value))
            return formatNumber(Number(value))
          },
        },
      },
      xaxis: {
        type: "datetime",
        labels: {
          style: { colors: "rgba(255,255,255,0.45)" },
          datetimeUTC: false,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: {
        min: yRange.min,
        max: yRange.max,
        tickAmount: 4,
        labels: {
          style: { colors: "rgba(255,255,255,0.45)" },
          formatter: (value) => formatNumber(Number(value)),
        },
      },
    }),
    [metricConfig, visibleMetricKeys, yRange]
  )

  useApexChart(
    chartContainerRef,
    chartOptions,
    visibleSeries,
    visibleSeries.length > 0
  )

  return (
    <Card className="mx-4 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 text-foreground sm:mx-6 lg:mx-4">
      <CardHeader>
        <CardTitle>Performance</CardTitle>
        <CardDescription>
          {windowOverview?.trend.length
            ? `Search Console trend over the last ${windowOverview.trend.length} days`
            : "Search Console trend"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col px-2 pt-2 sm:px-6">
        {visibleSeries.length === 0 ? (
          <div className="flex min-h-[360px] w-full items-center justify-center text-sm text-muted-foreground">
            No Search Console trend data yet.
          </div>
        ) : (
          <>
            <div className="min-h-[360px] w-full" ref={chartContainerRef} />
            <div className="mt-auto flex justify-center">
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                {visibleMetricKeys.map((metricKey) => (
                  <div className="flex items-center gap-2" key={metricKey}>
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: metricConfig[metricKey].color }}
                    />
                    <span className="truncate text-muted-foreground">
                      {metricConfig[metricKey].label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
})

const tooltipDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function getMetricRange(series: ChartSeries[]) {
  const values: number[] = []
  for (const item of series) {
    for (const point of item.data) {
      if (Number.isFinite(point.y)) values.push(point.y)
    }
  }

  if (!values.length) return { min: 0, max: 100 }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = Math.max(4, (maxValue - minValue) * 0.12)

  if (maxValue === minValue) {
    return {
      min: Math.max(0, Math.floor(minValue - 4)),
      max: Math.ceil(maxValue + 4),
    }
  }

  return {
    min: Math.max(0, Math.floor(minValue - padding)),
    max: Math.ceil(maxValue + padding),
  }
}

function formatTooltipDate(value: number) {
  return tooltipDateFormatter.format(new Date(value))
}
