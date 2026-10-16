"use client"

import { useCallback, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useOrganizationEventsListener } from "~/hooks/use-organization-events"
import {
  fetchLocationSetup,
  locationSetupQueryKey,
  locationSetupRefetchInterval,
  startLocationSetup,
  type LocationSetupResponse,
} from "~/lib/location-setup-api"

// Backend-owned setup row; org events refresh it, bounded poll covers running.
export function useLocationSetup({
  projectId,
  locationId,
  enabled,
}: {
  projectId: string | null
  locationId: string | null
  enabled: boolean
}) {
  const queryClient = useQueryClient()
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState("")

  const ready = enabled && !!projectId && !!locationId
  const query = useQuery({
    queryKey: locationSetupQueryKey(projectId ?? "none", locationId ?? "none"),
    queryFn: () => fetchLocationSetup(projectId!, locationId!),
    enabled: ready,
    refetchInterval: (query) =>
      locationSetupRefetchInterval(query.state.data?.status ?? null),
  })

  useEffect(() => {
    setStartError("")
    setIsStarting(false)
  }, [projectId, locationId])

  useOrganizationEventsListener((event) => {
    if (!projectId || !locationId) return
    if ((event.project_id ?? null) !== projectId) return
    const payload = event.payload as { location_id?: unknown }
    if (payload.location_id !== locationId) return
    void queryClient.invalidateQueries({
      queryKey: locationSetupQueryKey(projectId, locationId),
    })
  })

  const start = useCallback(
    async (differences?: string) => {
      if (!projectId || !locationId || isStarting) return
      setStartError("")
      setIsStarting(true)
      try {
        const setup = await startLocationSetup(
          projectId,
          locationId,
          differences
        )
        queryClient.setQueryData(
          locationSetupQueryKey(projectId, locationId),
          setup
        )
      } catch (error) {
        setStartError(
          error instanceof Error && error.message
            ? error.message
            : "Unable to initialize this location."
        )
      } finally {
        setIsStarting(false)
      }
    },
    [projectId, locationId, isStarting, queryClient]
  )

  const retry = useCallback(() => start(), [start])

  const loadError = query.isError
    ? query.error instanceof Error && query.error.message
      ? query.error.message
      : "Could not load location setup."
    : ""
  return {
    setup: (query.data ?? null) as LocationSetupResponse | null,
    isLoading: query.isLoading,
    loadError,
    isStarting,
    startError,
    start,
    retry,
    refetch: query.refetch,
  }
}
