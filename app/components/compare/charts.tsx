"use client"

import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "~/lib/utils"

import { ChartContainer, type ChartConfig } from "~/components/ui/chart"
import {
  EChartsAreaChart,
  type ChartConfig as EChartsChartConfig,
} from "~/components/evilcharts/charts/echarts-area-chart"
import {
  tooltipIndicatorHtml,
  tooltipRow,
  tooltipShell,
} from "~/components/evilcharts/ui/echarts-tooltip"

export type SidePaint = { color: string; soft: string; dim: string }

type TwoSide = { nameA: string; nameB: string; paintA: SidePaint; paintB: SidePaint }

function config({ nameA, nameB, paintA, paintB }: TwoSide): ChartConfig {
  return {
    a: { label: nameA, color: paintA.color },
    b: { label: nameB, color: paintB.color },
  }
}


/**
 * Value label pinned to a bar's OUTER end — left site's number on the left,
 * right site's number on the right.
 *
 * Recharts' position="left"/"right" resolves against the rect's own x/width,
 * and on a negative bar that lands on the zero line, which is exactly where the
 * two sides meet — so the number printed on top of the opposing bar. Taking
 * min/max of the rect edges gives the true outer end whatever the sign.
 */
type BarLabelProps = {
  x?: string | number
  y?: string | number
  width?: string | number
  height?: string | number
  // Recharts widens this to its RenderableText union; we only ever read a number.
  value?: unknown
}

function endLabel(
  side: "left" | "right",
  color: string,
  format: (value: number) => string
) {
  return function EndLabel(props: BarLabelProps) {
    const x = Number(props.x ?? 0)
    const y = Number(props.y ?? 0)
    const width = Number(props.width ?? 0)
    const height = Number(props.height ?? 0)
    const outer =
      side === "left" ? Math.min(x, x + width) - 10 : Math.max(x, x + width) + 10
    return (
      <text
        x={outer}
        y={y + height / 2}
        dy={4}
        textAnchor={side === "left" ? "end" : "start"}
        fill={color}
        fontSize={13}
        fontWeight={500}
      >
        {format(Math.abs(Number(props.value ?? 0)))}
      </text>
    )
  }
}

const asScore = (value: number) => `${Math.round(value)}`

/* ------------------------------------------------------------------ scores */

export type ScoreRow = { metric: string; a: number | null; b: number | null }

/** Overall plus the three pillars, one grouped bar per metric. */
export function ScoreBars({
  rows,
  nameA,
  nameB,
  paintA,
  paintB,
}: { rows: ScoreRow[] } & TwoSide) {
  return (
    <ChartContainer
      config={config({ nameA, nameB, paintA, paintB })}
      className="aspect-auto h-[260px] w-full"
    >
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: 4, right: 52, top: 8, bottom: 8 }}
        barGap={6}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 4" />
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="metric"
          axisLine={false}
          tickLine={false}
          width={96}
          tick={{ fontSize: 13 }}
        />
        <Bar dataKey="b" fill={paintB.color} radius={[0, 3, 3, 0]} barSize={15}>
          <LabelList
            dataKey="b"
            position="right"
            offset={8}
            fill={paintB.color}
            fontSize={13}
            fontWeight={500}
          />
        </Bar>
        <Bar dataKey="a" fill={paintA.color} radius={[0, 3, 3, 0]} barSize={15}>
          <LabelList
            dataKey="a"
            position="right"
            offset={8}
            fill={paintA.color}
            fontSize={13}
            fontWeight={500}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}


/* ----------------------------------------------------------------- buckets */

export type BucketRow = {
  label: string
  aShared: number
  aLead: number
  bShared: number
  bLead: number
  a: number | null
  b: number | null
}

/**
 * Diverging stacked bars. Each side is a stack of two segments: the score both
 * sites reach, then the winner's overhang in full colour. Bar length carries
 * the score, the bright tip carries the gap.
 */
