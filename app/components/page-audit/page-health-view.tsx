"use client"

import { memo, useCallback, useMemo, useRef, useState } from "react"

import { IssueExplorer } from "~/components/issue-explorer"
import { IssueTreemap } from "~/components/issue-treemap"
import {
  usePageHealthDetail,
  usePageIssueDetail,
} from "~/components/page-audit/use-page-audit-queries"
import type { SelectedAuditPage } from "~/components/page-audit/page-audit-context"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import { Card } from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"
import {
  buildPageScopedBreakdown,
  computePageOverallScore,
  computePagePillarScores,
} from "~/lib/build-page-breakdown"
import { getPillarChartColor } from "~/lib/pillar-colors"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import { formatBucketLabel } from "~/lib/utils"

export const PageHealthView = memo(function PageHealthView({
  crawlId,
  page,
  breakdown,
}: {
  crawlId: string
  page: SelectedAuditPage
  breakdown: ScoreBreakdownResponse | null
}) {
  const healthQuery = usePageHealthDetail(crawlId, page.id)
  const issuesQuery = usePageIssueDetail(crawlId, page.url)

  const issueExplorerRef = useRef<HTMLDivElement>(null)
  const focusTokenRef = useRef(0)
  const [bucketFocus, setBucketFocus] = useState<{
    pillarId?: string
    bucketId: string
    issueTypeId?: string
    autoSelect?: number
    token: number
  } | null>(null)

  const pageIssues = issuesQuery.data?.current_issues ?? []
  const scopedBreakdown = useMemo(
    () => (breakdown ? buildPageScopedBreakdown(breakdown, pageIssues) : null),
    [breakdown, pageIssues]
  )

  const pillarScores = useMemo(
    () => (breakdown ? computePagePillarScores(breakdown, pageIssues) : []),
    [breakdown, pageIssues]
  )

  const computedOverallScore = useMemo(
    () =>
      breakdown ? computePageOverallScore(breakdown, pageIssues) : undefined,
    [breakdown, pageIssues]
  )

  const overallCenterScore =
    healthQuery.data?.health_score ?? computedOverallScore

  const overallSegments = useMemo(
    () =>
      pillarScores.map((pillar) => ({
        key: pillar.id,
        label: pillar.label,
        value: pillar.score,
        color: getPillarChartColor(pillar.id, 0),
      })),
    [pillarScores]
  )

  const pillarRadials = useMemo(
    () =>
      pillarScores.map((pillar) => ({
        ...pillar,
        segments: pillar.buckets.map((bucket, index) => ({
          key: bucket.id,
          label: formatBucketLabel(bucket.id, bucket.label),
          value: bucket.score,
          color: getPillarChartColor(pillar.id, index),
        })),
      })),
    [pillarScores]
  )

  const handleFocusBucket = useCallback(
    (
      pillarId: string,
      bucketId: string,
      issueTypeId?: string,
      autoSelect?: number
    ) => {
      focusTokenRef.current += 1
      setBucketFocus({
        pillarId,
        bucketId,
        issueTypeId,
        autoSelect,
        token: focusTokenRef.current,
      })
      issueExplorerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    },
    []
  )

  const isLoading = healthQuery.isLoading || issuesQuery.isLoading

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="px-4 lg:px-6">
        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.3fr)_minmax(0,0.7fr)]">
            <Skeleton className="h-[420px] rounded-xl" />
            <div className="grid auto-rows-fr grid-cols-1 gap-4 @min-[28rem]/buckets:grid-cols-2 @min-[56rem]/buckets:grid-cols-3">
              <Skeleton className="h-[420px] rounded-xl" />
              <Skeleton className="h-[420px] rounded-xl" />
              <Skeleton className="h-[420px] rounded-xl" />
            </div>
          </div>
        ) : (
          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(260px,0.3fr)_minmax(0,0.7fr)]">
            <ScoreRadialChart
              centerValue={overallCenterScore}
              description="Page health score"
              segments={overallSegments}
              title="Page Health"
            />
            <div className="@container/buckets h-full min-w-0 w-full">
              <div className="grid h-full auto-rows-fr grid-cols-1 gap-4 @min-[28rem]/buckets:grid-cols-2 @min-[56rem]/buckets:grid-cols-3">
                {pillarRadials.map((pillar) => (
                  <ScoreRadialChart
                    key={pillar.id}
                    centerLabel={pillar.label}
                    centerValue={pillar.score}
                    description={
                      pillar.issueCount > 0
                        ? `${pillar.issueCount} issue${
                            pillar.issueCount === 1 ? "" : "s"
                          } on this page`
                        : "No issues on this page"
                    }
                    segments={pillar.segments}
                    title={pillar.label}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {scopedBreakdown ? (
        <div className="px-4 lg:px-6">
          <Card className="bg-gradient-to-br from-card via-card to-muted/30">
            <IssueTreemap
              breakdown={scopedBreakdown}
              onSelect={(selection) => {
                if (selection.bucketId) {
                  handleFocusBucket(
                    selection.pillarId,
                    selection.bucketId,
                    selection.issueTypeId
                  )
                  return
                }
                issueExplorerRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }}
            />
            <Separator />
            <div className="scroll-mt-4" ref={issueExplorerRef}>
              <IssueExplorer
                breakdown={scopedBreakdown}
                focusRequest={bucketFocus}
                scopedUrl={page.url}
              />
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
})
