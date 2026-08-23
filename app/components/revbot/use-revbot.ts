"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
  AITurnMessageResponse,
  AITurnResponse,
  AITurnSubmissionResponse,
  ProjectResponse,
} from "~/lib/api.types"

const STORAGE_PREFIX = "revbot-turn:"
const EFFORT_STORAGE_KEY = "revbot-reasoning-effort"
const RECONNECT_DELAY_MS = 700

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
  /** Last known turn status per conversation (queued/running while active). */
  conversationStatus: Record<string, RevbotStatus>
  messages: LocalMessage[]
  status: RevbotStatus
  phase: AIStreamPhase | null
  toolCalls: RevbotToolCall[]
  activityStartedAt: number | null
  stopping: boolean
  loading: boolean
}

function storageKey(projectId: string) {
  return `${STORAGE_PREFIX}${projectId}`
}

function readStoredConversation(projectId: string): StoredConversation | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storageKey(projectId)) ?? "null"
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

function saveStoredConversation(projectId: string, value: StoredConversation) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(value))
  } catch {
    // Storage is an optional reload convenience.
  }
}

function clearStoredConversation(projectId: string) {
  try {
    localStorage.removeItem(storageKey(projectId))
  } catch {
    // Storage is an optional reload convenience.
  }
}

function isTurnTerminal(status: RevbotStatus) {
  return status === "completed" || status === "stopped" || status === "failed"
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
  } catch {
    // Storage is an optional preference convenience.
  }
}

function resolveEffort(allowedEfforts: AIReasoningEffort[]) {
  const stored = readStoredEffort()
  if (stored && allowedEfforts.includes(stored)) return stored
  return defaultEffort(allowedEfforts)
}

