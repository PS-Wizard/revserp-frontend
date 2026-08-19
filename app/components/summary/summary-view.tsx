"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react"

import type { AuditTab } from "~/components/app-navbar/types"
import type { CrawlBreakdown } from "~/components/pillar-audit-view"
import {
  PotentialScoreChart,
  type ScorePotentialPlanId,
} from "~/components/summary/potential-score-chart"
import { OpportunityCards } from "~/components/summary/opportunity-cards"
import { useProjectPanelOpen } from "~/components/summary/project-panel-context"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { ApiError, clientApiFetch } from "~/lib/api"
import type {
  CrawlResponse,
  ProjectResponse,
  ScorePotentialResponse,
} from "~/lib/api.types"
import { getCrawlTimestamp } from "~/lib/crawl"
import { cn } from "~/lib/utils"

// Plans are nested for the current config (best ⊆ top_3 ⊆ recommended), so the
// deepest plan whose fixes are all checked is the honest projection. The
// backend computes every scenario — the client only ever selects which
// precomputed point to draw.
const PLAN_ORDER: ReadonlyArray<ScorePotentialPlanId> = [
  "recommended",
  "top_3",
  "best_bucket",
]

const PILLAR_TO_TAB: Record<string, AuditTab> = {
  seo: "seo",
  aeo: "aeo",
  pagespeed: "pagespeed",
}
const lastCrawlFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

type SummaryViewProps = {
  userName?: string
  userEmail?: string
  activeProject: ProjectResponse | null
  /** The active project's latest completed crawl — gates the potential fetch. */
  latestCompletedCrawl: CrawlResponse | null
  crawls: CrawlResponse[]
  crawlBreakdowns: CrawlBreakdown[]
  onNavigateToTab: (tab: AuditTab) => void
}

