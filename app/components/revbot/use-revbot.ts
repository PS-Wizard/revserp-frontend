"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  ApiError,
  clientApiDelete,
  clientApiFetch,
  clientApiPost,
  clientApiSSE,
} from "~/lib/api"
import type {
  AIConversationDetailResponse,
  AIConversationResponse,
  AIConversationsResponse,
  AIReasoningEffort,
  AIStreamPhase,
  AIStreamPhasePayload,
  AIStreamTerminalPayload,
  AIStreamTextDeltaPayload,
  AIStreamToolCallPayload,
  AIStreamToolResultPayload,
  AIToolCallResponse,
  AIToolCallStatus,
  AITurnImage,
  UserQuestionAnswer,
  UserQuestionAnswerBody,
  UserQuestionAnswerResponse,
  UserQuestionListResponse,
  UserQuestionRequest,
  AITurnMessageResponse,
  AITurnResponse,
  AITurnSubmissionResponse,
  CMSApproval,
  CMSApprovalDecisionBody,
  CMSApprovalDecisionResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { invalidateBusinessProfile } from "~/lib/business-profile-query"
import { invalidateProjectKeywordLists } from "~/lib/project-keywords-query"
import { mcpConnectionsQueryKey } from "~/components/marketplace/marketplace-api"
import {
  isActivityRoundId,
  isAssistantRoundPayload,
  isSameTurnMessage,
  isTurnActiveStatus,
  isTurnTerminalStatus,
  isTurnWaitingStatus,
  mergeApprovalCard,
  mergeAssistantActivityRound,
  parseAssistantActivityRounds,
  removeAssistantActivityRound,
  resolveStreamResume,
  resolveTurnObserverStart,
  sameAssistantActivityRounds,
  turnIdToResyncOnRefocus,
  type RevbotActivityRound,
  type TurnObserver,
} from "./revbot-replay-state"
import { normalizeToolCallStatus } from "./tool-call-status"
import {
  clearQuestionDraft,
  mergeQuestionRequest,
  mergeQuestionRequests,
  pendingQuestionRequest,
} from "./revbot-user-questions"
import type { MCPApprovalDecision } from "./mcp-approval-copy"

export { isTurnActiveStatus, isTurnWaitingStatus } from "./revbot-replay-state"

const STORAGE_PREFIX = "revbot-turn:"
const EFFORT_STORAGE_KEY = "revbot-reasoning-effort"
const RECONNECT_DELAY_MS = 700
const AUTO_RETRY_MAX_ATTEMPTS = 3
const AUTO_RETRY_DELAY_MS = 800

const RETRYABLE_ERROR_CODES = new Set([
  "worker_interrupted",
  "provider_timeout",
  "provider_unavailable",
])

type SendOptions = {
  images?: AITurnImage[]
  /** Reuse the preceding user bubble and drop the failed assistant message. */
  retryAfterAssistantMessageId?: string
  /** Keep the auto-retry counter; a fresh send resets it. */
  autoRetry?: boolean
  crawlId?: string
}

type StoredConversation = { conversationId: string; turnId?: string }
export type RevbotToolCall = {
  callId: string
  name: string
  args: Record<string, unknown>
  status: AIToolCallStatus
  summary: string | null
  seq: number
}
type LocalMessage = AITurnMessageResponse & {
  activityEndedAt?: number | null
  activityStartedAt?: number | null
  local?: boolean
  toolCalls?: RevbotToolCall[]
}
type RevbotStatus = AITurnResponse["status"] | "idle"

type RevbotState = {
  conversationId: string | null
  conversations: AIConversationResponse[]
  /** Last known turn status per conversation (queued/running/waiting while active). */
  conversationStatus: Record<string, RevbotStatus>
  messages: LocalMessage[]
  status: RevbotStatus
  phase: AIStreamPhase | null
  toolCalls: RevbotToolCall[]
  activityStartedAt: number | null
  stopping: boolean
  loading: boolean
  approvals: CMSApproval[]
  questions: UserQuestionRequest[]
  answeringQuestion: string | null
  questionErrors: Record<string, string>
  turnId: string | null
  decidingApproval: { id: string; decision: MCPApprovalDecision } | null
  approvalDecisionErrors: Record<string, string>
}

function normalizeLocationScope(value: string | null | undefined): string | null {
  return value ? value : null
}

function conversationLocationScope(conversation: {
  location_id?: string | null
} | null | undefined): string | null {
  return normalizeLocationScope(conversation?.location_id)
}

function storageKey(projectId: string, locationId?: string | null) {
  const scope = normalizeLocationScope(locationId)
  return scope
    ? `${STORAGE_PREFIX}${projectId}:${scope}`
    : `${STORAGE_PREFIX}${projectId}`
}

function readStoredConversation(
  projectId: string,
  locationId?: string | null
): StoredConversation | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storageKey(projectId, locationId)) ?? "null"
    )
    if (!value || typeof value !== "object") return null
    const record = value as Record<string, unknown>
    if (typeof record.conversationId !== "string") return null
    return typeof record.turnId === "string"
      ? { conversationId: record.conversationId, turnId: record.turnId }
      : { conversationId: record.conversationId }
  } catch {
    return null
  }
}

function saveStoredConversation(
  projectId: string,
  value: StoredConversation,
  locationId?: string | null
) {
  try {
    localStorage.setItem(storageKey(projectId, locationId), JSON.stringify(value))
  } catch {
    // Storage is an optional reload convenience.
  }
}

function clearStoredConversation(projectId: string, locationId?: string | null) {
  try {
    localStorage.removeItem(storageKey(projectId, locationId))
  } catch {}
}

/** Turn status predicates live in ./revbot-replay-state so the hook and the
 * replay rules share one source of truth. */
const isTurnTerminal = isTurnTerminalStatus

function assistantMessageForTurn(turn: AITurnResponse) {
  return [...turn.messages]
    .reverse()
    .find((message) => message.role === "assistant")
}

function isRetryableCutoff(turn: AITurnResponse) {
  if (turn.status === "completed") return false
  if (turn.status === "stopped" && turn.error_code === "cancelled") return false
  if (turn.cancel_requested && turn.status === "stopped") return false

  const assistant = assistantMessageForTurn(turn)
  if (assistant?.status === "complete") return false

  // A tool may already have changed remote state; resending could repeat the change.
  if ((turn.tool_calls?.length ?? 0) > 0) return false

  if (turn.status === "failed") {
    if (turn.error_code && RETRYABLE_ERROR_CODES.has(turn.error_code)) {
      return true
    }
    return assistant?.status === "partial" || assistant?.status === "failed"
  }

  return turn.status === "stopped" && assistant?.status === "partial"
}

const ERROR_MESSAGES: Record<string, string> = {
  ai_chat_disabled: "Revbot is disabled for this workspace.",
  cancelled: "Stopped.",
  context_too_large: "This conversation is too long. Start a new conversation.",
  conversation_busy: "Wait for the current response to finish.",
  conversation_not_found: "This conversation is no longer available.",
  idempotency_conflict: "This request conflicts with an earlier request.",
  invalid_request: "Check the message and try again.",
  monthly_message_limit_reached:
    "This workspace reached its monthly message limit.",
  provider_timeout: "Revbot took too long to respond. Try again.",
  provider_unavailable: "Revbot is temporarily unavailable. Try again.",
  provider_invalid_request:
    "The AI provider rejected this request. Please report this error.",
  rate_limited: "Revbot is busy. Try again shortly.",
  reasoning_not_allowed:
    "That reasoning effort is not allowed for this workspace.",
  worker_interrupted: "The response was interrupted. Try again.",
}

function errorMessage(code: string | null | undefined, fallback: string) {
  if (!code) return fallback
  return ERROR_MESSAGES[code] ?? fallback
}

function simpleError(error: unknown, fallback: string) {
  if (error instanceof ApiError) return errorMessage(error.message, fallback)
  return error instanceof Error ? error.message : fallback
}

function turnErrorMessage(code: string | null | undefined) {
  if (code === "cancelled") return null
  return errorMessage(code, "The assistant could not complete this request.")
}

const REVBOT_TOAST_ID = "revbot-error"

function reportRevbotError(message: string | null) {
  if (!message) return
  toast.error(message, { id: REVBOT_TOAST_ID })
}

function defaultEffort(allowedEfforts: AIReasoningEffort[]) {
  return allowedEfforts.includes("high")
    ? "high"
    : (allowedEfforts[0] ?? "none")
}

function readStoredEffort(): AIReasoningEffort | null {
  try {
    const value = localStorage.getItem(EFFORT_STORAGE_KEY)
    if (
      value === "none" ||
      value === "low" ||
      value === "high" ||
      value === "max"
    ) {
      return value
    }
  } catch {
    // Storage is an optional preference convenience.
  }
  return null
}

function saveStoredEffort(effort: AIReasoningEffort) {
  try {
    localStorage.setItem(EFFORT_STORAGE_KEY, effort)
  } catch {}
}

function resolveEffort(allowedEfforts: AIReasoningEffort[]) {
  const stored = readStoredEffort()
  if (stored && allowedEfforts.includes(stored)) return stored
  return defaultEffort(allowedEfforts)
}

