"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import type { ApexOptions } from "apexcharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import type { GSCOverviewWindowResponse } from "~/lib/api.types"

import { dateTimestamp, formatNumber, formatPercentFromWholeNumber, formatPosition } from "./formatters"
import type { ChartSeries, GSCMetricKey, MetricConfig } from "./types"

export function GSCPerformanceChart({
  windowOverview,
  chartSeries,
  visibleMetrics,
  chartMetricOrder,
  metricConfig,
  visibleRangeLabel,
  visibleTrendRowCount,
  onChartZoomRange,
}: {
  windowOverview: GSCOverviewWindowResponse | null
  chartSeries: ChartSeries[]
  visibleMetrics: Record<GSCMetricKey, boolean>
  chartMetricOrder: GSCMetricKey[]
  metricConfig: Record<GSCMetricKey, MetricConfig>
  visibleRangeLabel: string
  visibleTrendRowCount: number
  onChartZoomRange: (startTimestamp: number, endTimestamp: number) => void
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartInstanceRef = useRef<any>(null)
  const initialRangeRef = useRef<{ start: number; end: number } | null>(null)

  if (initialRangeRef.current === null) {
    initialRangeRef.current = getDefaultVisibleRange(windowOverview)
  }
  const previousWindowOverviewRef = useRef(windowOverview)
  if (previousWindowOverviewRef.current !== windowOverview) {
    previousWindowOverviewRef.current = windowOverview
    initialRangeRef.current = getDefaultVisibleRange(windowOverview)
  }

  const visibleMetricKeys = useMemo(
    () => chartMetricOrder.filter((metricKey) => visibleMetrics[metricKey]),
    [chartMetricOrder, visibleMetrics]
  )
  const visibleSeries = useMemo(
    () =>
      visibleMetricKeys
        .map((metricKey) => {
          const seriesName = metricConfig[metricKey].seriesName
          return chartSeries.find((series) => series.name === seriesName) ?? null
        })
        .filter((series): series is ChartSeries => series !== null),
    [chartSeries, metricConfig, visibleMetricKeys]
  )
  const yRange = useMemo(() => getMetricRange(visibleSeries), [visibleSeries])

  const handleChartZoomRange = useCallback(
    (startTimestamp: number, endTimestamp: number) => {
      if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) return
      onChartZoomRange(startTimestamp, endTimestamp)
    },
    [onChartZoomRange]
  )

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
        zoom: {
          enabled: true,
          type: "x",
          autoScaleYaxis: true,
          allowMouseWheelZoom: false,
        },
        animations: { speed: 300 },
        events: {
          zoomed: (_chartContext, payload) => {
            if (payload?.xaxis) {
              handleChartZoomRange(Number(payload.xaxis.min), Number(payload.xaxis.max))
            }
          },
          beforeResetZoom: () => {
            const fullRange = getFullVisibleRange(windowOverview)
            if (fullRange.start > 0 && fullRange.end > 0) {
              handleChartZoomRange(fullRange.start, fullRange.end)
            }
          },
        },
      },
      colors: visibleMetricKeys.map((metricKey) => metricConfig[metricKey].color),
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
            const apexSeries = context?.w?.config?.series as Array<{ name?: string }> | undefined
            const seriesName = apexSeries?.[context?.seriesIndex ?? -1]?.name ?? ""
            if (seriesName === "CTR") return formatPercentFromWholeNumber(Number(value))
            if (seriesName === "Position") return formatPosition(Number(value))
            return formatNumber(Number(value))
          },
        },
      },
      xaxis: {
        type: "datetime",
        labels: { style: { colors: "rgba(255,255,255,0.45)" }, datetimeUTC: false },
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
    [handleChartZoomRange, metricConfig, visibleMetricKeys, windowOverview, yRange]
  )

  useEffect(() => {
    const chartContainer = chartContainerRef.current
    if (!chartContainer || chartInstanceRef.current || !visibleSeries.length) return

    let chart: any = null
    let isDestroyed = false

    void (async () => {
      const ApexCharts = (await import("apexcharts")).default
      if (isDestroyed || chartInstanceRef.current) return

      chart = new ApexCharts(chartContainer, {
        ...chartOptions,
        series: visibleSeries,
      })
      chartInstanceRef.current = chart
      await chart.render()

      const initialRange = initialRangeRef.current ?? { start: 0, end: 0 }
      if (initialRange.start > 0 && initialRange.end > 0) {
        chart.zoomX(initialRange.start, initialRange.end)
      }
    })()

    return () => {
      isDestroyed = true
      chart?.destroy()
      chartInstanceRef.current = null
    }
  }, [chartOptions, visibleSeries])

  useEffect(() => {
    if (!chartInstanceRef.current) return
    void chartInstanceRef.current.updateOptions(chartOptions, false, false, false)
    void chartInstanceRef.current.updateSeries(visibleSeries, false)
  }, [chartOptions, visibleSeries])

  return (
    <Card className="mx-4 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 text-foreground sm:mx-6 lg:mx-4">
      <CardHeader>
        <CardTitle>Performance</CardTitle>
        <CardDescription>
          Visible range: {visibleRangeLabel || "—"} · comparing against the immediately previous{" "}
          {visibleTrendRowCount}-day window.
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
}

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
    return { min: Math.max(0, Math.floor(minValue - 4)), max: Math.ceil(maxValue + 4) }
  }

  return {
    min: Math.max(0, Math.floor(minValue - padding)),
    max: Math.ceil(maxValue + padding),
  }
}

function getDefaultVisibleRange(windowOverview: GSCOverviewWindowResponse | null) {
  if (!windowOverview?.trend.length) return { start: 0, end: 0 }

  return {
    start: dateTimestamp(windowOverview.trend[Math.max(0, windowOverview.trend.length - 7)]?.date),
    end: dateTimestamp(windowOverview.trend[windowOverview.trend.length - 1]?.date),
  }
}

function getFullVisibleRange(windowOverview: GSCOverviewWindowResponse | null) {
  if (!windowOverview?.trend.length) return { start: 0, end: 0 }

  return {
    start: dateTimestamp(windowOverview.trend[0]?.date),
    end: dateTimestamp(windowOverview.trend[windowOverview.trend.length - 1]?.date),
  }
}

function formatTooltipDate(value: number) {
  return tooltipDateFormatter.format(new Date(value))
}