export const SummaryView = memo(function SummaryView({
  userName,
  userEmail,
  activeProject,
  latestCompletedCrawl,
  crawls,
  crawlBreakdowns,
  onNavigateToTab,
}: SummaryViewProps) {
  const openProjectPanel = useProjectPanelOpen()
  const projectId = activeProject?.id ?? null

  // Guard: fire only for the selected project when it has a completed crawl.
  // The query key carries the project id, so a project switch naturally
  // re-fetches for the new project and never renders a stale payload.
  const fetchEnabled = Boolean(projectId && latestCompletedCrawl)
  const { data, isLoading, error } = useQuery({
    queryKey: ["score-potential", projectId],
    queryFn: () =>
      clientApiFetch<ScorePotentialResponse>(
        `/projects/${projectId}/score-potential`
      ),
    enabled: fetchEnabled,
    staleTime: 60_000,
  })

  const available = data && data.potential_available === true ? data : null
  const unavailableReason =
    data && data.potential_available === false ? (data.reason ?? null) : null
  const isNotFound = error instanceof ApiError && error.status === 404

  // Selection defaults to the recommended plan and resets only when the
  // underlying payload changes (project switch or a new crawl) — not on
  // unrelated re-renders or user toggles.
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(new Set())
  const selectionKeyRef = useRef("")
  const recommendedKey = available
    ? `${available.current.overall}:${available.scenarios.recommended.buckets.join("|")}`
    : ""
  useEffect(() => {
    if (!available) return
    if (recommendedKey === selectionKeyRef.current) return
    selectionKeyRef.current = recommendedKey
    setSelectedBuckets(new Set(available.scenarios.recommended.buckets))
  }, [available, recommendedKey])

  const toggleBucket = useCallback((bucketId: string) => {
    setSelectedBuckets((previous) => {
      const next = new Set(previous)
      if (next.has(bucketId)) next.delete(bucketId)
      else next.add(bucketId)
      return next
    })
  }, [])

  const activePlan = useMemo<ScorePotentialPlanId | null>(() => {
    if (!available) return null
    const covered = PLAN_ORDER.filter((planId) => {
      const buckets = available.scenarios[planId].buckets
      return (
        buckets.length > 0 &&
        buckets.every((bucket) => selectedBuckets.has(bucket))
      )
    })
    if (covered.length === 0) return null
    // The deepest plan wins when several are fully covered (e.g. checking
    // top_3's extra bucket on top of the recommended pair advances the
    // projection to the top_3 datapoint).
    return [...covered].sort(
      (a, b) =>
        available.scenarios[b].buckets.length -
        available.scenarios[a].buckets.length
    )[0]
  }, [available, selectedBuckets])

  const bucketLabels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const { breakdown } of crawlBreakdowns) {
      for (const pillar of breakdown.pillars) {
        for (const bucket of pillar.buckets) {
          map[bucket.id] = bucket.label
        }
      }
    }
    return map
  }, [crawlBreakdowns])

  const planBucketSet = useMemo(() => {
    if (!available) return new Set<string>()
    return new Set([
      ...available.scenarios.best_bucket.buckets,
      ...available.scenarios.top_3.buckets,
      ...available.scenarios.recommended.buckets,
    ])
  }, [available])

  const opportunities = useMemo(() => {
    if (!available) return []
    const listed = available.opportunities.filter(
      (opportunity) =>
        opportunity.delta.overall > 0 || planBucketSet.has(opportunity.bucket)
    )
    // Always surface every recommended fix; cap the rest so the row of cards
    // stays a calm action layer.
    const recommendedCount = available.scenarios.recommended.buckets.length
    return listed.slice(0, Math.max(8, recommendedCount))
  }, [available, planBucketSet])

  const topPillarTab = opportunities[0]
    ? PILLAR_TO_TAB[opportunities[0].pillar]
    : undefined

  const firstName =
    userName?.trim().split(/\s+/)[0] || userEmail?.split("@")[0] || "there"

  return (
    <div className="flex min-w-0 flex-col gap-6 md:gap-8">
      <header className="px-4 lg:px-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          <span className="text-muted-foreground">
            Hello {firstName}, here&apos;s the rundown for{" "}
          </span>
          <button
            type="button"
            onClick={() => openProjectPanel?.()}
            title="Switch project"
            className={cn(
              "inline-flex max-w-full items-baseline gap-1 rounded-md align-baseline transition-colors",
              "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            )}
          >
            <span className="max-w-[16ch] truncate underline decoration-muted-foreground/60 decoration-dotted underline-offset-4 sm:max-w-none">
              {activeProject?.name ?? "Select a project"}
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className="size-4 shrink-0 self-center text-muted-foreground"
            />
          </button>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {latestCompletedCrawl
            ? `Last completed crawl · ${lastCrawlFormatter.format(
                new Date(getCrawlTimestamp(latestCompletedCrawl))
              )}`
            : "Run a crawl to start tracking your scores."}
        </p>
      </header>

      {latestCompletedCrawl && !isNotFound ? (
        <>
          <section className="px-4 lg:px-6">
            <Card className="bg-gradient-to-br from-card via-card to-muted/30">
              <CardHeader>
                <CardTitle>Score potential</CardTitle>
                <CardDescription>
                  Your score history with the projected impact of the
                  highest-impact fixes.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2 pt-2 sm:px-6">
                <PotentialScoreChart
                  crawls={crawls}
                  potential={available}
                  isLoading={fetchEnabled && isLoading && !available}
                  activePlan={activePlan}
                />
              </CardContent>
            </Card>
          </section>

          {unavailableReason ? (
            <p className="px-4 text-sm text-muted-foreground lg:px-6">
              Score history is pending the next crawl
              {unavailableReason === "scoring_config_changed"
                ? " — the scoring configuration changed since the last crawl."
                : "."}
            </p>
          ) : available && opportunities.length > 0 ? (
            <section className="flex min-w-0 flex-col gap-4 md:gap-5">
              <header className="flex items-end justify-between gap-4 px-4 lg:px-6">
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-semibold tracking-tight">
                    Highest-impact next steps
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Check the fixes you&apos;re planning — the chart above
                    projects their combined score.
                  </p>
                </div>
                {topPillarTab ? (
                  <button
                    type="button"
                    onClick={() => onNavigateToTab(topPillarTab)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md pb-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                  >
                    Full audit
                    <ArrowRightIcon aria-hidden="true" className="size-3.5" />
                  </button>
                ) : null}
              </header>
              <OpportunityCards
                opportunities={opportunities}
                current={available.current}
                selected={selectedBuckets}
                onToggle={toggleBucket}
                labels={bucketLabels}
              />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
})
