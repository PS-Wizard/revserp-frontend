"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TagsIcon } from "lucide-react"

import { OverviewKeywordCloud } from "~/components/overview-keyword-cloud"
import { useRevbotStartPrompt } from "~/components/revbot/revbot-start-prompt-context"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { Skeleton } from "~/components/ui/skeleton"
import { ApiError } from "~/lib/api"
import {
  businessProfileQueryKey,
  fetchBusinessProfile,
} from "~/lib/business-profile-query"
import { useFeatures } from "~/lib/features"

const KEYWORD_PROMPT = `Review my GSC data if it’s connected. If GSC isn’t available, analyze the latest crawl data instead.

Use the available data to understand what the business currently ranks for and what search terms it should target:

* Prioritize GSC impressions, queries, clicks, and rankings when available.
* Otherwise, inspect crawled URLs and their page titles to understand the site’s services, topics, and target keywords.
* Read the page content of important pages where necessary for additional context.
* Identify high-value keywords and queries the business is already getting visibility for or has a realistic opportunity to target.
* Use those findings to update and optimize the business profile so its description, services, categories, and wording better align with relevant search demand.

Base recommendations on actual search/crawl evidence rather than guessing keywords.`

function KeywordsEmptyState({
  canGenerate,
  onGenerate,
}: {
  canGenerate: boolean
  onGenerate: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50">
        <TagsIcon aria-hidden="true" className="size-5 text-violet-400" />
      </div>
      <p className="text-base font-medium text-foreground">
        No target keywords
      </p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Add keywords to the business profile, or let Revbot find them from
        Search Console and crawl data.
      </p>
      {canGenerate ? (
        <Button className="mt-5" onClick={onGenerate} size="sm" type="button">
          Find keywords
        </Button>
      ) : null}
    </div>
  )
}

export function OverviewTargetKeywordsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const features = useFeatures()
  const startPrompt = useRevbotStartPrompt()
  const [watching, setWatching] = useState(false)

  const query = useQuery({
    queryKey: projectId
      ? businessProfileQueryKey(projectId)
      : ["business-profile-disabled"],
    queryFn: () => fetchBusinessProfile(projectId!),
    enabled: Boolean(projectId),
    placeholderData: (previous) => previous,
    refetchInterval: watching ? 4000 : false,
  })

  const keywords = useMemo(() => {
    const values = query.data?.business_profile?.target_keywords ?? []
    return values.map((keyword) => keyword.trim()).filter(Boolean)
  }, [query.data])

  useEffect(() => {
    if (keywords.length > 0) setWatching(false)
  }, [keywords.length])

  useEffect(() => {
    if (!watching) return
    const timeout = window.setTimeout(() => setWatching(false), 5 * 60_000)
    return () => window.clearTimeout(timeout)
  }, [watching])

  const canGenerate = Boolean(features.ai_chat && startPrompt && projectId)

  const openKeywordChat = () => {
    if (!startPrompt) return
    setWatching(true)
    startPrompt(KEYWORD_PROMPT)
  }

  const body = !projectId ? (
    <div className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
      Select a project to see target keywords.
    </div>
  ) : query.isLoading ? (
    <div className="flex flex-1 flex-col justify-center gap-3 px-5 py-8">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-6 w-2/3" />
    </div>
  ) : query.isError ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        {query.error instanceof ApiError
          ? query.error.message
          : "Could not load target keywords."}
      </p>
      <Button onClick={() => void query.refetch()} size="sm" type="button">
        Try again
      </Button>
    </div>
  ) : keywords.length === 0 ? (
    <KeywordsEmptyState
      canGenerate={canGenerate}
      onGenerate={openKeywordChat}
    />
  ) : (
    <OverviewKeywordCloud keywords={keywords} />
  )

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3 className="truncate font-heading text-base font-semibold tracking-tight">
          Target keywords
        </h3>
      </div>
      {body}
    </Card>
  )
}
