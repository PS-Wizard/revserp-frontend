import { useQuery } from "@tanstack/react-query"

import { clientApiFetch } from "~/lib/api"

import type {
  IssueWorkspaceChangeStatus,
  IssueWorkspaceChangesResponse,
} from "./issue-workspace.types"

const CHANGES_PAGE_SIZE = 500

export function useIssueWorkspaceChanges(
  crawlId: string | null,
  status: IssueWorkspaceChangeStatus,
  enabled: boolean
) {
  return useQuery({
    enabled: Boolean(crawlId) && enabled,
    queryKey: ["issue-workspace-changes", crawlId, status],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({
        status,
        limit: String(CHANGES_PAGE_SIZE),
        offset: "0",
      })
      return clientApiFetch<IssueWorkspaceChangesResponse>(
        `/crawls/${crawlId}/issue-workspace/changes?${qs.toString()}`,
        { signal }
      )
    },
  })
}
