"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Loader2,
  RefreshCwIcon,
  TagsIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { useKeywordCoverageQuery } from "~/components/keywords/keywords-coverage"
import { AddNonBrandKeywordButton } from "~/components/keywords/add-non-brand-keyword-button"
import { KeywordEstimatesTable } from "~/components/keywords/keyword-estimates-table"
import { useRevbotStartPrompt } from "~/components/revbot/revbot-start-prompt-context"
import { keywordCardClass } from "~/components/keyword-management/keyword-card-parts"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { useOrganizationEventsListener } from "~/hooks/use-organization-events"
import { ApiError } from "~/lib/api"
import type {
  KeywordAnalysis,
  KeywordCoverageSeed,
  ProjectKeywordAnalysisResponse,
} from "~/lib/api.types"
import { useFeatures } from "~/lib/features"
import { cn } from "~/lib/utils"
import {
  competitorKeywordAnalysisQueryOptions,
  projectKeywordAnalysisQueryOptions,
} from "~/lib/keyword-analysis-api"
import {
  normalizeProjectKeywordLists,
  projectKeywordListsQueryOptions,
} from "~/lib/project-keywords-query"

type Props = {
  projectId: string | null
  /** When set, reads this competitor's independent keyword estimates. */
  competitorId?: string | null
  title: string
  /** Shown under the title so the reader knows which site was measured. */
  scopeNotice?: string
  /** Opt-in: shows a "+" per row that adds the keyword to this project's non-brand list. */
  allowAddToProject?: boolean
  /** Coverage override for the competitor case; projects load their own. */
  coverage?: KeywordCoverageSeed[]
}

export {
  formatAnalysisCpc,
  formatAnalysisCount,
  formatAnalysisKd,
  formatAnalysisRank,
} from "~/components/keywords/keyword-estimates-table"

const ANALYZE_POLL_MS = 5000
const ANALYZE_TIMEOUT_MS = 5 * 60_000
const keywordAnalysisCardClass = cn(keywordCardClass, "h-[32rem] min-w-0")

function projectAnalyzeKeywordsPrompt() {
  return [
    "Estimate keyword metrics for this project with the Revserp keyword tools.",
    "",
    "1. Start by calling get_project_keywords AND get_business_profile so you know the saved brand and non-brand keywords plus the brand, offering, and audience. Ground every estimate in crawled page content (titles, headings, body text) and Search Console data when connected. Do not use web search.",
    '2. For EVERY saved keyword (brand and non-brand), estimate ALL five metrics as numbers: rank (1-100), traffic, volume, kd (0-100), cpc. Every metric must be a best-effort educated guess even without measured data — never null, never omitted, never "--".',
    "3. Save the complete list with set_keyword_analysis, omitting competitor_id so the estimates attach to the current project.",
  ].join("\n")
}

function competitorAnalyzeKeywordsPrompt(
  competitorId: string,
  known: KeywordAnalysis[]
) {
  const knownSection =
    known.length > 0
      ? `Known competitor keywords to estimate:\n${known
          .map(
            (row) =>
              `- ${row.keyword} (${row.kind === "brand" ? "brand" : "non-brand"})`
          )
          .join("\n")}`
      : "No competitor estimates exist yet. Discover this competitor's real keywords from its crawl content, the competitor roster, or competitor initialization context."
  return [
    `Estimate keyword metrics for ONE competitor only with the Revserp keyword tools. Target competitor_id "${competitorId}": pass it on every set_keyword_analysis call and never write project estimates.`,
    "",
    `1. ${knownSection} get_project_keywords reads the parent project only — never use it for this competitor and never copy the parent project's keywords.`,
    "2. Ground every estimate in the competitor's own crawled page content (titles, headings, body text) and context, plus general knowledge. Web fetch is optional.",
    '3. For EVERY competitor keyword, estimate ALL five metrics as numbers: rank (1-100), traffic, volume, kd (0-100), cpc. Every metric must be a best-effort educated guess even without measured data — never null, never omitted, never "--".',
    `4. Save the complete list with set_keyword_analysis including competitor_id "${competitorId}".`,
  ].join("\n")
}

function estimatesSignature(keywords: KeywordAnalysis[] | null | undefined) {
  return JSON.stringify(keywords ?? null)
}

