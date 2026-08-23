import { lazy, Suspense } from "react"

import { cn } from "~/lib/utils"

import type { RevbotToolCall } from "./use-revbot"

const RevbotTrendRenderer = lazy(() => import("./revbot-trend-renderer"))

type TrendUnit = "count" | "percent" | "score" | "milliseconds"
type TrendXKind = "date" | "category"

type RevbotTrendChart = {
  title: string
  note?: string
  xKind: TrendXKind
  x: string[]
  unit: TrendUnit
  series: Array<{
    key: string
    label: string
    values: Array<number | null>
    projectedPoints?: number
  }>
}

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
const SERIES_KEYS = new Set(["label", "values", "projected_points"])

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
      Object.keys(value).some((key) => !SERIES_KEYS.has(key)) ||
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

function TrendChartSkeleton({
  chart,
  variant,
}: {
  chart: RevbotTrendChart
  variant: "default" | "dark"
}) {
  const isDark = variant === "dark"
  return (
    <section
      className={cn(
        "mt-4 flex h-72 w-full min-w-0 flex-col border-t",
        isDark ? "border-white/10" : "border-border"
      )}
    >
      <h2 className={cn("mt-4 text-sm font-medium", isDark && "text-white/90")}>
        {chart.title}
      </h2>
      {chart.note ? (
        <p
          className={cn(
            "mt-1 text-xs",
            isDark ? "text-white/50" : "text-muted-foreground"
          )}
        >
          {chart.note}
        </p>
      ) : null}
      <div
        aria-label="Loading trend chart"
        className={cn(
          "mt-4 flex min-h-0 flex-1 items-end gap-2 overflow-hidden rounded-lg",
          isDark ? "bg-white/[0.03]" : "bg-muted/35"
        )}
      >
        {[42, 55, 38, 68, 52, 78, 61, 85].map((height, index) => (
          <span
            className={cn(
              "flex-1 rounded-t bg-muted-foreground/10 motion-safe:animate-pulse",
              isDark && "bg-white/10"
            )}
            key={index}
            style={{ height: `${height}%`, animationDelay: `${index * 70}ms` }}
          />
        ))}
      </div>
    </section>
  )
}

export function RevbotChartArtifacts({
  toolCalls,
  variant,
}: {
  toolCalls: RevbotToolCall[]
  variant: "default" | "dark"
}) {
  const seen = new Set<string>()
  const charts = toolCalls.flatMap((call) => {
    if (
      call.name !== "render_chart" ||
      call.status === "failed" ||
      (call.status !== "running" &&
        call.status !== "awaiting" &&
        call.status !== "completed") ||
      seen.has(call.callId)
    ) {
      return []
    }
    seen.add(call.callId)
    const chart = parseTrendChart(call.args)
    return chart ? [{ call, chart }] : []
  })

  return charts.map(({ call, chart }) => (
    <Suspense
      fallback={<TrendChartSkeleton chart={chart} variant={variant} />}
      key={call.callId}
    >
      <RevbotTrendRenderer
        chart={chart}
        isLoading={call.status === "running" || call.status === "awaiting"}
        variant={variant}
      />
    </Suspense>
  ))
}

export type { RevbotTrendChart }
