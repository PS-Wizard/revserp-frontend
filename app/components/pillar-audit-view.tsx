"use client"

import { useState } from "react"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { BucketScoreHistoryChart } from "~/components/bucket-score-history-chart"

import { IssueExplorer } from "~/components/issue-explorer"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { GooglePSIDrawer } from "~/components/gsc-overview/google-psi-drawer"
import type { GooglePSIStoredResult } from "~/lib/api.types"
import type { PendingAIFixRequest } from "~/components/issue-explorer/types"
import type {
  CrawlResponse,
  ScoreBreakdownBucketResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import { cn, formatBucketLabel } from "~/lib/utils"

export type CrawlBreakdown = {
  crawl: CrawlResponse
  breakdown: ScoreBreakdownResponse
}

type PillarAuditViewProps = {
  activeProjectName?: string
  crawlBreakdowns: CrawlBreakdown[]
  currentBreakdown: ScoreBreakdownResponse | null
  onGenerateAIFixesNow?: (request: PendingAIFixRequest) => void
  onOpenAIConversation?: (conversationId: string) => void
  pillarId: string
  projectId?: string
  title: string
}

export function PillarAuditView({
  activeProjectName,
  crawlBreakdowns,
  currentBreakdown,
  onGenerateAIFixesNow,
  onOpenAIConversation,
  pillarId,
  projectId,
  title,
}: PillarAuditViewProps) {
  const currentPillar = currentBreakdown?.pillars.find((pillar) => pillar.id === pillarId)
  const radialSegments =
    currentPillar?.buckets.map((bucket) => ({
      key: bucket.id,
      label: formatBucketLabel(bucket.id, bucket.label),
      value: bucket.score,
    })) ?? []

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="grid gap-4 px-4 lg:grid-cols-[minmax(260px,0.3fr)_minmax(0,0.7fr)] lg:px-6">
        <ScoreRadialChart
          centerLabel={title}
          centerValue={currentPillar?.score}
          description="Current crawl bucket scores"
          segments={radialSegments}
          title={`${title} Score`}
        />
        <BucketScoreHistoryChart
          activeProjectName={activeProjectName}
          crawlBreakdowns={crawlBreakdowns}
          pillarId={pillarId}
          title={title}
        />
      </div>
      <div className="px-4 lg:px-6">
        <Separator />
      </div>
      <BucketScoreCards
        crawlBreakdowns={crawlBreakdowns}
        pillarId={pillarId}
        psiResult={
          pillarId === "pagespeed"
            ? (crawlBreakdowns[0]?.crawl?.google_psi_results as GooglePSIStoredResult[])?.[0] ?? null
            : null
        }
      />
      <div className="px-4 lg:px-6">
        <Separator />
      </div>
      <IssueExplorer
        breakdown={currentBreakdown}
        initialPillarId={pillarId}
        onGenerateAIFixesNow={onGenerateAIFixesNow}
        onOpenAIConversation={onOpenAIConversation}
        projectId={projectId}
      />
    </div>
  )
}

function BucketScoreCards({
  crawlBreakdowns,
  pillarId,
  psiResult,
}: {
  crawlBreakdowns: CrawlBreakdown[]
  pillarId: string
  psiResult: GooglePSIStoredResult | null
}) {
  const [psiDrawerOpen, setPsiDrawerOpen] = useState(false)
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
          <>
            <Card
              className={`@container/card border-border/50 bg-gradient-to-br from-card via-card to-muted/30 ${
                bucket.id === "psi_cwv" && psiResult
                  ? "cursor-pointer transition hover:border-primary/30"
                  : ""
              }`}
              key={bucket.id}
              onClick={() => {
                if (bucket.id === "psi_cwv" && psiResult) setPsiDrawerOpen(true)
              }}
            >
              <CardHeader>
                <CardDescription>{bucket.id === "psi_cwv" ? "Google PSI" : bucket.label}</CardDescription>
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
            {bucket.id === "psi_cwv" && psiResult && (
              <GooglePSIDrawer
                open={psiDrawerOpen}
                onClose={() => setPsiDrawerOpen(false)}
                psiResult={psiResult}
              />
            )}
          </>
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

