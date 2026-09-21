"use client"

import { memo, useMemo, useRef, useState } from "react"
import type { ApexOptions } from "apexcharts"
import { ExternalLinkIcon, RadarIcon } from "lucide-react"

import {
  GSCDateRangePicker,
  type GSCChartRange,
  type GSCRangePresetKey,
} from "~/components/gsc-overview/gsc-date-range-picker"
import { useApexChart } from "~/hooks/use-apex-chart"
import { buttonVariants } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

import {
  dateTimestamp,
  metricConfig,
  metricOrder,
  type AnalyticsChartSeries,
  type AnalyticsMetricKey,
} from "./types"

// Google's official article for installing the Google tag on a website.
const googleTagSetupURL = "https://support.google.com/analytics/answer/15756615"

export const AnalyticsPerformanceChart = memo(
  function AnalyticsPerformanceChart({
    chartSeries,
    trend,
    hasTrend,
    visibleMetrics,
  }: {
    chartSeries: AnalyticsChartSeries[]
    trend: Array<{ date: string }>
    hasTrend: boolean
    visibleMetrics: Record<AnalyticsMetricKey, boolean>
  }) {
    const chartContainerRef = useRef<HTMLDivElement | null>(null)
    const [activePreset, setActivePreset] = useState<GSCRangePresetKey | null>(
      null
    )
    const [appliedRange, setAppliedRange] = useState<GSCChartRange | null>(null)
    const lastPresetRangeRef = useRef<GSCChartRange | null>(null)
    const visibleMetricKeys = useMemo(
      () => metricOrder.filter((key) => visibleMetrics[key]),
      [visibleMetrics]
    )
    const visibleSeries = useMemo(
      () =>
        visibleMetricKeys
          .map((key) =>
            chartSeries.find(
              (series) => series.name === metricConfig[key].seriesName
            )
          )
          .filter((series): series is AnalyticsChartSeries => Boolean(series)),
      [chartSeries, visibleMetricKeys]
    )
    const yRange = useMemo(() => {
      const values = visibleSeries.flatMap((series) =>
        series.data.flatMap((point) => (point.y == null ? [] : [point.y]))
      )
      if (!values.length) return { min: 0, max: 100 }
      const min = Math.min(...values)
      const max = Math.max(...values)
      const padding = Math.max(4, (max - min) * 0.12)
      return {
        min: Math.max(0, Math.floor(min - padding)),
        max: Math.ceil(max + padding),
      }
    }, [visibleSeries])
    const rangeEvent = (range: GSCChartRange | null) => {
      const preset = lastPresetRangeRef.current
      const matchesPreset =
        range &&
        preset &&
        Math.abs(range.min - preset.min) < 1000 &&
        Math.abs(range.max - preset.max) < 1000
      if (!matchesPreset) {
        lastPresetRangeRef.current = null
        setActivePreset(null)
      }
      setAppliedRange(range)
    }
    const rangeEventRef = useRef(rangeEvent)
    rangeEventRef.current = rangeEvent
    const options = useMemo<ApexOptions>(
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
              rangeEventRef.current(
                min == null || max == null ? null : { min, max }
              )
            },
            scrolled: (_chart, payload) => {
              const { min, max } = payload?.xaxis ?? {}
              if (min != null && max != null)
                rangeEventRef.current({ min, max })
            },
            beforeResetZoom: () => rangeEventRef.current(null),
          },
        },
        colors: visibleMetricKeys.map((key) => metricConfig[key].color),
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
          curve: visibleMetricKeys.map(() => "smooth" as const),
          width: 2.5,
        },
        theme: { mode: "dark" },
        tooltip: {
          theme: "dark",
          shared: true,
          x: {
            formatter: (value) =>
              tooltipDateFormatter.format(new Date(Number(value))),
          },
          y: {
            formatter: (value, context) => {
              const series = context?.w?.config?.series as
                Array<{ name?: string }> | undefined
              return series?.[context?.seriesIndex ?? -1]?.name ===
                "Engagement rate"
                ? `${Number(value).toFixed(2)}%`
                : new Intl.NumberFormat("en-US").format(Number(value))
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
            formatter: (value) =>
              new Intl.NumberFormat("en-US").format(Number(value)),
          },
        },
      }),
      [visibleMetricKeys, yRange]
    )
    const chart = useApexChart(
      chartContainerRef,
      options,
      visibleSeries,
      visibleSeries.length > 0
    )
    const bounds = useMemo(() => {
      const dates = trend.map((row) => dateTimestamp(row.date))
      return { min: Math.min(...dates), max: Math.max(...dates) }
    }, [trend])
    const applyRange = (
      range: GSCChartRange,
      preset: GSCRangePresetKey | null
    ) => {
      lastPresetRangeRef.current = preset ? range : null
      setActivePreset(preset)
      setAppliedRange(range)
      chart.current?.zoomX(range.min, range.max)
    }
    const resetRange = () => {
      lastPresetRangeRef.current = null
      setActivePreset(null)
      setAppliedRange(null)
      chart.current?.resetSeries(false, true)
    }
    return (
      <Card className="mx-4 overflow-hidden bg-gradient-to-br from-card via-card to-muted/30 sm:mx-6 lg:mx-4">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Performance</CardTitle>
            {hasTrend ? (
              <CardDescription>
                {`Google Analytics trend over the last ${trend.length} days`}
              </CardDescription>
            ) : null}
          </div>
          {visibleSeries.length && bounds.max > 0 ? (
            <GSCDateRangePicker
              activePreset={activePreset}
              appliedRange={appliedRange}
              earliestTimestamp={bounds.min}
              latestTimestamp={bounds.max}
              onCustomRangeSelect={(range) => applyRange(range, null)}
              onPresetSelect={(preset, range) => applyRange(range, preset)}
              onReset={resetRange}
            />
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col px-2 pt-2 sm:px-6">
          <div className="relative">
            <div
              aria-hidden={hasTrend ? undefined : true}
              className={cn("min-h-[360px] w-full", !hasTrend && "blur-sm")}
              ref={chartContainerRef}
            />
            {hasTrend ? null : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <span className="flex size-12 items-center justify-center rounded-full border border-border/60 bg-background/80 shadow-sm backdrop-blur-sm">
                  <RadarIcon
                    aria-hidden="true"
                    className="size-5 text-muted-foreground"
                  />
                </span>
                <div className="max-w-sm">
                  <p className="text-sm font-medium text-foreground">
                    Not enough data for a trend yet
                  </p>
                  <p className="pt-1.5 text-xs text-balance text-muted-foreground">
                    {trend.length
                      ? "This property has one day of hits so far. The chart appears once a second day of data arrives."
                      : "This property has no hits yet. The chart appears once a day of data arrives."}
                  </p>
                </div>
                <a
                  className={cn(
                    buttonVariants({ size: "sm", variant: "outline" })
                  )}
                  href={googleTagSetupURL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Set up the Google tag
                  <ExternalLinkIcon aria-hidden="true" data-icon="inline-end" />
                </a>
              </div>
            )}
          </div>
          {hasTrend ? (
            <div className="mt-auto flex justify-center">
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                {visibleMetricKeys.map((key) => (
                  <div className="flex items-center gap-2" key={key}>
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: metricConfig[key].color }}
                    />
                    <span className="truncate text-muted-foreground">
                      {metricConfig[key].label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    )
  }
)

const tooltipDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})