export function KeywordAnalysisCard({
  projectId,
  competitorId = null,
  title,
  scopeNotice,
  allowAddToProject = false,
  coverage,
}: Props) {
  const features = useFeatures()
  const revbotPrompt = useRevbotStartPrompt()
  const startPrompt = revbotPrompt?.startPrompt
  const [watching, setWatching] = useState(false)
  const baselineRef = useRef<string | null>(null)
  const scopedCompetitor = competitorId ?? null
  const query = useQuery<ProjectKeywordAnalysisResponse, Error>({
    ...(scopedCompetitor && projectId
      ? competitorKeywordAnalysisQueryOptions(projectId, scopedCompetitor)
      : projectKeywordAnalysisQueryOptions(projectId ?? "")),
    refetchInterval: watching ? ANALYZE_POLL_MS : false,
  })
  const coverageQuery = useKeywordCoverageQuery(
    scopedCompetitor ? null : (projectId ?? null)
  )
  const listsQuery = useQuery({
    ...projectKeywordListsQueryOptions(projectId ?? ""),
  })
  const canManage = normalizeProjectKeywordLists(
    listsQuery.data
  ).can_manage_keywords

  const keywords = useMemo(() => query.data?.keywords ?? [], [query.data])
  const signature = estimatesSignature(query.data?.keywords)

  useEffect(() => {
    setWatching(false)
    baselineRef.current = null
  }, [projectId, scopedCompetitor])

  useEffect(() => {
    if (!watching || baselineRef.current === null) return
    if (signature !== baselineRef.current) {
      setWatching(false)
    }
  }, [watching, signature])

  useEffect(() => {
    if (!watching) return
    const timeout = window.setTimeout(
      () => setWatching(false),
      ANALYZE_TIMEOUT_MS
    )
    return () => window.clearTimeout(timeout)
  }, [watching])

  useOrganizationEventsListener((event) => {
    if (event.type !== "keyword_analysis.updated") return
    if (!projectId || (event.project_id ?? null) !== projectId) return
    const payloadCompetitor =
      typeof event.payload?.competitor_id === "string"
        ? event.payload.competitor_id
        : null
    if ((payloadCompetitor ?? null) !== scopedCompetitor) return
    void query.refetch()
  })

  const canGenerate = Boolean(
    features.ai_chat && startPrompt && projectId && canManage && !watching
  )

  function openAnalysisChat() {
    if (!startPrompt || !projectId) return
    baselineRef.current = signature
    setWatching(true)
    startPrompt(
      scopedCompetitor
        ? competitorAnalyzeKeywordsPrompt(scopedCompetitor, keywords)
        : projectAnalyzeKeywordsPrompt(),
      { keepDocked: true }
    )
  }

  if (!projectId) {
    return (
      <Card className={keywordAnalysisCardClass}>
        <Empty className="min-h-64 border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TagsIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No project selected</EmptyTitle>
            <EmptyDescription>
              Select a project to see keyword estimates.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    )
  }

  if (query.isLoading && !query.data) {
    return (
      <Card className={keywordAnalysisCardClass}>
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-4/5" />
        </div>
      </Card>
    )
  }

  if (query.isError) {
    const isMissing =
      query.error instanceof ApiError && query.error.status === 404
    return (
      <Card className={keywordAnalysisCardClass}>
        <Empty className="min-h-64 border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>
              {isMissing
                ? "Estimates not ready yet"
                : "Could not load estimates"}
            </EmptyTitle>
            <EmptyDescription>
              {query.error instanceof ApiError && !isMissing
                ? query.error.message
                : "Keyword analysis has not finished for this site yet."}
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
      </Card>
    )
  }

  const onAddKeywordProjectId = allowAddToProject ? projectId : null
  const showAnalyzeButton = Boolean(canManage && startPrompt && projectId)

  return (
    <Card className={keywordAnalysisCardClass}>
      <KeywordEstimatesTable
        coverage={
          scopedCompetitor ? coverage : coverageQuery.data?.seeds
        }
        rowAction={
          onAddKeywordProjectId
            ? (row) => (
                <AddNonBrandKeywordButton
                  keyword={row.keyword}
                  projectId={onAddKeywordProjectId}
                />
              )
            : undefined
        }
        action={
          watching ? (
            <Button disabled size="xs" type="button" variant="ghost">
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              Working
            </Button>
          ) : keywords.length > 0 && showAnalyzeButton ? (
            <Button
              disabled={!canGenerate}
              onClick={openAnalysisChat}
              size="xs"
              type="button"
              variant="ghost"
            >
              <RefreshCwIcon aria-hidden="true" />
              Refresh estimates
            </Button>
          ) : null
        }
        description={scopeNotice}
        emptyAction={
          // ponytail: fragment keeps both CTAs without a wrapper div
          // that would break the Empty layout.
          <>
            {showAnalyzeButton ? (
              <Button
                className="mt-2"
                disabled={watching || !canGenerate}
                onClick={openAnalysisChat}
                size="sm"
                type="button"
              >
                {watching ? (
                  <>
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    Generating…
                  </>
                ) : (
                  "Analyze Keywords"
                )}
              </Button>
            ) : null}
            {watching ? (
              <Button
                onClick={() => void query.refetch()}
                size="sm"
                type="button"
                variant="ghost"
              >
                Check again
              </Button>
            ) : null}
          </>
        }
        footerNote={watching ? "Waiting for new estimates…" : undefined}
        rows={keywords}
        title={title}
      />
    </Card>
  )
}
