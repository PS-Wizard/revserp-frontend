"use client"

import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { CardAction } from "~/components/ui/card"
import { cn } from "~/lib/utils"
import { isNumber } from "./helpers"

const SPARKLINE_SIZES = {
  default: {
    className: "h-12 w-24",
    placeholderClassName: "h-12 w-24",
    width: 96,
    height: 40,
    strokeWidth: 2.25,
  },
  sm: {
    className: "h-8 w-16",
    placeholderClassName: "h-8 w-16",
    width: 64,
    height: 28,
    strokeWidth: 2,
  },
  md: {
    className: "h-10 w-20",
    placeholderClassName: "h-10 w-20",
    width: 80,
    height: 32,
    strokeWidth: 2.1,
  },
} as const

export function TrendSparkline({
  values,
  trend,
  size = "default",
}: {
  values: Array<number | undefined>
  trend: number | null
  size?: keyof typeof SPARKLINE_SIZES
}) {
  const sparklineSize = SPARKLINE_SIZES[size]
  const points = values.filter(isNumber).slice(-8)

  if (points.length < 2) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-border/60 bg-background/40",
          sparklineSize.placeholderClassName
        )}
      />
    )
  }

  const width = sparklineSize.width
  const height = sparklineSize.height
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = width / Math.max(points.length - 1, 1)
  const linePoints = points
    .map((value, index) => {
      const x = index * step
      const y = height - ((value - min) / range) * (height - 4) - 2
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "shrink-0 text-muted-foreground",
        sparklineSize.className,
        trend === null || trend === 0
          ? "text-muted-foreground"
          : trend > 0
            ? "text-emerald-400"
            : "text-rose-400"
      )}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        fill="none"
        points={linePoints}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={sparklineSize.strokeWidth}
      />
    </svg>
  )
}

export function TrendBadge({
  delta,
  inline = false,
}: {
  delta: number | null
  inline?: boolean
}) {
  if (delta === null) return null

  const badge = (
    <Badge variant="outline">
      {delta > 0 ? <TrendingUpIcon /> : delta < 0 ? <TrendingDownIcon /> : null}
      {delta > 0 ? "+" : ""}
      {delta} pts
    </Badge>
  )

  return inline ? badge : <CardAction>{badge}</CardAction>
}
