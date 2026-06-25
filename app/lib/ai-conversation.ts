import type {
  AIConversationResponse,
  AIMessageResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import { areStringArraysEqual } from "~/components/issue-explorer/utils"

export type AiConversationGroup = {
  label: string
  conversations: AIConversationResponse[]
}

function formatConversationDate(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatConversationTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function groupConversationsByDate(
  conversations: AIConversationResponse[]
): AiConversationGroup[] {
  const groups: AiConversationGroup[] = []
  const groupByLabel = new Map<string, AIConversationResponse[]>()

  for (const conversation of conversations) {
    const label = formatConversationDate(conversation.updated_at)
    const group = groupByLabel.get(label)
    if (group) {
      group.push(conversation)
      continue
    }

    const conversationsForDate = [conversation]
    groupByLabel.set(label, conversationsForDate)
    groups.push({ label, conversations: conversationsForDate })
  }

  return groups
}

export type RevserpAIMessage = {
  id?: string
  role: "user" | "assistant"
  content: string
}

export type AIScopeState = {
  pillarId: string
  bucketIds: string[]
  issueTypeIds: string[]
}

export function getNextScopeState(
  breakdown: ScoreBreakdownResponse | null,
  selectedPillarId: string,
  selectedBucketIds: string[],
  selectedIssueTypeIds: string[]
): AIScopeState | null {
  if (!breakdown?.pillars.length) {
    if (
      !selectedPillarId &&
      !selectedBucketIds.length &&
      !selectedIssueTypeIds.length
    ) {
      return null
    }

    return { pillarId: "", bucketIds: [], issueTypeIds: [] }
  }

  const selectedPillar =
    breakdown.pillars.find((pillar) => pillar.id === selectedPillarId) ??
    breakdown.pillars[0]
  const validBucketIds = new Set(
    selectedPillar.buckets.map((bucket) => bucket.id)
  )
  let nextBucketIds = selectedBucketIds.filter((bucketId) =>
    validBucketIds.has(bucketId)
  )

  if (!nextBucketIds.length && selectedPillar.buckets[0]) {
    nextBucketIds = [selectedPillar.buckets[0].id]
  }

  const nextBucketIdSet = new Set(nextBucketIds)
  const validIssueTypeIds = new Set<string>()
  for (const bucket of selectedPillar.buckets) {
    if (!nextBucketIdSet.has(bucket.id)) {
      continue
    }

    for (const issueType of bucket.issues) {
      validIssueTypeIds.add(issueType.id)
    }
  }
  const nextIssueTypeIds = selectedIssueTypeIds.filter((issueTypeId) =>
    validIssueTypeIds.has(issueTypeId)
  )

  if (
    selectedPillar.id === selectedPillarId &&
    areStringArraysEqual(nextBucketIds, selectedBucketIds) &&
    areStringArraysEqual(nextIssueTypeIds, selectedIssueTypeIds)
  ) {
    return null
  }

  return {
    pillarId: selectedPillar.id,
    bucketIds: nextBucketIds,
    issueTypeIds: nextIssueTypeIds,
  }
}

export function newMessageFromResponse(
  message: AIMessageResponse
): RevserpAIMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
  }
}

export function upsertConversation(
  conversations: AIConversationResponse[],
  conversation: AIConversationResponse
) {
  return [
    conversation,
    ...conversations.filter((item) => item.id !== conversation.id),
  ]
}
