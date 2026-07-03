import { clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  AIConversationResponse,
  CreateAIConversationMessageResponse,
  CreateAIConversationResponse,
  ScoreBreakdownIssueURLsResponse,
} from "~/lib/api.types"

import type { BucketScope, FixSelection, MergedIssueUrlRow } from "./types"

export function formatPenalty(value: number) {
  return Number(value.toFixed(2)).toString()
}

/** Stable selection key for a URL row (a URL may appear under multiple issue types). */
export function urlRowKey(row: MergedIssueUrlRow) {
  return `${row.issueTypeId}::${row.url}`
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

/** Fetches every affected URL across all issue types in a bucket, tagged with its issue type. */
export async function fetchBucketUrls(
  crawlId: string,
  bucketScope: BucketScope,
  signal?: AbortSignal
): Promise<MergedIssueUrlRow[]> {
  const rowsByIssueType = await Promise.all(
    bucketScope.bucket.issues.map((issueType) =>
      fetchIssueTypeUrls(
        crawlId,
        bucketScope,
        issueType.id,
        issueType.label,
        signal
      )
    )
  )
  return rowsByIssueType.flat()
}

async function fetchIssueTypeUrls(
  crawlId: string,
  bucketScope: BucketScope,
  issueTypeId: string,
  issueTypeLabel: string,
  signal?: AbortSignal
): Promise<MergedIssueUrlRow[]> {
  const pageSize = 100
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  const rows: MergedIssueUrlRow[] = []

  while (offset < total) {
    if (signal?.aborted) break

    const response = await clientApiFetch<ScoreBreakdownIssueURLsResponse>(
      `/crawls/${crawlId}/score-breakdown/${bucketScope.pillarId}/${bucketScope.bucketId}/${issueTypeId}/urls?limit=${pageSize}&offset=${offset}`,
      { signal }
    )

    total = response.pagination.total
    rows.push(
      ...response.urls.map((row) => ({
        ...row,
        source: issueTypeLabel,
        pillarId: bucketScope.pillarId,
        pillarLabel: bucketScope.pillarLabel,
        bucketId: bucketScope.bucketId,
        bucketLabel: bucketScope.bucketLabel,
        issueTypeId,
        issueTypeLabel,
      }))
    )
    offset += response.urls.length

    if (!response.urls.length) {
      break
    }
  }

  return rows
}

/**
 * Creates one conversation and posts one message per pillar selection.
 * The AI message API scopes a message to a single pillar, so cross-pillar
 * selections are split into one message each within the same conversation.
 */
export async function generateBatchAIFix({
  crawlId,
  projectId,
  selections,
}: {
  crawlId: string
  projectId: string
  selections: FixSelection[]
}): Promise<AIConversationResponse> {
  const created = await clientApiPost<CreateAIConversationResponse>(
    `/projects/${projectId}/ai/conversations`,
    {
      crawl_id: crawlId,
      title: buildBatchTitle(selections),
    }
  )

  let conversation = created.conversation
  for (const selection of selections) {
    const response = await clientApiPost<CreateAIConversationMessageResponse>(
      `/ai/conversations/${created.conversation.id}/messages`,
      {
        crawl_id: crawlId,
        pillar_id: selection.pillarId,
        bucket_ids: selection.bucketIds,
        issue_type_ids: selection.issueTypeIds,
        issue_urls: selection.urls,
        content: buildBatchPrompt(selection),
      }
    )
    conversation = response.conversation
  }

  return conversation
}

function buildBatchTitle(selections: FixSelection[]) {
  const urlCount = selections.reduce((sum, s) => sum + s.urls.length, 0)
  if (urlCount > 0) {
    return `Fix ${urlCount} affected URL${urlCount === 1 ? "" : "s"}`
  }

  const bucketCount = selections.reduce((sum, s) => sum + s.bucketIds.length, 0)
  if (selections.length === 1 && bucketCount === 1) {
    return `Fix ${selections[0].bucketLabels[0]} issues`
  }
  return `Fix ${bucketCount} selected bucket${bucketCount === 1 ? "" : "s"}`
}

function buildBatchPrompt(selection: FixSelection) {
  if (selection.urls.length) {
    const list = selection.urls.map((url) => `- ${url}`).join("\n")
    return `Help me fix the issues on these URLs for ${selection.pillarLabel}:\n${list}\nGive concrete, ready-to-apply recommendations based only on the crawl context.`
  }

  const buckets = selection.bucketLabels.join(", ")
  return `Help me fix all issues in the ${buckets} ${selection.pillarLabel} bucket${
    selection.bucketLabels.length === 1 ? "" : "s"
  }. Prioritize the most impactful issues and affected URLs, and give concrete, ready-to-apply recommendations based only on the crawl context.`
}
