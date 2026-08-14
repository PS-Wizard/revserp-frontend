"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  ApiError,
  clientApiFetch,
  clientApiPost,
  clientApiSSE,
} from "~/lib/api"
import type {
  AIConversationDetailResponse,
  AIConversationResponse,
  AIConversationsResponse,
  AIReasoningEffort,
  AIStreamPhasePayload,
  AIStreamTerminalPayload,
  AIStreamTextDeltaPayload,
  AITurnMessageResponse,
  AITurnResponse,
  AITurnSubmissionResponse,
  ProjectResponse,
} from "~/lib/api.types"

const STORAGE_PREFIX = "revbot-turn:"
const RECONNECT_DELAY_MS = 700

type StoredConversation = { conversationId: string; turnId?: string }
type LocalMessage = AITurnMessageResponse & { local?: boolean }
type RevbotStatus = AITurnResponse["status"] | "idle"

type RevbotState = {
  conversationId: string | null
  conversations: AIConversationResponse[]
  messages: LocalMessage[]
  status: RevbotStatus
  phase: AIStreamPhasePayload["phase"] | null
  stopping: boolean
  loading: boolean
  error: string | null
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

function defaultEffort(allowedEfforts: AIReasoningEffort[]) {
  return allowedEfforts.includes("high")
    ? "high"
    : (allowedEfforts[0] ?? "none")
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

export function useRevbot({
  activeProject,
  allowedEfforts,
}: {
  activeProject: ProjectResponse | null
  allowedEfforts: AIReasoningEffort[]
}) {
  const [prompt, setPrompt] = useState("")
  const [effort, setEffort] = useState<AIReasoningEffort>(() =>
    defaultEffort(allowedEfforts)
  )
  const [state, setState] = useState<RevbotState>({
    conversationId: null,
    conversations: [],
    messages: [],
    status: "idle",
    phase: null,
    stopping: false,
    loading: false,
    error: null,
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

  const updateStatus = useCallback((status: RevbotStatus) => {
    statusRef.current = status
    const terminal = isTurnTerminal(status)
    if (terminal) activeRequestRef.current = false
    if (mountedRef.current) {
      setState((current) => ({
        ...current,
        status,
        phase: terminal ? null : current.phase,
        stopping: terminal ? false : current.stopping,
      }))
    }
  }, [])

  const applyConversation = useCallback(
    (conversation: AIConversationDetailResponse, loading = false) => {
      conversationIdRef.current = conversation.id
      turnIdRef.current = null
      statusRef.current = "idle"
      activeRequestRef.current = false
      lastEventIdRef.current = 0
      seenEventIdsRef.current = new Set()
      const messages = conversation.messages.map((message) => ({ ...message }))
      const assistant = [...messages]
        .reverse()
        .find((message) => message.role === "assistant")
      assistantMessageIdRef.current = assistant?.id ?? null
      assistantTextRef.current = assistant?.content ?? ""
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          conversationId: conversation.id,
          messages,
          status: "idle",
          phase: null,
          stopping: false,
          loading,
          error: null,
        }))
      }
    },
    []
  )

  const applyTurn = useCallback(
    (turn: AITurnResponse, replay: boolean) => {
      conversationIdRef.current = turn.conversation_id
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
      const messageIds = new Set(messages.map((message) => message.id))
      const assistant = [...messages]
        .reverse()
        .find((message) => message.role === "assistant")
      assistantMessageIdRef.current = assistant?.id ?? null
      assistantTextRef.current = replay ? "" : (assistant?.content ?? "")

      setState((current) => ({
        ...current,
        conversationId: turn.conversation_id,
        messages: [
          ...current.messages.filter((message) => !messageIds.has(message.id)),
          ...messages,
        ],
        status: turn.status,
        phase: null,
        stopping: turn.cancel_requested && !isTurnTerminal(turn.status),
        loading: false,
        error:
          turn.status === "failed" ? turnErrorMessage(turn.error_code) : null,
      }))
    },
    [updateStatus]
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
                  error: null,
                }))
              } else if (
                event === "text_delta" &&
                isTextDeltaPayload(payload)
              ) {
                assistantTextRef.current += payload.text
                const assistantMessageId = assistantMessageIdRef.current
                setState((current) => ({
                  ...current,
                  error: null,
                  messages: current.messages.map((message) =>
                    message.id === assistantMessageId
                      ? { ...message, content: assistantTextRef.current }
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
                setState((current) => ({
                  ...current,
                  error: turnErrorMessage(payload.error_code),
                  stopping: false,
                }))
                void refreshTerminalTurn(turnId, generation)
              }
            },
          })
        } catch (error) {
          if (
            controller.signal.aborted ||
            generation !== generationRef.current ||
            !mountedRef.current
          )
            return
          setState((current) => ({
            ...current,
            error: simpleError(error, "Connection interrupted. Reconnecting…"),
          }))
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
    const projectId = activeProject?.id ?? null
    generationRef.current += 1
    const generation = generationRef.current
    projectGenerationRef.current += 1
    const projectGeneration = projectGenerationRef.current
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
    setPrompt("")
    setEffort(defaultEffort(allowedEfforts))
    setState({
      conversationId: null,
      conversations: [],
      messages: [],
      status: "idle",
      phase: null,
      stopping: false,
      loading: Boolean(projectId),
      error: null,
    })
    if (!projectId) return

    void clientApiFetch<AIConversationsResponse>(
      `/projects/${projectId}/ai/conversations?limit=50&offset=0`
    )
      .then((response) => {
        if (
          projectGeneration !== projectGenerationRef.current ||
          !mountedRef.current ||
          projectId !== projectIdRef.current
        )
          return
        setState((current) => ({
          ...current,
          conversations: [
            ...response.conversations,
            ...current.conversations.filter(
              (item) =>
                !response.conversations.some((next) => next.id === item.id)
            ),
          ],
        }))
      })
      .catch((error: unknown) => {
        if (
          projectGeneration !== projectGenerationRef.current ||
          !mountedRef.current ||
          projectId !== projectIdRef.current
        )
          return
        setState((current) => ({
          ...current,
          error: simpleError(error, "Unable to load Revbot conversations."),
        }))
      })

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
        if (generation !== generationRef.current || !mountedRef.current) return
        applyConversation(conversation, Boolean(stored.turnId))
        if (!stored.turnId) return

        try {
          const turn = await clientApiFetch<AITurnResponse>(
            `/ai/turns/${stored.turnId}`
          )
          if (generation !== generationRef.current || !mountedRef.current)
            return
          applyTurn(turn, !isTurnTerminal(turn.status))
          if (!isTurnTerminal(turn.status)) void observe(turn.id, generation)
        } catch (error) {
          if (generation !== generationRef.current || !mountedRef.current)
            return
          if (error instanceof ApiError && error.status === 404) {
            saveStoredConversation(projectId, {
              conversationId: stored.conversationId,
            })
            setState((current) => ({ ...current, loading: false }))
            return
          }
          setState((current) => ({
            ...current,
            loading: false,
            error: simpleError(error, "Unable to restore the Revbot turn."),
          }))
        }
      } catch (error) {
        if (generation !== generationRef.current || !mountedRef.current) return
        if (error instanceof ApiError && error.status === 404) {
          clearStoredConversation(projectId)
          setState((current) => ({ ...current, loading: false }))
          return
        }
        setState((current) => ({
          ...current,
          loading: false,
          error: simpleError(
            error,
            "Unable to restore the Revbot conversation."
          ),
        }))
      }
    })()
  }, [
    activeProject?.id,
    allowedEfforts,
    applyConversation,
    applyTurn,
    observe,
    stopObserver,
  ])

  const selectConversation = useCallback(
    async (conversationId: string) => {
      const projectId = projectIdRef.current
      if (
        !projectId ||
        activeRequestRef.current ||
        statusRef.current === "queued" ||
        statusRef.current === "running"
      )
        return

      generationRef.current += 1
      const generation = generationRef.current
      stopObserver()
      turnIdRef.current = null
      statusRef.current = "idle"
      activeRequestRef.current = false
      assistantTextRef.current = ""
      assistantMessageIdRef.current = null
      setState((current) => ({
        ...current,
        conversationId,
        messages: [],
        status: "idle",
        phase: null,
        stopping: false,
        loading: true,
        error: null,
      }))
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
      } catch (error) {
        if (
          generation !== generationRef.current ||
          !mountedRef.current ||
          projectId !== projectIdRef.current
        )
          return
        setState((current) => ({
          ...current,
          loading: false,
          error: simpleError(error, "Unable to load the Revbot conversation."),
        }))
      }
    },
    [applyConversation, stopObserver]
  )

  const newChat = useCallback(() => {
    const projectId = projectIdRef.current
    if (
      !projectId ||
      activeRequestRef.current ||
      statusRef.current === "queued" ||
      statusRef.current === "running"
    )
      return

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
    setPrompt("")
    setState((current) => ({
      ...current,
      conversationId: null,
      messages: [],
      status: "idle",
      phase: null,
      stopping: false,
      loading: false,
      error: null,
    }))
  }, [stopObserver])

  const send = useCallback(async () => {
    const projectId = projectIdRef.current
    const content = prompt.trim()
    if (
      !projectId ||
      !content ||
      activeRequestRef.current ||
      !allowedEfforts.includes(effort)
    )
      return

    const generation = generationRef.current + 1
    generationRef.current = generation
    stopObserver()
    const optimisticUser = userMessage(content)
    const optimisticAssistant = assistantMessage()
    assistantMessageIdRef.current = optimisticAssistant.id
    assistantTextRef.current = ""
    activeRequestRef.current = true
    setState((current) => ({
      ...current,
      messages: [...current.messages, optimisticUser, optimisticAssistant],
      status: "idle",
      phase: null,
      stopping: false,
      loading: true,
      error: null,
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
          content,
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
      setPrompt("")
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
                title: content.replace(/\s+/g, " ").slice(0, 120),
              }
            : conversation
        ),
        status: turn.status,
        loading: false,
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
      setState((current) => ({
        ...current,
        messages: current.messages.filter(
          (message) =>
            message.id !== optimisticUser.id &&
            message.id !== optimisticAssistant.id
        ),
        status: "idle",
        loading: false,
        error: simpleError(error, "Unable to send your message."),
      }))
    }
  }, [allowedEfforts, effort, observe, prompt, stopObserver])

  const stop = useCallback(async () => {
    const turnId = turnIdRef.current
    const generation = generationRef.current
    const projectId = projectIdRef.current
    if (
      !turnId ||
      (statusRef.current !== "queued" && statusRef.current !== "running")
    )
      return
    setState((current) => ({ ...current, stopping: true, error: null }))
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
      setState((current) => ({
        ...current,
        stopping: false,
        error: simpleError(error, "Unable to stop this request."),
      }))
    }
  }, [applyTurn, stopObserver])

  useEffect(() => {
    if (!isTurnTerminal(statusRef.current)) return
    activeRequestRef.current = false
  }, [state.status])

  return {
    conversationId: state.conversationId,
    conversations: state.conversations,
    effort,
    error: state.error,
    loading: state.loading,
    messages: state.messages,
    newChat,
    phase: state.phase,
    prompt,
    selectConversation,
    send,
    setEffort,
    setPrompt,
    status: state.status,
    stopping: state.stopping,
    stop,
  }
}

function isPhasePayload(payload: unknown): payload is AIStreamPhasePayload {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    ((payload as Record<string, unknown>).phase === "thinking" ||
      (payload as Record<string, unknown>).phase === "writing")
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
