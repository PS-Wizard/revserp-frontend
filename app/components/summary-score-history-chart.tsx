"use client"

import { memo, useMemo, useRef } from "react"

import type { ApexOptions } from "apexcharts"

import type { CrawlResponse } from "~/lib/api.types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { useApexChart } from "~/hooks/use-apex-chart"
import { getCrawlTimestamp } from "~/lib/crawl"
import { getPillarChartColor } from "~/lib/pillar-colors"
import {
  formatTooltipDateTime,
  getScoreRange,
} from "~/components/score-history-chart-utils"

const SCORE_SERIES = [
  { key: "overall", label: "Overall", color: "rgba(255,255,255,0.50)" },
  { key: "seo", label: "SEO", color: getPillarChartColor("seo", 0) },
  { key: "aeo", label: "AEO", color: getPillarChartColor("aeo", 0) },
  {
    key: "pagespeed",
    label: "PageSpeed",
    color: getPillarChartColor("pagespeed", 0),
  },
] as const

const SCORE_SERIES_KEYS = SCORE_SERIES.map((scoreSeries) => scoreSeries.key)

export const SummaryScoreHistoryChart = memo(function SummaryScoreHistoryChart({
  activeProjectName,
  crawls,
}: {
  activeProjectName?: string
  crawls: CrawlResponse[]
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null)

  const chartRows = useMemo(
    () =>
      [...crawls]
        .sort(
          (left, right) => getCrawlTimestamp(left) - getCrawlTimestamp(right)
        )
        .map((crawl) => ({
          timestamp: new Date(crawl.completed_at ?? crawl.created_at).getTime(),
          overall: crawl.overall_score ?? null,
          seo: crawl.seo_score ?? null,
          aeo: crawl.aeo_score ?? null,
          pagespeed: crawl.pagespeed_score ?? null,
        })),
    [crawls]
  )

  const series = useMemo(
    () =>
      SCORE_SERIES.map((scoreSeries) => ({
        name: scoreSeries.label,
        data: chartRows.map((row) => ({
          x: row.timestamp,
          y: row[scoreSeries.key],
        })),
      })),
    [chartRows]
  )
  const yRange = useMemo(
    () => getScoreRange(chartRows, SCORE_SERIES_KEYS),
    [chartRows]
  )

  const chartOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "area",
        height: 340,
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
      colors: SCORE_SERIES.map((scoreSeries) => scoreSeries.color),
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
        x: { formatter: (value) => formatTooltipDateTime(Number(value)) },
        y: { formatter: (value) => `${Math.round(Number(value))}%` },
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
          formatter: (value) => `${Math.round(Number(value))}%`,
        },
      },
    }),
    [yRange]
  )

  useApexChart(chartContainerRef, chartOptions, series, chartRows.length > 0)

  return (
    <Card className="@container/card flex h-full flex-col bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardTitle>Score History</CardTitle>
        <CardDescription>
          {activeProjectName
            ? `Recent completed crawls for ${activeProjectName}`
            : "Recent completed crawls"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-2 pt-2 sm:px-6">
        {chartRows.length === 0 ? (
          <div className="flex min-h-[340px] w-full items-center justify-center text-sm text-muted-foreground">
            No completed crawl history yet.
          </div>
        ) : (
          <>
            <div className="min-h-[340px] w-full" ref={chartContainerRef} />
            <div className="mt-auto flex justify-center">
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                {SCORE_SERIES.map((scoreSeries) => (
                  <div
                    className="flex items-center gap-2"
                    key={scoreSeries.key}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: scoreSeries.color }}
                    />
                    <span className="truncate text-muted-foreground">
                      {scoreSeries.label}
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

