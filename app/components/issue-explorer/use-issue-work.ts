"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

import { clientApiDelete, clientApiPost } from "~/lib/api"
import type { IssueWorkStateResponse } from "~/components/summary/issue-workspace.types"

export type IssueWorkMutationResult =
  | {
      action: "mark"
      issueId: string
      response: IssueWorkStateResponse
    }
  | {
      action: "undo"
      attemptId: string
      response: IssueWorkStateResponse
    }

export function useIssueWorkActions(
  onSuccess: (result: IssueWorkMutationResult) => void
) {
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set())

  const markPending = useCallback((key: string) => {
    setPendingKeys((prev) => new Set(prev).add(key))
  }, [])

  const clearPending = useCallback((key: string) => {
    setPendingKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [])

  const markDone = useCallback(
    async (issueId: string) => {
      const key = `mark:${issueId}`
      markPending(key)
      try {
        const response = await clientApiPost<IssueWorkStateResponse>(
          `/crawl-issues/${issueId}/work-done`,
          {}
        )
        toast.success("Marked as done")
        onSuccess({ action: "mark", issueId, response })
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not mark as done"
        )
      } finally {
        clearPending(key)
      }
    },
    [clearPending, markPending, onSuccess]
  )

  const undo = useCallback(
    async (attemptId: string) => {
      const key = `undo:${attemptId}`
      markPending(key)
      try {
        const response = await clientApiDelete<IssueWorkStateResponse>(
          `/issue-work-attempts/${attemptId}/contributors/me`
        )
        toast.success("Undone")
        onSuccess({ action: "undo", attemptId, response })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not undo")
      } finally {
        clearPending(key)
      }
    },
    [clearPending, markPending, onSuccess]
  )

  const isPending = useCallback(
    (key: string) => pendingKeys.has(key),
    [pendingKeys]
  )

  return { markDone, undo, isPending, pendingKeys }
}