function userMessage(content: string, images?: AITurnImage[]): LocalMessage {
  const now = new Date().toISOString()
  return {
    id: `local-user-${crypto.randomUUID()}`,
    role: "user",
    status: "complete",
    content,
    created_at: now,
    updated_at: now,
    local: true,
    ...(images?.length ? { images } : {}),
  }
}

function hasUserTurnContent(message: {
  content: string
  images?: AITurnImage[]
}) {
  return Boolean(message.content.trim()) || Boolean(message.images?.length)
}

function assistantMessage(): LocalMessage {
  const now = new Date().toISOString()
  return {
    id: `local-assistant-${crypto.randomUUID()}`,
    role: "assistant",
    status: "pending",
    content: "",
    created_at: now,
    updated_at: now,
    local: true,
  }
}

function mapToolCallResponse(call: AIToolCallResponse): RevbotToolCall {
  const summary = call.summary || null
  return {
    callId: call.call_id,
    name: call.name,
    args:
      call.args && typeof call.args === "object" && !Array.isArray(call.args)
        ? call.args
        : {},
    status: normalizeToolCallStatus(call.status),
    summary,
    seq: call.seq,
  }
}

function mapToolCallResponses(calls: AIToolCallResponse[] | undefined) {
  return (calls ?? []).map(mapToolCallResponse)
}

