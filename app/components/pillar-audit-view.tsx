"use client"

import { memo, useCallback, useMemo, useState } from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { BucketScoreHistoryChart } from "~/components/bucket-score-history-chart"

import { IssueExplorer } from "~/components/issue-explorer"
import { generateBatchAIFix } from "~/components/issue-explorer/utils"
import type { FixSelection } from "~/components/issue-explorer/types"
import { NumberPopIn } from "~/components/number-pop-in"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { GooglePSIDrawer } from "~/components/gsc-overview/google-psi-drawer"
import { ApiError } from "~/lib/api"
import type { GooglePSIStoredResult } from "~/lib/api.types"
import type { CrawlResponse, ScoreBreakdownResponse } from "~/lib/api.types"
import { formatBucketLabel } from "~/lib/utils"
import { getPillarChartColor } from "~/lib/pillar-colors"
import {
  TrendBadge,
  TrendSparkline,
  getRoundedDelta,
  getTrendLabel,
  getTrendSummary,
} from "~/components/trend-sparkline"

export type CrawlBreakdownScores = {
  overall_score: number
  pillars: Array<{
    id: string
    label: string
    score: number
    buckets: Array<{ id: string; label: string; score: number }>
  }>
}

export type CrawlBreakdown = {
  crawl: CrawlResponse
  breakdown: CrawlBreakdownScores
}

type PillarAuditViewProps = {
  activeProjectName?: string
  crawlBreakdowns: CrawlBreakdown[]
  currentBreakdown: ScoreBreakdownResponse | null
  currentCrawlId?: string
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
  currentCrawlId,
  onOpenAIConversation,
  pillarId,
  projectId,
  title,
}: PillarAuditViewProps) {
  const currentEntry =
    crawlBreakdowns.find(({ crawl }) => crawl.id === currentCrawlId) ??
    crawlBreakdowns[0]
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
          currentBreakdown={currentBreakdown}
          currentCrawlId={currentCrawlId}
          onOpenAIConversation={onOpenAIConversation}
          pillarId={pillarId}
          projectId={projectId}
          psiResult={
            pillarId === "pagespeed"
              ? ((
                  currentEntry?.crawl
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
  currentBreakdown,
  currentCrawlId,
  onOpenAIConversation,
  pillarId,
  projectId,
  psiResult,
}: {
  crawlBreakdowns: CrawlBreakdown[]
  currentBreakdown: ScoreBreakdownResponse | null
  currentCrawlId?: string
  onOpenAIConversation?: (
    conversationId: string,
    scope?: { pillarId: string; bucketIds: string[]; issueTypeIds: string[] }
  ) => void
  pillarId: string
  projectId?: string
  psiResult: GooglePSIStoredResult | null
}) {
  const [psiDrawerOpen, setPsiDrawerOpen] = useState(false)
  const [submittingBucketId, setSubmittingBucketId] = useState<string | null>(
    null
  )
  const crawlId = currentBreakdown?.crawl_id ?? ""
  const pillarLabel = useMemo(
    () =>
      currentBreakdown?.pillars.find((pillar) => pillar.id === pillarId)
        ?.label ?? pillarId,
    [currentBreakdown, pillarId]
  )

  // Mirror the issue table's whole-bucket "Recommend Fixes": one selection
  // scoped to this bucket with empty issueTypeIds/urls so the backend expands
  // to every issue type in it.
  const onRecommendBucketFix = useCallback(
    (bucket: { id: string; label: string }) => {
      if (!crawlId || !projectId) {
        toast.error("Recommended fixes are unavailable for this view.")
        return
      }

      const selection: FixSelection = {
        pillarId,
        pillarLabel,
        bucketIds: [bucket.id],
        bucketLabels: [formatBucketLabel(bucket.id, bucket.label)],
        issueTypeIds: [],
        urls: [],
      }

      setSubmittingBucketId(bucket.id)
      const promise = generateBatchAIFix({
        crawlId,
        projectId,
        selections: [selection],
      })

      toast.promise(promise, {
        loading: "Generating recommended fixes…",
        success: (conversation) => ({
          message: `Fixes are ready in "${conversation.title || "Untitled chat"}".`,
          action: onOpenAIConversation
            ? {
                label: "Open chat",
                onClick: () =>
                  onOpenAIConversation(conversation.id, {
                    pillarId,
                    bucketIds: [bucket.id],
                    issueTypeIds: [],
                  }),
              }
            : undefined,
        }),
        error: (error) =>
          error instanceof ApiError
            ? error.message
            : "Unable to generate recommended fixes.",
      })

      const done = () => setSubmittingBucketId(null)
      void promise.then(done, done)
    },
    [crawlId, projectId, pillarId, pillarLabel, onOpenAIConversation]
  )
  // crawlBreakdowns is the full history sorted newest-first. Locate the crawl
  // the user has selected (falling back to the newest) so the cards, trend
  // deltas, and pop-in replay key track the selection rather than always the
  // newest crawl.
  const currentIndex = useMemo(() => {
    const idx = crawlBreakdowns.findIndex(
      ({ crawl }) => crawl.id === currentCrawlId
    )
    return idx >= 0 ? idx : 0
  }, [crawlBreakdowns, currentCrawlId])
  const buckets = useMemo(
    () =>
      crawlBreakdowns[currentIndex]?.breakdown.pillars.find(
        (pillar) => pillar.id === pillarId
      )?.buckets ?? [],
    [crawlBreakdowns, currentIndex, pillarId]
  )
  const previousPillar = useMemo(
    () =>
      crawlBreakdowns[currentIndex + 1]?.breakdown.pillars.find(
        (pillar) => pillar.id === pillarId
      ),
    [crawlBreakdowns, currentIndex, pillarId]
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
      {buckets.map((bucket) => {
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
              className={`@container/card relative flex flex-col border-border/50 bg-gradient-to-br from-card via-card to-muted/30 ${
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
                  {bucket.score === undefined ? (
                    "—"
                  ) : (
                    <>
                      <NumberPopIn
                        value={Math.round(bucket.score)}
                        replayKey={currentCrawlId}
                      />
                      %
                    </>
                  )}
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
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/40 opacity-0 backdrop-blur-[3px] transition-opacity duration-200 group-hover/card:opacity-100">
                <Button
                  className="pointer-events-auto shadow-sm"
                  disabled={
                    submittingBucketId !== null || !projectId || !crawlId
                  }
                  onClick={(event) => {
                    event.stopPropagation()
                    onRecommendBucketFix(bucket)
                  }}
                  size="sm"
                >
                  {submittingBucketId === bucket.id ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-4" />
                  )}
                  Recommend Fixes
                </Button>
              </div>
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