export function BucketBars({
  rows,
  nameA,
  nameB,
  paintA,
  paintB,
}: { rows: BucketRow[] } & TwoSide) {
  return (
    <ChartContainer
      config={config({ nameA, nameB, paintA, paintB })}
      className="aspect-auto w-full"
      style={{ height: Math.max(200, rows.length * 54 + 32) }}
    >
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
        stackOffset="sign"
        barGap={0}
      >
        {/* padded past ±100 so the end labels never land on the category text */}
        <XAxis type="number" domain={[-122, 122]} hide />
        <YAxis
          type="category"
          dataKey="label"
          axisLine={false}
          tickLine={false}
          width={150}
          tick={{ fontSize: 13 }}
        />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Bar dataKey="bShared" stackId="s" fill={paintB.dim} barSize={16} />
        <Bar
          dataKey="bLead"
          stackId="s"
          fill={paintB.color}
          barSize={16}
          // mirrored on negative bars — this rounds the outer (left) end
          radius={[0, 3, 3, 0]}
          minPointSize={1}
        >
          <LabelList dataKey="b" content={endLabel("left", paintB.color, asScore)} />
        </Bar>
        <Bar dataKey="aShared" stackId="s" fill={paintA.dim} barSize={16} />
        <Bar
          dataKey="aLead"
          stackId="s"
          fill={paintA.color}
          barSize={16}
          radius={[0, 3, 3, 0]}
          minPointSize={1}
        >
          <LabelList dataKey="a" content={endLabel("right", paintA.color, asScore)} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* ------------------------------------------------------------------- radar */

export type RadarRow = { label: string; a: number; b: number }

/** Shape of one pillar's buckets. Small on purpose — it sits beside the bars. */
export function BucketRadar({
  rows,
  nameA,
  nameB,
  paintA,
  paintB,
}: { rows: RadarRow[] } & TwoSide) {
  if (rows.length < 3) return null
  return (
    <ChartContainer
      config={config({ nameA, nameB, paintA, paintB })}
      className="aspect-square h-[380px] w-full"
    >
      <RadarChart data={rows} outerRadius="68%" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <PolarGrid gridType="polygon" radialLines={false} stroke="var(--border)" />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
        <Radar dataKey="b" stroke={paintB.color} fill={paintB.color} fillOpacity={0.14} />
        <Radar dataKey="a" stroke={paintA.color} fill={paintA.color} fillOpacity={0.14} />
      </RadarChart>
    </ChartContainer>
  )
}

/* ------------------------------------------------------------------ spread */

export type SpreadRow = { label: string; pillar: string; a: number; b: number }

const fmtPct = (value: number) =>
  value === 0 ? "0%" : value < 1 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`

/**
 * Prevalence, diverging off a shared zero. Deliberately NOT two-toned like the
 * bucket chart: there a longer bar is a better score, here a longer bar is more
 * affected pages. Highlighting an "overhang" would mean the opposite thing in
 * the two charts, so length alone carries it and colour stays pure identity.
 */
export function SpreadBars({
  rows,
  nameA,
  nameB,
  paintA,
  paintB,
}: { rows: SpreadRow[] } & TwoSide) {
  const max = Math.max(5, ...rows.flatMap((r) => [r.a, r.b]))
  const data = rows.map((row) => ({ ...row, aVal: row.a, bVal: -row.b }))

  return (
    <ChartContainer
      config={config({ nameA, nameB, paintA, paintB })}
      className="aspect-auto w-full"
      style={{ height: rows.length * 46 + 24 }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
        stackOffset="sign"
        barGap={0}
      >
        <XAxis type="number" domain={[-max * 1.3, max * 1.3]} hide />
        <YAxis
          type="category"
          dataKey="label"
          axisLine={false}
          tickLine={false}
          width={210}
          tick={{ fontSize: 13 }}
        />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Bar
          dataKey="bVal"
          stackId="s"
          fill={paintB.color}
          barSize={12}
          // mirrored on negative bars — this rounds the outer (left) end
          radius={[0, 3, 3, 0]}
          minPointSize={1}
        >
          <LabelList dataKey="b" content={endLabel("left", paintB.color, fmtPct)} />
        </Bar>
        <Bar
          dataKey="aVal"
          stackId="s"
          fill={paintA.color}
          barSize={12}
          radius={[0, 3, 3, 0]}
          minPointSize={1}
        >
          <LabelList dataKey="a" content={endLabel("right", paintA.color, fmtPct)} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* ------------------------------------------------------------------ ridge */

const HEALTH_CHART_HEIGHT = 340
const HEALTH_Y_STEP = 10

export function HealthRidge({
  values,
  paintA,
  paintB,
  nameA,
  nameB,
}: {
  /** Per-side share of pages, index = issue count, last entry is the tail. */
  values: { a: number[]; b: number[] }
  nameA: string
  nameB: string
  paintA: SidePaint
  paintB: SidePaint
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const { a, b } = values
  const n = Math.max(a.length, b.length, 1)
  const data = Array.from({ length: n }, (_, index) => ({
    label: index === n - 1 ? `${index}+` : String(index),
    a: Math.round((a[index] ?? 0) * 100),
    b: -Math.round((b[index] ?? 0) * 100),
  }))
  const peak = Math.max(
    ...data.flatMap((row) => [Math.abs(row.a), Math.abs(row.b)]),
    HEALTH_Y_STEP
  )
  const top = Math.max(
    HEALTH_Y_STEP,
    Math.ceil(peak / HEALTH_Y_STEP) * HEALTH_Y_STEP
  )
  const chartConfig: EChartsChartConfig = {
    a: {
      label: nameA,
      colors: { light: [paintA.color], dark: [paintA.color] },
    },
    b: {
      label: nameB,
      colors: { light: [paintB.color], dark: [paintB.color] },
    },
  }
  const series = [
    { key: "a", name: nameA, color: paintA.color },
    { key: "b", name: nameB, color: paintB.color },
  ] as const

  return (
    <div className="w-full">
      <p className="px-6 pb-3 text-center text-xs text-muted-foreground">
        % of each site&apos;s pages with this many issues. You above, them
        below.
      </p>
      <div style={{ height: HEALTH_CHART_HEIGHT }}>
        <EChartsAreaChart
          className="h-full w-full"
          chartOptions={{
            grid: { left: 44, right: 24, top: 8, bottom: 28 },
            yAxis: {
              type: "value",
              min: -top,
              max: top,
              interval: 20,
              axisLine: { show: false },
              axisTick: { show: false },
              splitLine: { show: false },
              axisLabel: {
                fontSize: 10,
                formatter: (value: number) =>
                  `${Math.abs(Math.round(value))}%`,
              },
            },
            tooltip: {
              trigger: "axis",
              confine: true,
              backgroundColor: "transparent",
              borderWidth: 0,
              padding: 0,
              extraCssText: "box-shadow:none;",
              formatter: (params: unknown) =>
                formatHealthTooltip(params, nameA, nameB),
            },
          }}
          config={chartConfig}
          curveType="monotone"
          data={data}
          enableHoverHighlight
          onSelectionChange={setSelectedKey}
          selectedDataKey={selectedKey}
          xDataKey="label"
        >
          <EChartsAreaChart.Grid />
          <EChartsAreaChart.XAxis
            dataKey="label"
            tickFormatter={(value, index) =>
              index % 2 === 0 || value.endsWith("+") ? value : ""
            }
          />
          <EChartsAreaChart.YAxis hideDots />
          {series.map((item) => (
            <EChartsAreaChart.Area
              key={item.key}
              dataKey={item.key}
              isClickable
              strokeVariant="solid"
              strokeWidth={2.5}
              variant="lines"
            >
              <EChartsAreaChart.Dot variant="border" />
              <EChartsAreaChart.ActiveDot variant="default" />
            </EChartsAreaChart.Area>
          ))}
        </EChartsAreaChart>
      </div>
      <div className="px-6 pt-8 sm:pt-10">
        <div className="flex flex-wrap justify-center lg:flex-nowrap">
          {series.map((item, index) => {
            const isSelected = selectedKey === item.key
            const isDimmed = selectedKey !== null && !isSelected
            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  "flex w-1/2 min-w-0 cursor-pointer flex-col items-center gap-1 rounded-md px-2 py-1.5 text-center transition-opacity duration-150 sm:px-3",
                  "hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                  "lg:flex-1 lg:px-2",
                  index > 0 && "border-l border-border",
                  isDimmed && "opacity-40"
                )}
                key={item.key}
                onClick={() =>
                  setSelectedKey((current) =>
                    current === item.key ? null : item.key
                  )
                }
                title={item.name}
                type="button"
              >
                <div className="flex max-w-full min-w-0 items-center justify-center gap-1.5 text-xs font-medium text-foreground">
                  <span
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.name}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function formatHealthTooltip(
  params: unknown,
  nameA: string,
  nameB: string
) {
  const items = (Array.isArray(params) ? params : [params]) as Array<{
    seriesId?: string
    seriesName?: string
    value?: number
    axisValue?: string
  }>
  const axis = String(items[0]?.axisValue ?? "")
  const body = items
    .map((item) => {
      const key =
        item.seriesId === "a" || item.seriesName === nameA
          ? "a"
          : item.seriesId === "b" || item.seriesName === nameB
            ? "b"
            : null
      if (!key) return ""
      const value = typeof item.value === "number" ? Math.abs(item.value) : 0
      return tooltipRow({
        dimmed: "",
        indicatorHtml: tooltipIndicatorHtml(key, 1),
        labelText: key === "a" ? nameA : nameB,
        valueText: `${Math.round(value)}% of pages`,
      })
    })
    .filter(Boolean)
    .join("")
  const label =
    axis === "1" ? "1 issue on a page" : `${axis} issues on a page`
  return tooltipShell({
    body,
    label,
    roundness: "lg",
    variant: "default",
  })
}

/* ------------------------------------------------------------------ legend */

export function CompareLegend({
  nameA,
  nameB,
  paintA,
  paintB,
  className,
}: TwoSide & { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-4 text-sm", className)}>
      {[
        { name: nameB, color: paintB.color },
        { name: nameA, color: paintA.color },
      ].map((entry) => (
        <span className="flex items-center gap-2" key={entry.name}>
          <span
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: entry.color }}
          />
          <span className="font-medium text-muted-foreground">{entry.name}</span>
        </span>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- score ring */

/** Compact gauge for the headline tiles. Fixed pixel box, so no viewBox scaling. */
export function ScoreRing({
  value,
  color,
  size = 76,
}: {
  value: number | null
  color: string
  size?: number
}) {
  const stroke = 7
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = ((value ?? 0) / 100) * circumference

  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        {value !== null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
          />
        ) : null}
      </g>
    </svg>
  )
}
