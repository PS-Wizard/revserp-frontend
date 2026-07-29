import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  ApiError,
  clientApiDelete,
  clientApiFetch,
  clientApiPost,
  clientApiStream,
} from "~/lib/api"
import type {
  AIConversationDetail,
  AIConversationListResponse,
  AIConversationSummary,
  CreateAIConversation,
} from "~/lib/api.types"
import {
  messagesFromResponses,
  normalizeChartSpec,
  upsertConversation,
} from "~/lib/ai-conversation"
import type { RevserpAIMessage } from "~/lib/ai-conversation"
import { panelStateForTool, type PanelState } from "./panel-map"

export type AINavigationDestination =
  | "audit_summary"
  | "audit_seo"
  | "audit_aeo"
  | "audit_pagespeed"
  | "site_graph"
  | "search_console"
  | "visibility"

export type AIExportAction = {
  kind: "audit" | "crawl"
  format: "pdf" | "csv" | "xlsx"
  project_id: string
  crawl_id?: string
}

/** The far side of an AI-opened comparison: a crawl of another project. */
export type AICompareTarget = {
  projectId: string
  crawlId: string
}

export function aiConversationsListQueryKey(orgId: string) {
  return ["ai-conversations", orgId] as const
}

export function aiConversationDetailQueryKey(conversationId: string) {
  return ["ai-conversation", conversationId] as const
}

const NAVIGATION_DESTINATIONS: AINavigationDestination[] = [
  "audit_summary",
  "audit_seo",
  "audit_aeo",
  "audit_pagespeed",
  "site_graph",
  "search_console",
  "visibility",
]

function isNavigatePayload(
  payload: unknown
): payload is { destination: AINavigationDestination } {
  const destination = (payload as { destination?: unknown })?.destination
  return NAVIGATION_DESTINATIONS.includes(
    destination as AINavigationDestination
  )
}

function isProjectSwitchedPayload(
  payload: unknown
): payload is { project_id: string } {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    typeof (payload as { project_id?: unknown }).project_id === "string" &&
    (payload as { project_id: string }).project_id.trim()
  )
}

function isCompareStartedPayload(
  payload: unknown
): payload is { project_id: string; crawl_id: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return false
  const { project_id, crawl_id } = payload as {
    project_id?: unknown
    crawl_id?: unknown
  }
  return (
    typeof project_id === "string" &&
    project_id.trim().length > 0 &&
    typeof crawl_id === "string" &&
    crawl_id.trim().length > 0
  )
}

function isCrawlStartedPayload(
  payload: unknown
): payload is { id: string; project_id: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return false
  const { id, project_id } = payload as { id?: unknown; project_id?: unknown }
  return (
    typeof id === "string" &&
    id.trim().length > 0 &&
    typeof project_id === "string" &&
    project_id.trim().length > 0
  )
}

function isExportPayload(payload: unknown): payload is AIExportAction {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return false
  const value = payload as Record<string, unknown>
  if (typeof value.project_id !== "string" || !value.project_id.trim())
    return false
  if (
    value.crawl_id !== undefined &&
    (typeof value.crawl_id !== "string" || !value.crawl_id.trim())
  )
    return false
  return (
    (value.kind === "audit" && value.format === "pdf") ||
    (value.kind === "crawl" &&
      (value.format === "csv" || value.format === "xlsx"))
  )
}

export type UseAIChatParams = {
  orgId: string
  projectId?: string
  crawlId?: string
  projectIds: string[]
  trackCrawl: (id: string) => void
  onNavigate: (destination: AINavigationDestination) => void
  onProjectSwitched: (projectId: string) => void
  onCompare: (target: AICompareTarget) => void
  onExport: (action: AIExportAction) => void
  onAutoCrawlConfigured: () => void
  setPanelState: (state: PanelState) => void
}

