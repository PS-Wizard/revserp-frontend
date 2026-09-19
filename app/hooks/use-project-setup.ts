"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { fetchProjectSetup, startProjectSetup } from "~/lib/api"
import type { ProjectSetupResponse } from "~/lib/api.types"

export function projectSetupQueryKey(projectId: string) {
  return ["project-setup", projectId] as const
}

/**
 * Owns the once-per-project setup row. The backend drives every step and the
 * organization SSE provider refreshes this query (no polling, no second
 * EventSource); this hook only reads the row and starts setup once on demand.
 */
export function useProjectSetup({
  projectId,
  enabled,
}: {
  projectId: string | null
  enabled: boolean
}) {
  const queryClient = useQueryClient()
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState("")

  const query = useQuery({
    queryKey: projectSetupQueryKey(projectId ?? "none"),
    queryFn: () => fetchProjectSetup(projectId!),
    enabled: enabled && !!projectId,
  })

  // A failed start on one project must not surface on the next one; this hook
  // is reused across project switches because the query key changes in place.
  useEffect(() => {
    setStartError("")
    setIsStarting(false)
  }, [projectId])

  // Visibility can be skipped and still complete; surface the reason once the
  // panel swaps out for the freshly refreshed project data. Ids are remembered
  // in a set so revisiting a completed setup never re-fires, and one project's
  // reason never leaks into another.
  const skippedToastIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const setup = query.data
    const reason = setup?.visibility_skip_reason?.trim()
    if (!setup || setup.status !== "completed" || !reason) return
    if (skippedToastIdsRef.current.has(setup.id)) return
    skippedToastIdsRef.current.add(setup.id)
    toast.message("Project setup complete", {
      description: `Visibility was skipped: ${reason}`,
    })
  }, [query.data])

  const start = useCallback(async () => {
    if (!projectId || isStarting) return
    setStartError("")
    setIsStarting(true)
    try {
      const setup = await startProjectSetup(projectId)
      queryClient.setQueryData(projectSetupQueryKey(projectId), setup)
    } catch (error) {
      setStartError(
        error instanceof Error && error.message
          ? error.message
          : "Unable to set up this project."
      )
    } finally {
      setIsStarting(false)
    }
  }, [projectId, isStarting, queryClient])

  return {
    setup: (query.data ?? null) as ProjectSetupResponse | null,
    isLoading: query.isLoading,
    isStarting,
    startError,
    start,
  }
}
