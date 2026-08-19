"use client"

import { memo, useMemo, useState } from "react"

import type { CrawlResponse, ScorePotentialResponse } from "~/lib/api.types"
import {
  EChartsAreaChart,
  type ChartConfig,
} from "~/components/evilcharts/charts/echarts-area-chart"
import { getCrawlTimestamp } from "~/lib/crawl"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { getScoreRange } from "~/components/score-history-chart-utils"
import { cn } from "~/lib/utils"

export type ScorePotentialPlanId = "best_bucket" | "top_3" | "recommended"

export const SCORE_POTENTIAL_PLANS: ReadonlyArray<{
  id: ScorePotentialPlanId
  label: string
}> = [
  { id: "best_bucket", label: "Best bucket" },
  { id: "top_3", label: "Top 3" },
  { id: "recommended", label: "Recommended" },
]

type AvailablePotential = Extract<
  ScorePotentialResponse,
  { potential_available: true }
>

const SCORE_SERIES = [
  { key: "overall", label: "Overall", color: "rgba(255,255,255,0.55)" },
  { key: "seo", label: "SEO", color: getPillarChartColor("seo", 0) },
  { key: "aeo", label: "AEO", color: getPillarChartColor("aeo", 0) },
  {
    key: "pagespeed",
    label: "PageSpeed",
    color: getPillarChartColor("pagespeed", 0),
  },
] as const

const SCORE_SERIES_KEYS = SCORE_SERIES.map((series) => series.key)

// Keep the history window readable — the projection tail needs room to breathe
// and older crawls add noise to a "what to do next" screen.
const HISTORY_LIMIT = 12

const axisDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})

function formatAxisDate(timestamp: number) {
  return axisDateFormatter.format(new Date(timestamp))
}

function useChartRows(
  crawls: CrawlResponse[],
  potential: AvailablePotential | null,
  activePlan: ScorePotentialPlanId | null
) {
  return useMemo(() => {
    const ascending = [...crawls]
      .filter((crawl) => crawl.status === "completed")
      .sort((left, right) => getCrawlTimestamp(left) - getCrawlTimestamp(right))
      .slice(-HISTORY_LIMIT)

    const historyRows: Array<Record<string, number | string | null>> =
      ascending.map((crawl) => ({
        label: formatAxisDate(getCrawlTimestamp(crawl)),
        overall: crawl.overall_score ?? null,
        seo: crawl.seo_score ?? null,
        aeo: crawl.aeo_score ?? null,
        pagespeed: crawl.pagespeed_score ?? null,
      }))

    if (!potential)
      return { historyRows, chartRows: historyRows, bufferSegments: 0 }

    const activeIndex = SCORE_POTENTIAL_PLANS.findIndex(
      (plan) => plan.id === activePlan
    )
    const chartRows = [...historyRows]
    SCORE_POTENTIAL_PLANS.forEach((plan, planIndex) => {
      const scenario = potential.scenarios[plan.id]
      const withinPlan = activeIndex >= planIndex
      chartRows.push({
        label: plan.label,
        overall: withinPlan ? scenario.scores_if_fixed.overall : null,
        seo: withinPlan ? scenario.scores_if_fixed.seo : null,
        aeo: withinPlan ? scenario.scores_if_fixed.aeo : null,
        pagespeed: withinPlan ? scenario.scores_if_fixed.pagespeed : null,
      })
    })

    return {
      historyRows,
      chartRows,
      // The dashed tail spans from the last crawl to the active plan: one
      // segment per plan point (Best bucket → Top 3 → Recommended).
      bufferSegments: activeIndex + 1,
    }
  }, [crawls, potential, activePlan])
}

