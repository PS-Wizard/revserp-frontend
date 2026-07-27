"use client"

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

// Plot geometry, in viewBox units. The SVG stretches to the container with
// preserveAspectRatio="none" and a fixed pixel height, so the curves fill the
// width without the box growing tall. Strokes use non-scaling-stroke so the
// stretch never thickens them, and every label is HTML — text inside a scaled
// viewBox renders at whatever size the scale factor happens to be, which is
// exactly how it ended up twice the size of the rest of the page.
const RW = 1000
const RH = 300
const RMID = RH / 2
const RAMP = RH * 0.45
// Gridlines land on round percentages instead of quarters of whatever the peak
// happens to be, so the axis reads 5/10/15 rather than 11/22/34.
const Y_STEP = 5
const Y_LABEL_EVERY = 10

/** Symmetric cubic through the points — smooth without overshoot. */
function area(values: number[], dir: 1 | -1, max: number) {
  const n = values.length
  const x = (i: number) => (i / (n - 1)) * RW
  const y = (i: number) => RMID - dir * (values[i] / max) * RAMP
  let d = `M 0 ${RMID} L 0 ${y(0)}`
  for (let i = 0; i < n - 1; i++) {
    const mx = (x(i) + x(i + 1)) / 2
    d += ` C ${mx} ${y(i)} ${mx} ${y(i + 1)} ${x(i + 1)} ${y(i + 1)}`
  }
  return `${d} L ${RW} ${RMID} Z`
}

/**
 * Mirrored distribution of pages by issue count. Each side is scaled to its own
 * page total, which is what makes sites of different size comparable. Stays
 * hand-rolled SVG because the layered gradient falloff is the whole look and
 * Recharts cannot express it without more fighting than it is worth.
 */
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
  const { a, b } = values
  const peak = Math.max(...a, ...b) || 0.01
  // Round the top of the scale up to a whole step so the last gridline is the
  // plot edge rather than floating just short of it.
  const topPct = Math.max(Y_STEP, Math.ceil((peak * 100) / Y_STEP) * Y_STEP)
  const scaleMax = topPct / 100
  const yTicks = Array.from(
    { length: Math.floor(topPct / Y_STEP) },
    (_, i) => (i + 1) * Y_STEP
  )

  const n = a.length
  const xStep = n > 24 ? 5 : n > 8 ? 2 : 1
  const xTicks = Array.from({ length: n }, (_, i) => i).filter(
    (i) => i % xStep === 0 || i === n - 1
  )

  return (
    <div className="flex gap-3">
      <div className="relative w-10 shrink-0" style={{ height: RH }}>
        {yTicks
          .filter((pct) => pct % Y_LABEL_EVERY === 0 || pct === topPct)
          .flatMap((pct) => [-1, 1].map((dir) => ({ pct, dir })))
          .map(({ pct, dir }) => (
            <span
              key={`${pct}-${dir}`}
              className="absolute right-0 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
              style={{ top: `${50 - dir * (pct / topPct) * 45}%` }}
            >
              {pct}%
            </span>
          ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height: RH }}>
          <svg
            viewBox={`0 0 ${RW} ${RH}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label="Share of pages by issue count"
          >
            <defs>
              <linearGradient id="cmp-ridge-b" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={paintB.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={paintB.color} stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="cmp-ridge-a" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={paintA.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={paintA.color} stopOpacity={0.04} />
              </linearGradient>
            </defs>

            {xTicks.map((i) => (
              <line
                key={`x-${i}`}
                x1={(i / (n - 1)) * RW}
                y1={RMID - RAMP}
                x2={(i / (n - 1)) * RW}
                y2={RMID + RAMP}
                stroke="var(--border)"
                strokeDasharray="2 6"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {yTicks
              .flatMap((pct) => [-1, 1].map((dir) => ({ pct, dir })))
              .map(({ pct, dir }) => (
                <line
                  key={`y-${pct}-${dir}`}
                  x1={0}
                  y1={RMID - dir * (pct / topPct) * RAMP}
                  x2={RW}
                  y2={RMID - dir * (pct / topPct) * RAMP}
                  stroke="var(--border)"
                  strokeDasharray="2 6"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

            <path d={area(b, 1, scaleMax)} fill="url(#cmp-ridge-b)" />
            <path d={area(a, -1, scaleMax)} fill="url(#cmp-ridge-a)" />
            <path
              d={area(b, 1, scaleMax)}
              fill="none"
              stroke={paintB.color}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={area(a, -1, scaleMax)}
              fill="none"
              stroke={paintA.color}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={0}
              y1={RMID}
              x2={RW}
              y2={RMID}
              stroke="var(--border)"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <span
            className="pointer-events-none absolute top-0 right-0 text-sm font-medium"
            style={{ color: paintB.color }}
          >
            {nameB}
          </span>
          <span
            className="pointer-events-none absolute right-0 bottom-0 text-sm font-medium"
            style={{ color: paintA.color }}
          >
            {nameA}
          </span>
        </div>

        <div className="relative mt-2 h-4">
          {xTicks.map((i) => (
            <span
              key={i}
              className="absolute -translate-x-1/2 text-xs text-muted-foreground tabular-nums"
              style={{ left: `${(i / (n - 1)) * 100}%` }}
            >
              {i === n - 1 ? `${i}+` : i}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Issues on a page</p>
      </div>
    </div>
  )
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
