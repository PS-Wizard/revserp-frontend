import type { QueryClient } from "@tanstack/react-query"

import { clientApiFetch } from "~/lib/api"
import type { ProjectBusinessProfileStatusResponse } from "~/lib/api.types"

export function businessProfileQueryKey(projectId: string) {
  return ["business-profile", projectId] as const
}

export function fetchBusinessProfile(projectId: string) {
  return clientApiFetch<ProjectBusinessProfileStatusResponse>(
    `/projects/${projectId}/business-profile`
  )
}

export function invalidateBusinessProfile(
  queryClient: QueryClient,
  projectId: string
) {
  return queryClient.invalidateQueries({
    queryKey: businessProfileQueryKey(projectId),
  })
}
