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
export type ScoreRadialSegment = {
  key: string
  label: string
  value?: number | null
  color?: string
}

type ScoreRadialChartProps = {
  centerLabel?: string
  centerValue?: number | null
  description?: string
  segments: ScoreRadialSegment[]
  title: string
}

export const ScoreRadialChart = memo(function ScoreRadialChart({
  centerValue,
  description,
  segments,
  title,
}: ScoreRadialChartProps) {
  const [rechartsComponents, setRechartsComponents] = useState<{
    PolarGrid: React.ComponentType<any>
    RadialBar: React.ComponentType<any>
    RadialBarChart: React.ComponentType<any>
  } | null>(null)

  useEffect(() => {
    import("recharts").then((m) => {
      setRechartsComponents({
        PolarGrid: m.PolarGrid,
        RadialBar: m.RadialBar,
        RadialBarChart: m.RadialBarChart,
      })
    })
  }, [])

  const chartData = useMemo(() => buildChartData(segments), [segments])
  const chartConfig = useMemo(() => buildChartConfig(chartData), [chartData])

  return (
    <Card className="flex h-full flex-col border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center gap-4">
        {chartData.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No score data yet.
          </div>
        ) : !rechartsComponents ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            Loading chart...
          </div>
        ) : (
          <>
            <div className="relative mx-auto h-[250px] w-[250px]">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <rechartsComponents.RadialBarChart
                  data={chartData}
                  innerRadius={34}
                  outerRadius={108}
                >
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        nameKey="key"
                        formatter={(value, _name, _item, _index, payload) => {
                          const label = getTooltipLabel(payload)

                          return (
                            <>
                              <span className="text-muted-foreground">
                                {label}
                              </span>
                              <span className="font-mono font-medium text-foreground tabular-nums">
                                {typeof value === "number"
                                  ? `${value}%`
                                  : String(value)}
                              </span>
                            </>
                          )
                        }}
                      />
                    }
                  />
                  <rechartsComponents.PolarGrid
                    gridType="circle"
                    radialLines={false}
                  />
                  <rechartsComponents.RadialBar background dataKey="value" />
                </rechartsComponents.RadialBarChart>
              </ChartContainer>
              {typeof centerValue === "number" &&
              Number.isFinite(centerValue) ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex size-20 items-center justify-center rounded-full border border-border/50 bg-background/70 text-center shadow-sm backdrop-blur-sm">
                    <span className="font-mono text-2xl leading-none font-semibold tabular-nums">
                      {Math.round(centerValue)}%
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="grid gap-2 text-sm">
              {chartData.map((segment) => (
                <div
                  className="flex items-center justify-between gap-3"
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
      </CardContent>
    </Card>
  )
})

function getTooltipLabel(payload: unknown) {
  if (payload && typeof payload === "object" && "label" in payload) {
    return String(payload.label)
  }

  if (payload && typeof payload === "object" && "key" in payload) {
    return String(payload.key)
  }

  return "Score"
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
