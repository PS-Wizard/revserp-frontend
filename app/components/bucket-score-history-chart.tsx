"use client"

import { memo, useMemo, useState } from "react"

import {
  EChartsAreaChart,
  type ChartConfig,
} from "~/components/evilcharts/charts/echarts-area-chart"
import type { CrawlResponse } from "~/lib/api.types"
import { formatBucketLabel } from "~/lib/utils"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { cn } from "~/lib/utils"
import {
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

const axisDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})

function formatAxisDate(timestamp: number) {
  return axisDateFormatter.format(new Date(timestamp))
}

export const BucketScoreHistoryChart = memo(function BucketScoreHistoryChart({
  crawlBreakdowns,
  pillarId,
}: {
  activeProjectName?: string
  crawlBreakdowns: CrawlBreakdown[]
  pillarId: string
  title: string
}) {
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null)

  const buckets = useMemo(
    () =>
      crawlBreakdowns[0]?.breakdown.pillars.find((p) => p.id === pillarId)
        ?.buckets ?? [],
    [crawlBreakdowns, pillarId]
  )

  const chartRows = useMemo(() => {
    return [...crawlBreakdowns].reverse().map(({ crawl, breakdown }) => {
      const pillar = breakdown.pillars.find((p) => p.id === pillarId)
      const timestamp = new Date(
        crawl.completed_at ?? crawl.created_at
      ).getTime()
      const row: Record<string, number | string | null> = {
        timestamp,
        date: formatAxisDate(timestamp),
      }
      for (const bucket of buckets) {
        row[bucket.id] =
          pillar?.buckets.find((b) => b.id === bucket.id)?.score ?? null
      }
      return row
    })
  }, [crawlBreakdowns, pillarId, buckets])

  const bucketIds = useMemo(() => buckets.map((bucket) => bucket.id), [buckets])

  const yRange = useMemo(
    () =>
      getScoreRange(
        chartRows as Array<Record<string, number | null>>,
        bucketIds
      ),
    [chartRows, bucketIds]
  )

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {}
    for (const [index, bucket] of buckets.entries()) {
      const color = getPillarChartColor(pillarId, index)
      config[bucket.id] = {
        label: formatBucketLabel(
          bucket.id,
          bucket.label.replace(/^bucket_/, "")
        ),
        colors: { light: [color], dark: [color] },
      }
    }
    return config
  }, [buckets, pillarId])

  const chartPlotHeight = 300

  const hasData = chartRows.length > 0 && buckets.length > 0
  const latestRow = hasData ? chartRows[chartRows.length - 1] : null

  const bucketLegend = hasData ? (
    <div className="px-6 pt-8 sm:pt-10">
      <div className="flex flex-wrap justify-center lg:flex-nowrap">
        {buckets.map((bucket, index) => {
          const color = getPillarChartColor(pillarId, index)
          const label = formatBucketLabel(
            bucket.id,
            bucket.label.replace(/^bucket_/, "")
          )
          const isDimmed =
            selectedBucketId !== null && selectedBucketId !== bucket.id
          const latest = latestRow?.[bucket.id]
          const latestScore =
            typeof latest === "number" ? Math.round(latest) : null

          const isSelected = selectedBucketId === bucket.id

          return (
            <button
              key={bucket.id}
              type="button"
              title={label}
              aria-pressed={isSelected}
              onClick={() =>
                setSelectedBucketId((prev) =>
                  prev === bucket.id ? null : bucket.id
                )
              }
              className={cn(
                "flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-md py-1.5 text-center transition-opacity duration-150",
                "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                buckets.length <= 2
                  ? "w-1/2 px-2 sm:px-3"
                  : buckets.length === 3
                    ? "w-1/3 px-2 sm:px-3"
                    : "w-1/2 px-2 sm:w-1/3 sm:px-3",
                "lg:flex-1 lg:px-2",
                index > 0 && "border-l border-border",
                isDimmed && "opacity-40"
              )}
            >
              <div className="flex max-w-full min-w-0 items-center justify-center gap-1.5 text-xs font-medium text-foreground">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{label}</span>
              </div>
              <div className="leading-none">
                <span className="text-base font-medium tracking-tight text-foreground sm:text-lg lg:text-xl">
                  {latestScore ?? "—"}
                </span>
                {latestScore !== null ? (
                  <span className="ml-0.5 text-xs font-light text-muted-foreground sm:text-sm">
                    %
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  ) : null

  const chartBody = !hasData ? (
    <div
      className="flex w-full items-center justify-center text-sm text-muted-foreground"
      style={{ minHeight: chartPlotHeight }}
    >
      No completed bucket history yet.
    </div>
  ) : (
    <div className="w-full">
      <div style={{ height: chartPlotHeight }}>
        <EChartsAreaChart
          data={chartRows}
          config={chartConfig}
          xDataKey="date"
          className="h-full w-full"
          curveType="monotone"
          enableHoverHighlight
          selectedDataKey={selectedBucketId}
          onSelectionChange={setSelectedBucketId}
          chartOptions={{
            grid: { left: 24, right: 24, top: 8, bottom: 28 },
            yAxis: {
              type: "value",
              show: false,
              scale: true,
              min: yRange.min,
              max: yRange.max,
              boundaryGap: ["14%", "18%"],
            },
          }}
        >
          <EChartsAreaChart.Grid />
          <EChartsAreaChart.XAxis dataKey="date" />
          <EChartsAreaChart.YAxis />
          <EChartsAreaChart.Tooltip variant="default" />
          {buckets.map((bucket) => (
            <EChartsAreaChart.Area
              key={bucket.id}
              dataKey={bucket.id}
              variant="lines"
              strokeVariant="solid"
              strokeWidth={2.5}
              isClickable
            >
              <EChartsAreaChart.Dot variant="border" />
              <EChartsAreaChart.ActiveDot variant="default" />
            </EChartsAreaChart.Area>
          ))}
        </EChartsAreaChart>
      </div>
      {bucketLegend}
    </div>
  )

  return (
    <section className="w-full min-w-0">{chartBody}</section>
  )
})
