"use client"

import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { IssueExplorer } from "~/components/issue-explorer"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart"
import type {
  CrawlResponse,
  ScoreBreakdownBucketResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"

export type CrawlBreakdown = {
  crawl: CrawlResponse
  breakdown: ScoreBreakdownResponse
}

type PillarAuditViewProps = {
  activeProjectName?: string
  crawlBreakdowns: CrawlBreakdown[]
  currentBreakdown: ScoreBreakdownResponse | null
  pillarId: string
  title: string
}

export function PillarAuditView({
  activeProjectName,
  crawlBreakdowns,
  currentBreakdown,
  pillarId,
  title,
}: PillarAuditViewProps) {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="px-4 lg:px-6">
        <BucketScoreHistory
          activeProjectName={activeProjectName}
          crawlBreakdowns={crawlBreakdowns}
          pillarId={pillarId}
          title={title}
        />
      </div>
      <BucketScoreCards crawlBreakdowns={crawlBreakdowns} pillarId={pillarId} />
      <IssueExplorer breakdown={currentBreakdown} initialPillarId={pillarId} />
    </div>
  )
}

function BucketScoreHistory({
  activeProjectName,
  crawlBreakdowns,
  pillarId,
  title,
}: {
  activeProjectName?: string
  crawlBreakdowns: CrawlBreakdown[]
  pillarId: string
  title: string
}) {
  const chronologicalBreakdowns = [...crawlBreakdowns].reverse()
  const buckets = getLatestPillarBuckets(crawlBreakdowns, pillarId)
  const chartConfig = buildChartConfig(buckets)
  const chartData = chronologicalBreakdowns.map(({ crawl, breakdown }) => {
    const pillar = breakdown.pillars.find((item) => item.id === pillarId)
    const timestamp = crawl.completed_at ?? crawl.created_at

    return {
      timestamp,
      ...Object.fromEntries(
        buckets.map((bucket) => [
          getBucketDataKey(bucket.id),
          pillar?.buckets.find((item) => item.id === bucket.id)?.score ?? null,
        ])
      ),
    }
  })

  return (
    <Card className="@container/card border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardTitle>{title} Score History</CardTitle>
        <CardDescription>
          {activeProjectName
            ? `Bucket trends for ${activeProjectName}`
            : "Bucket trends from recent completed crawls"}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {chartData.length === 0 || buckets.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No completed bucket history yet.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
            <AreaChart data={chartData}>
              <defs>
                {buckets.map((bucket, index) => (
                  <linearGradient
                    id={`fill-${pillarId}-${bucket.id}`}
                    key={bucket.id}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={getChartColor(index)} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={getChartColor(index)} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="timestamp"
                minTickGap={24}
                tickFormatter={formatAxisDateTime}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                tickLine={false}
                width={44}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value, name) => (
                      <>
                        <span className="text-muted-foreground">
                          {String(name).replace(/^bucket_/, "")}
                        </span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {typeof value === "number" ? `${Math.round(value)}%` : String(value)}
                        </span>
                      </>
                    )}
                    labelFormatter={(value) => formatTooltipDateTime(String(value))}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {buckets.map((bucket, index) => (
                <Area
                  dataKey={getBucketDataKey(bucket.id)}
                  fill={`url(#fill-${pillarId}-${bucket.id})`}
                  key={bucket.id}
                  stroke={getChartColor(index)}
                  type="monotone"
                />
              ))}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function BucketScoreCards({
  crawlBreakdowns,
  pillarId,
}: {
  crawlBreakdowns: CrawlBreakdown[]
  pillarId: string
}) {
  const buckets = getLatestPillarBuckets(crawlBreakdowns, pillarId)
  const previousPillar = crawlBreakdowns[1]?.breakdown.pillars.find(
    (pillar) => pillar.id === pillarId
  )
  const chronologicalBreakdowns = [...crawlBreakdowns].reverse()

  if (!buckets.length) {
    return (
      <div className="px-4 lg:px-6">
        <Card className="border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
          <CardHeader>
            <CardTitle>No bucket scores yet</CardTitle>
            <CardDescription>Run a completed crawl to populate this view.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {buckets.map((bucket) => {
        const previousBucket = previousPillar?.buckets.find((item) => item.id === bucket.id)
        const series = chronologicalBreakdowns.map(({ breakdown }) =>
          breakdown.pillars
            .find((pillar) => pillar.id === pillarId)
            ?.buckets.find((item) => item.id === bucket.id)?.score
        )
        const delta = getRoundedDelta(bucket.score, previousBucket?.score)

        return (
          <Card
            className="@container/card border-border/50 bg-gradient-to-br from-card via-card to-muted/30"
            key={bucket.id}
          >
            <CardHeader>
              <CardDescription>{bucket.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {formatScore(bucket.score)}
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
                  {getTrendSummary(previousBucket?.score, bucket.score)}
                </div>
              </div>
              <Sparkline values={series} trend={delta} />
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

function getLatestPillarBuckets(crawlBreakdowns: CrawlBreakdown[], pillarId: string) {
  return (
    crawlBreakdowns[0]?.breakdown.pillars.find((pillar) => pillar.id === pillarId)
      ?.buckets ?? []
  )
}

function buildChartConfig(buckets: ScoreBreakdownBucketResponse[]) {
  return Object.fromEntries(
    buckets.map((bucket, index) => [
      getBucketDataKey(bucket.id),
      {
        label: bucket.label,
        color: getChartColor(index),
      },
    ])
  ) satisfies ChartConfig
}

function getBucketDataKey(bucketId: string) {
  return `bucket_${bucketId.replace(/[^a-zA-Z0-9_]/g, "_")}`
}

function getChartColor(index: number) {
  return `var(--chart-${(index % 5) + 1})`
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

function formatAxisDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatTooltipDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}