function userMessage(content: string): LocalMessage {
  const now = new Date().toISOString()
  return {
    id: `local-user-${crypto.randomUUID()}`,
    role: "user",
    status: "complete",
    content,
    created_at: now,
    updated_at: now,
    local: true,
  }
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
    status: inferToolResultStatus(call.status, summary),
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
    .map((message) => turnMessagesById.get(message.id) ?? message)
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
  onConversationChange,
}: {
  activeProject: ProjectResponse | null
  allowedEfforts: AIReasoningEffort[]
  requestedConversationId: string | null
  onConversationChange: (conversationId: string | null) => void
}) {
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
  })
  const mountedRef = useRef(true)
  const projectIdRef = useRef<string | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const turnIdRef = useRef<string | null>(null)
  const statusRef = useRef<RevbotStatus>("idle")
  const activeRequestRef = useRef(false)
  const generationRef = useRef(0)
  const projectGenerationRef = useRef(0)
  const observerRef = useRef<AbortController | null>(null)
  const lastEventIdRef = useRef(0)
  const seenEventIdsRef = useRef<Set<number>>(new Set())
  const assistantTextRef = useRef("")
  const assistantMessageIdRef = useRef<string | null>(null)
  const onConversationChangeRef = useRef(onConversationChange)
  const conversationCacheRef = useRef(
    new Map<string, AIConversationDetailResponse>()
  )

  useEffect(() => {
    onConversationChangeRef.current = onConversationChange
  }, [onConversationChange])

  const notifyConversationChange = useCallback(
    (conversationId: string | null) => {
      onConversationChangeRef.current(conversationId)
    },
    []
  )

  /** Best-effort refresh of the conversation list and per-conversation turn statuses. */
  const refreshConversations = useCallback(() => {
    const projectId = projectIdRef.current
    if (!projectId) return
    // Deliberately NOT gated by generation: selecting a conversation bumps
    // the generation, which would drop this refresh on mount (restored
    // conversation id arrives right after the list fetch starts), leaving
    // the history pane empty until the next project switch. Project and
    // mount guards below are the correct invalidation scope.
    void clientApiFetch<AIConversationsResponse>(
      `/projects/${projectId}/ai/conversations?limit=50&offset=0`
    )
      .then((response) => {
        if (!mountedRef.current || projectId !== projectIdRef.current) return
        const statuses: Record<string, RevbotStatus> = {}
        for (const conversation of response.conversations) {
          statuses[conversation.id] =
            (conversation.turn_status as RevbotStatus) ?? "idle"
        }
        setState((current) => ({
          ...current,
          conversations: [
            ...response.conversations,
            ...current.conversations.filter(
              (item) =>
                !response.conversations.some((next) => next.id === item.id)
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
                  response.conversations.some((next) => next.id === id)
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

  const applyConversation = useCallback(
    (conversation: AIConversationDetailResponse, loading = false) => {
      conversationCacheRef.current.set(conversation.id, conversation)
      conversationIdRef.current = conversation.id
      notifyConversationChange(conversation.id)
      turnIdRef.current = null
      statusRef.current = "idle"
      activeRequestRef.current = false
      lastEventIdRef.current = 0
      seenEventIdsRef.current = new Set()
      const messages = conversation.messages.map((message) => {
        const mapped: LocalMessage = { ...message }
        if (message.role === "assistant") {
          const toolCalls = mapToolCallResponses(message.tool_calls)
          if (toolCalls.length) mapped.toolCalls = toolCalls
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
      const conversationStatus =
        (conversation.turn_status as RevbotStatus) ?? "idle"
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          conversationId: conversation.id,
          messages,
          status: "idle",
          phase: null,
          toolCalls: [],
          activityStartedAt: null,
          stopping: false,
          loading,
          conversationStatus: {
            ...current.conversationStatus,
            [conversation.id]: conversationStatus,
          },
        }))
      }
    },
    [notifyConversationChange]
  )

  const applyTurn = useCallback(
    (turn: AITurnResponse, replay: boolean) => {
      conversationIdRef.current = turn.conversation_id
      notifyConversationChange(turn.conversation_id)
      turnIdRef.current = turn.id
      activeRequestRef.current = !isTurnTerminal(turn.status)
      updateStatus(turn.status)
      if (!mountedRef.current) return

      let messages = turn.messages.map((message) => ({ ...message }))
      if (replay) {
        const assistantIndex = messages.findIndex(
          (message) => message.role === "assistant"
        )
        if (assistantIndex === -1) {
          messages.push(assistantMessage())
        } else {
          messages[assistantIndex] = {
            ...messages[assistantIndex],
            content: "",
            status: "pending",
          }
        }
      }
      const assistant = [...messages]
        .reverse()
        .find((message) => message.role === "assistant")
      assistantMessageIdRef.current = assistant?.id ?? null
      assistantTextRef.current = replay ? "" : (assistant?.content ?? "")
      const toolCalls = replay ? [] : mapToolCallResponses(turn.tool_calls)
      const turnActivity = turnActivityTimestamps(turn)
      if (turn.status === "failed") {
        reportRevbotError(turnErrorMessage(turn.error_code))
      }

      setState((current) => {
        const existingClientAssistant = assistant?.id
          ? current.messages.find((message) => message.id === assistant.id)
          : null
        const mergedMessages = mergeTurnMessages(current.messages, messages)

        return {
          ...current,
          conversationId: turn.conversation_id,
          messages: attachTurnActivityToAssistant(
            mergedMessages,
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
        }
      })
    },
    [notifyConversationChange, updateStatus]
  )

  const stopObserver = useCallback(() => {
    observerRef.current?.abort()
    observerRef.current = null
  }, [])

  const refreshTerminalTurn = useCallback(
    async (turnId: string, generation: number) => {
      try {
        const turn = await clientApiFetch<AITurnResponse>(`/ai/turns/${turnId}`)
        if (generation !== generationRef.current || !mountedRef.current) return
        applyTurn(turn, false)
      } catch {
        // Keep the streamed text if the final refresh is unavailable.
      }
    },
    [applyTurn]
  )

  const observe = useCallback(
    async (turnId: string, generation: number) => {
      stopObserver()
      const controller = new AbortController()
      observerRef.current = controller
      lastEventIdRef.current = 0
      seenEventIdsRef.current = new Set()
      assistantTextRef.current = ""

      while (
        generation === generationRef.current &&
        mountedRef.current &&
        !isTurnTerminal(statusRef.current)
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
                if (seenEventIdsRef.current.has(numericId)) return
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
              } else if (event === "tool_call" && isToolCallPayload(payload)) {
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
                    activityStartedAt: current.activityStartedAt ?? Date.now(),
                  }
                })
              } else if (
                event === "tool_result" &&
                isToolResultPayload(payload)
              ) {
                const resultStatus = inferToolResultStatus(
                  payload.status,
                  payload.summary
                )
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
              } else if (
                event === "text_delta" &&
                isTextDeltaPayload(payload)
              ) {
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
              } else if (event === "completed" && isTerminalPayload(payload)) {
                updateStatus("completed")
                void refreshTerminalTurn(turnId, generation)
              } else if (event === "stopped" && isTerminalPayload(payload)) {
                updateStatus("stopped")
                void refreshTerminalTurn(turnId, generation)
              } else if (event === "failed" && isTerminalPayload(payload)) {
                updateStatus("failed")
                reportRevbotError(turnErrorMessage(payload.error_code))
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
          isTurnTerminal(statusRef.current)
        ) {
          return
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
    },
    [refreshTerminalTurn, stopObserver, updateStatus]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      stopObserver()
    }
  }, [stopObserver])

  useEffect(() => {
    setEffort((current) =>
      allowedEfforts.includes(current) ? current : defaultEffort(allowedEfforts)
    )
  }, [allowedEfforts, setEffort])

  useEffect(() => {
    const projectId = activeProject?.id ?? null
    generationRef.current += 1
    const generation = generationRef.current
    projectGenerationRef.current += 1
    stopObserver()
    projectIdRef.current = projectId
    conversationIdRef.current = null
    turnIdRef.current = null
    statusRef.current = "idle"
    activeRequestRef.current = false
    lastEventIdRef.current = 0
    seenEventIdsRef.current = new Set()
    assistantTextRef.current = ""
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
    })
    if (!projectId) return

    refreshConversations()

    const stored = readStoredConversation(projectId)
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
        applyConversation(conversation, Boolean(stored.turnId))
        if (!stored.turnId) return

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
          applyTurn(turn, !isTurnTerminal(turn.status))
          if (!isTurnTerminal(turn.status)) void observe(turn.id, generation)
        } catch (error) {
          if (
            generation !== generationRef.current ||
            !mountedRef.current ||
            projectId !== projectIdRef.current
          )
            return
          if (error instanceof ApiError && error.status === 404) {
            saveStoredConversation(projectId, {
              conversationId: stored.conversationId,
            })
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
        if (error instanceof ApiError && error.status === 404) {
          clearStoredConversation(projectId)
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
    applyConversation,
    applyTurn,
    observe,
    refreshConversations,
    stopObserver,
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

      generationRef.current += 1
      const generation = generationRef.current
      stopObserver()
      turnIdRef.current = null
      statusRef.current = "idle"
      activeRequestRef.current = false
      assistantTextRef.current = ""
      assistantMessageIdRef.current = null
      const cachedConversation =
        conversationCacheRef.current.get(conversationId)
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
        }))
      }
      saveStoredConversation(projectId, { conversationId })

      try {
        const conversation = await clientApiFetch<AIConversationDetailResponse>(
          `/ai/conversations/${conversationId}`
        )
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          projectId !== projectIdRef.current
        )
          return
        applyConversation(conversation)
        if (
          conversation.turn_id &&
          (conversation.turn_status === "queued" ||
            conversation.turn_status === "running")
        ) {
          saveStoredConversation(projectId, {
            conversationId,
            turnId: conversation.turn_id,
          })
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
            applyTurn(turn, !isTurnTerminal(turn.status))
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
    [applyConversation, applyTurn, observe, stopObserver]
  )

  const newChat = useCallback(() => {
    const projectId = projectIdRef.current
    if (!projectId) return

    generationRef.current += 1
    stopObserver()
    conversationIdRef.current = null
    turnIdRef.current = null
    statusRef.current = "idle"
    activeRequestRef.current = false
    lastEventIdRef.current = 0
    seenEventIdsRef.current = new Set()
    assistantTextRef.current = ""
    assistantMessageIdRef.current = null
    clearStoredConversation(projectId)
    notifyConversationChange(null)
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
          // queued/running entry cannot keep the background poll alive.
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
    if (requestedConversationId === conversationIdRef.current) return
    if (requestedConversationId)
      void selectConversation(requestedConversationId)
    else newChat()
  }, [newChat, requestedConversationId, selectConversation])

  const send = useCallback(
    async (content: string) => {
      const projectId = projectIdRef.current
      const trimmed = content.trim()
      if (
        !projectId ||
        !trimmed ||
        activeRequestRef.current ||
        !allowedEfforts.includes(effort)
      )
        return

      const generation = generationRef.current + 1
      generationRef.current = generation
      stopObserver()
      const optimisticUser = userMessage(trimmed)
      const optimisticAssistant = assistantMessage()
      assistantMessageIdRef.current = optimisticAssistant.id
      assistantTextRef.current = ""
      activeRequestRef.current = true
      setState((current) => ({
        ...current,
        messages: [...current.messages, optimisticUser, optimisticAssistant],
        status: "idle",
        phase: null,
        toolCalls: [],
        activityStartedAt: Date.now(),
        stopping: false,
        loading: true,
      }))

      try {
        let conversationId = conversationIdRef.current
        if (!conversationId) {
          const conversation = await clientApiPost<AIConversationResponse>(
            `/projects/${projectId}/ai/conversations`,
            {}
          )
          conversationId = conversation.id
          if (
            !mountedRef.current ||
            generation !== generationRef.current ||
            projectId !== projectIdRef.current
          )
            return
          conversationIdRef.current = conversationId
          notifyConversationChange(conversationId)
          saveStoredConversation(projectId, { conversationId })
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
            reasoning_effort: effort,
            client_request_id: crypto.randomUUID(),
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
        saveStoredConversation(projectId, {
          conversationId,
          turnId: turn.turn_id,
        })
        setState((current) => ({
          ...current,
          messages: current.messages.map((message) => {
            if (message.id === optimisticUser.id) {
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
                  title: trimmed.replace(/\s+/g, " ").slice(0, 120),
                }
              : conversation
          ),
          status: turn.status,
          loading: false,
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
              message.id !== optimisticUser.id &&
              message.id !== optimisticAssistant.id
          ),
          status: "idle",
          loading: false,
        }))
      }
    },
    [allowedEfforts, effort, notifyConversationChange, observe, stopObserver]
  )

  const stop = useCallback(async () => {
    const turnId = turnIdRef.current
    const generation = generationRef.current
    const projectId = projectIdRef.current
    if (
      !turnId ||
      (statusRef.current !== "queued" && statusRef.current !== "running")
    )
      return
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
      applyTurn(turn, false)
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
  }, [applyTurn, stopObserver])

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
      conversationId !== state.conversationId &&
      (status === "queued" || status === "running")
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

  return {
    activityStartedAt: state.activityStartedAt,
    conversationActive: (conversationId: string) => {
      const status = state.conversationStatus[conversationId]
      return status === "queued" || status === "running"
    },
    conversationId: state.conversationId,
    conversations: state.conversations,
    deleteConversation,
    effort,
    loading: state.loading,
    messages: state.messages,
    newChat,
    phase: state.phase,
    selectConversation,
    send,
    setEffort,
    status: state.status,
    stopping: state.stopping,
    stop,
    toolCalls: state.toolCalls,
  }
}

export type RevbotHandle = ReturnType<typeof useRevbot>

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

function looksLikeToolError(summary: string | null) {
  if (!summary) return false
  const lower = summary.toLowerCase()
  return (
    lower.includes("error") ||
    lower.startsWith("argument ") ||
    lower.startsWith("unknown ") ||
    lower.includes(" must ") ||
    lower.includes("invalid ")
  )
}

function inferToolResultStatus(
  status: AIToolCallStatus | undefined,
  summary: string | null
): AIToolCallStatus {
  if (status === "failed") return "failed"
  if (status === "running") return "running"
  if (status === "awaiting") return "awaiting"
  if (looksLikeToolError(summary)) return "failed"
  if (status === "completed") return "completed"
  return "completed"
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
