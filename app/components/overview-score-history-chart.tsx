"use client"

import { memo, useMemo, useState } from "react"

import {
  EChartsAreaChart,
  type ChartConfig,
} from "~/components/evilcharts/charts/echarts-area-chart"
import { getScoreRange } from "~/components/score-history-chart-utils"
import {
  TrendBadge,
  TrendSparkline,
  getRoundedDelta,
  getTrendLabel,
  getTrendSummary,
} from "~/components/trend-sparkline"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import type { CrawlResponse } from "~/lib/api.types"
import { getCrawlTimestamp } from "~/lib/crawl"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { cn } from "~/lib/utils"

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

    const scoreCards = useMemo(
      () =>
        SCORE_SERIES.map((series) => {
          const values = chartRows.map((row) => row[series.key] ?? undefined)

          return {
            ...series,
            value: values.at(-1),
            previousValue: values.length > 1 ? values.at(-2) : undefined,
            values,
          }
        }),
      [chartRows]
    )

    const chartPlotHeight = 300
    const hasData = chartRows.length > 0

    return (
      <section className="mx-4 min-w-0 overflow-hidden rounded-xl border border-border bg-card lg:mx-6 dark:bg-[#101214]">
        {hasData ? (
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
        ) : (
          <div
            className="flex w-full items-center justify-center text-sm text-muted-foreground"
            style={{ minHeight: chartPlotHeight }}
          >
            No completed crawl history yet.
          </div>
        )}

        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2 lg:grid-cols-4">
          {scoreCards.map((card) => {
            const delta = getRoundedDelta(card.value, card.previousValue)
            const isSelected = selectedDataKey === card.key
            const isDimmed =
              selectedDataKey !== null && selectedDataKey !== card.key

            const trendLabel =
              card.value === undefined
                ? "Waiting for crawl data"
                : card.previousValue === undefined
                  ? "No prior crawl to compare"
                  : getTrendLabel(delta)
            const trendSummary = getTrendSummary(card.previousValue, card.value)

            return (
              <Card
                key={card.key}
                className={cn(
                  "@container/card relative min-h-[178px] rounded-none border-0 bg-card text-left shadow-none transition-[opacity,filter] duration-150 hover:brightness-110 dark:bg-[linear-gradient(to_bottom,#101214_0%,#101214_50%,var(--card)_100%)]",
                  "has-focus-visible:z-20 has-focus-visible:ring-2 has-focus-visible:ring-ring/60 has-focus-visible:ring-inset",
                  isSelected && "brightness-110",
                  isDimmed && "opacity-40"
                )}
              >
                <button
                  type="button"
                  title={card.label}
                  aria-label={`${card.label}: ${card.value === undefined ? "no score" : `${Math.round(card.value)} percent`}. ${trendLabel}. ${trendSummary}. Toggle chart series.`}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelectedDataKey((previousKey) =>
                      previousKey === card.key ? null : card.key
                    )
                  }
                  className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-none"
                />
                <CardHeader className="pointer-events-none">
                  <CardDescription className="flex items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: card.color }}
                    />
                    {card.label}
                  </CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {card.value === undefined
                      ? "—"
                      : `${Math.round(card.value)}%`}
                  </CardTitle>
                  {delta !== null ? <TrendBadge delta={delta} /> : null}
                </CardHeader>
                <CardFooter className="pointer-events-none mt-auto flex items-end justify-between gap-4 text-sm">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="font-medium">{trendLabel}</div>
                    <div className="text-muted-foreground">{trendSummary}</div>
                  </div>
                  <TrendSparkline values={card.values} trend={delta} />
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </section>
    )
  }
)
