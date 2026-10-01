import type { QueryClient } from "@tanstack/react-query"

import { invalidateProjectKeywordLists } from "~/lib/project-keywords-query"
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
  // Legacy profile tool routes also carried keyword writes, so a profile
  // update refreshes the keyword lists plus the derived coverage matrix.
  return queryClient
    .invalidateQueries({
      queryKey: businessProfileQueryKey(projectId),
    })
    .then(() => invalidateProjectKeywordLists(queryClient, projectId))
}
