import type { CMSApproval, CMSApprovalStatus } from "~/lib/api.types"

/**
 * Replay-safe state rules for the Revbot turn stream and approval cards.
 *
 * The turn event log is durable: reconnecting, reloading, or deciding an
 * approval replays every historical frame of the SAME turn from event 0. These
 * pure helpers hold the two rules that keep that replay from corrupting live
 * UI state:
 *
 *   - a live same-turn observer is never restarted and never has its streamed
 *     text replaced by a lagging turn snapshot;
 *   - an approval card only ever moves forward through the backend lifecycle.
 */

/** CMS approval contract status plus the legacy migration46 spelling. Accept
 * both until the backend aligns them; report the final spelling via parent. */
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

/** The one live SSE subscription for the selected conversation, if any. */
export type TurnObserver = {
  controller: AbortController
  turnId: string
  generation: number
}

export type TurnObserverStart =
  /** Open a fresh stream: the cursor, seen event ids, and text all reset. */
  | { kind: "start" }
  /** A stream for this exact turn is already live. Leave it completely alone —
   * restarting it would abort the connection and replay the turn from event 0. */
  | { kind: "keep" }
  /** Paused for approval: no worker lease and no further events, so refresh
   * the durable cards instead of reconnect-polling. */
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

/** A live same-turn stream owns the assistant text. A turn snapshot fetched
 * mid-stream lags the deltas already delivered, so adopting its content would
 * duplicate the prefix the stream keeps appending to. A terminal snapshot is
 * the exception: the turn is over and the persisted content is final. */
export function shouldKeepStreamedAssistantText({
  observer,
  replay,
  status,
  turnId,
}: {
  observer: TurnObserver | null
  replay: boolean
  status: string | null | undefined
  turnId: string
}) {
  if (replay || !observer) return false
  if (isTurnTerminalStatus(status)) return false
  return observer.turnId === turnId
}

/** Refocus/visibility re-verifies a paused turn against its live snapshot and
 * restarts a stream that was lost with the connection — but never disturbs a
 * stream that is still running. Returns the turn to re-sync, or null. */
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

/** Legal forward status moves, mirroring the backend's status guards
 * (DecideCMSApproval, InvalidatePendingCMSApprovalsForTurn,
 * MarkCMSApprovalExecuting, CompleteCMSApproval, FailExecutingCMSApprovalsForTurn
 * and the crash-recovery updates). Anything outside this table is a replayed
 * frame, not progress. */
const APPROVAL_STATUS_SUCCESSORS: Record<
  CMSApprovalStatus,
  readonly CMSApprovalStatus[]
> = {
  pending: ["approved", "rejected", "invalidated"],
  approved: ["executing", "invalidated"],
  executing: ["completed", "failed"],
  // Crash recovery: a CMS write may have applied before the worker died.
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
