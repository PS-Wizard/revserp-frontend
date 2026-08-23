import { lazy, Suspense, useMemo } from "react"

import { cn } from "~/lib/utils"

import type { RevbotToolCall } from "./use-revbot"

const RevbotTrendRenderer = lazy(() => import("./revbot-trend-renderer"))
const RevbotRankingRenderer = lazy(() => import("./revbot-ranking-renderer"))

type ChartUnit = "count" | "percent" | "score" | "milliseconds"
type TrendXKind = "date" | "category"

type RevbotTrendChart = {
  title: string
  note?: string
  xKind: TrendXKind
  x: string[]
  unit: ChartUnit
  series: Array<{
    key: string
    label: string
    values: Array<number | null>
    projectedPoints?: number
  }>
}

type RevbotRankingChart = {
  title: string
  note?: string
  categories: string[]
  unit: ChartUnit
  series: Array<{
    key: string
    label: string
    values: number[]
  }>
}

type RevbotChartArtifact =
  | { call: RevbotToolCall; preset: "trend"; chart: RevbotTrendChart }
  | { call: RevbotToolCall; preset: "ranking"; chart: RevbotRankingChart }

const MAX_SERIES = 3
const TREND_KEYS = new Set([
  "preset",
  "title",
  "note",
  "x_kind",
  "x",
  "unit",
  "series",
])
const TREND_SERIES_KEYS = new Set(["label", "values", "projected_points"])
const RANKING_KEYS = new Set([
  "preset",
  "title",
  "note",
  "categories",
  "unit",
  "series",
])
const RANKING_SERIES_KEYS = new Set(["label", "values"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function textLength(value: string) {
  return Array.from(value.trim()).length
}

function parseTrendChart(args: unknown): RevbotTrendChart | null {
  if (
    !isRecord(args) ||
    Object.keys(args).some((key) => !TREND_KEYS.has(key)) ||
    args.preset !== "trend" ||
    typeof args.title !== "string" ||
    !args.title.trim() ||
    textLength(args.title) > 120 ||
    (args.note !== undefined && typeof args.note !== "string") ||
    (typeof args.note === "string" && textLength(args.note) > 300) ||
    (args.x_kind !== "date" && args.x_kind !== "category") ||
    (args.unit !== "count" &&
      args.unit !== "percent" &&
      args.unit !== "score" &&
      args.unit !== "milliseconds") ||
    !Array.isArray(args.x) ||
    args.x.length < 2 ||
    args.x.length > 60 ||
    !args.x.every(
      (value) =>
        typeof value === "string" &&
        Boolean(value.trim()) &&
        textLength(value) <= 80
    ) ||
    !Array.isArray(args.series) ||
    args.series.length < 1 ||
    args.series.length > MAX_SERIES
  ) {
    return null
  }

  const x = (args.x as string[]).map((value) => value.trim())
  if (
    (args.x_kind === "date" &&
      !x.every((value) => Number.isFinite(Date.parse(value)))) ||
    (args.x_kind === "category" && new Set(x).size !== x.length)
  ) {
    return null
  }
  const series = args.series.map((value, index) => {
    if (
      !isRecord(value) ||
      Object.keys(value).some((key) => !TREND_SERIES_KEYS.has(key)) ||
      typeof value.label !== "string" ||
      !value.label.trim() ||
      textLength(value.label) > 60
    ) {
      return null
    }
    if (
      !Array.isArray(value.values) ||
      value.values.length !== x.length ||
      !value.values.every(
        (point) =>
          point === null ||
          (typeof point === "number" && Number.isFinite(point))
      )
    ) {
      return null
    }
    if (
      value.projected_points !== undefined &&
      (typeof value.projected_points !== "number" ||
        !Number.isInteger(value.projected_points) ||
        value.projected_points < 1 ||
        value.projected_points > x.length - 1)
    ) {
      return null
    }

    return {
      key: `series_${index}`,
      label: value.label.trim(),
      values: value.values as Array<number | null>,
      projectedPoints: value.projected_points as number | undefined,
    }
  })

  if (series.some((value) => value === null)) return null
  const parsedSeries = series as RevbotTrendChart["series"]

  const note = typeof args.note === "string" ? args.note.trim() : undefined
  if (
    parsedSeries.some((value) => value.projectedPoints !== undefined) &&
    !note
  ) {
    return null
  }

  return {
    title: args.title.trim(),
    note: note || undefined,
    xKind: args.x_kind,
    x,
    unit: args.unit,
    series: parsedSeries,
  }
}

function parseRankingChart(args: unknown): RevbotRankingChart | null {
  if (
    !isRecord(args) ||
    Object.keys(args).some((key) => !RANKING_KEYS.has(key)) ||
    args.preset !== "ranking" ||
    typeof args.title !== "string" ||
    !args.title.trim() ||
    textLength(args.title) > 120 ||
    (args.note !== undefined && typeof args.note !== "string") ||
    (typeof args.note === "string" && textLength(args.note) > 300) ||
    (args.unit !== "count" &&
      args.unit !== "percent" &&
      args.unit !== "score" &&
      args.unit !== "milliseconds") ||
    !Array.isArray(args.categories) ||
    args.categories.length < 2 ||
    args.categories.length > 12 ||
    !args.categories.every(
      (value) =>
        typeof value === "string" &&
        Boolean(value.trim()) &&
        textLength(value) <= 80
    ) ||
    !Array.isArray(args.series) ||
    args.series.length < 1 ||
    args.series.length > MAX_SERIES
  ) {
    return null
  }

  const categories = (args.categories as string[]).map((value) => value.trim())
  if (new Set(categories).size !== categories.length) return null

  const series = args.series.map((value, index) => {
    if (
      !isRecord(value) ||
      Object.keys(value).some((key) => !RANKING_SERIES_KEYS.has(key)) ||
      typeof value.label !== "string" ||
      !value.label.trim() ||
      textLength(value.label) > 60 ||
      !Array.isArray(value.values) ||
      value.values.length !== categories.length ||
      !value.values.every(
        (point) => typeof point === "number" && Number.isFinite(point)
      )
    ) {
      return null
    }

    return {
      key: `series_${index}`,
      label: value.label.trim(),
      values: value.values as number[],
    }
  })

  if (series.some((value) => value === null)) return null

  const note = typeof args.note === "string" ? args.note.trim() : undefined
  return {
    title: args.title.trim(),
    note: note || undefined,
    categories,
    unit: args.unit,
    series: series as RevbotRankingChart["series"],
  }
}

function LoadingBadge({ variant }: { variant: "default" | "dark" }) {
  const isDark = variant === "dark"
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-2 py-0.5 text-sm",
          isDark
            ? "border-white/10 bg-[#0b0b0c] text-white/90"
            : "border-border bg-background text-foreground"
        )}
      >
        <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
        Loading
      </div>
    </div>
  )
}

