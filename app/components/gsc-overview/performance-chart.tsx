"use client"

import { memo, useMemo, useRef, useState } from "react"
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
  GSCDateRangePicker,
  type GSCChartRange,
  type GSCRangePresetKey,
} from "./gsc-date-range-picker"
import {
  formatNumber,
  formatPercentFromWholeNumber,
  formatPosition,
} from "./formatters"
import type { ChartSeries, GSCMetricKey, MetricConfig } from "./types"
import { useApexChart } from "~/hooks/use-apex-chart"

const scoreSeriesColor = "rgba(255,255,255,0.60)"

export const GSCPerformanceChart = memo(function GSCPerformanceChart({
  windowOverview,
  chartSeries,
  visibleMetrics,
  chartMetricOrder,
  metricConfig,
  scoreSeries,
  onVisibleRangeChange,
}: {
  windowOverview: GSCOverviewWindowResponse | null
  chartSeries: ChartSeries[]
  visibleMetrics: Record<GSCMetricKey, boolean>
  chartMetricOrder: GSCMetricKey[]
  metricConfig: Record<GSCMetricKey, MetricConfig>
  scoreSeries: ChartSeries | null
  onVisibleRangeChange: (range: { min: number; max: number } | null) => void
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const [activePreset, setActivePreset] = useState<GSCRangePresetKey | null>(
    null
  )
  const [appliedRange, setAppliedRange] = useState<GSCChartRange | null>(null)
  // Range last applied by a preset click, so chart zoom events echoing that
  // exact range don't deselect the preset, while manual zoom/pan does.
  const lastPresetRangeRef = useRef<GSCChartRange | null>(null)
  const skipNextRangeEventRef = useRef(false)

  const handleChartRangeEvent = (range: GSCChartRange | null) => {
    if (skipNextRangeEventRef.current) {
      skipNextRangeEventRef.current = false
      return
    }
    const presetRange = lastPresetRangeRef.current
    const matchesPreset =
      range !== null &&
      presetRange !== null &&
      Math.abs(range.min - presetRange.min) < 1000 &&
      Math.abs(range.max - presetRange.max) < 1000
    if (!matchesPreset) {
      lastPresetRangeRef.current = null
      setActivePreset(null)
    }
    setAppliedRange(range)
    onVisibleRangeChange(range)
  }
  const onChartRangeEventRef = useRef(handleChartRangeEvent)
  onChartRangeEventRef.current = handleChartRangeEvent

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
  const renderedSeries = useMemo(
    () => (scoreSeries ? [...visibleSeries, scoreSeries] : visibleSeries),
    [scoreSeries, visibleSeries]
  )
  const yRange = useMemo(() => getMetricRange(renderedSeries), [renderedSeries])
  const hasScoreSeries = scoreSeries !== null

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
        events: {
          zoomed: (_chart, payload) => {
            const { min, max } = payload?.xaxis ?? {}
            if (min == null || max == null) {
              onChartRangeEventRef.current(null)
            } else {
              onChartRangeEventRef.current({ min, max })
            }
          },
          scrolled: (_chart, payload) => {
            const { min, max } = payload?.xaxis ?? {}
            if (min != null && max != null) {
              onChartRangeEventRef.current({ min, max })
            }
          },
          beforeResetZoom: () => {
            onChartRangeEventRef.current(null)
          },
        },
      },
      colors: [
        ...visibleMetricKeys.map((metricKey) => metricConfig[metricKey].color),
        ...(hasScoreSeries ? [scoreSeriesColor] : []),
      ],
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
      stroke: {
        curve: [
          ...visibleMetricKeys.map(() => "smooth" as const),
          ...(hasScoreSeries ? ["stepline" as const] : []),
        ],
        width: 2.5,
      },
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
            if (seriesName === "Overall Score")
              return `${Math.round(Number(value))}`
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
    [hasScoreSeries, metricConfig, visibleMetricKeys, yRange]
  )

  const chartInstanceRef = useApexChart(
    chartContainerRef,
    chartOptions,
    renderedSeries,
    visibleSeries.length > 0
  )

  const trendBounds = useMemo(() => {
    let min = Number.POSITIVE_INFINITY
    let max = 0
    for (const series of visibleSeries) {
      for (const point of series.data) {
        if (point.x < min) min = point.x
        if (point.x > max) max = point.x
      }
    }
    if (!Number.isFinite(min)) return { min: 0, max: 0 }
    return { min, max }
  }, [visibleSeries])

  const applyChartRange = (
    range: GSCChartRange,
    preset: GSCRangePresetKey | null
  ) => {
    lastPresetRangeRef.current = preset ? range : null
    setActivePreset(preset)
    setAppliedRange(range)
    chartInstanceRef.current?.zoomX(range.min, range.max)
    onVisibleRangeChange(range)
  }

  const resetChartRange = () => {
    lastPresetRangeRef.current = null
    setActivePreset(null)
    setAppliedRange(null)
    skipNextRangeEventRef.current = true
    chartInstanceRef.current?.resetSeries(false, true)
    onVisibleRangeChange(null)
  }

  return (
    <Card className="mx-4 overflow-hidden bg-gradient-to-br from-card via-card to-muted/30 text-foreground sm:mx-6 lg:mx-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Performance</CardTitle>
          <CardDescription>
            {windowOverview?.trend.length
              ? `Search Console trend over the last ${windowOverview.trend.length} days`
              : "Search Console trend"}
          </CardDescription>
        </div>
        {visibleSeries.length > 0 && trendBounds.max > 0 ? (
          <GSCDateRangePicker
            activePreset={activePreset}
            appliedRange={appliedRange}
            earliestTimestamp={trendBounds.min}
            latestTimestamp={trendBounds.max}
            onCustomRangeSelect={(range) => applyChartRange(range, null)}
            onPresetSelect={(preset, range) => applyChartRange(range, preset)}
            onReset={resetChartRange}
          />
        ) : null}
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
                {hasScoreSeries ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: scoreSeriesColor }}
                    />
                    <span className="truncate text-muted-foreground">
                      Overall Score
                    </span>
                  </div>
                ) : null}
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
      if (point.y !== null && Number.isFinite(point.y)) values.push(point.y)
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
