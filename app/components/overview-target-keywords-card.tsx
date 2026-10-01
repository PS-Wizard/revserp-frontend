"use client"

import { useQuery } from "@tanstack/react-query"

import { OverviewKeywordCloud } from "~/components/overview-keyword-cloud"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"
import { ApiError } from "~/lib/api"
import {
  normalizeProjectKeywordLists,
  projectKeywordListsQueryOptions,
} from "~/lib/project-keywords-query"

export function OverviewTargetKeywordsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const query = useQuery({
    ...projectKeywordListsQueryOptions(projectId!),
    enabled: Boolean(projectId),
  })
  const combined = normalizeProjectKeywordLists(query.data).combined

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3 className="truncate font-heading text-base font-semibold tracking-tight">
          Keywords
        </h3>
        <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-yellow-700 dark:bg-yellow-400" />
            Brand
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-600 dark:bg-blue-400" />
            Non-brand
          </span>
        </div>
      </div>
      <Separator />
      {!projectId ? (
        <div className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
          Select a project to see keywords.
        </div>
      ) : query.isLoading && !query.data ? (
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
              : "Could not load keywords."}
          </p>
          <Button onClick={() => void query.refetch()} size="sm" type="button">
            Try again
          </Button>
        </div>
      ) : combined.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">
          No keywords yet. Open the Keywords tab to add or generate them.
        </div>
      ) : (
        <OverviewKeywordCloud items={combined} />
      )}
    </Card>
  )
}