function TrendChartSkeleton({
  chart,
  variant,
}: {
  chart: RevbotTrendChart
  variant: "default" | "dark"
}) {
  const isDark = variant === "dark"
  return (
    <figure className="mx-auto mt-4 flex h-72 w-4/5 min-w-0 flex-col">
      <div
        aria-label="Loading trend chart"
        className="relative min-h-0 flex-1 overflow-hidden"
      >
        <svg
          aria-hidden="true"
          className="h-full w-full motion-safe:animate-pulse"
          preserveAspectRatio="none"
          viewBox="0 0 100 40"
        >
          <path
            className={cn(
              isDark
                ? "fill-white/[0.03] stroke-white/20"
                : "fill-muted/35 stroke-muted-foreground/20"
            )}
            d="M0 31 C8 28 12 20 20 23 S33 32 42 21 S57 12 65 18 S78 27 86 15 S96 10 100 12 L100 40 L0 40 Z"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <LoadingBadge variant={variant} />
      </div>
      <figcaption className="mt-3 shrink-0">
        <div
          className={cn(
            "text-center text-sm font-medium",
            isDark && "text-white/90"
          )}
        >
          {chart.title}
        </div>
        {chart.note ? (
          <p
            className={cn(
              "mt-1 text-center text-xs",
              isDark ? "text-white/50" : "text-muted-foreground"
            )}
          >
            {chart.note}
          </p>
        ) : null}
      </figcaption>
    </figure>
  )
}

