"use client"

import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import type { CrawlResponse } from "~/lib/api.types"
import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

export function SectionCards({
  crawls,
  currentCrawl,
  previousCrawl,
}: {
  crawls: CrawlResponse[]
  currentCrawl: CrawlResponse | null
  previousCrawl: CrawlResponse | null
}) {
  const cardCrawls = [...crawls].reverse()
  const cards = [
    {
      label: "Overall Score",
      value: currentCrawl?.overall_score,
      previousValue: previousCrawl?.overall_score,
      series: cardCrawls.map((crawl) => crawl.overall_score),
    },
    {
      label: "SEO Score",
      value: currentCrawl?.seo_score,
      previousValue: previousCrawl?.seo_score,
      series: cardCrawls.map((crawl) => crawl.seo_score),
    },
    {
      label: "AEO Score",
      value: currentCrawl?.aeo_score,
      previousValue: previousCrawl?.aeo_score,
      series: cardCrawls.map((crawl) => crawl.aeo_score),
    },
    {
      label: "PageSpeed Score",
      value: currentCrawl?.pagespeed_score,
      previousValue: previousCrawl?.pagespeed_score,
      series: cardCrawls.map((crawl) => crawl.pagespeed_score),
    },
  ] as const

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => {
        const delta = getRoundedDelta(card.value, card.previousValue)

        return (
          <Card
            key={card.label}
            className="@container/card border-border/50 bg-gradient-to-br from-card via-card to-muted/30"
          >
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {formatScore(card.value)}
              </CardTitle>
              {delta !== null && (
                <CardAction>
                  <Badge variant="outline">
                    {delta > 0 ? <TrendingUpIcon /> : delta < 0 ? <TrendingDownIcon /> : null}
                    {delta > 0 ? "+" : ""}
                    {delta} pts
                  </Badge>
                </CardAction>
              )}
            </CardHeader>
            <CardFooter className="flex items-end justify-between gap-4 text-sm">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="font-medium">{getTrendLabel(delta)}</div>
                <div className="text-muted-foreground">
                  {getTrendSummary(card.previousValue, card.value)}
                </div>
              </div>
              <Sparkline values={card.series} trend={delta} />
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}

function Sparkline({
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

function getTrendLabel(delta: number | null) {
  if (delta === null || delta === 0) {
    return "Flat since last crawl"
  }

  return delta > 0 ? "Trending up since last crawl" : "Trending down since last crawl"
}

function getTrendSummary(
  previousValue: number | undefined,
  currentValue: number | undefined
 ) {
  if (currentValue === undefined) {
    return "Waiting for crawl data."
  }

  if (previousValue === undefined) {
    return formatScore(currentValue)
  }

  return `${formatScore(previousValue)} → ${formatScore(currentValue)}`
}

function getRoundedDelta(value: number | undefined, previousValue: number | undefined) {
  if (value === undefined || previousValue === undefined) {
    return null
  }

  return Math.round(value) - Math.round(previousValue)
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function formatScore(value: number | undefined) {
  return value === undefined ? "—" : `${Math.round(value)}%`
}
