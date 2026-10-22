"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { CompetitorInitializationResponse } from "~/lib/api.types"
import {
  competitorInitializationQueryKey,
  competitorInitializationRefetchInterval,
  competitorKeywordAnalysisQueryKey,
  fetchCompetitorInitialization,
  projectKeywordAnalysisQueryKey,
  retryCompetitorInitialization,
  startCompetitorInitialization,
} from "~/lib/keyword-analysis-api"

// Backend-owned competitor setup row with bounded polling while running.
export function useCompetitorInitialization({
  projectId,
  competitorId,
  parentCrawlId = null,
  enabled,
}: {
  projectId: string | null
  competitorId: string | null
  parentCrawlId?: string | null
  enabled: boolean
}) {
  const queryClient = useQueryClient()
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState("")
  const completedRef = useRef(false)

  const ready = enabled && !!projectId && !!competitorId
  const queryKey = competitorInitializationQueryKey(
    projectId ?? "none",
    competitorId ?? "none"
  )
  const query = useQuery({
    queryKey,
    queryFn: () => fetchCompetitorInitialization(projectId!, competitorId!),
    enabled: ready,
    refetchInterval: (query) =>
      competitorInitializationRefetchInterval(query.state.data?.status ?? null),
  })

  const loadError = query.isError
    ? query.error instanceof Error && query.error.message
      ? query.error.message
      : "Could not load competitor setup."
    : ""

  const refreshDependents = useCallback(() => {
    if (!projectId || !competitorId) return
    void queryClient.invalidateQueries({
      queryKey: ["project-competitors", projectId],
    })
    void queryClient.invalidateQueries({
      queryKey: projectKeywordAnalysisQueryKey(projectId),
    })
    void queryClient.invalidateQueries({
      queryKey: competitorKeywordAnalysisQueryKey(projectId, competitorId),
    })
  }, [projectId, competitorId, queryClient])

  // Completion is the first moment the competitor crawl id and keyword
  // estimates can exist. Refresh them so insights never read a stale saved
  // crawl id or stale metrics. Polling stops on completion, so this fires once
  // per transition; the POST path below covers an already-completed response.
  useEffect(() => {
    if (!projectId || !competitorId) return
    if (query.data?.status !== "completed" || completedRef.current) return
    completedRef.current = true
    refreshDependents()
  }, [query.data?.status, projectId, competitorId, refreshDependents])

  useEffect(() => {
    setStartError("")
    setIsStarting(false)
    completedRef.current = false
  }, [projectId, competitorId])

  const run = useCallback(
    async (kind: "start" | "retry") => {
      if (!projectId || !competitorId || isStarting) return
      setStartError("")
      setIsStarting(true)
      try {
        const setup =
          kind === "start"
            ? await startCompetitorInitialization(
                projectId,
                competitorId,
                parentCrawlId
              )
            : await retryCompetitorInitialization(
                projectId,
                competitorId,
                parentCrawlId
              )
        queryClient.setQueryData(queryKey, setup)
        if (setup.status === "completed") {
          completedRef.current = true
          refreshDependents()
        }
      } catch (error) {
        setStartError(
          error instanceof Error && error.message
            ? error.message
            : "Unable to initialize this competitor."
        )
      } finally {
        setIsStarting(false)
      }
    },
    [
      projectId,
      competitorId,
      parentCrawlId,
      isStarting,
      queryClient,
      queryKey,
      refreshDependents,
    ]
  )

  const start = useCallback(() => run("start"), [run])
  const retry = useCallback(() => run("retry"), [run])

  return {
    setup: (query.data ?? null) as CompetitorInitializationResponse | null,
    isLoading: query.isLoading,
    loadError,
    isStarting,
    startError,
    start,
    retry,
    refetch: query.refetch,
  }
}
