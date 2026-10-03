import type {
  AITurnMessageResponse,
  CMSApproval,
  CMSApprovalStatus,
} from "~/lib/api.types"

/** Pure rules for the Revbot turn stream and approval cards. */

/** Turn waiting status, including the legacy spelling. */
export function isTurnWaitingStatus(status: string | null | undefined) {
  return status === "waiting_for_user" || status === "waiting"
}

export function isTurnTerminalStatus(status: string | null | undefined) {
  return status === "completed" || status === "stopped" || status === "failed"
}

/** A turn is live while queued, running, or paused for approval. */
export function isTurnActiveStatus(status: string | null | undefined) {
  return (
    status === "queued" || status === "running" || isTurnWaitingStatus(status)
  )
}

/** The assistant bubble uses the streaming renderer for exactly one reason:
 * it is the turn's live message. Waiting for approval must not swap it for
 * static markdown: the swap unmounts the animator and replays visible text.
 */
export function isActiveAssistantMessage(
  messageId: string,
  activeAssistantMessageId: string | null | undefined
) {
  return activeAssistantMessageId !== null && messageId === activeAssistantMessageId
}

/** Same-turn reconnect keeps the SSE cursor and streamed text; a new turn restarts both. */
export type StreamResume = { kind: "resume" } | { kind: "restart" }

export function resolveStreamResume({
  lastObservedTurnId,
  turnId,
}: {
  lastObservedTurnId: string | null
  turnId: string
}): StreamResume {
  return lastObservedTurnId === turnId
    ? { kind: "resume" }
    : { kind: "restart" }
}

/** True when a turn snapshot changed nothing visible, so the row keeps its identity. */
export function isSameTurnMessage(
  current: AITurnMessageResponse,
  incoming: AITurnMessageResponse
) {
  return (
    current.role === incoming.role &&
    current.status === incoming.status &&
    current.content === incoming.content &&
    current.updated_at === incoming.updated_at &&
    (current.images?.length ?? 0) === (incoming.images?.length ?? 0) &&
    (current.tool_calls?.length ?? 0) === (incoming.tool_calls?.length ?? 0)
  )
}

/** The one live SSE subscription for the selected conversation, if any. */
export type TurnObserver = {
  controller: AbortController
  turnId: string
  generation: number
}

export type TurnObserverStart =
  /** Subscribe. A new turn restarts cursor and text; a seeded same-turn resume keeps both. */
  | { kind: "start" }
  /** A stream for this exact turn is already live. Leave it alone. */
  | { kind: "keep" }
  /** Paused for approval: refresh the durable cards instead of reconnect-polling. */
  | { kind: "parked" }
  /** Stale generation, or the turn already reached a terminal status. */
  | { kind: "skip" }

/** Decide what a live status sync may do to the observer for one turn. */
export function resolveTurnObserverStart({
  currentGeneration,
  generation,
  observer,
  status,
  turnId,
}: {
  currentGeneration: number
  generation: number
  observer: TurnObserver | null
  status: string | null | undefined
  turnId: string
}): TurnObserverStart {
  if (generation !== currentGeneration) return { kind: "skip" }
  if (isTurnTerminalStatus(status)) return { kind: "skip" }
  if (
    observer !== null &&
    observer.turnId === turnId &&
    observer.generation === generation
  ) {
    return { kind: "keep" }
  }
  if (isTurnWaitingStatus(status)) return { kind: "parked" }
  return { kind: "start" }
}

/** Turn to re-sync on refocus, or null when a live stream already covers it. */
export function turnIdToResyncOnRefocus({
  observer,
  status,
  turnId,
}: {
  observer: TurnObserver | null
  status: string | null | undefined
  turnId: string | null
}): string | null {
  if (!turnId) return null
  if (isTurnWaitingStatus(status)) return turnId
  const live = observer !== null && observer.turnId === turnId
  return !live && (status === "queued" || status === "running") ? turnId : null
}

/** Legal forward approval moves. Anything else is a replayed frame, not progress. */
const APPROVAL_STATUS_SUCCESSORS: Record<
  CMSApprovalStatus,
  readonly CMSApprovalStatus[]
> = {
  pending: ["approved", "rejected", "invalidated"],
  approved: ["executing", "invalidated"],
  executing: ["completed", "failed"],
  completed: ["failed"],
  rejected: [],
  invalidated: [],
  failed: [],
}

/** A decision timestamp only moves forward; both are server generated ISO-8601. */
function isFresherApprovalDecision(
  existing: CMSApproval,
  incoming: CMSApproval
) {
  if (!incoming.decided_at) return false
  if (!existing.decided_at) return true
  return incoming.decided_at > existing.decided_at
}

/** True when `incoming` is real progress on the card `existing` tracks. */
export function shouldReplaceApprovalCard(
  existing: CMSApproval,
  incoming: CMSApproval
) {
  if (existing.id !== incoming.id) return true
  if (incoming.status === existing.status) {
    return isFresherApprovalDecision(existing, incoming)
  }
  return (APPROVAL_STATUS_SUCCESSORS[existing.status] ?? []).includes(
    incoming.status
  )
}

/** Merge one card by id. Returns the same array when nothing moved, so a
 * replayed historical frame does not re-render the list. */
export function mergeApprovalCard(
  approvals: CMSApproval[],
  incoming: CMSApproval
): CMSApproval[] {
  const index = approvals.findIndex((item) => item.id === incoming.id)
  if (index === -1) return [...approvals, incoming]
  if (!shouldReplaceApprovalCard(approvals[index], incoming)) return approvals
  const next = [...approvals]
  next[index] = { ...approvals[index], ...incoming }
  return next
}
