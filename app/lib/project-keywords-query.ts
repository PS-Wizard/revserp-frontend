import type { QueryClient } from "@tanstack/react-query"

import { clientApiDelete, clientApiFetch, clientApiPost } from "~/lib/api"

export type ProjectKeywordKind = "brand" | "non_brand"
export type ProjectKeywordSource = "user" | "revserp"

export interface ProjectKeyword {
  id: string
  keyword: string
  kind: ProjectKeywordKind
}

export interface CombinedProjectKeyword {
  keyword: string
  kind: ProjectKeywordKind
  sources: ProjectKeywordSource[]
}

export interface ProjectKeywordListsResponse {
  can_manage_keywords: boolean
  user_defined: ProjectKeyword[]
  revserp_suggested: ProjectKeyword[]
  combined: CombinedProjectKeyword[]
}

const emptyLists: ProjectKeywordListsResponse = {
  can_manage_keywords: false,
  user_defined: [],
  revserp_suggested: [],
  combined: [],
}

export function normalizeProjectKeywordLists(
  data: ProjectKeywordListsResponse | null | undefined
): ProjectKeywordListsResponse {
  if (!data) return emptyLists
  return {
    can_manage_keywords: data.can_manage_keywords === true,
    user_defined: data.user_defined ?? [],
    revserp_suggested: data.revserp_suggested ?? [],
    combined: data.combined ?? [],
  }
}

export function projectKeywordListsQueryKey(projectId: string) {
  return ["project-keyword-lists", projectId] as const
}

export function fetchProjectKeywordLists(projectId: string) {
  return clientApiFetch<ProjectKeywordListsResponse>(
    `/projects/${projectId}/keyword-lists`
  ).then(normalizeProjectKeywordLists)
}

export function projectKeywordListsQueryOptions(projectId: string) {
  return {
    queryKey: projectKeywordListsQueryKey(projectId),
    queryFn: () => fetchProjectKeywordLists(projectId),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    enabled: Boolean(projectId),
  }
}

export function invalidateProjectKeywordLists(
  queryClient: QueryClient,
  projectId: string
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: projectKeywordListsQueryKey(projectId),
    }),
    queryClient.invalidateQueries({
      queryKey: ["project-keywords", projectId],
    }),
  ])
}

export function applyProjectKeywordListsResponse(
  queryClient: QueryClient,
  projectId: string,
  response: ProjectKeywordListsResponse
) {
  queryClient.setQueryData(
    projectKeywordListsQueryKey(projectId),
    normalizeProjectKeywordLists(response)
  )
  return invalidateProjectKeywordLists(queryClient, projectId)
}

export function createProjectKeyword(
  projectId: string,
  input: { keyword: string; kind: ProjectKeywordKind }
) {
  return clientApiPost<ProjectKeywordListsResponse>(
    `/projects/${projectId}/keyword-lists`,
    input
  ).then(normalizeProjectKeywordLists)
}

export function deleteProjectKeyword(projectId: string, keywordId: string) {
  return clientApiDelete<ProjectKeywordListsResponse>(
    `/projects/${projectId}/keyword-lists/${keywordId}`
  ).then(normalizeProjectKeywordLists)
}
