import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { QueryClient, QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"

import { clientApiDelete, clientApiPost } from "~/lib/api"

import type {
  IssueWorkspacePageDetail,
  IssueWorkspaceWorkItem,
  IssueWorkStateResponse,
} from "./issue-workspace.types"

interface MutationContext {
  crawlId: string | null
  detailKey?: QueryKey
  previousDetail?: IssueWorkspacePageDetail
  optimisticAttemptId?: string
}

function refreshChangedWorkspace(
  queryClient: QueryClient,
  context: MutationContext | undefined
) {
  if (!context?.crawlId) return

  const refreshes = [
    queryClient.invalidateQueries({
      queryKey: ["issue-workspace-summary", context.crawlId],
      exact: true,
    }),
  ]
  if (context.detailKey) {
    refreshes.push(
      queryClient.invalidateQueries({
        queryKey: context.detailKey,
        exact: true,
      })
    )
  } else {
    refreshes.push(
      queryClient.invalidateQueries({
        queryKey: ["issue-workspace-changes", context.crawlId],
      })
    )
  }
  void Promise.all(refreshes)
}

function contributorsFromResponse(response: IssueWorkStateResponse) {
  return response.contributors.map((contributor) => contributor.user_id)
}

export function useIssueWorkMutations({
  crawlId,
  currentUserId,
  selectedUrl,
}: {
  crawlId: string | null
  currentUserId: string
  selectedUrl: string | null
}) {
  const queryClient = useQueryClient()

  const mutationContext = async (): Promise<MutationContext> => {
    if (!crawlId || !selectedUrl) return { crawlId }

    const detailKey = ["issue-workspace-page", crawlId, selectedUrl] as const
    await queryClient.cancelQueries({ queryKey: detailKey, exact: true })
    return {
      crawlId,
      detailKey,
      previousDetail:
        queryClient.getQueryData<IssueWorkspacePageDetail>(detailKey),
    }
  }

  const markDone = useMutation({
    mutationFn: (issueId: string) =>
      clientApiPost<IssueWorkStateResponse>(
        `/crawl-issues/${issueId}/work-done`,
        {}
      ),
    onMutate: async (issueId) => {
      const context = await mutationContext()
      const detail = context.previousDetail
      if (!context.detailKey || !detail) return context

      const issue = [...detail.current_issues, ...detail.issues].find(
        (candidate) => candidate.current_issue_id === issueId
      )
      if (!issue) return context

      const optimisticAttemptId = `optimistic:${issueId}`
      const optimisticWork: IssueWorkspaceWorkItem = {
        work_item_id: optimisticAttemptId,
        attempt_id: optimisticAttemptId,
        url: issue.url,
        subject_kind: "page",
        pillar: issue.pillar,
        bucket: issue.bucket,
        issue_type: issue.issue_type,
        status: "awaiting_verification",
        contributors: [currentUserId],
      }
      queryClient.setQueryData<IssueWorkspacePageDetail>(context.detailKey, {
        ...detail,
        work_items: [...detail.work_items, optimisticWork],
      })
      return { ...context, optimisticAttemptId }
    },
    onSuccess: (response, _issueId, context) => {
      if (context?.detailKey && context.optimisticAttemptId) {
        queryClient.setQueryData<IssueWorkspacePageDetail>(
          context.detailKey,
          (detail) =>
            detail
              ? {
                  ...detail,
                  work_items: detail.work_items.map((work) =>
                    work.attempt_id === context.optimisticAttemptId
                      ? {
                          ...work,
                          work_item_id:
                            response.work_item_id ?? work.work_item_id,
                          attempt_id: response.attempt_id,
                          status: response.status,
                          contributors: contributorsFromResponse(response),
                        }
                      : work
                  ),
                }
              : detail
        )
      }
      refreshChangedWorkspace(queryClient, context)
    },
    onError: (error: Error, _issueId, context) => {
      if (context?.detailKey && context.previousDetail) {
        queryClient.setQueryData(context.detailKey, context.previousDetail)
      }
      toast.error(error.message || "Could not mark issue as done")
    },
  })

  const undoContribution = useMutation({
    mutationFn: (attemptId: string) =>
      clientApiDelete<IssueWorkStateResponse>(
        `/issue-work-attempts/${attemptId}/contributors/me`
      ),
    onMutate: async (attemptId) => {
      const context = await mutationContext()
      const detail = context.previousDetail
      if (!context.detailKey || !detail) return context

      queryClient.setQueryData<IssueWorkspacePageDetail>(context.detailKey, {
        ...detail,
        work_items: detail.work_items.flatMap((work) => {
          if (work.attempt_id !== attemptId) return [work]
          const contributors = work.contributors.filter(
            (userId) => userId !== currentUserId
          )
          return contributors.length ? [{ ...work, contributors }] : []
        }),
      })
      return context
    },
    onSuccess: (response, attemptId, context) => {
      if (context?.detailKey) {
        const contributors = contributorsFromResponse(response)
        queryClient.setQueryData<IssueWorkspacePageDetail>(
          context.detailKey,
          (detail) =>
            detail
              ? {
                  ...detail,
                  work_items: detail.work_items.flatMap((work) =>
                    work.attempt_id !== attemptId
                      ? [work]
                      : contributors.length
                        ? [{ ...work, status: response.status, contributors }]
                        : []
                  ),
                }
              : detail
        )
      }
      refreshChangedWorkspace(queryClient, context)
    },
    onError: (error: Error, _attemptId, context) => {
      if (context?.detailKey && context.previousDetail) {
        queryClient.setQueryData(context.detailKey, context.previousDetail)
      }
      toast.error(error.message || "Could not undo contribution")
    },
  })

  return { markDone, undoContribution }
}