function parseActivityTimestamp(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function turnActivityTimestamps(turn: AITurnResponse) {
  if (!isTurnTerminal(turn.status)) {
    return { endedAt: null as number | null, startedAt: null as number | null }
  }
  const endedAt = turn.completed_at ? Date.parse(turn.completed_at) : null
  const startedAt = turn.started_at ? Date.parse(turn.started_at) : endedAt
  if (
    endedAt === null ||
    startedAt === null ||
    !Number.isFinite(endedAt) ||
    !Number.isFinite(startedAt)
  ) {
    return { endedAt: null, startedAt: null }
  }
  return { endedAt, startedAt }
}

function attachTurnActivityToAssistant(
  messages: LocalMessage[],
  assistantMessageId: string | null,
  {
    activityEndedAt,
    activityStartedAt,
    toolCalls,
  }: {
    activityEndedAt: number | null
    activityStartedAt: number | null
    toolCalls: RevbotToolCall[]
  }
) {
  if (!assistantMessageId) return messages
  if (!toolCalls.length && !activityStartedAt) return messages

  return messages.map((message) =>
    message.id === assistantMessageId
      ? {
          ...message,
          ...(toolCalls.length ? { toolCalls: [...toolCalls] } : {}),
          ...(activityStartedAt
            ? {
                activityStartedAt,
                activityEndedAt: activityEndedAt ?? Date.now(),
              }
            : {}),
        }
      : message
  )
}

function mergeTurnMessages(
  currentMessages: LocalMessage[],
  turnMessages: LocalMessage[]
) {
  const turnMessagesById = new Map(
    turnMessages.map((message) => [message.id, message])
  )
  const messages = currentMessages
    .filter((message) => !message.local)
    .map((message) => {
      const incoming = turnMessagesById.get(message.id)
      if (!incoming) return message
      return isSameTurnMessage(message, incoming) ? message : incoming
    })
  const messageIds = new Set(messages.map((message) => message.id))
  return [
    ...messages,
    ...turnMessages.filter((message) => !messageIds.has(message.id)),
  ]
}

export function useRevbot({
  activeProject,
  allowedEfforts,
  requestedConversationId,
  locationId,
  onConversationChange,
  pinnedConversationId,
  disableConversationList,
  onToolResult,
  onTurnSettled,
  onBeforeSend,
}: {
  activeProject: ProjectResponse | null
  allowedEfforts: AIReasoningEffort[]
  requestedConversationId: string | null
  /** Location workspace scope. Absent means the parent project scope. */
  locationId?: string
  onConversationChange: (conversationId: string | null) => void
  /**
   * Pin the hook to one conversation (content drafts). The project
   * conversation list is never fetched and the selection is never persisted
   * to reload storage, so the island chat is left untouched.
   */
  pinnedConversationId?: string | null
  /**
   * Never fetch the project conversation list (content drafts). Pass from
   * first render; pinnedConversationId can arrive later once loaded.
   */
  disableConversationList?: boolean
  /** Fires for every streamed tool_result (draft sync point). */
  onToolResult?: ((name: string, status: string) => void) | null
  /** Fires when the active turn reaches a terminal status. */
  onTurnSettled?: ((status: RevbotStatus) => void) | null
  /** Awaited at the top of send(), so callers can flush pending writes. */
  onBeforeSend?: (() => void | Promise<void>) | null
}) {
  const queryClient = useQueryClient()
  const [effort, setEffortState] = useState<AIReasoningEffort>(() =>
    resolveEffort(allowedEfforts)
  )
  const setEffort = useCallback(
    (
      next:
        AIReasoningEffort | ((current: AIReasoningEffort) => AIReasoningEffort)
    ) => {
      setEffortState((current) => {
        const resolved = typeof next === "function" ? next(current) : next
        saveStoredEffort(resolved)
        return resolved
      })
    },
    []
  )
  const [state, setState] = useState<RevbotState>({
    conversationId: null,
    conversations: [],
    conversationStatus: {},
    messages: [],
    status: "idle",
    phase: null,
    toolCalls: [],
    activityStartedAt: null,
    stopping: false,
    loading: false,
    approvals: [],
    questions: [],
    answeringQuestion: null,
    questionErrors: {},
    turnId: null,
    decidingApproval: null,
    approvalDecisionErrors: {},
  })
  const mountedRef = useRef(true)
  const projectIdRef = useRef<string | null>(null)
  const locationIdRef = useRef<string | null>(null)
  const conversationLocationRef = useRef<string | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const turnIdRef = useRef<string | null>(null)
  const statusRef = useRef<RevbotStatus>("idle")
  const activeRequestRef = useRef(false)
  const generationRef = useRef(0)
  const projectGenerationRef = useRef(0)
  /** The live SSE subscription, if any: aborting it is what a restart does, so
   * it also records WHICH turn it streams and under which generation. */
  const observerRef = useRef<TurnObserver | null>(null)
  const lastObservedTurnRef = useRef<string | null>(null)
  const lastEventIdRef = useRef(0)
  const seenEventIdsRef = useRef<Set<number>>(new Set())
  const assistantTextRef = useRef("")
  const assistantActivityRef = useRef<RevbotActivityRound[]>([])
  const assistantMessageIdRef = useRef<string | null>(null)
  const messagesRef = useRef<LocalMessage[]>([])
  const autoRetryAttemptsRef = useRef(0)
  const autoRetryTimerRef = useRef<number | null>(null)
  const userStopRequestedRef = useRef(false)
  const maybeAutoRetryTurnRef = useRef<
    (turn: AITurnResponse, generation: number) => boolean
  >(() => false)
  const decidingApprovalRef = useRef<string | null>(null)
  const answeringQuestionRef = useRef<string | null>(null)
  const sendCrawlIdRef = useRef<string | null>(null)
  const questionsRef = useRef<UserQuestionRequest[]>([])
  /** Latest turn-snapshot sync; assigned after observe (observe calls it via ref). */
  const syncTurnSnapshotRef = useRef(
    (_turnId: string, _generation: number) => {}
  )
  const onConversationChangeRef = useRef(onConversationChange)
  const pinnedConversationIdRef = useRef(pinnedConversationId ?? null)
  const listDisabledRef = useRef(disableConversationList === true)
  const onToolResultRef = useRef(onToolResult ?? null)
  const onTurnSettledRef = useRef(onTurnSettled ?? null)
  const onBeforeSendRef = useRef(onBeforeSend ?? null)
  const conversationCacheRef = useRef(
    new Map<string, AIConversationDetailResponse>()
  )

  const clearAutoRetryTimer = useCallback(() => {
    if (autoRetryTimerRef.current !== null) {
      window.clearTimeout(autoRetryTimerRef.current)
      autoRetryTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    onConversationChangeRef.current = onConversationChange
  }, [onConversationChange])

  useEffect(() => {
    pinnedConversationIdRef.current = pinnedConversationId ?? null
  }, [pinnedConversationId])

  useEffect(() => {
    listDisabledRef.current = disableConversationList === true
  }, [disableConversationList])

  useEffect(() => {
    onToolResultRef.current = onToolResult ?? null
  }, [onToolResult])

  useEffect(() => {
    onTurnSettledRef.current = onTurnSettled ?? null
  }, [onTurnSettled])

  useEffect(() => {
    onBeforeSendRef.current = onBeforeSend ?? null
  }, [onBeforeSend])

  useEffect(() => {
    messagesRef.current = state.messages
  }, [state.messages])

  useEffect(() => {
    questionsRef.current = state.questions
  }, [state.questions])

  useEffect(() => {
    const conversationId = state.conversationId
    if (!conversationId) return
    for (const request of state.questions) {
      if (request.status !== "pending")
        clearQuestionDraft(conversationId, request.id)
    }
  }, [state.conversationId, state.questions])

  const notifyConversationChange = useCallback(
    (conversationId: string | null) => {
      onConversationChangeRef.current(conversationId)
    },
    []
  )

  /** Best-effort refresh of the conversation list and per-conversation turn statuses. */
  const refreshConversations = useCallback(() => {
    // Pinned (draft) conversations never list project conversations.
    if (listDisabledRef.current || pinnedConversationIdRef.current) return
    const projectId = projectIdRef.current
    if (!projectId) return
    // Deliberately NOT gated by generation: selecting a conversation bumps
    // the generation, which would drop this refresh on mount (restored
    // conversation id arrives right after the list fetch starts), leaving
    // the history pane empty until the next project switch. Project and
    // mount guards below are the correct invalidation scope.
    const scopeLocationId = locationIdRef.current
    const scopeQuery = scopeLocationId
      ? `&location_id=${encodeURIComponent(scopeLocationId)}`
      : ""
    void clientApiFetch<AIConversationsResponse>(
      `/projects/${projectId}/ai/conversations?limit=50&offset=0${scopeQuery}`
    )
      .then((response) => {
        if (
          !mountedRef.current ||
          projectId !== projectIdRef.current ||
          scopeLocationId !== locationIdRef.current
        )
          return
        const inScope = response.conversations.filter(
          (conversation) =>
            conversationLocationScope(conversation) === scopeLocationId
        )
        const statuses: Record<string, RevbotStatus> = {}
        for (const conversation of inScope) {
          statuses[conversation.id] =
            (conversation.turn_status as RevbotStatus) ?? "idle"
        }
        setState((current) => ({
          ...current,
          conversations: [
            ...inScope,
            ...current.conversations.filter(
              (item) =>
                !inScope.some((next) => next.id === item.id)
            ),
          ],
          // Overlay fresh statuses, but drop entries for conversations the
          // server no longer lists (deleted elsewhere) unless they are the
          // selected one — its status is SSE-driven, and a brand-new optimistic
          // conversation may legitimately lag behind this list snapshot.
          conversationStatus: {
            ...Object.fromEntries(
              Object.entries(current.conversationStatus).filter(
                ([id]) =>
                  id === conversationIdRef.current ||
                  inScope.some((next) => next.id === id)
              )
            ),
            ...statuses,
          },
        }))
      })
      .catch(() => {
        // Background refresh is best-effort; the next project load retries.
      })
  }, [])

  const updateStatus = useCallback(
    (status: RevbotStatus) => {
      statusRef.current = status
      const terminal = isTurnTerminal(status)
      if (terminal) activeRequestRef.current = false
      if (status === "completed") autoRetryAttemptsRef.current = 0
      const conversationId = conversationIdRef.current
      if (mountedRef.current) {
        setState((current) => {
          const assistantMessageId = assistantMessageIdRef.current
          const messages =
            terminal && (current.toolCalls.length || current.activityStartedAt)
              ? attachTurnActivityToAssistant(
                  current.messages,
                  assistantMessageId,
                  {
                    activityEndedAt: Date.now(),
                    activityStartedAt: current.activityStartedAt,
                    toolCalls: current.toolCalls,
                  }
                )
              : current.messages
          return {
            ...current,
            status,
            messages,
            phase: terminal ? null : current.phase,
            toolCalls: terminal ? [] : current.toolCalls,
            activityStartedAt: terminal ? null : current.activityStartedAt,
            stopping: terminal ? false : current.stopping,
            conversationStatus:
              conversationId === null
                ? current.conversationStatus
                : {
                    ...current.conversationStatus,
                    [conversationId]: status,
                  },
          }
        })
        if (terminal) refreshConversations()
      }
    },
    [refreshConversations]
  )

  /** Merge one approval card by id, forward-only. SSE frames replay, so a
   * historical approval_required/approval_decided must never push a card that
   * already moved on back to pending. Callers scope by turn id first. */
  const upsertApproval = useCallback((approval: CMSApproval) => {
    if (!mountedRef.current) return
    setState((current) => {
      const approvals = mergeApprovalCard(current.approvals, approval)
      if (approvals === current.approvals) return current
      return { ...current, approvals }
    })
  }, [])

  const upsertQuestionRequest = useCallback((request: UserQuestionRequest) => {
    if (!mountedRef.current) return
    setState((current) => {
      const questions = mergeQuestionRequest(current.questions, request)
      if (questions === current.questions) return current
      return { ...current, questions }
    })
  }, [])

  const applyConversation = useCallback(
    (conversation: AIConversationDetailResponse, loading = false) => {
      const scope = locationIdRef.current
      if (conversationLocationScope(conversation) !== scope) return false
      conversationLocationRef.current = scope
      conversationCacheRef.current.set(conversation.id, conversation)
      conversationIdRef.current = conversation.id
      notifyConversationChange(conversation.id)
      turnIdRef.current = null
      sendCrawlIdRef.current = null
      statusRef.current = "idle"
      activeRequestRef.current = false
      lastObservedTurnRef.current = null
      lastEventIdRef.current = 0
      seenEventIdsRef.current = new Set()
      const messages = conversation.messages.map((message) => {
        const mapped: LocalMessage = { ...message }
        if (message.role === "assistant") {
          const toolCalls = mapToolCallResponses(message.tool_calls)
          if (toolCalls.length) mapped.toolCalls = toolCalls
          const activity = parseAssistantActivityRounds(message.activity)
          if (activity.length) mapped.activity = activity
          const startedAt = parseActivityTimestamp(message.activity_started_at)
          const endedAt = parseActivityTimestamp(message.activity_ended_at)
          if (startedAt !== null) mapped.activityStartedAt = startedAt
          if (endedAt !== null) mapped.activityEndedAt = endedAt
        }
        return mapped
      })
      const assistant = [...messages]
        .reverse()
        .find((message) => message.role === "assistant")
      assistantMessageIdRef.current = assistant?.id ?? null
      assistantTextRef.current = assistant?.content ?? ""
      assistantActivityRef.current = parseAssistantActivityRounds(
        assistant?.activity
      )
      const conversationStatus =
        (conversation.turn_status as RevbotStatus) ?? "idle"
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          conversationId: conversation.id,
          turnId: null,
          messages,
          status: "idle",
          phase: null,
          toolCalls: [],
          activityStartedAt: null,
          stopping: false,
          loading,
          approvals: [],
          questions: Array.isArray(conversation.question_requests)
            ? conversation.question_requests
            : [],
          answeringQuestion: null,
          questionErrors: {},

          decidingApproval: null,
          approvalDecisionErrors: {},
          conversationStatus: {
            ...current.conversationStatus,
            [conversation.id]: conversationStatus,
          },
        }))
      }
      return true
    },
    [notifyConversationChange]
  )

  const applyTurn = useCallback(
    (turn: AITurnResponse) => {
      conversationIdRef.current = turn.conversation_id
      notifyConversationChange(turn.conversation_id)
      turnIdRef.current = turn.id
      const terminal = isTurnTerminal(turn.status)
      activeRequestRef.current = !terminal
      updateStatus(turn.status)
      if (!mountedRef.current) return

      const messages: LocalMessage[] = turn.messages.map((message) => ({
        ...message,
        activity: parseAssistantActivityRounds(message.activity),
      }))
      const assistant = [...messages]
        .reverse()
        .find((message) => message.role === "assistant")
      assistantMessageIdRef.current = assistant?.id ?? null
      const snapshotText = assistant?.content ?? ""
      const snapshotActivity = parseAssistantActivityRounds(assistant?.activity)
      const liveSameTurn = !terminal && observerRef.current?.turnId === turn.id
      let nextText: string
      let nextActivity: RevbotActivityRound[]
      if (terminal) {
        assistantTextRef.current = snapshotText
        assistantActivityRef.current = snapshotActivity
        nextText = snapshotText
        nextActivity = snapshotActivity
      } else if (liveSameTurn) {
        // Live stream owns newer deltas than this snapshot; keep them.
        nextText = assistantTextRef.current
        nextActivity = assistantActivityRef.current
      } else if (typeof turn.event_cursor === "number") {
        assistantTextRef.current = snapshotText
        assistantActivityRef.current = snapshotActivity
        lastEventIdRef.current = turn.event_cursor
        seenEventIdsRef.current = new Set()
        lastObservedTurnRef.current = turn.id
        nextText = snapshotText
        nextActivity = snapshotActivity
      } else {
        assistantTextRef.current = ""
        assistantActivityRef.current = []
        lastEventIdRef.current = 0
        seenEventIdsRef.current = new Set()
        lastObservedTurnRef.current = turn.id
        nextText = ""
        nextActivity = []
      }
      const toolCalls = mapToolCallResponses(turn.tool_calls)
      const turnActivity = turnActivityTimestamps(turn)
      const snapshotApprovals = Array.isArray(turn.approvals)
        ? turn.approvals.filter((approval) => approval.turn_id === turn.id)
        : []
      const snapshotQuestions = Array.isArray(turn.question_requests)
        ? turn.question_requests.filter((request) => request.turn_id === turn.id)
        : []

      setState((current) => {
        const existingClientAssistant = assistant?.id
          ? current.messages.find((message) => message.id === assistant.id)
          : null
        const mergedMessages = mergeTurnMessages(current.messages, messages)
        const assistantId = assistant?.id
        const overlayStreamedState =
          assistantId &&
          (nextText !== snapshotText ||
            !sameAssistantActivityRounds(nextActivity, snapshotActivity))
        const mergedMessagesWithStreamedText = !overlayStreamedState
          ? mergedMessages
          : mergedMessages.map((message) =>
              message.id === assistantId
                ? { ...message, content: nextText, activity: nextActivity }
                : message
            )
        const mergedApprovals = snapshotApprovals.reduce(
          (acc, approval) => mergeApprovalCard(acc, approval),
          current.approvals.filter(
            (approval) =>
              approval.status !== "pending" || approval.turn_id === turn.id
          )
        )

        return {
          ...current,
          conversationId: turn.conversation_id,
          turnId: turn.id,
          messages: attachTurnActivityToAssistant(
            mergedMessagesWithStreamedText,
            assistant?.id ?? null,
            {
              activityEndedAt:
                turnActivity.endedAt ??
                existingClientAssistant?.activityEndedAt ??
                null,
              activityStartedAt:
                turnActivity.startedAt ??
                existingClientAssistant?.activityStartedAt ??
                null,
              toolCalls,
            }
          ),
          status: turn.status,
          phase: isTurnTerminal(turn.status) ? null : current.phase,
          toolCalls: isTurnTerminal(turn.status) ? [] : toolCalls,
          activityStartedAt: isTurnTerminal(turn.status)
            ? null
            : (current.activityStartedAt ?? Date.now()),
          stopping: turn.cancel_requested && !isTurnTerminal(turn.status),
          loading: false,
          approvals: mergedApprovals,
          questions: mergeQuestionRequests(
            current.questions.filter(
              (request) =>
                request.status !== "pending" || request.turn_id === turn.id
            ),
            snapshotQuestions
          ),
          answeringQuestion:
            snapshotQuestions.some((request) => request.status !== "pending")
              ? null
              : current.answeringQuestion,
        }
      })
    },
    [notifyConversationChange, updateStatus]
  )

  const stopObserver = useCallback(() => {
    observerRef.current?.controller.abort()
    observerRef.current = null
  }, [])

  const refreshTerminalTurn = useCallback(
    async (turnId: string, generation: number) => {
      try {
        const turn = await clientApiFetch<AITurnResponse>(`/ai/turns/${turnId}`)
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          turnIdRef.current !== turn.id ||
          turn.conversation_id !== conversationIdRef.current
        )
          return
        applyTurn(turn)

        maybeAutoRetryTurnRef.current(turn, generation)
      } catch {
        // Keep the streamed text if the final refresh is unavailable.
      }
    },
    [applyTurn]
  )

  const observe = useCallback(
    async (turnId: string, generation: number) => {
      // A live same-turn observer is never restarted; anything else goes
      // through the snapshot seed in applyTurn before subscribing here.
      const start = resolveTurnObserverStart({
        currentGeneration: generationRef.current,
        generation,
        observer: observerRef.current,
        status: statusRef.current,
        turnId,
      })
      if (start.kind === "skip" || start.kind === "keep") return
      if (start.kind === "parked") return

      stopObserver()
      const controller = new AbortController()
      observerRef.current = { controller, turnId, generation }
      // Same-turn reconnect keeps the seeded cursor and text; only a new
      // turn restarts from event 0 with a blank backlog.
      const resume = resolveStreamResume({
        lastObservedTurnId: lastObservedTurnRef.current,
        turnId,
      })
      lastObservedTurnRef.current = turnId
      if (resume.kind === "restart") {
        lastEventIdRef.current = 0
        seenEventIdsRef.current = new Set()
        assistantTextRef.current = ""
        assistantActivityRef.current = []
      }
      try {
        while (
          generation === generationRef.current &&
          mountedRef.current &&
          !isTurnTerminal(statusRef.current) &&
          !isTurnWaitingStatus(statusRef.current)
        ) {
          try {
            const after = lastEventIdRef.current
            await clientApiSSE(`/ai/turns/${turnId}/events?after=${after}`, {
              signal: controller.signal,
              onEvent: (event, payload, eventId) => {
                if (generation !== generationRef.current || !mountedRef.current)
                  return
                const numericId = eventId === null ? null : Number(eventId)
                if (numericId !== null && Number.isFinite(numericId)) {
                  if (
                    numericId <= lastEventIdRef.current ||
                    seenEventIdsRef.current.has(numericId)
                  )
                    return
                  seenEventIdsRef.current.add(numericId)
                  lastEventIdRef.current = Math.max(
                    lastEventIdRef.current,
                    numericId
                  )
                }

                if (event === "phase" && isPhasePayload(payload)) {
                  setState((current) => ({
                    ...current,
                    phase: payload.phase,
                    activityStartedAt: current.activityStartedAt ?? Date.now(),
                  }))
                } else if (
                  event === "tool_call" &&
                  isToolCallPayload(payload)
                ) {
                  const nextCall: RevbotToolCall = {
                    callId: payload.id,
                    name: payload.name,
                    args: payload.args,
                    status: "running",
                    summary: null,
                    seq: 0,
                  }
                  setState((current) => {
                    const existing = current.toolCalls.find(
                      (call) => call.callId === payload.id
                    )
                    const toolCalls = existing
                      ? current.toolCalls.map((call) =>
                          call.callId === payload.id
                            ? { ...call, ...nextCall, seq: call.seq }
                            : call
                        )
                      : [
                          ...current.toolCalls,
                          { ...nextCall, seq: current.toolCalls.length },
                        ]
                    return {
                      ...current,
                      phase: "working",
                      toolCalls,
                      activityStartedAt:
                        current.activityStartedAt ?? Date.now(),
                    }
                  })
                } else if (
                  event === "tool_result" &&
                  isToolResultPayload(payload)
                ) {
                  const resultStatus = normalizeToolCallStatus(payload.status)
                  setState((current) => ({
                    ...current,
                    toolCalls: current.toolCalls.map((call) =>
                      call.callId === payload.id
                        ? {
                            ...call,
                            status: resultStatus,
                            summary: payload.summary,
                          }
                        : call
                    ),
                  }))
                  onToolResultRef.current?.(payload.name, resultStatus)
                  if (
                    payload.name === "update_business_profile" &&
                    resultStatus === "completed"
                  ) {
                    const projectId = projectIdRef.current
                    if (projectId) {
                      void invalidateBusinessProfile(queryClient, projectId)
                    }
                  }
                  if (
                    payload.name === "update_project_keywords" &&
                    resultStatus === "completed"
                  ) {
                    const projectId = projectIdRef.current
                    if (projectId) {
                      void invalidateProjectKeywordLists(queryClient, projectId)
                    }
                  }
                } else if (
                  event === "text_delta" &&
                  isTextDeltaPayload(payload)
                ) {
                  const round = (payload as { round?: unknown }).round
                  if (isActivityRoundId(round)) {
                    const existing = assistantActivityRef.current.find(
                      (item) => item.round === round
                    )
                    const provisional = (existing?.text ?? "") + payload.text
                    assistantActivityRef.current = mergeAssistantActivityRound(
                      assistantActivityRef.current,
                      { round, text: provisional, status: "running" }
                    )
                    const assistantMessageId = assistantMessageIdRef.current
                    setState((current) => ({
                      ...current,
                      messages: current.messages.map((message) =>
                        message.id === assistantMessageId
                          ? {
                              ...message,
                              activity: mergeAssistantActivityRound(
                                parseAssistantActivityRounds(message.activity),
                                { round, text: provisional, status: "running" }
                              ),
                            }
                          : message
                      ),
                    }))
                  } else {
                    const assistantText = assistantTextRef.current + payload.text
                    assistantTextRef.current = assistantText
                    const assistantMessageId = assistantMessageIdRef.current
                    setState((current) => ({
                      ...current,
                      messages: current.messages.map((message) =>
                        message.id === assistantMessageId
                          ? { ...message, content: assistantText }
                          : message
                      ),
                    }))
                  }
                } else if (
                  event === "assistant_round" &&
                  isAssistantRoundPayload(payload)
                ) {
                  const assistantMessageId = assistantMessageIdRef.current
                  if (payload.kind === "activity") {
                    assistantActivityRef.current = mergeAssistantActivityRound(
                      assistantActivityRef.current,
                      { round: payload.round, text: payload.text, status: "complete" }
                    )
                    setState((current) => ({
                      ...current,
                      messages: current.messages.map((message) =>
                        message.id === assistantMessageId
                          ? {
                              ...message,
                              activity: mergeAssistantActivityRound(
                                parseAssistantActivityRounds(message.activity),
                                {
                                  round: payload.round,
                                  text: payload.text,
                                  status: "complete",
                                }
                              ),
                            }
                          : message
                      ),
                    }))
                  } else {
                    assistantActivityRef.current = removeAssistantActivityRound(
                      assistantActivityRef.current,
                      payload.round
                    )
                    assistantTextRef.current = payload.text
                    setState((current) => ({
                      ...current,
                      messages: current.messages.map((message) =>
                        message.id === assistantMessageId
                          ? {
                              ...message,
                              content: payload.text,
                              activity: removeAssistantActivityRound(
                                parseAssistantActivityRounds(message.activity),
                                payload.round
                              ),
                            }
                          : message
                      ),
                    }))
                  }
                } else if (event === "approval_required") {
                  // Cards stay scoped to the observed turn: a historical replay
                  // for another turn must not touch this stream's cards.
                  const approval = cmsApprovalFromEventPayload(payload)
                  if (approval && approval.turn_id === turnId)
                    upsertApproval(approval)
                } else if (event === "approval_decided") {
                  const approval = cmsApprovalFromEventPayload(payload)
                  if (approval && approval.turn_id === turnId) {
                    upsertApproval(approval)
                    void syncTurnSnapshotRef.current(turnId, generation)
                  }
                } else if (event === "question_required") {
                  const request = userQuestionFromEventPayload(payload)
                  if (request && request.turn_id === turnId) {
                    upsertQuestionRequest(request)
                    void syncTurnSnapshotRef.current(turnId, generation)
                  }
                } else if (event === "question_resolved") {
                  const request = userQuestionFromEventPayload(payload)
                  if (request && request.turn_id === turnId) {
                    upsertQuestionRequest(request)
                    void syncTurnSnapshotRef.current(turnId, generation)
                  }
                } else if (event === "waiting_for_user") {
                  const waitingId = waitingTurnIdFromEventPayload(payload)
                  if (waitingId === null || waitingId === turnId) {
                    // Historical waiting frames replay on resume; only the
                    // current turn snapshot can pause this stream.
                    void syncTurnSnapshotRef.current(turnId, generation)
                  }
                } else if (
                  event === "completed" &&
                  isTerminalPayload(payload)
                ) {
                  updateStatus("completed")
                  void refreshTerminalTurn(turnId, generation)
                } else if (event === "stopped" && isTerminalPayload(payload)) {
                  updateStatus("stopped")
                  void refreshTerminalTurn(turnId, generation)
                } else if (event === "failed" && isTerminalPayload(payload)) {
                  updateStatus("failed")
                  setState((current) => ({
                    ...current,
                    stopping: false,
                  }))
                  void refreshTerminalTurn(turnId, generation)
                }
              },
            })
          } catch {
            if (
              controller.signal.aborted ||
              generation !== generationRef.current ||
              !mountedRef.current
            )
              return
          }

          if (
            generation !== generationRef.current ||
            controller.signal.aborted ||
            !mountedRef.current ||
            isTurnTerminal(statusRef.current) ||
            isTurnWaitingStatus(statusRef.current)
          ) {
            return
          }
          // The SSE stream closed without a terminal event (e.g. dropped
          // connection). Fetch the turn once before reconnecting: if the server
          // already reached a terminal state, apply it instead of reopening a
          // finished stream.
          try {
            const turn = await clientApiFetch<AITurnResponse>(
              `/ai/turns/${turnId}`
            )
            if (
              generation !== generationRef.current ||
              controller.signal.aborted ||
              !mountedRef.current
            ) {
              return
            }
            if (isTurnTerminal(turn.status)) {
              applyTurn(turn)
              maybeAutoRetryTurnRef.current(turn, generation)
              return
            }
            if (isTurnWaitingStatus(turn.status)) {
              // The turn paused for approval while the stream was down: park
              // on waiting and stop reconnecting.
              applyTurn(turn)
              return
            }
          } catch {
            if (
              generation !== generationRef.current ||
              controller.signal.aborted ||
              !mountedRef.current
            ) {
              return
            }
            // Fall through to reconnect when the refresh is unavailable.
          }
          await new Promise<void>((resolve) => {
            const timer = window.setTimeout(resolve, RECONNECT_DELAY_MS)
            controller.signal.addEventListener(
              "abort",
              () => {
                window.clearTimeout(timer)
                resolve()
              },
              { once: true }
            )
          })
        }
      } finally {
        // Release the ref only if it is still OURS: a newer observer (different
        // turn or generation) already owns it, and refocus uses its presence to
        // tell "streaming" from "lost".
        if (observerRef.current?.controller === controller) {
          observerRef.current = null
        }
      }
    },
    [
      applyTurn,
      queryClient,
      refreshTerminalTurn,
      stopObserver,
      updateStatus,
      upsertApproval,
      upsertQuestionRequest,
    ]
  )

  /** Authoritative turn sync. Historical SSE frames replay on
   * resume, so waiting/decision handling always verifies against this live
   * snapshot and ignores frames for turns the user already left. A paused turn
   * resumed by a decision is re-subscribed exactly once; an already live
   * same-turn stream is left running by observe(). */
  const syncTurnSnapshot = useCallback(
    async (turnId: string, generation: number) => {
      try {
        const turn = await clientApiFetch<AITurnResponse>(`/ai/turns/${turnId}`)
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          turnIdRef.current !== turn.id ||
          turn.conversation_id !== conversationIdRef.current
        )
          return
        applyTurn(turn)

        if (!isTurnTerminal(turn.status) && !isTurnWaitingStatus(turn.status))
          void observe(turn.id, generation)
      } catch {
        // Keep current cards; refocus retries the sync.
      }
    },
    [applyTurn, observe]
  )

  useEffect(() => {
    syncTurnSnapshotRef.current = syncTurnSnapshot
  }, [syncTurnSnapshot])

  /** Decide one MCP approval; the worker resumes the same run. always_allow
   * also saves the exact connection/tool rule and refetches the Marketplace
   * preferences for that project. */
  const decideApproval = useCallback(
    async (approvalId: string, decision: MCPApprovalDecision) => {
      const conversationId = conversationIdRef.current
      if (!conversationId || decidingApprovalRef.current) return
      const generation = generationRef.current
      decidingApprovalRef.current = approvalId
      setState((current) => ({
        ...current,
        decidingApproval: { id: approvalId, decision },
        approvalDecisionErrors: {
          ...current.approvalDecisionErrors,
          [approvalId]: "",
        },
      }))
      try {
        const body: CMSApprovalDecisionBody =
          decision === "always_allow"
            ? { decision: "approve", always_allow: true }
            : { decision }
        const response = await clientApiPost<CMSApprovalDecisionResponse>(
          `/ai/conversations/${conversationId}/approvals/${approvalId}/decision`,
          body
        )
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          conversationIdRef.current !== conversationId
        )
          return
        upsertApproval(response.approval)
        if (decision === "always_allow") {
          const projectId = projectIdRef.current
          if (projectId) {
            void queryClient.invalidateQueries({
              queryKey: mcpConnectionsQueryKey(projectId),
            })
          }
        }
        void syncTurnSnapshotRef.current(response.turn_id, generation)
      } catch (error) {
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          conversationIdRef.current !== conversationId
        )
          return
        const message =
          error instanceof ApiError && error.status === 409
            ? "Already decided — refreshed to the latest state."
            : error instanceof ApiError && error.status === 404
              ? "Approval no longer available — refreshed."
              : error instanceof ApiError && error.status === 403
                ? "Only the turn initiator can decide."
                : simpleError(error, "Unable to send the decision.")
        setState((current) => ({
          ...current,
          approvalDecisionErrors: {
            ...current.approvalDecisionErrors,
            [approvalId]: message,
          },
        }))
        reportRevbotError(message)
      } finally {
        decidingApprovalRef.current = null
        if (mountedRef.current) {
          setState((current) => ({ ...current, decidingApproval: null }))
        }
      }
    },
    [queryClient, upsertApproval]
  )

  const syncQuestions = useCallback(
    async (conversationId: string, generation: number) => {
      try {
        const response = await clientApiFetch<UserQuestionListResponse>(
          `/ai/conversations/${conversationId}/questions`
        )
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          conversationIdRef.current !== conversationId
        )
          return
        const incoming = Array.isArray(response.question_requests)
          ? response.question_requests
          : []
        setState((current) => ({
          ...current,
          questions: mergeQuestionRequests(current.questions, incoming),
        }))
      } catch {}
    },
    []
  )

  const answerQuestions = useCallback(
    async (requestId: string, body: UserQuestionAnswerBody): Promise<boolean> => {
      const conversationId = conversationIdRef.current
      if (!conversationId) return false
      const generation = generationRef.current
      if (answeringQuestionRef.current) return false
      answeringQuestionRef.current = requestId
      setState((current) => ({
        ...current,
        answeringQuestion: requestId,
        questionErrors: { ...current.questionErrors, [requestId]: "" },
      }))
      try {
        const response = await clientApiPost<UserQuestionAnswerResponse>(
          `/ai/conversations/${conversationId}/questions/${requestId}/answer`,
          body
        )
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          conversationIdRef.current !== conversationId
        )
          return false
        upsertQuestionRequest(response.question_request)
        void syncTurnSnapshotRef.current(response.turn_id, generation)
        return true
      } catch (error) {
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          conversationIdRef.current !== conversationId
        )
          return false
        const message =
          error instanceof ApiError && error.status === 409
            ? "Already answered — refreshed to the latest state."
            : error instanceof ApiError && error.status === 404
              ? "Question no longer available — refreshed."
              : error instanceof ApiError && error.status === 403
                ? "Only the turn initiator can answer."
                : simpleError(error, "Unable to send the answers.")
        setState((current) => ({
          ...current,
          questionErrors: { ...current.questionErrors, [requestId]: message },
        }))
        reportRevbotError(message)
        void syncQuestions(conversationId, generation)
        return false
      } finally {
        if (answeringQuestionRef.current === requestId)
          answeringQuestionRef.current = null
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            answeringQuestion:
              current.answeringQuestion === requestId
                ? null
                : current.answeringQuestion,
          }))
        }
      }
    },
    [syncQuestions, upsertQuestionRequest]
  )

  const submitQuestionAnswers = useCallback(
    (requestId: string, answers: UserQuestionAnswer[]) => {
      const skipped = answers.length > 0 && answers.every((a) => a.skipped)
      void answerQuestions(
        requestId,
        skipped ? { decision: "skip" } : { decision: "answer", answers }
      )
    },
    [answerQuestions]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      clearAutoRetryTimer()
      stopObserver()
    }
  }, [clearAutoRetryTimer, stopObserver])

  useEffect(() => {
    setEffort((current) =>
      allowedEfforts.includes(current) ? current : defaultEffort(allowedEfforts)
    )
  }, [allowedEfforts, setEffort])

  useEffect(() => {
    const projectId = activeProject?.id ?? null
    const scopeLocationId = normalizeLocationScope(locationId)
    generationRef.current += 1
    const generation = generationRef.current
    projectGenerationRef.current += 1
    clearAutoRetryTimer()
    autoRetryAttemptsRef.current = 0
    userStopRequestedRef.current = false
    stopObserver()
    projectIdRef.current = projectId
    locationIdRef.current = scopeLocationId
    conversationLocationRef.current = null
    conversationIdRef.current = null
    turnIdRef.current = null
    sendCrawlIdRef.current = null
    statusRef.current = "idle"
    activeRequestRef.current = false
    lastObservedTurnRef.current = null
    lastEventIdRef.current = 0
    seenEventIdsRef.current = new Set()
    assistantTextRef.current = ""
    assistantActivityRef.current = []
    assistantMessageIdRef.current = null
    conversationCacheRef.current.clear()
    setState({
      conversationId: null,
      conversations: [],
      conversationStatus: {},
      messages: [],
      status: "idle",
      phase: null,
      toolCalls: [],
      activityStartedAt: null,
      stopping: false,
      loading: Boolean(projectId),
      approvals: [],
      questions: [],
      answeringQuestion: null,
      questionErrors: {},
      turnId: null,

      decidingApproval: null,
      approvalDecisionErrors: {},
    })
    if (!projectId) return

    // Content drafts never touch the project conversation list or the
    // island's reload slot; the pinned effect below owns selection.
    if (listDisabledRef.current) {
      setState((current) => ({ ...current, loading: false }))
      return
    }

    refreshConversations()

    const stored = readStoredConversation(projectId, scopeLocationId)
    if (!stored) {
      setState((current) => ({ ...current, loading: false }))
      return
    }

    void (async () => {
      try {
        const conversation = await clientApiFetch<AIConversationDetailResponse>(
          `/ai/conversations/${stored.conversationId}`
        )
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          projectId !== projectIdRef.current
        )
          return
        if (!applyConversation(conversation, Boolean(stored.turnId))) {
          clearStoredConversation(projectId, scopeLocationId)
          if (mountedRef.current) {
            setState((current) => ({ ...current, loading: false }))
          }
          return
        }
        if (!stored.turnId) {
          void syncQuestions(stored.conversationId, generation)
          return
        }

        try {
          const turn = await clientApiFetch<AITurnResponse>(
            `/ai/turns/${stored.turnId}`
          )
          if (
            generation !== generationRef.current ||
            !mountedRef.current ||
            projectId !== projectIdRef.current
          )
            return
          applyTurn(turn)
          void syncQuestions(stored.conversationId, generation)
          if (!isTurnTerminal(turn.status)) void observe(turn.id, generation)
        } catch (error) {
          if (
            generation !== generationRef.current ||
            !mountedRef.current ||
            projectId !== projectIdRef.current
          )
            return
          if (error instanceof ApiError && error.status === 404) {
            saveStoredConversation(
              projectId,
              {
                conversationId: stored.conversationId,
              },
              scopeLocationId
            )
            setState((current) => ({ ...current, loading: false }))
            return
          }
          reportRevbotError(
            simpleError(error, "Unable to restore the Revbot turn.")
          )
          setState((current) => ({
            ...current,
            loading: false,
          }))
        }
      } catch (error) {
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          projectId !== projectIdRef.current
        )
          return
        if (
          error instanceof ApiError &&
          (error.status === 404 || error.status === 403)
        ) {
          clearStoredConversation(projectId, scopeLocationId)
          setState((current) => ({ ...current, loading: false }))
          return
        }
        reportRevbotError(
          simpleError(error, "Unable to restore the Revbot conversation.")
        )
        setState((current) => ({
          ...current,
          loading: false,
        }))
      }
    })()
  }, [
    activeProject?.id,
    locationId,
    applyConversation,
    applyTurn,
    observe,
    refreshConversations,
    stopObserver,
    syncQuestions,
  ])

  const selectConversation = useCallback(
    async (conversationId: string) => {
      const projectId = projectIdRef.current
      if (!projectId) return

      if (
        conversationIdRef.current === conversationId &&
        conversationCacheRef.current.has(conversationId)
      ) {
        return
      }

      const scopeLocationId = locationIdRef.current
      const cachedConversation =
        conversationCacheRef.current.get(conversationId)
      if (
        cachedConversation &&
        conversationLocationScope(cachedConversation) !== scopeLocationId
      ) {
        conversationCacheRef.current.delete(conversationId)
        reportRevbotError("This conversation is no longer available.")
        return
      }

      generationRef.current += 1
      const generation = generationRef.current
      stopObserver()
      turnIdRef.current = null
      sendCrawlIdRef.current = null
      statusRef.current = "idle"
      activeRequestRef.current = false
      lastObservedTurnRef.current = null
      lastEventIdRef.current = 0
      seenEventIdsRef.current = new Set()
      assistantTextRef.current = ""
      assistantActivityRef.current = []
      assistantMessageIdRef.current = null
      if (cachedConversation) {
        applyConversation(cachedConversation, true)
      } else {
        setState((current) => ({
          ...current,
          status: "idle",
          phase: null,
          toolCalls: [],
          activityStartedAt: null,
          stopping: false,
          loading: true,
          questions: [],
          answeringQuestion: null,
          questionErrors: {},
          turnId: null,
        }))
      }

      try {
        const conversation = await clientApiFetch<AIConversationDetailResponse>(
          `/ai/conversations/${conversationId}`
        )
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          projectId !== projectIdRef.current ||
          scopeLocationId !== locationIdRef.current
        )
          return
        if (!applyConversation(conversation)) {
          conversationCacheRef.current.delete(conversationId)
          reportRevbotError("This conversation is no longer available.")
          if (mountedRef.current) {
            setState((current) => ({ ...current, loading: false }))
          }
          return
        }
        // Pinned (draft) chats must not overwrite the island's reload slot.
        if (!pinnedConversationIdRef.current)
          saveStoredConversation(projectId, { conversationId }, scopeLocationId)
        void syncQuestions(conversationId, generation)
        if (
          conversation.turn_id &&
          (conversation.turn_status === "queued" ||
            conversation.turn_status === "running" ||
            isTurnWaitingStatus(conversation.turn_status))
        ) {
          if (!pinnedConversationIdRef.current)
            saveStoredConversation(
              projectId,
              {
                conversationId,
                turnId: conversation.turn_id,
              },
              scopeLocationId
            )
          try {
            const turn = await clientApiFetch<AITurnResponse>(
              `/ai/turns/${conversation.turn_id}`
            )
            if (
              generation !== generationRef.current ||
              !mountedRef.current ||
              projectId !== projectIdRef.current
            )
              return
            applyTurn(turn)
            if (!isTurnTerminal(turn.status)) void observe(turn.id, generation)
          } catch (error) {
            if (
              generation !== generationRef.current ||
              !mountedRef.current ||
              projectId !== projectIdRef.current
            )
              return
            reportRevbotError(
              simpleError(error, "Unable to resume this conversation.")
            )
          }
        }
      } catch (error) {
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          projectId !== projectIdRef.current
        )
          return
        reportRevbotError(
          simpleError(error, "Unable to load the Revbot conversation.")
        )
        setState((current) => ({
          ...current,
          loading: false,
        }))
      }
    },
    [applyConversation, applyTurn, observe, stopObserver, syncQuestions]
  )

  const newChat = useCallback(() => {
    const projectId = projectIdRef.current
    if (!projectId) return

    generationRef.current += 1
    stopObserver()
    conversationIdRef.current = null
    turnIdRef.current = null
    sendCrawlIdRef.current = null
    statusRef.current = "idle"
    activeRequestRef.current = false
    lastObservedTurnRef.current = null
    lastEventIdRef.current = 0
    seenEventIdsRef.current = new Set()
    assistantTextRef.current = ""
    assistantActivityRef.current = []
    assistantMessageIdRef.current = null
    clearStoredConversation(projectId, locationIdRef.current)
    notifyConversationChange(null)
    decidingApprovalRef.current = null
    answeringQuestionRef.current = null
    setState((current) => ({
      ...current,
      conversationId: null,
      messages: [],
      status: "idle",
      phase: null,
      toolCalls: [],
      activityStartedAt: null,
      stopping: false,
      loading: false,
      approvals: [],
      questions: [],
      answeringQuestion: null,
      questionErrors: {},
      turnId: null,

      decidingApproval: null,
      approvalDecisionErrors: {},
    }))
  }, [notifyConversationChange, stopObserver])

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const projectId = projectIdRef.current
      if (!projectId) return

      const isActive = conversationIdRef.current === conversationId

      try {
        await clientApiDelete(`/ai/conversations/${conversationId}`)
        if (!mountedRef.current || projectId !== projectIdRef.current) return

        conversationCacheRef.current.delete(conversationId)
        setState((current) => ({
          ...current,
          conversations: current.conversations.filter(
            (conversation) => conversation.id !== conversationId
          ),
          // Drop the deleted conversation's last-known turn status so a stale
          // active-turn entry cannot keep the background poll alive.
          conversationStatus: Object.fromEntries(
            Object.entries(current.conversationStatus).filter(
              ([id]) => id !== conversationId
            )
          ),
        }))

        if (isActive) newChat()
      } catch (error) {
        if (!mountedRef.current || projectId !== projectIdRef.current) return
        reportRevbotError(
          simpleError(error, "Unable to delete this conversation.")
        )
      }
    },
    [newChat]
  )

  useEffect(() => {
    // Pinned (draft) mode owns selection through the effect below; running
    // newChat here would wipe the island's stored conversation.
    if (disableConversationList || pinnedConversationId) return
    if (requestedConversationId === conversationIdRef.current) return
    if (requestedConversationId)
      void selectConversation(requestedConversationId)
    else newChat()
  }, [
    newChat,
    disableConversationList,
    pinnedConversationId,
    requestedConversationId,
    selectConversation,
  ])

  // Content drafts bind one Revbot instance to the draft's conversation.
  useEffect(() => {
    if (pinnedConversationId) void selectConversation(pinnedConversationId)
  }, [pinnedConversationId, selectConversation])

  const send = useCallback(
    async (content: string, options?: SendOptions) => {
      // Draft pages flush their autosave here so the turn reads fresh text.
      await onBeforeSendRef.current?.()
      const projectId = projectIdRef.current
      const trimmed = content.trim()
      const images = options?.images
      const hasImages = Boolean(images?.length)
      const pending = pendingQuestionRequest(
        questionsRef.current,
        turnIdRef.current
      )
      if (
        pending &&
        projectId &&
        conversationIdRef.current &&
        turnIdRef.current === pending.turn_id
      ) {
        if (hasImages) {
          reportRevbotError("Images can't be sent while answering a question.")
          return false
        }
        if (!trimmed || answeringQuestionRef.current) return false
        return answerQuestions(pending.id, { decision: "answer", reply: trimmed })
      }
      if (
        !projectId ||
        (!trimmed && !hasImages) ||
        activeRequestRef.current ||
        !allowedEfforts.includes(effort)
      )
        return

      const generation = generationRef.current + 1
      generationRef.current = generation
      clearAutoRetryTimer()
      userStopRequestedRef.current = false
      stopObserver()
      const retryAssistantId = options?.retryAfterAssistantMessageId
      const sendCrawlId = options?.crawlId?.trim()
        ? options.crawlId
        : undefined
      sendCrawlIdRef.current = sendCrawlId ?? null
      if (!options?.autoRetry) autoRetryAttemptsRef.current = 0
      const optimisticUser = userMessage(trimmed, images)
      const optimisticAssistant = assistantMessage()
      assistantMessageIdRef.current = optimisticAssistant.id
      assistantTextRef.current = ""
      assistantActivityRef.current = []
      activeRequestRef.current = true
      setState((current) => {
        const withoutFailedAssistant = retryAssistantId
          ? current.messages.filter(
              (message) => message.id !== retryAssistantId
            )
          : current.messages
        const nextMessages = retryAssistantId
          ? [...withoutFailedAssistant, optimisticAssistant]
          : [...withoutFailedAssistant, optimisticUser, optimisticAssistant]

        return {
          ...current,
          messages: nextMessages,
          status: "idle",
          phase: null,
          toolCalls: [],
          activityStartedAt: Date.now(),
          stopping: false,
          loading: true,
        }
      })

      try {
        const scopeLocationId = locationIdRef.current
        let conversationId = conversationIdRef.current
        if (
          conversationId &&
          conversationLocationRef.current !== scopeLocationId
        ) {
          conversationId = null
          conversationIdRef.current = null
          conversationLocationRef.current = null
        }
        if (!conversationId) {
          const conversation = await clientApiPost<AIConversationResponse>(
            `/projects/${projectId}/ai/conversations`,
            scopeLocationId ? { location_id: scopeLocationId } : {}
          )
          conversationId = conversation.id
          if (
            !mountedRef.current ||
            generation !== generationRef.current ||
            projectId !== projectIdRef.current
          )
            return
          if (conversationLocationScope(conversation) !== scopeLocationId) {
            activeRequestRef.current = false
            statusRef.current = "idle"
            assistantMessageIdRef.current = null
            reportRevbotError("This conversation is no longer available.")
            setState((current) => ({
              ...current,
              messages: current.messages.filter(
                (message) =>
                  message.id !== optimisticUser.id &&
                  message.id !== optimisticAssistant.id
              ),
              status: "idle",
              loading: false,
            }))
            return
          }
          conversationIdRef.current = conversationId
          conversationLocationRef.current = scopeLocationId
          notifyConversationChange(conversationId)
          saveStoredConversation(projectId, { conversationId }, scopeLocationId)
          setState((current) => ({
            ...current,
            conversationId,
            conversations: [
              conversation,
              ...current.conversations.filter(
                (item) => item.id !== conversation.id
              ),
            ],
          }))
        }

        if (
          !mountedRef.current ||
          generation !== generationRef.current ||
          projectId !== projectIdRef.current
        )
          return
        const turn = await clientApiPost<AITurnSubmissionResponse>(
          `/ai/conversations/${conversationId}/turns`,
          {
            content: trimmed,
            images: hasImages ? images : undefined,
            reasoning_effort: effort,
            client_request_id: crypto.randomUUID(),
            crawl_id: sendCrawlId,
          }
        )
        if (
          !mountedRef.current ||
          generation !== generationRef.current ||
          projectId !== projectIdRef.current
        )
          return
        turnIdRef.current = turn.turn_id
        statusRef.current = turn.status
        assistantMessageIdRef.current = turn.assistant_message_id
        saveStoredConversation(
          projectId,
          {
            conversationId,
            turnId: turn.turn_id,
          },
          locationIdRef.current
        )
        setState((current) => ({
          ...current,
          messages: current.messages.map((message) => {
            if (!retryAssistantId && message.id === optimisticUser.id) {
              return { ...message, id: turn.user_message_id, local: false }
            }
            if (message.id === optimisticAssistant.id) {
              return { ...message, id: turn.assistant_message_id, local: false }
            }
            return message
          }),
          conversations: current.conversations.map((conversation) =>
            conversation.id === conversationId &&
            conversation.title === "New conversation"
              ? {
                  ...conversation,
                  title: trimmed
                    ? trimmed.replace(/\s+/g, " ").slice(0, 120)
                    : "Sent an image",
                }
              : conversation
          ),
          status: turn.status,
          loading: false,
          turnId: turn.turn_id,
          conversationStatus: {
            ...current.conversationStatus,
            [conversationId]: turn.status,
          },
        }))
        void observe(turn.turn_id, generation)
      } catch (error) {
        if (
          generation !== generationRef.current ||
          projectId !== projectIdRef.current ||
          !mountedRef.current
        )
          return
        activeRequestRef.current = false
        statusRef.current = "idle"
        assistantMessageIdRef.current = null
        reportRevbotError(simpleError(error, "Unable to send your message."))
        setState((current) => ({
          ...current,
          messages: current.messages.filter(
            (message) =>
              (retryAssistantId || message.id !== optimisticUser.id) &&
              message.id !== optimisticAssistant.id
          ),
          status: "idle",
          loading: false,
        }))
      }
    },
    [
      allowedEfforts,
      answerQuestions,
      clearAutoRetryTimer,
      effort,
      notifyConversationChange,
      observe,
      stopObserver,
    ]
  )

  const maybeAutoRetryTurn = useCallback(
    (turn: AITurnResponse, generation: number) => {
      const reportFailure = () => {
        reportRevbotError(turnErrorMessage(turn.error_code))
      }

      if (
        generation !== generationRef.current ||
        !mountedRef.current ||
        userStopRequestedRef.current
      ) {
        return false
      }

      if (!isRetryableCutoff(turn)) {
        if (turn.status === "failed") reportFailure()
        return false
      }

      const assistant = assistantMessageForTurn(turn)
      if (!assistant) {
        reportFailure()
        return false
      }

      const messages = messagesRef.current
      const assistantIndex = messages.findIndex(
        (message) => message.id === assistant.id
      )
      if (assistantIndex <= 0) {
        reportFailure()
        return false
      }

      const userMessageEntry = messages[assistantIndex - 1]
      if (
        userMessageEntry.role !== "user" ||
        !hasUserTurnContent(userMessageEntry)
      ) {
        reportFailure()
        return false
      }

      const attempt = autoRetryAttemptsRef.current
      if (attempt >= AUTO_RETRY_MAX_ATTEMPTS) {
        reportFailure()
        return false
      }

      autoRetryAttemptsRef.current = attempt + 1
      toast.message(
        `Retrying response (${attempt + 1}/${AUTO_RETRY_MAX_ATTEMPTS})…`,
        { id: REVBOT_TOAST_ID }
      )
      clearAutoRetryTimer()
      autoRetryTimerRef.current = window.setTimeout(() => {
        autoRetryTimerRef.current = null
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          userStopRequestedRef.current
        ) {
          return
        }
        void send(userMessageEntry.content, {
          images: userMessageEntry.images,
          retryAfterAssistantMessageId: assistant.id,
          autoRetry: true,
          crawlId: sendCrawlIdRef.current ?? undefined,
        })
      }, AUTO_RETRY_DELAY_MS)
      return true
    },
    [clearAutoRetryTimer, send]
  )

  useEffect(() => {
    maybeAutoRetryTurnRef.current = maybeAutoRetryTurn
  }, [maybeAutoRetryTurn])

  const retry = useCallback(
    (assistantMessageId: string) => {
      if (activeRequestRef.current || isTurnActiveStatus(statusRef.current)) {
        reportRevbotError("Wait for the current response to finish.")
        return
      }

      const messages = messagesRef.current
      const assistantIndex = messages.findIndex(
        (message) => message.id === assistantMessageId
      )
      if (assistantIndex <= 0) return

      const userMessage = messages[assistantIndex - 1]
      if (userMessage.role !== "user") return
      if (!hasUserTurnContent(userMessage)) return

      void send(userMessage.content, {
        images: userMessage.images,
        retryAfterAssistantMessageId: assistantMessageId,
        crawlId: sendCrawlIdRef.current ?? undefined,
      })
    },
    [send]
  )

  const stop = useCallback(async () => {
    const turnId = turnIdRef.current
    const generation = generationRef.current
    const projectId = projectIdRef.current
    if (!turnId || !isTurnActiveStatus(statusRef.current)) return
    userStopRequestedRef.current = true
    clearAutoRetryTimer()
    setState((current) => ({ ...current, stopping: true }))
    try {
      const turn = await clientApiPost<AITurnResponse>(
        `/ai/turns/${turnId}/cancel`,
        {}
      )
      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        projectId !== projectIdRef.current
      )
        return
      applyTurn(turn)
      if (conversationIdRef.current)
        void syncQuestions(conversationIdRef.current, generation)

      if (isTurnTerminal(turn.status)) {
        stopObserver()
      } else {
        setState((current) => ({ ...current, stopping: true }))
      }
    } catch (error) {
      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        projectId !== projectIdRef.current
      )
        return
      reportRevbotError(simpleError(error, "Unable to stop this request."))
      setState((current) => ({
        ...current,
        stopping: false,
      }))
    }
  }, [applyTurn, clearAutoRetryTimer, stopObserver, syncQuestions])

  useEffect(() => {
    if (!isTurnTerminal(statusRef.current)) return
    activeRequestRef.current = false
  }, [state.status])

  // While a background conversation (not the selected one — that one updates
  // via SSE) has a turn in flight, poll the conversation list so its spinner
  // clears once the turn finishes. Polling pauses while the tab is hidden;
  // becoming visible again with an active background conversation triggers an
  // immediate best-effort refresh so state catches up.
  const anyBackgroundConversationActive = Object.entries(
    state.conversationStatus
  ).some(
    ([conversationId, status]) =>
      conversationId !== state.conversationId && isTurnActiveStatus(status)
  )
  useEffect(() => {
    if (!anyBackgroundConversationActive) return
    const tick = () => {
      if (document.hidden) return
      refreshConversations()
    }
    const timer = window.setInterval(tick, 5000)
    const handleVisibilityChange = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [anyBackgroundConversationActive, refreshConversations])

  // Refocus re-verifies a paused turn against its live snapshot instead of
  // trusting replayed waiting frames. A stream that died with the connection
  // is restarted here; a stream that is still live is never disturbed.
  useEffect(() => {
    const refreshOnVisible = () => {
      if (document.hidden) return
      const generation = generationRef.current
      const resyncTurnId = turnIdToResyncOnRefocus({
        observer: observerRef.current,
        status: statusRef.current,
        turnId: turnIdRef.current,
      })
      if (resyncTurnId)
        void syncTurnSnapshotRef.current(resyncTurnId, generation)
    }
    window.addEventListener("focus", refreshOnVisible)
    document.addEventListener("visibilitychange", refreshOnVisible)
    return () => {
      window.removeEventListener("focus", refreshOnVisible)
      document.removeEventListener("visibilitychange", refreshOnVisible)
    }
  }, [])

  const pendingQuestion = pendingQuestionRequest(state.questions, state.turnId)
  const waitingForQuestion = pendingQuestion !== null

  // Draft sync point: refetch the draft whenever a turn settles.
  useEffect(() => {
    if (isTurnTerminal(state.status)) onTurnSettledRef.current?.(state.status)
  }, [state.status])

  return {
    activityStartedAt: state.activityStartedAt,
    conversationActive: (conversationId: string) => {
      const status = state.conversationStatus[conversationId]
      return isTurnActiveStatus(status)
    },
    conversationId: state.conversationId,
    conversations: state.conversations,
    deleteConversation,
    effort,
    loading: state.loading,
    messages: state.messages,
    newChat,
    phase: state.phase,
    retry,
    selectConversation,
    send,
    setEffort,
    status: state.status,
    stopping: state.stopping,
    stop,
    toolCalls: state.toolCalls,
    approvals: state.approvals,
    questions: state.questions,
    pendingQuestion,
    waitingForQuestion,
    answeringQuestion: state.answeringQuestion,
    questionErrors: state.questionErrors,
    submitQuestionAnswers,
    syncQuestions,

    decidingApproval: state.decidingApproval,
    approvalDecisionErrors: state.approvalDecisionErrors,
    decideApproval,

    waitingForApproval: state.approvals.some(
      (approval) => approval.status === "pending"
    ),
  }
}

