import { clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  AIConversationResponse,
  CreateAIConversationMessageResponse,
  CreateAIConversationResponse,
  ScoreBreakdownIssueURLsResponse,
} from "~/lib/api.types"

import type {
  AIFixTarget,
  IssueScope,
  MergedIssueUrlRow,
  PendingAIFixRequest,
} from "./types"


export function formatPenalty(value: number) {
  return Number(value.toFixed(2)).toString()
}

export function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

export function getSelectionLabel(values: string[], fallback: string) {
  if (!values.length) {
    return fallback
  }

  if (values.length === 1) {
    return values[0]
  }

  return `${values.length} selected`
}

export function toggleSelection(
  value: string,
  selectedValues: string[],
  setSelectedValues: (values: string[]) => void,
  allowEmpty: boolean
) {
  const isSelected = selectedValues.includes(value)

  if (isSelected) {
    if (!allowEmpty && selectedValues.length === 1) {
      return
    }

    setSelectedValues(selectedValues.filter((item) => item !== value))
    return
  }

  setSelectedValues([...selectedValues, value])
}

export async function fetchAllIssueUrls(
  crawlId: string,
  issueScope: IssueScope
) {
  const pageSize = 100
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  const rows: MergedIssueUrlRow[] = []

  while (offset < total) {
    const response = await clientApiFetch<ScoreBreakdownIssueURLsResponse>(
      `/crawls/${crawlId}/score-breakdown/${issueScope.pillarId}/${issueScope.bucketId}/${issueScope.issueTypeId}/urls?limit=${pageSize}&offset=${offset}`
    )

    total = response.pagination.total
    rows.push(
      ...response.urls.map((row) => ({
        ...row,
        source: `${issueScope.pillarLabel} / ${issueScope.bucketLabel} / ${issueScope.issueTypeLabel}`,
        pillarId: issueScope.pillarId,
        pillarLabel: issueScope.pillarLabel,
        bucketId: issueScope.bucketId,
        bucketLabel: issueScope.bucketLabel,
        issueTypeId: issueScope.issueTypeId,
        issueTypeLabel: issueScope.issueTypeLabel,
      }))
    )
    offset += response.urls.length

    if (!response.urls.length) {
      break
    }
  }

  return rows
}

export function buildPendingAIFixRequest(target: AIFixTarget): PendingAIFixRequest {
  return {
    requestId: `${Date.now()}:${target.key}`,
    target,
    title: buildAIFixConversationTitle(target),
    prompt: buildAIFixConversationPrompt(target),
  }
}

export async function generateQueuedAIFix({
  crawlId,
  projectId,
  request,
  target,
}: {
  crawlId: string
  projectId: string
  request: PendingAIFixRequest
  target: AIFixTarget
}): Promise<AIConversationResponse> {
  const created = await clientApiPost<CreateAIConversationResponse>(
    `/projects/${projectId}/ai/conversations`,
    {
      crawl_id: crawlId,
      title: request.title,
    }
  )

  const response = await clientApiPost<CreateAIConversationMessageResponse>(
    `/ai/conversations/${created.conversation.id}/messages`,
    {
      crawl_id: crawlId,
      pillar_id: target.pillarId,
      bucket_ids: [target.bucketId],
      issue_type_ids: [target.issueTypeId],
      issue_urls: target.urls ?? [],
      content: request.prompt,
    }
  )

  return response.conversation
}

function buildAIFixConversationTitle(target: AIFixTarget) {
  if (target.urls?.length) {
    return `Fix ${target.issueTypeLabel} on ${shortURLLabel(target.urls[0])}`
  }

  return `Fix ${target.issueTypeLabel}`
}

function buildAIFixConversationPrompt(target: AIFixTarget) {
  if (target.urls?.length) {
    return `Help me fix the ${target.issueTypeLabel} issue for this URL: ${target.urls[0]}. Give concrete, ready-to-apply recommendations based only on the crawl context.`
  }

  return `Help me fix these ${target.issueTypeLabel} issues. Prioritize the affected URLs and give concrete, ready-to-apply recommendations based only on the crawl context.`
}

function shortURLLabel(rawURL: string) {
  try {
    const url = new URL(rawURL)
    return `${url.hostname}${url.pathname}`
  } catch {
    return rawURL
  }
}
