"use client"

import { memo, useMemo, useState } from "react"
import { BucketScoreHistoryChart } from "~/components/bucket-score-history-chart"

import { IssueExplorer } from "~/components/issue-explorer"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { GooglePSIDrawer } from "~/components/gsc-overview/google-psi-drawer"
import type { GooglePSIStoredResult } from "~/lib/api.types"
import type { CrawlResponse, ScoreBreakdownResponse } from "~/lib/api.types"
import { formatBucketLabel } from "~/lib/utils"
import { getPillarChartColor } from "~/lib/pillar-colors"
import {
  TrendBadge,
  TrendSparkline,
  formatScore,
  getRoundedDelta,
  getTrendLabel,
  getTrendSummary,
} from "~/components/trend-sparkline"

export type CrawlBreakdown = {
  crawl: CrawlResponse
  breakdown: ScoreBreakdownResponse
}

type PillarAuditViewProps = {
  activeProjectName?: string
  crawlBreakdowns: CrawlBreakdown[]
  currentBreakdown: ScoreBreakdownResponse | null
  onOpenAIConversation?: (
    conversationId: string,
    scope?: { pillarId: string; bucketIds: string[]; issueTypeIds: string[] }
  ) => void
  pillarId: string
  projectId?: string
  title: string
}

export const PillarAuditView = memo(function PillarAuditView({
  activeProjectName,
  crawlBreakdowns,
  currentBreakdown,
  onOpenAIConversation,
  pillarId,
  projectId,
  title,
}: PillarAuditViewProps) {
  const currentPillar = currentBreakdown?.pillars.find(
    (pillar) => pillar.id === pillarId
  )
  const radialSegments =
    currentPillar?.buckets.map((bucket, index) => ({
      key: bucket.id,
      label: formatBucketLabel(bucket.id, bucket.label),
      value: bucket.score,
      color: getPillarChartColor(pillarId, index),
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
        <BucketScoreCards
          crawlBreakdowns={crawlBreakdowns}
          pillarId={pillarId}
          psiResult={
            pillarId === "pagespeed"
              ? ((
                  crawlBreakdowns[0]?.crawl
                    ?.google_psi_results as GooglePSIStoredResult[]
                )?.[0] ?? null)
              : null
          }
        />
      </div>
      <div className="px-4 lg:px-6">
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
      <IssueExplorer
        breakdown={currentBreakdown}
        initialPillarId={pillarId}
        onOpenAIConversation={onOpenAIConversation}
        projectId={projectId}
      />
    </div>
  )
})

const BucketScoreCards = memo(function BucketScoreCards({
  crawlBreakdowns,
  pillarId,
  psiResult,
}: {
  crawlBreakdowns: CrawlBreakdown[]
  pillarId: string
  psiResult: GooglePSIStoredResult | null
}) {
  const [psiDrawerOpen, setPsiDrawerOpen] = useState(false)
  const buckets = useMemo(
    () => getLatestPillarBuckets(crawlBreakdowns, pillarId),
    [crawlBreakdowns, pillarId]
  )
  const previousPillar = useMemo(
    () =>
      crawlBreakdowns[1]?.breakdown.pillars.find(
        (pillar) => pillar.id === pillarId
      ),
    [crawlBreakdowns, pillarId]
  )
  const chronologicalBreakdowns = useMemo(
    () => [...crawlBreakdowns].reverse(),
    [crawlBreakdowns]
  )

  if (!buckets.length) {
    return (
      <Card className="border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader>
          <CardTitle>No bucket scores yet</CardTitle>
          <CardDescription>
            Run a completed crawl to populate this view.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {buckets.map((bucket, index) => {
        const previousBucket = previousPillar?.buckets.find(
          (item) => item.id === bucket.id
        )
        const series = chronologicalBreakdowns.map(
          ({ breakdown }) =>
            breakdown.pillars
              .find((pillar) => pillar.id === pillarId)
              ?.buckets.find((item) => item.id === bucket.id)?.score
        )
        const delta = getRoundedDelta(bucket.score, previousBucket?.score)

        return (
          <>
            <Card
              className={`@container/card flex flex-col border-border/50 bg-gradient-to-br from-card via-card to-muted/30 ${
                bucket.id === "psi_cwv" && psiResult
                  ? "cursor-pointer transition hover:border-primary/30"
                  : ""
              }`}
              key={bucket.id}
              onClick={() => {
                if (bucket.id === "psi_cwv" && psiResult) setPsiDrawerOpen(true)
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardDescription>
                  {bucket.id === "psi_cwv" ? "Google PSI" : bucket.label}
                </CardDescription>
                {delta !== null && <TrendBadge delta={delta} />}
              </CardHeader>
              <div className="flex flex-1 items-center justify-center px-6 py-4">
                <CardTitle className="text-3xl font-semibold tabular-nums @[250px]/card:text-4xl">
                  {formatScore(bucket.score)}
                </CardTitle>
              </div>
              <CardFooter className="flex items-end justify-between gap-4 text-sm">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="font-medium">{getTrendLabel(delta)}</div>
                  <div className="text-muted-foreground">
                    {getTrendSummary(previousBucket?.score, bucket.score)}
                  </div>
                </div>
                <TrendSparkline values={series} trend={delta} />
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
})

function getLatestPillarBuckets(
  crawlBreakdowns: CrawlBreakdown[],
  pillarId: string
) {
  return (
    crawlBreakdowns[0]?.breakdown.pillars.find(
      (pillar) => pillar.id === pillarId
    )?.buckets ?? []
  )
}
