"use client"

import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { CardAction } from "~/components/ui/card"
import { cn } from "~/lib/utils"
import { isNumber } from "./helpers"

export function TrendSparkline({
  values,
  trend,
}: {
  values: Array<number | undefined>
  trend: number | null
}) {
  const points = values.filter(isNumber).slice(-8)

  if (points.length < 2) {
    return (
      <div className="h-12 w-24 rounded-md border border-dashed border-border/60 bg-background/40" />
    )
  }

  const width = 96
  const height = 40
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
        "h-12 w-24 shrink-0 text-muted-foreground",
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
        strokeWidth="2.25"
      />
    </svg>
  )
}

export function TrendBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null

  return (
    <CardAction>
      <Badge variant="outline">
        {delta > 0 ? (
          <TrendingUpIcon />
        ) : delta < 0 ? (
          <TrendingDownIcon />
        ) : null}
        {delta > 0 ? "+" : ""}
        {delta} pts
      </Badge>
    </CardAction>
  )
}