function RankingChartSkeleton({
  chart,
  variant,
}: {
  chart: RevbotRankingChart
  variant: "default" | "dark"
}) {
  const isDark = variant === "dark"
  const heights = [54, 78, 46, 68, 38, 61, 84, 51, 72, 43, 64, 57]
  return (
    <figure className="mx-auto mt-4 flex h-72 w-full max-w-3xl min-w-0 flex-col px-4">
      <div
        aria-label="Loading ranking chart"
        className="relative flex min-h-0 flex-1 items-end gap-3 overflow-hidden px-6 pt-6"
      >
        {chart.categories.map((category, index) => (
          <span
            aria-hidden="true"
            className={cn(
              "flex-1 rounded-t motion-safe:animate-pulse",
              isDark ? "bg-white/10" : "bg-muted-foreground/10"
            )}
            key={category}
            style={{
              height: `${heights[index] ?? 50}%`,
              animationDelay: `${index * 70}ms`,
            }}
          />
        ))}
        <LoadingBadge variant={variant} />
      </div>
      <figcaption className="mt-3 shrink-0">
        <div
          className={cn(
            "text-center text-sm font-medium",
            isDark && "text-white/90"
          )}
        >
          {chart.title}
        </div>
        {chart.note ? (
          <p
            className={cn(
              "mt-1 text-center text-xs",
              isDark ? "text-white/50" : "text-muted-foreground"
            )}
          >
            {chart.note}
          </p>
        ) : null}
      </figcaption>
    </figure>
  )
}

export function RevbotChartArtifacts({
  toolCalls,
  variant,
}: {
  toolCalls: RevbotToolCall[]
  variant: "default" | "dark"
}) {
  const charts = useMemo<RevbotChartArtifact[]>(() => {
    const seen = new Set<string>()
    const parsed: RevbotChartArtifact[] = []
    for (const call of toolCalls) {
      if (
        call.name !== "render_chart" ||
        call.status === "failed" ||
        (call.status !== "running" &&
          call.status !== "awaiting" &&
          call.status !== "completed") ||
        seen.has(call.callId)
      ) {
        continue
      }
      seen.add(call.callId)
      const trend = parseTrendChart(call.args)
      if (trend) {
        parsed.push({ call, preset: "trend", chart: trend })
        continue
      }
      const ranking = parseRankingChart(call.args)
      if (ranking) parsed.push({ call, preset: "ranking", chart: ranking })
    }
    return parsed
  }, [toolCalls])

  return charts.map((artifact) => {
    const isLoading =
      artifact.call.status === "running" || artifact.call.status === "awaiting"
    if (artifact.preset === "trend") {
      return (
        <Suspense
          fallback={
            <TrendChartSkeleton chart={artifact.chart} variant={variant} />
          }
          key={artifact.call.callId}
        >
          <RevbotTrendRenderer
            chart={artifact.chart}
            isLoading={isLoading}
            variant={variant}
          />
        </Suspense>
      )
    }
    return (
      <Suspense
        fallback={
          <RankingChartSkeleton chart={artifact.chart} variant={variant} />
        }
        key={artifact.call.callId}
      >
        <RevbotRankingRenderer
          chart={artifact.chart}
          isLoading={isLoading}
          variant={variant}
        />
      </Suspense>
    )
  })
}

export type { ChartUnit, RevbotRankingChart, RevbotTrendChart }