export const PotentialScoreChart = memo(function PotentialScoreChart({
  crawls,
  potential,
  isLoading,
  activePlan,
}: {
  crawls: CrawlResponse[]
  potential: AvailablePotential | null
  isLoading: boolean
  activePlan: ScorePotentialPlanId | null
}) {
  const [selectedDataKey, setSelectedDataKey] = useState<string | null>(null)
  const [showPotential, setShowPotential] = useState(true)

  const { historyRows, chartRows, bufferSegments } = useChartRows(
    crawls,
    potential ? (showPotential ? potential : null) : null,
    activePlan
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
        chartRows as Array<Record<string, number | null>>,
        SCORE_SERIES_KEYS
      ),
    [chartRows]
  )

  const hasData = historyRows.length > 0
  const latestHistoryRow = historyRows[historyRows.length - 1]

  // Hide plan axis labels that the projection line does not reach yet (the
  // tail stops at the active plan; plans beyond it are "next", not drawn).
  const tickFormatter = (value: string, index: number) => {
    if (index < historyRows.length) return value
    const planIndex = index - historyRows.length
    if (potential && showPotential && activePlan) {
      const activeIndex = SCORE_POTENTIAL_PLANS.findIndex(
        (plan) => plan.id === activePlan
      )
      return planIndex <= activeIndex ? value : ""
    }
    return ""
  }

  const readout = useMemo(() => {
    if (!potential || !showPotential || !activePlan) return null
    const scenario = potential.scenarios[activePlan]
    const baseline = potential.current.overall
    const delta = scenario.delta.overall
    const fixCount = scenario.buckets.length
    return {
      planLabel:
        SCORE_POTENTIAL_PLANS.find((plan) => plan.id === activePlan)?.label ??
        "Plan",
      baseline,
      projected: scenario.scores_if_fixed.overall,
      delta,
      fixCount,
    }
  }, [potential, showPotential, activePlan])

  return (
    <div className="w-full min-w-0">
      <div className="w-full">
        <div style={{ height: 300 }}>
          <EChartsAreaChart
            data={chartRows}
            config={chartConfig}
            xDataKey="label"
            className="h-full w-full"
            curveType="monotone"
            enableHoverHighlight
            selectedDataKey={selectedDataKey}
            onSelectionChange={setSelectedDataKey}
            isLoading={isLoading}
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
            <EChartsAreaChart.XAxis
              dataKey="label"
              tickFormatter={tickFormatter}
            />
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
                enableBufferLine={bufferSegments}
              >
                <EChartsAreaChart.Dot variant="border" />
                <EChartsAreaChart.ActiveDot variant="default" />
              </EChartsAreaChart.Area>
            ))}
          </EChartsAreaChart>
        </div>
      </div>

      {hasData && (
        <div className="px-6 pt-8 sm:pt-10">
          <div className="flex flex-wrap justify-center lg:flex-nowrap">
            {SCORE_SERIES.map((series) => {
              const isDimmed =
                selectedDataKey !== null && selectedDataKey !== series.key
              const latestScore = latestHistoryRow?.[series.key]
              const latest =
                typeof latestScore === "number" ? Math.round(latestScore) : null
              const isSelected = selectedDataKey === series.key

              return (
                <button
                  key={series.key}
                  type="button"
                  title={series.label}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelectedDataKey((prev) =>
                      prev === series.key ? null : series.key
                    )
                  }
                  className={cn(
                    "flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-md py-1.5 text-center transition-opacity duration-150",
                    "hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                    "w-1/2 px-2 sm:w-1/4 lg:flex-1 lg:px-2",
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
                      {latest ?? "—"}
                    </span>
                    {latest !== null ? (
                      <span className="ml-0.5 text-xs font-light text-muted-foreground sm:text-sm">
                        %
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })}

            {potential ? (
              <button
                type="button"
                aria-pressed={showPotential}
                title="Toggle the projected scores"
                onClick={() => setShowPotential((show) => !show)}
                className={cn(
                  "flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-2 py-1.5 text-center transition-opacity duration-150",
                  "hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                  showPotential ? "opacity-100" : "opacity-50"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-0 w-4 shrink-0 border-t-2 border-dashed border-muted-foreground/70" />
                  <span className="truncate">Potential</span>
                </div>
                <div className="leading-none" aria-hidden="true">
                  <span className="text-base font-light text-muted-foreground/70 sm:text-lg">
                    {readout ? `→ ${readout.projected}%` : "—"}
                  </span>
                </div>
              </button>
            ) : null}
          </div>

          {readout ? (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              {readout.planLabel}: Overall{" "}
              <span className="font-medium text-foreground/80 tabular-nums">
                {readout.baseline}
              </span>{" "}
              →{" "}
              <span className="font-medium text-foreground/80 tabular-nums">
                {readout.projected}
              </span>{" "}
              ({readout.delta >= 0 ? "+" : ""}
              {readout.delta} overall) · {readout.fixCount}{" "}
              {readout.fixCount === 1 ? "fix" : "fixes"}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
})
