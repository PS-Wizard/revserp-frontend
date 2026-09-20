"use client"

import { memo, useMemo } from "react"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import type { CrawlBreakdown } from "~/components/pillar-audit-view"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { cn, formatBucketLabel } from "~/lib/utils"

const OVERVIEW_PILLARS = [
  { id: "seo", label: "SEO" },
  { id: "aeo", label: "AEO" },
  { id: "pagespeed", label: "PageSpeed" },
] as const

export type OverviewPillarId = (typeof OVERVIEW_PILLARS)[number]["id"]

/** "pillar" keeps Overview's SEO-blue / AEO-red / PageSpeed-green. "seo" and "aeo" paint every ring from that family. */
export type PillarScoresColorSource = "pillar" | "seo" | "aeo"

type PillarScoresBreakdown = {
  overall_score?: number | null
  pillars: Array<{
    id: string
    score?: number | null
    buckets: Array<{ id: string; label: string; score: number }>
  }>
}

type RadialChartModel = {
  id?: string
  label?: string
  centerValue?: number | null
  segments: Array<{
    key: string
    label: string
    value?: number | null
    color: string
  }>
}

export const OverviewPillarScoresSection = memo(
  function OverviewPillarScoresSection({
    crawlBreakdowns,
    currentCrawlId,
    onSelectPillar,
  }: {
    crawlBreakdowns: CrawlBreakdown[]
    currentCrawlId?: string
    onSelectPillar?: (pillarId: OverviewPillarId) => void
  }) {
    const currentIndex = useMemo(() => {
      const idx = crawlBreakdowns.findIndex(
        ({ crawl }) => crawl.id === currentCrawlId
      )
      return idx >= 0 ? idx : 0
    }, [crawlBreakdowns, currentCrawlId])

    const currentBreakdown = crawlBreakdowns[currentIndex]?.breakdown

    return (
      <div className="px-4 lg:px-6">
        <PillarScoresRow
          breakdown={currentBreakdown}
          onSelectPillar={onSelectPillar}
        />
      </div>
    )
  }
)

export const PillarScoresRow = memo(function PillarScoresRow({
  breakdown,
  colorSource = "pillar",
  onSelectPillar,
}: {
  breakdown?: PillarScoresBreakdown | null
  colorSource?: PillarScoresColorSource
  onSelectPillar?: (pillarId: OverviewPillarId) => void
}) {
  const charts = useMemo(
    () => buildCharts(breakdown, colorSource),
    [breakdown, colorSource]
  )

  if (!charts.hasScores) {
    return <NoPillarScores />
  }

  return (
    <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,9fr)_repeat(3,minmax(0,7fr))]">
      <ScoreRadialChart
        centerValue={charts.overall.centerValue}
        description="Current crawl pillar scores"
        segments={charts.overall.segments}
        title="Overall Score"
      />
      {charts.pillars.map((pillar) => (
        <ScoreRadialChart
          key={pillar.id}
          centerLabel={pillar.label}
          centerValue={pillar.centerValue}
          description="Current crawl bucket scores"
          onSelect={
            onSelectPillar
              ? () => onSelectPillar(pillar.id as OverviewPillarId)
              : undefined
          }
          selectLabel={`Open ${pillar.label} tab`}
          segments={pillar.segments}
          title={`${pillar.label} Score`}
        />
      ))}
    </div>
  )
})

export const PillarScoresCompare = memo(function PillarScoresCompare({
  you,
  them,
}: {
  you?: PillarScoresBreakdown | null
  them?: PillarScoresBreakdown | null
}) {
  const youCharts = useMemo(() => buildCharts(you, "seo"), [you])
  const themCharts = useMemo(() => buildCharts(them, "aeo"), [them])

  if (!youCharts.hasScores && !themCharts.hasScores) {
    return <NoPillarScores />
  }

  return (
    <div className="flex flex-col">
      <PillarScoresRow breakdown={you} colorSource="seo" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,9fr)_repeat(3,minmax(0,7fr))]">
        <ScoreDelta
          them={themCharts.overall.centerValue}
          you={youCharts.overall.centerValue}
        />
        {youCharts.pillars.map((pillar, index) => (
          <ScoreDelta
            key={pillar.id}
            them={themCharts.pillars[index]?.centerValue}
            you={pillar.centerValue}
          />
        ))}
      </div>
      <PillarScoresRow breakdown={them} colorSource="aeo" />
    </div>
  )
})

function ScoreDelta({
  you,
  them,
}: {
  you?: number | null
  them?: number | null
}) {
  const delta =
    typeof you === "number" &&
    Number.isFinite(you) &&
    typeof them === "number" &&
    Number.isFinite(them)
      ? Math.round(you) - Math.round(them)
      : null

  return (
    <div className="flex h-16 flex-col items-center">
      <div className="w-0 flex-1 border-l-2 border-dotted border-muted-foreground/70" />
      {delta === null ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        <Badge
          className={cn(
            "h-7 gap-1.5 border-2 px-2.5 text-sm [&>svg]:size-3.5!",
            delta > 0 && "border-emerald-400/70 text-emerald-400",
            delta < 0 && "border-rose-400/70 text-rose-400",
            delta === 0 && "border-muted-foreground/60"
          )}
          variant="outline"
        >
          {delta > 0 ? (
            <TrendingUpIcon />
          ) : delta < 0 ? (
            <TrendingDownIcon />
          ) : null}
          {delta > 0 ? "+" : ""}
          {delta} pts
        </Badge>
      )}
      <div className="w-0 flex-1 border-l-2 border-dotted border-muted-foreground/70" />
    </div>
  )
}

function NoPillarScores() {
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

function buildCharts(
  breakdown: PillarScoresBreakdown | null | undefined,
  colorSource: PillarScoresColorSource
) {
  const overall: RadialChartModel = {
    centerValue: breakdown?.overall_score,
    segments: OVERVIEW_PILLARS.map((pillar, index) => {
      const entry = breakdown?.pillars.find((item) => item.id === pillar.id)
      return {
        key: pillar.id,
        label: pillar.label,
        value: entry?.score,
        color: chartColor(colorSource, pillar.id, index),
      }
    }),
  }

  const pillars = OVERVIEW_PILLARS.map((pillar) => {
    const entry = breakdown?.pillars.find((item) => item.id === pillar.id)
    return {
      id: pillar.id,
      label: pillar.label,
      centerValue: entry?.score,
      segments:
        entry?.buckets.map((bucket, index) => ({
          key: bucket.id,
          label: formatBucketLabel(bucket.id, bucket.label),
          value: bucket.score,
          color: chartColor(colorSource, pillar.id, index),
        })) ?? [],
    }
  })

  return {
    overall,
    pillars,
    hasScores: pillars.some((pillar) => pillar.centerValue !== undefined),
  }
}

function chartColor(
  colorSource: PillarScoresColorSource,
  pillarId: string,
  index: number
) {
  if (colorSource === "pillar") {
    return getPillarChartColor(pillarId, index)
  }
  return getPillarChartColor(colorSource, index)
}
