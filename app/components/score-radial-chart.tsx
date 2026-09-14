"use client"

import { memo, useEffect, useMemo, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart"
import { cn } from "~/lib/utils"
export type ScoreRadialSegment = {
  key: string
  label: string
  value?: number | null
  color?: string
  contribution?: number | null
}

const DEFAULT_CHART_SIZE = 250
const DEFAULT_INNER_RADIUS = 34
const DEFAULT_OUTER_RADIUS = 108

type ScoreRadialChartProps = {
  centerLabel?: string
  centerValue?: number | null
  chartSize?: number
  description?: string
  /** Skip the Card chrome so this chart can sit inside another card. */
  embed?: boolean
  onSelect?: () => void
  selectLabel?: string
  segments: ScoreRadialSegment[]
  title: string
}

export const ScoreRadialChart = memo(function ScoreRadialChart({
  centerValue,
  chartSize = DEFAULT_CHART_SIZE,
  description,
  embed = false,
  onSelect,
  selectLabel,
  segments,
  title,
}: ScoreRadialChartProps) {
  const [rechartsComponents, setRechartsComponents] = useState<{
    PolarAngleAxis: React.ComponentType<any>
    PolarGrid: React.ComponentType<any>
    RadialBar: React.ComponentType<any>
    RadialBarChart: React.ComponentType<any>
  } | null>(null)

  useEffect(() => {
    import("recharts").then((m) => {
      setRechartsComponents({
        PolarAngleAxis: m.PolarAngleAxis,
        PolarGrid: m.PolarGrid,
        RadialBar: m.RadialBar,
        RadialBarChart: m.RadialBarChart,
      })
    })
  }, [])

  const chartData = useMemo(() => buildChartData(segments), [segments])
  const chartConfig = useMemo(() => buildChartConfig(chartData), [chartData])
  const legendMinHeight = chartData.length > 0 ? chartData.length * 28 : 0
  const scale = chartSize / DEFAULT_CHART_SIZE
  const innerRadius = Math.round(DEFAULT_INNER_RADIUS * scale)
  const outerRadius = Math.round(DEFAULT_OUTER_RADIUS * scale)
  const compact = chartSize < 200
  const chartBoxStyle = { height: chartSize, width: chartSize }

  const body = (
    <>
      {chartData.length === 0 ? (
        <div
          className="relative mx-auto flex shrink-0 items-center justify-center"
          style={chartBoxStyle}
        >
          {typeof centerValue === "number" && Number.isFinite(centerValue) ? (
            <ScoreCenter value={centerValue} compact={compact} />
          ) : (
            <span className="text-sm text-muted-foreground">
              No score data yet.
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="relative mx-auto shrink-0" style={chartBoxStyle}>
            {!rechartsComponents ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading chart...
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-full w-full">
                <rechartsComponents.RadialBarChart
                  data={chartData}
                  innerRadius={innerRadius}
                  outerRadius={outerRadius}
                >
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        nameKey="key"
                        formatter={(value, _name, _item, _index, payload) => {
                          const label = getTooltipLabel(payload)
                          const contribution = getTooltipContribution(payload)

                          return (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  {label}
                                </span>
                                <span className="font-mono font-medium text-foreground tabular-nums">
                                  {typeof value === "number"
                                    ? `${value}%`
                                    : String(value)}
                                </span>
                              </div>
                              {typeof contribution === "number" &&
                              Number.isFinite(contribution) ? (
                                <div className="text-xs text-muted-foreground/70">
                                  Contributes: {contribution}%
                                </div>
                              ) : null}
                            </div>
                          )
                        }}
                      />
                    }
                  />
                  <rechartsComponents.PolarAngleAxis
                    type="number"
                    domain={[0, 100]}
                    tick={false}
                    axisLine={false}
                  />
                  <rechartsComponents.PolarGrid
                    gridType="circle"
                    radialLines={false}
                  />
                  <rechartsComponents.RadialBar background dataKey="value" />
                </rechartsComponents.RadialBarChart>
              </ChartContainer>
            )}
            {typeof centerValue === "number" && Number.isFinite(centerValue) ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <ScoreCenter value={centerValue} compact={compact} />
              </div>
            ) : null}
          </div>
          <div
            className="mt-auto grid shrink-0 gap-2 text-sm"
            style={{ minHeight: legendMinHeight }}
          >
            {chartData.map((segment) => (
              <div
                className="flex h-7 items-center justify-between gap-3"
                key={segment.key}
              >
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.fill }}
                  />
                  <span className="truncate">{segment.label}</span>
                </span>
                <span className="font-mono font-medium tabular-nums">
                  {segment.value}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )

  if (embed) {
    return <div className="flex flex-col gap-4">{body}</div>
  }

  return (
    <Card
      aria-label={onSelect ? (selectLabel ?? `Open ${title}`) : undefined}
      className={cn(
        "flex h-full flex-col bg-gradient-to-br from-card via-card to-muted/30",
        onSelect &&
          "cursor-pointer transition hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      )}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onSelect()
              }
            }
          : undefined
      }
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">{body}</CardContent>
    </Card>
  )
})

function ScoreCenter({ value, compact }: { value: number; compact: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full border border-border/50 bg-background/70 text-center shadow-sm backdrop-blur-sm",
        compact ? "size-16" : "size-20"
      )}
    >
      <span
        className={cn(
          "font-mono leading-none font-semibold tabular-nums",
          compact ? "text-xl" : "text-2xl"
        )}
      >
        {Math.round(value)}%
      </span>
    </div>
  )
}

function getTooltipLabel(payload: unknown) {
  if (payload && typeof payload === "object" && "label" in payload) {
    return String(payload.label)
  }

  if (payload && typeof payload === "object" && "key" in payload) {
    return String(payload.key)
  }

  return "Score"
}

function getTooltipContribution(payload: unknown) {
  if (payload && typeof payload === "object" && "contribution" in payload) {
    const contribution = (payload as { contribution?: unknown }).contribution
    return typeof contribution === "number" ? contribution : null
  }

  return null
}

function buildChartData(segments: ScoreRadialSegment[]) {
  const chartData: Array<ScoreRadialSegment & { fill: string; value: number }> =
    []

  for (const segment of segments) {
    if (typeof segment.value !== "number" || !Number.isFinite(segment.value)) {
      continue
    }

    chartData.push({
      ...segment,
      fill: segment.color ?? getChartColor(chartData.length),
      value: Math.round(segment.value),
    })
  }

  return chartData
}

function buildChartConfig(
  segments: Array<ScoreRadialSegment & { fill: string; value: number }>
) {
  return Object.fromEntries(
    segments.map((segment) => [
      segment.key,
      {
        label: segment.label,
        color: segment.fill,
      },
    ])
  ) satisfies ChartConfig
}

function getChartColor(index: number) {
  return `var(--chart-${(index % 5) + 1})`
}
