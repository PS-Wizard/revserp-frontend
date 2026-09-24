"use client"

import { memo, useCallback, useMemo, useRef, useState } from "react"

import { FileWarningIcon } from "lucide-react"
import { IssueExplorer } from "~/components/issue-explorer"
import { IssueTreemap } from "~/components/issue-treemap"
import {
  usePageHealthDetail,
  usePageIssueDetail,
} from "~/components/page-audit/use-page-audit-queries"
import type { SelectedAuditPage } from "~/components/page-audit/page-audit-context"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import { Card } from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"
import {
  buildPageScopedBreakdown,
  countPageIssuesByPillar,
} from "~/lib/build-page-breakdown"
import { getPillarChartColor } from "~/lib/pillar-colors"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import { ApiError } from "~/lib/api"
import { formatBucketLabel } from "~/lib/utils"

const PILLAR_LABELS: Record<string, string> = {
  seo: "SEO",
  aeo: "AEO",
  pagespeed: "PageSpeed",
}

export const PageHealthView = memo(function PageHealthView({
  crawlId,
  page,
  breakdown,
}: {
  crawlId: string | null
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

  const pillarIssueCounts = useMemo(
    () => countPageIssuesByPillar(pageIssues),
    [pageIssues]
  )

  const healthData = healthQuery.data ?? null
  const overallCenterScore =
    healthData !== null ? healthData.health_score : undefined

  const overallSegments = useMemo(() => {
    if (!healthData?.pillars.length) return []

    return healthData.pillars.map((pillar) => {
      const pillarMeta = breakdown?.pillars.find(
        (entry) => entry.id === pillar.id
      )
      return {
        key: pillar.id,
        label: pillarMeta?.label ?? PILLAR_LABELS[pillar.id] ?? pillar.id,
        value: pillar.score,
        color: getPillarChartColor(pillar.id, 0),
      }
    })
  }, [breakdown, healthData])

  const pillarRadials = useMemo(() => {
    if (!healthData?.pillars.length) return []

    return healthData.pillars.map((pillar) => {
      const pillarMeta = breakdown?.pillars.find(
        (entry) => entry.id === pillar.id
      )
      const label = pillarMeta?.label ?? PILLAR_LABELS[pillar.id] ?? pillar.id
      const issueCount = pillarIssueCounts[pillar.id] ?? 0

      return {
        id: pillar.id,
        label,
        score: pillar.score,
        issueCount,
        segments: pillar.buckets.map((bucket, index) => {
          const bucketMeta = pillarMeta?.buckets.find(
            (entry) => entry.id === bucket.id
          )
          return {
            key: bucket.id,
            label: formatBucketLabel(bucket.id, bucketMeta?.label ?? bucket.id),
            value: bucket.score,
            color: getPillarChartColor(pillar.id, index),
          }
        }),
      }
    })
  }, [breakdown, healthData, pillarIssueCounts])

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

  const isScoresLoading = healthQuery.isLoading
  const healthErrorMessage =
    healthQuery.error instanceof ApiError
      ? healthQuery.error.message
      : healthQuery.error instanceof Error
        ? healthQuery.error.message
        : "Unable to load page health scores."
  const hasNoScoreData = !isScoresLoading && !healthQuery.isError && !healthData

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {isScoresLoading ? (
        <div className="px-4 lg:px-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.3fr)_minmax(0,0.7fr)]">
            <Skeleton className="h-[420px] rounded-xl" />
            <div className="grid auto-rows-fr grid-cols-1 gap-4 @min-[28rem]/buckets:grid-cols-2 @min-[56rem]/buckets:grid-cols-3">
              <Skeleton className="h-[420px] rounded-xl" />
              <Skeleton className="h-[420px] rounded-xl" />
              <Skeleton className="h-[420px] rounded-xl" />
            </div>
          </div>
        </div>
      ) : healthQuery.isError ? (
        <div className="px-4 lg:px-6">
          <Card className="bg-gradient-to-br from-card via-card to-muted/30 p-6">
            <p className="text-sm text-destructive">{healthErrorMessage}</p>
          </Card>
        </div>
      ) : hasNoScoreData ? (
        <div className="px-4 lg:px-6">
          <Empty className="min-h-[420px]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileWarningIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Unsupported crawl version</EmptyTitle>
              <EmptyDescription>
                This crawl has no page score data. Run a full recrawl, then try
                again.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <>
          <div className="px-4 lg:px-6">
            <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(260px,0.3fr)_minmax(0,0.7fr)]">
              <ScoreRadialChart
                centerValue={overallCenterScore}
                description="Page health score"
                segments={overallSegments}
                title="Page Health"
              />
              <div className="@container/buckets h-full w-full min-w-0">
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
        </>
      )}
    </div>
  )
})