export type RevbotHandle = ReturnType<typeof useRevbot>

function cmsApprovalFromEventPayload(payload: unknown): CMSApproval | null {
  // Contract shape: {approval: ApprovalEntity}. Anything else is ignored.
  if (!payload || typeof payload !== "object") return null
  const approval = (payload as { approval?: unknown }).approval
  if (!approval || typeof approval !== "object") return null
  const record = approval as Record<string, unknown>
  if (
    typeof record.id !== "string" ||
    typeof record.turn_id !== "string" ||
    typeof record.status !== "string"
  )
    return null
  return approval as CMSApproval
}

function userQuestionFromEventPayload(
  payload: unknown
): UserQuestionRequest | null {
  if (!payload || typeof payload !== "object") return null
  const request = (payload as { question_request?: unknown }).question_request
  if (!request || typeof request !== "object") return null
  const record = request as Record<string, unknown>
  if (
    typeof record.id !== "string" ||
    typeof record.turn_id !== "string" ||
    typeof record.status !== "string" ||
    !Array.isArray(record.questions)
  )
    return null
  return request as UserQuestionRequest
}

function waitingTurnIdFromEventPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const turnId = (payload as { turn_id?: unknown }).turn_id
  return typeof turnId === "string" && turnId ? turnId : null
}

