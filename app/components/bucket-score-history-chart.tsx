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
import { formatBucketLabel } from "~/lib/utils"
import { getPillarChartColor } from "~/lib/pillar-colors"
import {
  formatTooltipDateTime,
  getScoreRange,
} from "~/components/score-history-chart-utils"

type CrawlBreakdown = {
  crawl: CrawlResponse
  breakdown: {
    pillars: Array<{
      id: string
      buckets: Array<{ id: string; label: string; score: number }>
    }>
  }
}

export const BucketScoreHistoryChart = memo(function BucketScoreHistoryChart({
  activeProjectName,
  crawlBreakdowns,
  pillarId,
  title,
}: {
  activeProjectName?: string
  crawlBreakdowns: CrawlBreakdown[]
  pillarId: string
  title: string
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null)

  const buckets = useMemo(
    () =>
      crawlBreakdowns[0]?.breakdown.pillars.find((p) => p.id === pillarId)
        ?.buckets ?? [],
    [crawlBreakdowns, pillarId]
  )

  const chartRows: Array<Record<string, number | null>> = useMemo(() => {
    return [...crawlBreakdowns].reverse().map(({ crawl, breakdown }) => {
      const pillar = breakdown.pillars.find((p) => p.id === pillarId)
      const timestamp = new Date(
        crawl.completed_at ?? crawl.created_at
      ).getTime()
      return {
        timestamp,
        ...Object.fromEntries(
          buckets.map((bucket) => [
            bucket.id,
            pillar?.buckets.find((b) => b.id === bucket.id)?.score ?? null,
          ])
        ),
      }
    })
  }, [crawlBreakdowns, pillarId, buckets])

  const series = useMemo(
    () =>
      buckets.map((bucket, index) => ({
        name: formatBucketLabel(
          bucket.id,
          bucket.label.replace(/^bucket_/, "")
        ),
        color: getPillarChartColor(pillarId, index),
        data: chartRows.map((row) => ({ x: row.timestamp, y: row[bucket.id] })),
      })),
    [buckets, chartRows, pillarId]
  )

  const bucketIds = useMemo(() => buckets.map((bucket) => bucket.id), [buckets])

  const yRange = useMemo(
    () => getScoreRange(chartRows, bucketIds),
    [chartRows, bucketIds]
  )

  const crawlTimestamps = useMemo(
    () =>
      chartRows
        .map((row) => row.timestamp)
        .filter((timestamp): timestamp is number => typeof timestamp === "number"),
    [chartRows]
  )

  const chartOptions = useMemo<ApexOptions>(
    () => ({
      annotations: {
        xaxis: crawlTimestamps.map((timestamp) => ({
          x: timestamp,
          borderWidth: 1.5,
          strokeDashArray: 3,
          borderColor: "rgba(255,255,255,0.32)",
        })),
      },
      chart: {
        type: "line",
        height: 340,
        background: "transparent",
        parentHeightOffset: 0,
        toolbar: { show: false },
        zoom: { enabled: true, type: "x", autoScaleYaxis: true },
        animations: { speed: 300 },
      },
      colors: buckets.map((_, i) => getPillarChartColor(pillarId, i)),
      dataLabels: { enabled: false },
      fill: { opacity: 0 },
      grid: {
        borderColor: "rgba(255,255,255,0.08)",
        strokeDashArray: 4,
        padding: { bottom: 8, left: 0, right: 14, top: 0 },
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: false } },
      },
      legend: { show: false },
      stroke: { curve: "smooth", width: 3.5 },
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
          offsetY: 0,
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: {
        min: yRange.min,
        max: yRange.max,
        tickAmount: 4,
        labels: { show: false },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
    }),
    [buckets, crawlTimestamps, pillarId, yRange]
  )

  useApexChart(
    chartContainerRef,
    chartOptions,
    series,
    chartRows.length > 0 && buckets.length > 0
  )

  const description = activeProjectName
    ? `Bucket trends for ${activeProjectName}`
    : "Bucket trends from recent completed crawls"
  const emptyChartHeight = 340

  const legend = (
    <div className="flex flex-wrap justify-center gap-4 text-sm">
      {buckets.map((bucket, index) => (
        <div className="flex items-center gap-2" key={bucket.id}>
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{
              backgroundColor: getPillarChartColor(pillarId, index),
            }}
          />
          <span className="truncate text-muted-foreground">
            {formatBucketLabel(bucket.id, bucket.label.replace(/^bucket_/, ""))}
          </span>
        </div>
      ))}
    </div>
  )

  const chartBody =
    chartRows.length === 0 || buckets.length === 0 ? (
      <div
        className="flex w-full items-center justify-center text-sm text-muted-foreground"
        style={{ minHeight: emptyChartHeight }}
      >
        No completed bucket history yet.
      </div>
    ) : (
      <>
        <div
          className="w-full"
          ref={chartContainerRef}
          style={{ minHeight: emptyChartHeight }}
        />
        <div className="mt-auto flex min-h-10 justify-center pt-6">
          {legend}
        </div>
      </>
    )

  return (
    <Card className="@container/card flex h-full flex-col bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardTitle>{title} Score History</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-2 pt-2 sm:px-6">
        {chartBody}
      </CardContent>
    </Card>
  )
})