export function useAIChat({
  orgId,
  projectId,
  crawlId,
  projectIds,
  trackCrawl,
  onNavigate,
  onProjectSwitched,
  onCompare,
  onExport,
  onAutoCrawlConfigured,
  setPanelState,
}: UseAIChatParams) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState("")
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const [messages, setMessages] = useState<RevserpAIMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [activeSendRequestId, setActiveSendRequestId] = useState<string | null>(
    null
  )
  const isSending = activeSendRequestId !== null
  const [errorMessage, setErrorMessage] = useState("")

  const mountedRef = useRef(true)
  const activeSendRequestIdRef = useRef<string | null>(null)
  const sendAbortControllerRef = useRef<AbortController | null>(null)
  const sendRestoreRef = useRef<(() => void) | null>(null)
  const loadAbortControllerRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)
  const trackedCrawlIDsRef = useRef(new Set<string>())

  // Latest-value refs so the stream handler never captures stale callbacks/ids.
  const projectIdRef = useRef(projectId)
  const crawlIdRef = useRef(crawlId)
  const projectIdsRef = useRef(projectIds)
  const trackCrawlRef = useRef(trackCrawl)
  const onNavigateRef = useRef(onNavigate)
  const onProjectSwitchedRef = useRef(onProjectSwitched)
  const onCompareRef = useRef(onCompare)
  const onExportRef = useRef(onExport)
  const setPanelStateRef = useRef(setPanelState)
  projectIdRef.current = projectId
  crawlIdRef.current = crawlId
  projectIdsRef.current = projectIds
  trackCrawlRef.current = trackCrawl
  onNavigateRef.current = onNavigate
  onProjectSwitchedRef.current = onProjectSwitched
  onCompareRef.current = onCompare
  onExportRef.current = onExport
  setPanelStateRef.current = setPanelState

  const { data: conversationsData } = useQuery({
    queryKey: aiConversationsListQueryKey(orgId),
    queryFn: ({ signal }) =>
      clientApiFetch<AIConversationListResponse>(
        `/ai/conversations?limit=50&offset=0`,
        { signal }
      ).then((r) => r.conversations),
    enabled: Boolean(orgId),
    placeholderData: (prev) => prev,
  })
  const conversations: AIConversationSummary[] = conversationsData ?? []

  const canSend = Boolean(prompt.trim() && !isSending)

  useEffect(() => {
    mountedRef.current = true
    const trackedCrawlIDs = trackedCrawlIDsRef.current
    return () => {
      mountedRef.current = false
      loadRequestIdRef.current += 1
      loadAbortControllerRef.current?.abort()
      loadAbortControllerRef.current = null
      sendAbortControllerRef.current?.abort()
      sendAbortControllerRef.current = null
      sendRestoreRef.current = null
      activeSendRequestIdRef.current = null
      trackedCrawlIDs.clear()
    }
  }, [])

  function startSending(requestId: string) {
    activeSendRequestIdRef.current = requestId
    setActiveSendRequestId(requestId)
  }

  function finishSending(requestId: string) {
    if (activeSendRequestIdRef.current !== requestId) return
    activeSendRequestIdRef.current = null
    setActiveSendRequestId(null)
    sendAbortControllerRef.current = null
    sendRestoreRef.current = null
  }

  const cancelSending = useCallback(() => {
    sendAbortControllerRef.current?.abort()
    sendAbortControllerRef.current = null
    sendRestoreRef.current = null
    activeSendRequestIdRef.current = null
    setActiveSendRequestId(null)
  }, [])

  // Stop button: abort the in-flight request and put the prompt back in the
  // composer so it can be edited and resent.
  const stopSending = useCallback(() => {
    const restore = sendRestoreRef.current
    cancelSending()
    restore?.()
  }, [cancelSending])

  function isActiveSendRequest(requestId: string) {
    return activeSendRequestIdRef.current === requestId
  }

  const loadConversation = useCallback(
    async (conversationId: string) => {
      cancelSending()
      loadAbortControllerRef.current?.abort()
      const controller = new AbortController()
      loadAbortControllerRef.current = controller
      const requestSeq = ++loadRequestIdRef.current
      setIsLoadingMessages(true)
      setErrorMessage("")
      try {
        const response = await clientApiFetch<AIConversationDetail>(
          `/ai/conversations/${conversationId}`,
          { signal: controller.signal }
        )
        if (!mountedRef.current || loadRequestIdRef.current !== requestSeq)
          return
        setActiveConversationId(response.conversation.id)
        setMessages(messagesFromResponses(response.messages))
        queryClient.setQueryData(
          aiConversationDetailQueryKey(conversationId),
          response
        )
        queryClient.setQueryData<AIConversationSummary[]>(
          aiConversationsListQueryKey(orgId),
          (current) =>
            current
              ? upsertConversation(current, response.conversation)
              : [response.conversation]
        )
      } catch (error) {
        if (
          controller.signal.aborted ||
          loadRequestIdRef.current !== requestSeq
        )
          return
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : "Unable to load AI conversation."
        )
      } finally {
        if (mountedRef.current && loadRequestIdRef.current === requestSeq) {
          setIsLoadingMessages(false)
          if (loadAbortControllerRef.current === controller) {
            loadAbortControllerRef.current = null
          }
        }
      }
    },
    [cancelSending, orgId, queryClient]
  )

  const startNewChat = useCallback(() => {
    loadRequestIdRef.current += 1
    loadAbortControllerRef.current?.abort()
    loadAbortControllerRef.current = null
    cancelSending()
    setActiveConversationId(null)
    setMessages([])
    setErrorMessage("")
    setIsLoadingMessages(false)
    setPrompt("")
  }, [cancelSending])

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await clientApiDelete<null>(`/ai/conversations/${conversationId}`)
      } catch (error) {
        toast.error(
          error instanceof ApiError
            ? error.message
            : "Unable to delete conversation."
        )
        return
      }
      queryClient.setQueryData<AIConversationSummary[]>(
        aiConversationsListQueryKey(orgId),
        (current) =>
          current?.filter(
            (conversation) => conversation.id !== conversationId
          ) ?? []
      )
      queryClient.removeQueries({
        queryKey: aiConversationDetailQueryKey(conversationId),
      })
      if (activeSendRequestIdRef.current === null) {
        setActiveConversationId((current) =>
          current === conversationId ? null : current
        )
        setMessages((current) =>
          activeConversationId === conversationId ? [] : current
        )
      }
    },
    [activeConversationId, orgId, queryClient]
  )

  async function handleSubmit(
    overrideText?: string,
    options?: { forceNew?: boolean }
  ) {
    const trimmedPrompt = (overrideText ?? prompt).trim()
    if (!trimmedPrompt || isSending) return
    const forceNew = options?.forceNew ?? false

    const requestId = crypto.randomUUID()
    const baseMessages = forceNew ? [] : messages
    const optimisticUserMessage: RevserpAIMessage = {
      role: "user",
      content: trimmedPrompt,
    }
    const streamingAssistantMessage: RevserpAIMessage = {
      role: "assistant",
      content: "",
      reasoning: "",
      toolCalls: [],
      streaming: true,
    }

    let currentAssistantMessage = streamingAssistantMessage

    const abortController = new AbortController()
    function isCurrentStream() {
      return (
        mountedRef.current &&
        isActiveSendRequest(requestId) &&
        !abortController.signal.aborted
      )
    }

    function applyAssistantUpdate(
      updater: (message: RevserpAIMessage) => RevserpAIMessage
    ) {
      currentAssistantMessage = updater(currentAssistantMessage)
      if (!isCurrentStream()) return
      setMessages((current) => {
        if (current.length === 0) return current
        const next = [...current]
        next[next.length - 1] = currentAssistantMessage
        return next
      })
    }

    sendAbortControllerRef.current = abortController
    sendRestoreRef.current = () => {
      setMessages(baseMessages)
      setPrompt(trimmedPrompt)
    }
    startSending(requestId)
    setPrompt("")
    setErrorMessage("")
    setMessages([
      ...baseMessages,
      optimisticUserMessage,
      streamingAssistantMessage,
    ])

    let createdConversationId: string | null = null
    let sawStreamError = false

    try {
      let conversationId = forceNew ? null : activeConversationId
      if (!conversationId) {
        const created = await clientApiPost<CreateAIConversation>(
          `/ai/conversations`,
          { title: trimmedPrompt },
          { signal: abortController.signal }
        )
        if (!isCurrentStream()) return
        conversationId = created.conversation.id
        createdConversationId = created.conversation.id
        setActiveConversationId(conversationId)
        queryClient.setQueryData<AIConversationSummary[]>(
          aiConversationsListQueryKey(orgId),
          (current) => upsertConversation(current ?? [], created.conversation)
        )
      }

      await clientApiStream(
        `/ai/conversations/${conversationId}/messages`,
        {
          content: trimmedPrompt,
          project_id: projectIdRef.current || undefined,
          crawl_id: crawlIdRef.current || undefined,
          // Browser timezone, used as the default when the agent configures an
          // auto-crawl without specifying one (mirrors the auto-crawl dialog).
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
        },
        {
          signal: abortController.signal,
          onEvent: (event, payload) => {
            if (!isCurrentStream()) return
            switch (event) {
              case "reasoning": {
                const delta = (payload as { delta?: string }).delta ?? ""
                applyAssistantUpdate((message) => ({
                  ...message,
                  reasoning: (message.reasoning ?? "") + delta,
                }))
                break
              }
              case "text": {
                const delta = (payload as { delta?: string }).delta ?? ""
                applyAssistantUpdate((message) => ({
                  ...message,
                  content: message.content + delta,
                }))
                break
              }
              case "tool_call": {
                const toolCall = payload as {
                  id: string
                  name: string
                  args?: unknown
                }
                // DETERMINISTIC client-side panel map — applied the instant the
                // tool_call frame arrives. No server panel field is consulted.
                const nextPanel = panelStateForTool(toolCall.name)
                if (nextPanel) setPanelStateRef.current(nextPanel)
                applyAssistantUpdate((message) => ({
                  ...message,
                  toolCalls: [
                    ...(message.toolCalls ?? []),
                    {
                      id: toolCall.id,
                      name: toolCall.name,
                      args:
                        typeof toolCall.args === "string"
                          ? toolCall.args
                          : toolCall.args
                            ? JSON.stringify(toolCall.args)
                            : undefined,
                      status: "running",
                    },
                  ],
                }))
                break
              }
              case "tool_result": {
                const toolResult = payload as {
                  id: string
                  name: string
                  summary?: string
                }
                // Refresh the navbar's auto-crawl state once the agent has
                // finished (re)configuring it, so it isn't stale until refresh.
                if (toolResult.name === "configure_auto_crawl") {
                  onAutoCrawlConfigured()
                }
                applyAssistantUpdate((message) => ({
                  ...message,
                  toolCalls: (message.toolCalls ?? []).map((toolCall) =>
                    toolCall.id === toolResult.id
                      ? {
                          ...toolCall,
                          summary: toolResult.summary,
                          status: "done",
                        }
                      : toolCall
                  ),
                }))
                break
              }
              case "chart": {
                const frame = payload as { id?: string; chart?: unknown }
                const chart = normalizeChartSpec(frame.chart, frame.id ?? "")
                if (!chart) break
                applyAssistantUpdate((message) => ({
                  ...message,
                  charts: [...(message.charts ?? []), chart],
                }))
                break
              }
              case "navigate": {
                if (isNavigatePayload(payload))
                  onNavigateRef.current(payload.destination)
                break
              }
              case "project_switched": {
                if (
                  isProjectSwitchedPayload(payload) &&
                  projectIdsRef.current.includes(payload.project_id)
                ) {
                  onProjectSwitchedRef.current(payload.project_id)
                }
                break
              }
              case "compare_started": {
                // Same tenancy fence as project_switched: the competitor must be
                // a project this session can already see.
                if (
                  isCompareStartedPayload(payload) &&
                  projectIdsRef.current.includes(payload.project_id)
                ) {
                  onCompareRef.current({
                    projectId: payload.project_id,
                    crawlId: payload.crawl_id,
                  })
                }
                break
              }
              case "crawl_started": {
                if (
                  isCrawlStartedPayload(payload) &&
                  projectIdsRef.current.includes(payload.project_id) &&
                  !trackedCrawlIDsRef.current.has(payload.id)
                ) {
                  trackedCrawlIDsRef.current.add(payload.id)
                  trackCrawlRef.current(payload.id)
                }
                break
              }
              case "export": {
                if (
                  isExportPayload(payload) &&
                  payload.project_id === projectIdRef.current
                ) {
                  onExportRef.current(payload)
                }
                break
              }
              case "error": {
                if (sawStreamError) break
                sawStreamError = true
                const message = (payload as { message?: string }).message
                applyAssistantUpdate((current) => ({
                  ...current,
                  streaming: false,
                }))
                setErrorMessage(message || "The AI agent ran into an error.")
                break
              }
              default:
                break
            }
          },
        }
      )

      if (!isCurrentStream()) return
      applyAssistantUpdate((message) => ({ ...message, streaming: false }))

      // Refresh list metadata (title/updated_at) and drop the cached detail so
      // the next open refetches the backend-persisted turn (ids, reasoning,
      // tool rows).
      queryClient.invalidateQueries({
        queryKey: aiConversationsListQueryKey(orgId),
      })
      queryClient.removeQueries({
        queryKey: aiConversationDetailQueryKey(conversationId),
      })
    } catch (error) {
      if (!isCurrentStream()) return

      const is409 = error instanceof ApiError && error.status === 409
      const message =
        error instanceof ApiError
          ? error.message
          : "Unable to generate an AI response."
      const hasPartialContent = Boolean(
        currentAssistantMessage.content ||
        currentAssistantMessage.reasoning ||
        currentAssistantMessage.toolCalls?.length
      )

      if (is409 || !hasPartialContent) {
        setMessages(baseMessages)
        setPrompt(trimmedPrompt)
        toast.error(message)
        if (createdConversationId) {
          queryClient.setQueryData<AIConversationSummary[]>(
            aiConversationsListQueryKey(orgId),
            (current) =>
              current?.filter(
                (conversation) => conversation.id !== createdConversationId
              ) ?? current
          )
          setActiveConversationId(null)
        }
      } else {
        applyAssistantUpdate((current) => ({ ...current, streaming: false }))
        setErrorMessage(message)
      }
    } finally {
      finishSending(requestId)
    }
  }

  return {
    prompt,
    setPrompt,
    messages,
    isSending,
    errorMessage,
    conversations,
    activeConversationId,
    isLoadingConversation: isLoadingMessages,
    canSend,
    handleSubmit,
    stopSending,
    loadConversation,
    startNewChat,
    deleteConversation,
  }
}