function isPhasePayload(payload: unknown): payload is AIStreamPhasePayload {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    ((payload as Record<string, unknown>).phase === "thinking" ||
      (payload as Record<string, unknown>).phase === "writing" ||
      (payload as Record<string, unknown>).phase === "working")
  )
}

function isToolCallPayload(
  payload: unknown
): payload is AIStreamToolCallPayload {
  if (!payload || typeof payload !== "object") return false
  const record = payload as Record<string, unknown>
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    record.args !== null &&
    typeof record.args === "object" &&
    !Array.isArray(record.args)
  )
}

function isToolResultPayload(
  payload: unknown
): payload is AIStreamToolResultPayload {
  if (!payload || typeof payload !== "object") return false
  const record = payload as Record<string, unknown>
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.summary === "string" &&
    (record.status === undefined ||
      record.status === "running" ||
      record.status === "completed" ||
      record.status === "failed" ||
      record.status === "awaiting")
  )
}

function isTextDeltaPayload(
  payload: unknown
): payload is AIStreamTextDeltaPayload {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).text === "string"
  )
}

function isTerminalPayload(
  payload: unknown
): payload is AIStreamTerminalPayload {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    (typeof (payload as Record<string, unknown>).error_code === "string" ||
      (payload as Record<string, unknown>).error_code === null ||
      (payload as Record<string, unknown>).error_code === undefined)
  )
}
