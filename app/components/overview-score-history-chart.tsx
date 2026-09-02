"use client"

import { memo, useMemo, useState } from "react"

import {
  EChartsAreaChart,
  type ChartConfig,
} from "~/components/evilcharts/charts/echarts-area-chart"
import { getScoreRange } from "~/components/score-history-chart-utils"
import { cn } from "~/lib/utils"
import type { CrawlResponse } from "~/lib/api.types"
import { getCrawlTimestamp } from "~/lib/crawl"
import { getPillarChartColor } from "~/lib/pillar-colors"

const SCORE_SERIES = [
  {
    key: "overall",
    label: "Overall Score",
    color: "rgba(255,255,255,0.55)",
  },
  { key: "seo", label: "SEO Score", color: getPillarChartColor("seo", 0) },
  { key: "aeo", label: "AEO Score", color: getPillarChartColor("aeo", 0) },
  {
    key: "pagespeed",
    label: "PageSpeed Score",
    color: getPillarChartColor("pagespeed", 0),
  },
] as const

const SCORE_SERIES_KEYS = SCORE_SERIES.map((series) => series.key)

const axisDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})

function formatAxisDate(timestamp: number) {
  return axisDateFormatter.format(new Date(timestamp))
}

export const OverviewScoreHistoryChart = memo(
  function OverviewScoreHistoryChart({ crawls }: { crawls: CrawlResponse[] }) {
    const [selectedDataKey, setSelectedDataKey] = useState<string | null>(null)

    const chartRows = useMemo(
      () =>
        [...crawls]
          .filter((crawl) => crawl.status === "completed")
          .sort(
            (left, right) => getCrawlTimestamp(left) - getCrawlTimestamp(right)
          )
          .map((crawl) => ({
            label: formatAxisDate(getCrawlTimestamp(crawl)),
            overall: crawl.overall_score ?? null,
            seo: crawl.seo_score ?? null,
            aeo: crawl.aeo_score ?? null,
            pagespeed: crawl.pagespeed_score ?? null,
          })),
      [crawls]
    )

    const chartConfig = useMemo(() => {
      const config: ChartConfig = {}
      for (const series of SCORE_SERIES) {
        config[series.key] = {
          label: series.label,
          colors: { light: [series.color], dark: [series.color] },
        }
      }
      return config
    }, [])

    const yRange = useMemo(
      () =>
        getScoreRange(
          chartRows as unknown as Array<Record<string, number | null>>,
          SCORE_SERIES_KEYS
        ),
      [chartRows]
    )

    const chartPlotHeight = 300
    const hasData = chartRows.length > 0
    const latestRow = hasData ? chartRows[chartRows.length - 1] : null

    const scoreLegend = hasData ? (
      <div className="px-6 pt-8 sm:pt-10">
        <div className="flex flex-wrap justify-center lg:flex-nowrap">
          {SCORE_SERIES.map((series, index) => {
            const isDimmed =
              selectedDataKey !== null && selectedDataKey !== series.key
            const latest = latestRow?.[series.key]
            const latestScore =
              typeof latest === "number" ? Math.round(latest) : null
            const isSelected = selectedDataKey === series.key

            return (
              <button
                key={series.key}
                type="button"
                title={series.label}
                aria-pressed={isSelected}
                onClick={() =>
                  setSelectedDataKey((previousKey) =>
                    previousKey === series.key ? null : series.key
                  )
                }
                className={cn(
                  "flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-md py-1.5 text-center transition-opacity duration-150",
                  "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "w-1/2 px-2 sm:w-1/4 sm:px-3 lg:flex-1 lg:px-2",
                  index > 0 && "border-l border-border",
                  isDimmed && "opacity-40"
                )}
              >
                <div className="flex max-w-full min-w-0 items-center justify-center gap-1.5 text-xs font-medium text-foreground">
                  <span
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: series.color }}
                  />
                  <span className="truncate">{series.label}</span>
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

    return (
      <section className="w-full min-w-0">
        {hasData ? (
          <div className="w-full">
            <div style={{ height: chartPlotHeight }}>
              <EChartsAreaChart
                data={chartRows}
                config={chartConfig}
                xDataKey="label"
                className="h-full w-full"
                curveType="monotone"
                enableHoverHighlight
                selectedDataKey={selectedDataKey}
                onSelectionChange={setSelectedDataKey}
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
                <EChartsAreaChart.XAxis dataKey="label" />
                <EChartsAreaChart.YAxis />
                <EChartsAreaChart.Tooltip variant="default" />
                {SCORE_SERIES.map((series) => (
                  <EChartsAreaChart.Area
                    key={series.key}
                    dataKey={series.key}
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
            {scoreLegend}
          </div>
        ) : (
          <div
            className="flex w-full items-center justify-center text-sm text-muted-foreground"
            style={{ minHeight: chartPlotHeight }}
          >
            No completed crawl history yet.
          </div>
        )}
      </section>
    )
  }
)
