"use client"

import { memo, useMemo, useRef } from "react"

import type { ApexOptions } from "apexcharts"

import type {
  CrawlResponse,
  ScoreBreakdownBucketResponse,
} from "~/lib/api.types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { useApexChart } from "~/hooks/use-apex-chart"
import { isNumber } from "~/components/trend-sparkline"
import { formatBucketLabel } from "~/lib/utils"
import { getPillarChartColor } from "~/lib/pillar-colors"

type CrawlBreakdown = {
  crawl: CrawlResponse
  breakdown: {
    pillars: Array<{ id: string; buckets: ScoreBreakdownBucketResponse[] }>
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

  const yRange = useMemo(() => {
    const values: number[] = []
    for (const row of chartRows) {
      for (const bucket of buckets) {
        const value = row[bucket.id]
        if (isNumber(value)) {
          values.push(value)
        }
      }
    }
    if (!values.length) return { min: 0, max: 100 }
    const min = Math.max(0, Math.floor(Math.min(...values) - 8))
    const max = Math.min(100, Math.ceil(Math.max(...values) + 8))
    if (max - min < 18) {
      const mid = (min + max) / 2
      return {
        min: Math.max(0, Math.floor(mid - 9)),
        max: Math.min(100, Math.ceil(mid + 9)),
      }
    }
    return { min, max }
  }, [chartRows, buckets])

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
      colors: buckets.map((_, i) => getPillarChartColor(pillarId, i)),
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
    [buckets, yRange]
  )

  useApexChart(
    chartContainerRef,
    chartOptions,
    series,
    chartRows.length > 0 && buckets.length > 0
  )

  return (
    <Card className="@container/card flex h-full flex-col border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardTitle>{title} Score History</CardTitle>
        <CardDescription>
          {activeProjectName
            ? `Bucket trends for ${activeProjectName}`
            : "Bucket trends from recent completed crawls"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-2 pt-2 sm:px-6">
        {chartRows.length === 0 || buckets.length === 0 ? (
          <div className="flex min-h-[340px] w-full items-center justify-center text-sm text-muted-foreground">
            No completed bucket history yet.
          </div>
        ) : (
          <>
            <div className="min-h-[340px] w-full" ref={chartContainerRef} />
            <div className="mt-auto flex justify-center">
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
                      {formatBucketLabel(
                        bucket.id,
                        bucket.label.replace(/^bucket_/, "")
                      )}
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

const tooltipDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatTooltipDateTime(value: number) {
  return tooltipDateTimeFormatter.format(new Date(value))
}
