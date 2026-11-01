"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { SwordsIcon } from "lucide-react"

import {
  KeywordCardEmpty,
  KeywordCardError,
  KeywordCardList,
  KeywordCardSkeleton,
  KeywordSelectionCheckbox,
  keywordCardClass,
  keywordErrorMessage,
} from "~/components/keyword-management/keyword-card-parts"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { clientApiFetch } from "~/lib/api"
import type {
  CompetitorResponse,
  CrawlsResponse,
  ProjectCompetitorsResponse,
} from "~/lib/api.types"
import { useCompetitorKeywordSelections } from "~/lib/competitor-keyword-selections"
import { competitorKeywordAnalysisQueryOptions } from "~/lib/keyword-analysis-api"

function competitorDisplayName(competitor: CompetitorResponse) {
  const name = competitor.name.trim()
  if (name) return name
  try {
    return new URL(competitor.seed_url).hostname.replace(/^www\./, "")
  } catch {
    return competitor.seed_url
  }
}

function CompetitorEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50">
        <SwordsIcon aria-hidden="true" className="size-5 text-sky-400" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Button
        className="mt-2"
        nativeButton={false}
        render={<a href="#competitors">Open Competitors</a>}
        size="sm"
        type="button"
      />
    </div>
  )
}

export function ProjectCompetitorKeywordsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const [tab, setTab] = useState<string | null>(null)
  const { selected, toggle } = useCompetitorKeywordSelections(projectId)
  const selectedKeys = useMemo(
    () => new Set(selected.map((phrase) => phrase.toLowerCase())),
    [selected]
  )

  const crawlsQuery = useQuery({
    queryKey: ["project-crawls", projectId ?? "none"],
    queryFn: () =>
      clientApiFetch<CrawlsResponse>(
        `/projects/${projectId!}/crawls?limit=50&offset=0`
      ),
    enabled: Boolean(projectId),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  })

  const parentCrawlId = useMemo(() => {
    const completed = (crawlsQuery.data?.crawls ?? []).filter(
      (crawl) => crawl.status === "completed"
    )
    completed.sort(
      (left, right) =>
        +new Date(right.completed_at ?? right.created_at) -
        +new Date(left.completed_at ?? left.created_at)
    )
    return completed[0]?.id ?? null
  }, [crawlsQuery.data])

  const competitorsQuery = useQuery({
    queryKey: ["project-competitors", projectId ?? "none", parentCrawlId],
    queryFn: () => {
      const crawlQuery = parentCrawlId ? `?crawl=${parentCrawlId}` : ""
      return clientApiFetch<ProjectCompetitorsResponse>(
        `/projects/${projectId!}/competitors${crawlQuery}`
      )
    },
    enabled: Boolean(projectId) && !crawlsQuery.isLoading,
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  })

  const completed = useMemo(
    () =>
      (competitorsQuery.data?.competitors ?? []).filter(
        (competitor) => competitor.crawl?.status === "completed"
      ),
    [competitorsQuery.data]
  )

  useEffect(() => {
    if (completed.length === 0) {
      setTab(null)
      return
    }
    setTab((current) =>
      current && completed.some((competitor) => competitor.id === current)
        ? current
        : completed[0].id
    )
  }, [completed])

  const activeCompetitor =
    completed.find((competitor) => competitor.id === tab) ?? null

  const analysisQuery = useQuery({
    ...competitorKeywordAnalysisQueryOptions(projectId ?? "", tab ?? ""),
    enabled: Boolean(projectId) && Boolean(tab),
  })

  const rows = useMemo(() => {
    const keywords = (analysisQuery.data?.keywords ?? []).filter(
      (row) => row.kind === "non_brand"
    )
    return [...keywords].sort((left, right) =>
      left.keyword.localeCompare(right.keyword)
    )
  }, [analysisQuery.data])

  const loading =
    crawlsQuery.isLoading ||
    competitorsQuery.isLoading ||
    (Boolean(tab) && analysisQuery.isLoading && !analysisQuery.data)
  const error =
    crawlsQuery.error ?? competitorsQuery.error ?? analysisQuery.error
  const retry = () => {
    if (crawlsQuery.isError) void crawlsQuery.refetch()
    else if (competitorsQuery.isError) void competitorsQuery.refetch()
    else void analysisQuery.refetch()
  }

  return (
    <Card className={keywordCardClass}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3 className="font-heading text-base font-semibold tracking-tight">
          Competitor keywords
        </h3>
        {completed.length > 0 ? (
          <Tabs onValueChange={setTab} value={tab ?? ""}>
            <TabsList className="h-auto max-w-full shrink gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
              {completed.map((competitor) => (
                <TabsTrigger
                  className="max-w-32 truncate px-2.5 py-1 text-xs"
                  key={competitor.id}
                  title={competitorDisplayName(competitor)}
                  value={competitor.id}
                >
                  {competitorDisplayName(competitor)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
      </div>
      <Separator />
      {!projectId ? (
        <KeywordCardEmpty message="Select a project to see competitor keywords." />
      ) : loading ? (
        <KeywordCardSkeleton />
      ) : error ? (
        <KeywordCardError
          message={keywordErrorMessage(
            error,
            "Could not load competitor keywords."
          )}
          onRetry={retry}
        />
      ) : completed.length === 0 ? (
        <CompetitorEmptyState
          description="Crawl a competitor to surface the non-brand terms worth covering."
          title="No crawled competitors"
        />
      ) : rows.length === 0 ? (
        <CompetitorEmptyState
          description={
            activeCompetitor
              ? `${competitorDisplayName(activeCompetitor)} has no non-brand keywords yet. Add competitors or refresh their analysis in the Competitors tab.`
              : "No non-brand competitor keywords yet."
          }
          title="No competitor keywords"
        />
      ) : (
        <>
          <KeywordCardList
            emptyMessage="No non-brand competitor keywords yet."
            getKey={(row) => `${row.keyword.toLowerCase()}`}
            getPhrase={(row) => row.keyword}
            items={rows}
            leading={(row) => (
              <KeywordSelectionCheckbox
                checked={selectedKeys.has(row.keyword.toLowerCase())}
                onToggle={() => toggle(row.keyword)}
                phrase={row.keyword}
              />
            )}
          />
          <div className="shrink-0 border-t border-border/40 px-3 py-3">
            <p className="px-2 text-xs text-muted-foreground">
              {selected.length === 0
                ? "Tick keywords to fold them into coverage and the cloud."
                : `${selected.length} selected — coverage and the cloud update immediately.`}
            </p>
          </div>
        </>
      )}
    </Card>
  )
}
