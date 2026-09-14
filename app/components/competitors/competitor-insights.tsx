"use client"

import { memo, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { TriangleAlertIcon, XIcon } from "lucide-react"

import { HealthRidge } from "~/components/compare/charts"
import { PAINT_A, PAINT_B } from "~/components/compare/helpers"
import { IssueBucketPies } from "~/components/competitors/issue-bucket-pies"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { clientApiFetch } from "~/lib/api"
import { PillarScoresCompare } from "~/components/overview-pillar-scores-section"
import { SliceScoreSankey } from "~/components/competitors/competitor-score-sankey"
import type {
  CompetitorGapPageHealth,
  CompetitorGapReport,
} from "~/lib/api.types"

const PAGE_HEALTH_BUCKETS = 21

type Props = {
  competitorCrawlId: string
  competitorName: string
  projectName: string
  onClose: () => void
}

function competitorGapQueryKey(competitorCrawlId: string) {
  return ["competitor-gap", competitorCrawlId, "v4"] as const
}

function padHealthBuckets(health: CompetitorGapPageHealth | undefined) {
  const buckets = health?.buckets ?? []
  return Array.from(
    { length: PAGE_HEALTH_BUCKETS },
    (_, index) => buckets[index] ?? 0
  )
}

function gapHealthShares(health: CompetitorGapPageHealth | undefined) {
  const buckets = padHealthBuckets(health)
  const total =
    health && health.total_pages > 0
      ? health.total_pages
      : buckets.reduce((sum, count) => sum + count, 0)
  if (total <= 0) {
    return buckets.map(() => 0)
  }
  return buckets.map((count) => count / total)
}

/* ------------------------------------------------------------- primitives */

function SectionCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <Card
      className="@container/card bg-gradient-to-br from-card via-card to-muted/30"
      size="sm"
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ shell */

function InsightsShell({
  onClose,
  subtitle,
  children,
}: {
  onClose: () => void
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="@container/main relative flex flex-1 flex-col gap-4 py-6">
      <div className="flex flex-wrap items-center justify-end gap-3 px-4 lg:px-6">
        {subtitle ? <div className="mr-auto min-w-0">{subtitle}</div> : null}
        <Button onClick={onClose} size="sm" type="button" variant="outline">
          <XIcon data-icon="inline-start" />
          Close
        </Button>
      </div>
      {children}
    </div>
  )
}

function InsightsLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Skeleton className="h-5 w-80" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}

/* ------------------------------------------------------------------- body */

function InsightsBody({
  report,
  competitorName,
  projectName,
}: {
  report: CompetitorGapReport
  competitorName: string
  projectName: string
}) {
  const themLabel = competitorName.trim() || "Competitor"
  const youLabel = projectName.trim() || "You"
  const youBreakdown = report.you_breakdown
  const themBreakdown = report.them_breakdown

  const sharesYou = gapHealthShares(report.page_health?.you)
  const sharesThem = gapHealthShares(report.page_health?.them)

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <PillarScoresCompare them={themBreakdown} you={youBreakdown} />

      <IssueBucketPies
        them={themBreakdown}
        themLabel={themLabel}
        you={youBreakdown}
        youLabel={youLabel}
      />

      <SliceScoreSankey
        them={themBreakdown}
        themLabel={themLabel}
        you={youBreakdown}
        youLabel={youLabel}
      />

      <SectionCard title="Page health">
        <HealthRidge
          nameA={youLabel}
          nameB={themLabel}
          paintA={PAINT_A}
          paintB={PAINT_B}
          values={{ a: sharesYou, b: sharesThem }}
        />
      </SectionCard>
    </div>
  )
}

/* -------------------------------------------------------------------- top */

export const CompetitorInsightsView = memo(function CompetitorInsightsView({
  competitorCrawlId,
  competitorName,
  projectName,
  onClose,
}: Props) {
  const query = useQuery({
    queryKey: competitorGapQueryKey(competitorCrawlId),
    queryFn: () =>
      clientApiFetch<CompetitorGapReport>(
        `/crawls/${competitorCrawlId}/competitor-gap`,
        { cache: "no-store" }
      ),
  })

  if (query.isError) {
    return (
      <InsightsShell onClose={onClose}>
        <div className="px-4 lg:px-6">
          <Empty className="border-0 py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlertIcon />
              </EmptyMedia>
              <EmptyTitle>Couldn&apos;t load insights</EmptyTitle>
              <EmptyDescription>
                The comparison request failed. Try again in a moment.
              </EmptyDescription>
            </EmptyHeader>
            <Button
              onClick={() => void query.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </Empty>
        </div>
      </InsightsShell>
    )
  }

  if (query.isLoading || !query.data) {
    return (
      <InsightsShell onClose={onClose}>
        <InsightsLoading />
      </InsightsShell>
    )
  }

  return (
    <InsightsShell
      onClose={onClose}
      subtitle={
        <p className="text-xs text-muted-foreground">
          Scored on {query.data.your_pages.toLocaleString()} vs{" "}
          {query.data.their_pages.toLocaleString()} matching pages, hop ≤{" "}
          {query.data.radius}. Not the full site.
        </p>
      }
    >
      <InsightsBody
        competitorName={competitorName}
        projectName={projectName}
        report={query.data}
      />
    </InsightsShell>
  )
})
