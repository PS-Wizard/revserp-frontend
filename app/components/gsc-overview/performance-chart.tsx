"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import type { ApexOptions } from "apexcharts"

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
  const visibleRangeRef = useRef<{ start: number; end: number } | null>(null)
  if (visibleRangeRef.current === null) {
    visibleRangeRef.current = getDefaultVisibleRange(windowOverview)
  }
  const previousWindowOverviewRef = useRef(windowOverview)
  if (previousWindowOverviewRef.current !== windowOverview) {
    previousWindowOverviewRef.current = windowOverview
    visibleRangeRef.current = getDefaultVisibleRange(windowOverview)
  }

  const handleChartZoomRange = useCallback(
    (startTimestamp: number, endTimestamp: number) => {
      if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) return
      visibleRangeRef.current = { start: startTimestamp, end: endTimestamp }
      onChartZoomRange(startTimestamp, endTimestamp)
    },
    [onChartZoomRange]
  )

  const chartOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "line",
        height: 360,
        background: "transparent",
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
        animations: { speed: 350 },
        events: {
          zoomed: (_chartContext, payload) => {
            if (payload?.xaxis) {
              handleChartZoomRange(Number(payload.xaxis.min), Number(payload.xaxis.max))
            }
          },
          scrolled: (_chartContext, payload) => {
            if (payload?.xaxis) {
              handleChartZoomRange(Number(payload.xaxis.min), Number(payload.xaxis.max))
            }
          },
          beforeResetZoom: () => {
            if (!windowOverview?.trend.length) return
            handleChartZoomRange(
              dateTimestamp(windowOverview.trend[0]?.date),
              dateTimestamp(windowOverview.trend[windowOverview.trend.length - 1]?.date)
            )
          },
        },
      },
      colors: chartMetricOrder.map((metricKey) => metricConfig[metricKey].color),
      dataLabels: { enabled: false },
      grid: { borderColor: "rgba(255,255,255,0.08)", strokeDashArray: 4 },
      legend: { show: false },
      stroke: { curve: "smooth", width: 2.5 },
      theme: { mode: "dark" },
      tooltip: {
        theme: "dark",
        shared: true,
        x: { format: "MMM d, yyyy" },
        y: {
          formatter: (value, context) => {
            const seriesName =
              context && context.seriesIndex >= 0 ? chartSeries[context.seriesIndex]?.name : ""
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
      },
      yaxis: [
        {
          labels: {
            style: { colors: "rgba(255,255,255,0.45)" },
            formatter: (value) => formatNumber(Number(value)),
          },
        },
        {
          opposite: true,
          labels: {
            style: { colors: "rgba(255,255,255,0.45)" },
            formatter: (value) =>
              Number(value) <= 100
                ? formatPercentFromWholeNumber(Number(value))
                : formatPosition(Number(value)),
          },
        },
      ],
    }),
    [chartMetricOrder, chartSeries, handleChartZoomRange, metricConfig, windowOverview]
  )


  useEffect(() => {
    const chartContainer = chartContainerRef.current
    if (!chartContainer || chartInstanceRef.current) return

    let chart: any = null
    let isDestroyed = false

    void (async () => {
      const ApexCharts = (await import("apexcharts")).default
      if (isDestroyed || chartInstanceRef.current) return

      chart = new ApexCharts(chartContainer, {
        ...chartOptions,
        series: chartSeries,
      })
      chartInstanceRef.current = chart
      await chart.render()
      applyMetricVisibility(chart, chartMetricOrder, metricConfig, visibleMetrics)
      const visibleRange = visibleRangeRef.current ?? { start: 0, end: 0 }
      if (visibleRange.start > 0 && visibleRange.end > 0) {
        chart.zoomX(visibleRange.start, visibleRange.end)
      }
    })()

    return () => {
      isDestroyed = true
      chart?.destroy()
      chartInstanceRef.current = null
    }
  }, [chartMetricOrder, chartOptions, chartSeries, metricConfig, visibleMetrics])

  useEffect(() => {
    if (!chartInstanceRef.current) return
    void chartInstanceRef.current.updateOptions(chartOptions, false, false, false)
    void chartInstanceRef.current.updateSeries(chartSeries, false)
  }, [chartOptions, chartSeries])

  useEffect(() => {
    if (!chartInstanceRef.current) return
    applyMetricVisibility(chartInstanceRef.current, chartMetricOrder, metricConfig, visibleMetrics)
  }, [chartMetricOrder, metricConfig, visibleMetrics])

  return (
    <section className="mx-4 overflow-x-auto rounded-xl border border-border/50 bg-card text-foreground sm:mx-6 lg:mx-4">
      <div className="border-b border-border/50 px-8 py-6">
        <h2 className="text-lg font-medium">Performance</h2>
        <p className="pt-2 text-sm text-muted-foreground">
          Visible range: {visibleRangeLabel || "—"} · comparing against the immediately previous{" "}
          {visibleTrendRowCount}-day window.
        </p>
      </div>
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="min-w-[920px]">
          <div className="gsc-overview-chart" ref={chartContainerRef} />
        </div>
      </div>
    </section>
  )
}

function applyMetricVisibility(
  chartInstance: any,
  chartMetricOrder: GSCMetricKey[],
  metricConfig: Record<GSCMetricKey, MetricConfig>,
  visibleMetrics: Record<GSCMetricKey, boolean>
) {
  for (const metricKey of chartMetricOrder) {
    const seriesName = metricConfig[metricKey].seriesName
    if (visibleMetrics[metricKey]) chartInstance.showSeries(seriesName)
    else chartInstance.hideSeries(seriesName)
  }
}

function getDefaultVisibleRange(windowOverview: GSCOverviewWindowResponse | null) {
  if (!windowOverview?.trend.length) {
    return { start: 0, end: 0 }
  }

  const endTimestamp = dateTimestamp(windowOverview.trend[windowOverview.trend.length - 1]?.date)
  const startTimestamp = dateTimestamp(
    windowOverview.trend[Math.max(0, windowOverview.trend.length - 7)]?.date
  )

  return { start: startTimestamp, end: endTimestamp }
}
