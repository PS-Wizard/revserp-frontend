"use client"

import { memo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { TriangleAlertIcon, XIcon } from "lucide-react"

import { IssueBucketPies } from "~/components/competitors/issue-bucket-pies"
import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { AddNonBrandKeywordButton } from "~/components/keywords/add-non-brand-keyword-button"
import { clientApiFetch } from "~/lib/api"
import { CompetitorPillarCompare } from "~/components/competitors/competitor-pillar-compare"
import { SliceScoreSankey } from "~/components/competitors/competitor-score-sankey"
import { KeywordAnalysisCard } from "~/components/keywords/keyword-analysis-card"
import { KeywordCoverageCard } from "~/components/keywords/keywords-coverage"
import type { CompetitorGapReport } from "~/lib/api.types"

type Props = {
  projectId: string
  competitorId: string
  competitorCrawlId: string
  competitorName: string
  projectName: string
  onClose: () => void
}

function competitorGapQueryKey(competitorCrawlId: string) {
  return ["competitor-gap", competitorCrawlId, "v5"] as const
}

/* ------------------------------------------------------------- primitives */

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
      <div className="flex flex-wrap items-center justify-end gap-3">
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
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-80" />
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}

/* ------------------------------------------------------------------- body */

function InsightsBody({
  projectId,
  competitorId,
  report,
  competitorName,
  projectName,
}: {
  projectId: string
  competitorId: string
  report: CompetitorGapReport
  competitorName: string
  projectName: string
}) {
  const [keywordList, setKeywordList] = useState<"you" | "them">("you")
  const themLabel = competitorName.trim() || "Competitor"
  const youLabel = projectName.trim() || "You"
  const theirList = keywordList === "them"
  const coverage = (theirList
    ? report.competitor_keyword_coverage
    : report.keyword_coverage) ?? { you: [], them: [] }
  const listLabel = theirList
    ? `${themLabel}’s keywords`
    : "Your non-brand keywords"
  const emptyDescription = theirList
    ? `${themLabel} has no non-brand keywords yet.`
    : "No non-brand keywords to compare yet. Add non-brand keywords to the parent project."
  // Our own list is already saved, so "+" only appears on the competitor's list.
  const addRowAction = theirList
    ? (keyword: string) => (
        <AddNonBrandKeywordButton keyword={keyword} projectId={projectId} />
      )
    : undefined
  const youBreakdown = report.you_breakdown
  const themBreakdown = report.them_breakdown

  return (
    <div className="flex flex-col gap-4">
      <CompetitorPillarCompare
        them={themBreakdown}
        themLabel={themLabel}
        you={youBreakdown}
        youLabel={youLabel}
      />

      <IssueBucketPies
        them={themBreakdown}
        themLabel={themLabel}
        you={youBreakdown}
        youLabel={youLabel}
      />

      <section aria-label="Keywords" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-heading text-sm font-semibold">Keywords</h3>
            <p className="text-xs text-muted-foreground">
              {theirList
                ? `Coverage measures ${themLabel}’s non-brand keywords on both sites; Gaps on ${youLabel} are opportunities they target that you don’t.`
                : "Coverage measures your non-brand keywords on both sites; estimates are independent per site."}
            </p>
          </div>
          <Tabs
            onValueChange={(value) => setKeywordList(value as "you" | "them")}
            value={keywordList}
          >
            <TabsList className="h-auto rounded-lg bg-muted/50 p-1">
              <TabsTrigger className="px-2.5 py-1 text-xs" value="you">
                Your keywords
              </TabsTrigger>
              <TabsTrigger className="px-2.5 py-1 text-xs" value="them">
                {themLabel}’s keywords
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <KeywordCoverageCard
            emptyDescription={emptyDescription}
            rowAction={addRowAction}
            scopeNotice={`${listLabel} measured on ${youLabel}.`}
            seeds={coverage.you}
            title={youLabel}
          />
          <KeywordCoverageCard
            emptyDescription={emptyDescription}
            rowAction={addRowAction}
            scopeNotice={`${listLabel} measured on ${themLabel}.`}
            seeds={coverage.them}
            title={themLabel}
          />
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <KeywordAnalysisCard
            projectId={projectId}
            scopeNotice={`Brand and non-brand estimates from ${youLabel}.`}
            title={youLabel}
          />
          <KeywordAnalysisCard
            allowAddToProject
            competitorId={competitorId}
            coverage={report.competitor_keyword_coverage?.them}
            projectId={projectId}
            scopeNotice={`Independent brand and non-brand estimates from ${themLabel}’s crawl.`}
            title={themLabel}
          />
        </div>
      </section>

      <SliceScoreSankey
        them={themBreakdown}
        themLabel={themLabel}
        you={youBreakdown}
        youLabel={youLabel}
      />

    </div>
  )
}

/* -------------------------------------------------------------------- top */

export const CompetitorInsightsView = memo(function CompetitorInsightsView({
  projectId,
  competitorId,
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
        <div>
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
          {query.data.their_pages.toLocaleString()} pages.
        </p>
      }
    >
      <InsightsBody
        competitorId={competitorId}
        competitorName={competitorName}
        projectId={projectId}
        projectName={projectName}
        report={query.data}
      />
    </InsightsShell>
  )
})
