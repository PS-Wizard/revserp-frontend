"use client"

import { useCallback, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { clientApiFetch, clientApiPut } from "~/lib/api"
import {
  mergeOnboardingCheckpoint,
  type OnboardingCheckpoint,
  type OnboardingState,
  type OnboardingStatus,
  type OnboardingWrite,
} from "~/lib/onboarding-state"

export function onboardingQueryKey(orgId: string, userId: string) {
  return ["onboarding", orgId, userId] as const
}

/**
 * GET /me/onboarding returns direct state; the backend backfills old users.
 * Abort-aware so unmounts and session changes cancel the request.
 */
async function fetchOnboardingState(signal?: AbortSignal) {
  return clientApiFetch<OnboardingState>(
    "/me/onboarding",
    signal ? { signal } : {},
  )
}

function writeOnboardingState(body: OnboardingWrite) {
  return clientApiPut<OnboardingState>("/me/onboarding", body)
}

/**
 * Tour progress, fetched separately from /me/bootstrap. Serialized saves
 * merge against the latest pending write; org + user scoping keeps sessions
 * apart. Version stays 1; unknown versions never auto-replay.
 */
export function useOnboardingState({
  orgId,
  userId,
}: {
  orgId: string | null
  userId: string | null
}) {
  const queryClient = useQueryClient()
  const scopeKey = orgId && userId ? `${orgId}:${userId}` : null
  const scopeRef = useRef(scopeKey)
  scopeRef.current = scopeKey
  const saveChainRef = useRef(Promise.resolve())
  const pendingWriteRef = useRef<OnboardingWrite | null>(null)

  const query = useQuery({
    queryKey: onboardingQueryKey(orgId ?? "none", userId ?? "none"),
    queryFn: ({ signal }) => fetchOnboardingState(signal),
    enabled: scopeKey !== null,
    staleTime: 60_000,
    retry: 1,
  })

  useEffect(() => {
    saveChainRef.current = Promise.resolve()
    pendingWriteRef.current = null
  }, [scopeKey])

  useEffect(
    () => () => {
      scopeRef.current = null
      pendingWriteRef.current = null
    },
    [],
  )

  const save = useCallback(
    (write: OnboardingWrite) => {
      const scope = scopeRef.current
      if (!scope) return Promise.resolve(null)
      const run = saveChainRef.current.then(async () => {
        if (scopeRef.current !== scope) return null
        const saved = await writeOnboardingState(write)
        if (scopeRef.current !== scope) return null
        // Adopt canonical only while still the newest intent.
        if (pendingWriteRef.current === write) {
          const { completed_at: _completedAt, ...savedWrite } = saved
          pendingWriteRef.current = savedWrite
        }
        queryClient.setQueryData(
          onboardingQueryKey(...(scope.split(":") as [string, string])),
          saved,
        )
        return saved
      })
      saveChainRef.current = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },
    [queryClient],
  )

  const saveCheckpoint = useCallback(
    (
      checkpoint: OnboardingCheckpoint,
      options?: { projectId?: string; crawlId?: string; force?: boolean },
    ) => {
      const current = query.data
      const pending = pendingWriteRef.current
      const baseCheckpoint = pending?.checkpoint ?? current?.checkpoint
      const merged =
        baseCheckpoint && !options?.force
          ? mergeOnboardingCheckpoint(baseCheckpoint, checkpoint)
          : checkpoint
      const status: OnboardingStatus = "in_progress"
      const write: OnboardingWrite = {
        version: 1,
        status,
        checkpoint: merged,
        ...(options?.projectId ?? pending?.project_id ?? current?.project_id
          ? {
              project_id:
                options?.projectId ??
                pending?.project_id ??
                current?.project_id,
            }
          : {}),
        ...(options?.crawlId ?? pending?.crawl_id ?? current?.crawl_id
          ? {
              crawl_id:
                options?.crawlId ?? pending?.crawl_id ?? current?.crawl_id,
            }
          : {}),
      }
      pendingWriteRef.current = write
      return save(write)
    },
    [query.data, save],
  )

  /** Dismiss records skipped, never complete. */
  const skipTour = useCallback(() => {
    const pending = pendingWriteRef.current
    const current = query.data
    const write: OnboardingWrite = {
      version: 1,
      status: "skipped",
      checkpoint: pending?.checkpoint ?? current?.checkpoint ?? "new_project",
      ...(pending?.project_id ?? current?.project_id
        ? { project_id: pending?.project_id ?? current?.project_id }
        : {}),
      ...(pending?.crawl_id ?? current?.crawl_id
        ? { crawl_id: pending?.crawl_id ?? current?.crawl_id }
        : {}),
    }
    pendingWriteRef.current = write
    return save(write)
  }, [query.data, save])

  const completeTour = useCallback(() => {
    const pending = pendingWriteRef.current
    const current = query.data
    const write: OnboardingWrite = {
      version: 1,
      status: "completed",
      checkpoint: "finish",
      ...(pending?.project_id ?? current?.project_id
        ? { project_id: pending?.project_id ?? current?.project_id }
        : {}),
      ...(pending?.crawl_id ?? current?.crawl_id
        ? { crawl_id: pending?.crawl_id ?? current?.crawl_id }
        : {}),
    }
    pendingWriteRef.current = write
    return save(write)
  }, [query.data, save])

  return {
    onboarding: query.data ?? null,
    isLoadingOnboarding: query.isLoading,
    onboardingScopeKey: scopeKey,
    saveOnboardingCheckpoint: saveCheckpoint,
    skipOnboardingTour: skipTour,
    completeOnboardingTour: completeTour,
  }
}
