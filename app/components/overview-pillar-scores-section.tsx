"use client"

import { memo, useMemo } from "react"

import type { CrawlBreakdown } from "~/components/pillar-audit-view"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { formatBucketLabel } from "~/lib/utils"

const OVERVIEW_PILLARS = [
  { id: "seo", label: "SEO" },
  { id: "aeo", label: "AEO" },
  { id: "pagespeed", label: "PageSpeed" },
] as const

export const OverviewPillarScoresSection = memo(
  function OverviewPillarScoresSection({
    crawlBreakdowns,
    currentCrawlId,
  }: {
    crawlBreakdowns: CrawlBreakdown[]
    currentCrawlId?: string
  }) {
    const currentIndex = useMemo(() => {
      const idx = crawlBreakdowns.findIndex(
        ({ crawl }) => crawl.id === currentCrawlId
      )
      return idx >= 0 ? idx : 0
    }, [crawlBreakdowns, currentCrawlId])

    const currentBreakdown = crawlBreakdowns[currentIndex]?.breakdown
    const radialSegments = useMemo(
      () =>
        OVERVIEW_PILLARS.map((pillar) => {
          const entry = currentBreakdown?.pillars.find(
            (item) => item.id === pillar.id
          )
          return {
            key: pillar.id,
            label: pillar.label,
            value: entry?.score,
            color: getPillarChartColor(pillar.id, 0),
          }
        }),
      [currentBreakdown]
    )

    return (
      <div className="px-4 lg:px-6">
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(260px,0.3fr)_minmax(0,0.7fr)]">
          <ScoreRadialChart
            centerValue={currentBreakdown?.overall_score}
            description="Current crawl pillar scores"
            segments={radialSegments}
            title="Overall Score"
          />
          <OverviewPillarRadialCards
            crawlBreakdowns={crawlBreakdowns}
            currentCrawlId={currentCrawlId}
          />
        </div>
      </div>
    )
  }
)

const OverviewPillarRadialCards = memo(function OverviewPillarRadialCards({
  crawlBreakdowns,
  currentCrawlId,
}: {
  crawlBreakdowns: CrawlBreakdown[]
  currentCrawlId?: string
}) {
  const currentIndex = useMemo(() => {
    const idx = crawlBreakdowns.findIndex(
      ({ crawl }) => crawl.id === currentCrawlId
    )
    return idx >= 0 ? idx : 0
  }, [crawlBreakdowns, currentCrawlId])

  const currentBreakdown = crawlBreakdowns[currentIndex]?.breakdown

  const pillars = useMemo(
    () =>
      OVERVIEW_PILLARS.map((pillar) => {
        const entry = currentBreakdown?.pillars.find(
          (item) => item.id === pillar.id
        )
        const segments =
          entry?.buckets.map((bucket, index) => ({
            key: bucket.id,
            label: formatBucketLabel(bucket.id, bucket.label),
            value: bucket.score,
            color: getPillarChartColor(pillar.id, index),
          })) ?? []

        return {
          ...pillar,
          score: entry?.score,
          segments,
        }
      }),
    [currentBreakdown]
  )

  if (!pillars.some((pillar) => pillar.score !== undefined)) {
    return (
      <Card className="bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader>
          <CardTitle>No pillar scores yet</CardTitle>
          <CardDescription>
            Run a completed crawl to populate this view.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="@container/buckets h-full min-w-0 w-full">
      <div className="grid h-full auto-rows-fr grid-cols-1 gap-4 @min-[28rem]/buckets:grid-cols-2 @min-[56rem]/buckets:grid-cols-3">
        {pillars.map((pillar) => (
          <ScoreRadialChart
            key={pillar.id}
            centerLabel={pillar.label}
            centerValue={pillar.score}
            description="Current crawl bucket scores"
            segments={pillar.segments}
            title={`${pillar.label} Score`}
          />
        ))}
      </div>
    </div>
  )
})
