"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  InfoIcon,
  Loader2,
  RefreshCwIcon,
  TagsIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { queryMatchRowClassName } from "~/components/gsc-overview/query-match-badges"
import { useRevbotStartPrompt } from "~/components/revbot/revbot-start-prompt-context"
import {
  KEYWORD_KIND_LABELS,
  keywordCardClass,
} from "~/components/keyword-management/keyword-card-parts"
import { Badge } from "~/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { useOrganizationEventsListener } from "~/hooks/use-organization-events"
import { ApiError } from "~/lib/api"
import type {
  KeywordAnalysis,
  ProjectKeywordAnalysisResponse,
} from "~/lib/api.types"
import { useFeatures } from "~/lib/features"
import { cn } from "~/lib/utils"
import {
  KEYWORD_ESTIMATES_TOOLTIP,
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
}

const DASH = "—"

const ANALYZE_POLL_MS = 5000
const ANALYZE_TIMEOUT_MS = 5 * 60_000
const keywordAnalysisCardClass = cn(keywordCardClass, "h-[32rem] min-w-0")

export function formatAnalysisCount(value: number | null) {
  return value === null || value === undefined ? DASH : value.toLocaleString()
}

export function formatAnalysisRank(value: number | null) {
  return value === null || value === undefined ? DASH : value.toLocaleString()
}

export function formatAnalysisKd(value: number | null) {
  return value === null || value === undefined
    ? DASH
    : `${value.toLocaleString()}%`
}

export function formatAnalysisCpc(value: number | null) {
  if (value === null || value === undefined) return DASH
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function projectAnalyzeKeywordsPrompt() {
  return [
    "Estimate keyword metrics for this project with the Revserp keyword tools.",
    "",
    "1. Start by calling get_project_keywords AND get_business_profile so you know the saved brand and non-brand keywords plus the brand, offering, and audience. Ground every estimate in crawled page content (titles, headings, body text) and Search Console data when connected. Do not use web search.",
    "2. For EVERY saved keyword (brand and non-brand), estimate ALL five metrics as numbers: rank (1-100), traffic, volume, kd (0-100), cpc. Every metric must be a best-effort educated guess even without measured data — never null, never omitted, never \"--\".",
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
    "3. For EVERY competitor keyword, estimate ALL five metrics as numbers: rank (1-100), traffic, volume, kd (0-100), cpc. Every metric must be a best-effort educated guess even without measured data — never null, never omitted, never \"--\".",
    `4. Save the complete list with set_keyword_analysis including competitor_id "${competitorId}".`,
  ].join("\n")
}

function estimatesSignature(keywords: KeywordAnalysis[] | null | undefined) {
  return JSON.stringify(keywords ?? null)
}

function hasEstimateGaps(keywords: KeywordAnalysis[]) {
  return keywords.some(
    (row) =>
      row.rank === null ||
      row.rank === undefined ||
      row.traffic === null ||
      row.traffic === undefined ||
      row.volume === null ||
      row.volume === undefined ||
      row.kd === null ||
      row.kd === undefined ||
      row.cpc === null ||
      row.cpc === undefined
  )
}

function KeywordKindBadge({ kind }: { kind: KeywordAnalysis["kind"] }) {
  const isBrand = kind === "brand"
  return (
    <Badge
      variant="outline"
      className={
        isBrand
          ? "border-yellow-500/40 bg-yellow-400/15 text-yellow-800 dark:text-yellow-200"
          : "border-blue-500/40 bg-blue-400/15 text-blue-800 dark:text-blue-200"
      }
    >
      {KEYWORD_KIND_LABELS[isBrand ? "brand" : "non_brand"]}
    </Badge>
  )
}

function EstimatesNote() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={KEYWORD_ESTIMATES_TOOLTIP}
            className="inline-flex shrink-0 items-center text-muted-foreground"
            tabIndex={0}
          />
        }
      >
        <InfoIcon aria-hidden="true" className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs break-words">
        {KEYWORD_ESTIMATES_TOOLTIP}
      </TooltipContent>
    </Tooltip>
  )
}

export function KeywordAnalysisCard({
  projectId,
  competitorId = null,
  title,
  scopeNotice,
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
  const listsQuery = useQuery({
    ...projectKeywordListsQueryOptions(projectId ?? ""),
  })
  const canManage = normalizeProjectKeywordLists(
    listsQuery.data
  ).can_manage_keywords

  const keywords = useMemo(
    () => query.data?.keywords ?? [],
    [query.data]
  )
  const brandCount = useMemo(
    () => keywords.filter((row) => row.kind === "brand").length,
    [keywords]
  )
  const nonBrandCount = useMemo(
    () => keywords.filter((row) => row.kind === "non_brand").length,
    [keywords]
  )
  const gaps = useMemo(() => hasEstimateGaps(keywords), [keywords])
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

  const showAnalyzeButton = Boolean(canManage && startPrompt && projectId)

  return (
    <Card className={keywordAnalysisCardClass}>
      <div className="flex min-h-20 shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-semibold tracking-tight">
            {title}
            <EstimatesNote />
          </h3>
          {scopeNotice ? (
            <p className="text-xs text-pretty text-muted-foreground">
              {scopeNotice}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            {brandCount} brand · {nonBrandCount} non-brand
          </p>
          {watching ? (
            <Button disabled size="xs" type="button" variant="ghost">
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              Working
            </Button>
          ) : gaps && keywords.length > 0 && showAnalyzeButton ? (
            <Button
              disabled={!canGenerate}
              onClick={openAnalysisChat}
              size="xs"
              type="button"
              variant="ghost"
            >
              <RefreshCwIcon aria-hidden="true" />
              Analyze keywords
            </Button>
          ) : null}
        </div>
      </div>
      {keywords.length === 0 ? (
        <Empty className="min-h-48 border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TagsIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No estimates yet</EmptyTitle>
            <EmptyDescription>
              Let Revbot estimate rank, traffic, volume, KD, and CPC
              for this site&apos;s keywords.
            </EmptyDescription>
          </EmptyHeader>
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
        </Empty>
      ) : (
        <div
          aria-label={`${title} table`}
          className="min-h-0 flex-1 overflow-auto border-t border-border/40 [&>[data-slot=table-container]]:overflow-visible"
          role="region"
          tabIndex={0}
        >
          <Table className="min-w-[40rem]">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Rank</TableHead>
                <TableHead className="text-right">Traffic</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">KD</TableHead>
                <TableHead className="text-right">CPC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keywords.map((row) => {
                const isBrand = row.kind === "brand"
                return (
                  <TableRow
                    key={`${row.kind}:${row.keyword}`}
                    className={queryMatchRowClassName({
                      brand: isBrand,
                      nonBrand: !isBrand,
                    })}
                  >
                    <TableCell className="max-w-56 truncate font-medium">
                      {row.keyword}
                    </TableCell>
                    <TableCell>
                      <KeywordKindBadge kind={row.kind} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisRank(row.rank)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisCount(row.traffic)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisCount(row.volume)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisKd(row.kd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAnalysisCpc(row.cpc)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {keywords.length > 0 ? (
        <p className="shrink-0 border-t border-border/40 px-5 py-3 text-center text-xs text-muted-foreground">
          {watching
            ? "Waiting for new estimates…"
            : KEYWORD_ESTIMATES_TOOLTIP}
        </p>
      ) : null}
    </Card>
  )
}
