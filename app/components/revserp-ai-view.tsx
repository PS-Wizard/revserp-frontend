"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useEffectEvent,
  useReducer,
} from "react"
import { LightbulbIcon, SparklesIcon, ZapIcon } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "~/components/ui/card"
import { Button } from "~/components/ui/button"
import { ApiError, clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  AIConversationDetailResponse,
  AIConversationResponse,
  AIConversationsResponse,
  CreateAIConversationMessageResponse,
  CreateAIConversationResponse,
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import {
  getNextScopeState,
  newMessageFromResponse,
  upsertConversation,
} from "~/lib/ai-conversation"
import type { RevserpAIMessage } from "~/lib/ai-conversation"
import { MessageList } from "~/components/revserp-ai-view/message-list"
import { Composer } from "~/components/revserp-ai-view/composer"

type ScopeState = {
  pillarId: string
  bucketIds: string[]
  issueTypeIds: string[]
}

type ScopeAction =
  | {
      type: "SET_PILLAR"
      pillarId: string
      bucketIds: string[]
      issueTypeIds: string[]
    }
  | { type: "TOGGLE_ISSUE_TYPE"; issueTypeId: string }
  | {
      type: "SET_SCOPE"
      pillarId: string
      bucketIds: string[]
      issueTypeIds: string[]
    }

const defaultScope: ScopeState = {
  pillarId: "",
  bucketIds: [],
  issueTypeIds: [],
}

function scopeReducer(state: ScopeState, action: ScopeAction): ScopeState {
  switch (action.type) {
    case "SET_PILLAR":
      return {
        pillarId: action.pillarId,
        bucketIds: action.bucketIds,
        issueTypeIds: action.issueTypeIds,
      }
    case "TOGGLE_ISSUE_TYPE": {
      const nextIssueTypeIds = state.issueTypeIds.includes(action.issueTypeId)
        ? state.issueTypeIds.filter((id) => id !== action.issueTypeId)
        : [...state.issueTypeIds, action.issueTypeId]
      return { ...state, issueTypeIds: nextIssueTypeIds }
    }
    case "SET_SCOPE":
      return {
        pillarId: action.pillarId,
        bucketIds: action.bucketIds,
        issueTypeIds: action.issueTypeIds,
      }
  }
}

export function aiConversationsListQueryKey(
  projectId: string,
  crawlId: string
) {
  return ["ai-conversations", projectId, crawlId] as const
}

export function aiConversationDetailQueryKey(conversationId: string) {
  return ["ai-conversation", conversationId] as const
}

function useAIConversation({
  breakdown,
  openConversationId,
  projectId,
  initialScope,
  forceNewConversation,
}: {
  breakdown: ScoreBreakdownResponse | null
  openConversationId?: string | null
  projectId?: string
  initialScope?: {
    pillarId: string
    bucketIds: string[]
    issueTypeIds: string[]
  } | null
  forceNewConversation?: boolean
}) {
  const queryClient = useQueryClient()
  const [scope, dispatchScope] = useReducer(scopeReducer, defaultScope)
  const {
    pillarId: selectedPillarId,
    bucketIds: selectedBucketIds,
    issueTypeIds: selectedIssueTypeIds,
  } = scope
  const [prompt, setPrompt] = useState("")
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const [messages, setMessages] = useState<RevserpAIMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [activeSendRequestId, setActiveSendRequestId] = useState<string | null>(
    null
  )
  const [emptyPollCount, setEmptyPollCount] = useState(0)
  const isSending = activeSendRequestId !== null
  const [errorMessage, setErrorMessage] = useState("")
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(
    null
  )
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeSendRequestIdRef = useRef<string | null>(null)
  const initialScopeAppliedRef = useRef(false)
  const MAX_EMPTY_POLLS = 15
  const openConversationIdRef = useRef(openConversationId)
  openConversationIdRef.current = openConversationId ?? null
  const crawlId = breakdown?.crawl_id ?? ""

  // Conversations list — cached, shared with popover's per-crawl slice
  const conversationsEnabled = Boolean(projectId && crawlId)
  const { data: conversationsData } = useQuery({
    queryKey: conversationsEnabled
      ? aiConversationsListQueryKey(projectId!, crawlId)
      : ["ai-conversations-disabled"],
    queryFn: () =>
      clientApiFetch<AIConversationsResponse>(
        `/projects/${projectId!}/ai/conversations?crawl_id=${encodeURIComponent(crawlId)}&limit=50&offset=0`
      ).then((r) => r.conversations),
    enabled: conversationsEnabled,
    placeholderData: (prev) => prev,
  })
  const conversations: AIConversationResponse[] = conversationsData ?? []

  const selectedPillar = useMemo(() => {
    return (
      breakdown?.pillars.find((pillar) => pillar.id === selectedPillarId) ??
      breakdown?.pillars[0] ??
      null
    )
  }, [breakdown?.pillars, selectedPillarId])

  const selectedBuckets = useMemo(() => {
    return (selectedPillar?.buckets ?? []).filter((bucket) =>
      selectedBucketIds.includes(bucket.id)
    )
  }, [selectedBucketIds, selectedPillar])

  const availableIssueTypes = useMemo(() => {
    const seenIssueTypeIds = new Set<string>()
    const issueTypes: ScoreBreakdownIssueTypeResponse[] = []

    for (const bucket of selectedBuckets) {
      for (const issueType of bucket.issues) {
        if (seenIssueTypeIds.has(issueType.id)) continue
        seenIssueTypeIds.add(issueType.id)
        issueTypes.push(issueType)
      }
    }

    return issueTypes.sort((left, right) =>
      left.label.localeCompare(right.label)
    )
  }, [selectedBuckets])

  const selectedIssueTypes = useMemo(() => {
    return availableIssueTypes.filter((issueType) =>
      selectedIssueTypeIds.includes(issueType.id)
    )
  }, [availableIssueTypes, selectedIssueTypeIds])

  const issueTypeLabel =
    selectedIssueTypeIds.length === 0
      ? "All issue types"
      : selectedIssueTypes.length === 1
        ? selectedIssueTypes[0].label
        : `${selectedIssueTypes.length} issue types`
  const selectedScopeLabel = selectedPillar
    ? `${selectedPillar.label} · ${issueTypeLabel}`
    : "Choose crawl context"
  const activeConversation =
    conversations.find(
      (conversation) => conversation.id === activeConversationId
    ) ?? null
  const canSend = Boolean(
    projectId &&
    breakdown?.crawl_id &&
    selectedPillar &&
    prompt.trim() &&
    !isSending
  )

  function startSending(requestId: string) {
    activeSendRequestIdRef.current = requestId
    setActiveSendRequestId(requestId)
  }

  function finishSending(requestId: string) {
    if (activeSendRequestIdRef.current !== requestId) return
    activeSendRequestIdRef.current = null
    setActiveSendRequestId(null)
  }

  const cancelSending = useCallback(() => {
    activeSendRequestIdRef.current = null
    setActiveSendRequestId(null)
  }, [])

  function isActiveSendRequest(requestId: string) {
    return activeSendRequestIdRef.current === requestId
  }

  const loadRequestIdRef = useRef(0)

  const loadConversation = useCallback(
    async (conversationId: string) => {
      cancelSending()
      const requestSeq = ++loadRequestIdRef.current
      setIsLoadingMessages(true)
      setErrorMessage("")
      try {
        const response = await clientApiFetch<AIConversationDetailResponse>(
          `/ai/conversations/${conversationId}`
        )
        if (loadRequestIdRef.current !== requestSeq) return
        setActiveConversationId(response.conversation.id)
        const loadedMessages = response.messages.map(newMessageFromResponse)
        setMessages(loadedMessages)
        // Update the detail cache
        queryClient.setQueryData(
          aiConversationDetailQueryKey(conversationId),
          response
        )
        // Update the conversations list cache entry for this conversation
        if (projectId && crawlId) {
          queryClient.setQueryData<AIConversationResponse[]>(
            aiConversationsListQueryKey(projectId, crawlId),
            (current) =>
              current
                ? upsertConversation(current, response.conversation)
                : [response.conversation]
          )
        }
        if (loadedMessages.length > 0) {
          setEmptyPollCount(0)
        }
      } catch (error) {
        if (loadRequestIdRef.current !== requestSeq) return
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : "Unable to load AI conversation."
        )
      } finally {
        if (loadRequestIdRef.current === requestSeq) {
          setIsLoadingMessages(false)
        }
      }
    },
    [cancelSending, crawlId, projectId, queryClient]
  )

  // Sync scope when breakdown changes (no-derived-state fix)
  const syncScope = useEffectEvent(() => {
    // When an external scope is being provided (e.g. Recommend Fixes),
    // skip default-scope computation until it has been applied.
    if (initialScope && !initialScopeAppliedRef.current) return

    const nextScopeState = getNextScopeState(
      breakdown,
      selectedPillarId,
      selectedBucketIds,
      selectedIssueTypeIds
    )
    if (!nextScopeState) return
    dispatchScope({
      type: "SET_SCOPE",
      pillarId: nextScopeState.pillarId,
      bucketIds: nextScopeState.bucketIds,
      issueTypeIds: nextScopeState.issueTypeIds,
    })
  })
  useEffect(() => {
    syncScope()
  }, [breakdown])

  // When conversations are loaded (from cache or fresh), pick the first one
  // if no external conversation was requested and forceNewConversation is off.
  const hasExternalConversationRequest = Boolean(openConversationId)
  const prevCrawlIdRef = useRef(crawlId)
  const prevProjectIdRef = useRef(projectId)

  useEffect(() => {
    const crawlChanged = crawlId !== prevCrawlIdRef.current
    const projectChanged = projectId !== prevProjectIdRef.current
    prevCrawlIdRef.current = crawlId
    prevProjectIdRef.current = projectId

    // Reset local state on project/crawl change
    if (crawlChanged || projectChanged) {
      cancelSending()
      setErrorMessage("")
      setIsLoadingMessages(false)
      if (!projectId || !crawlId) {
        setMessages([])
        setActiveConversationId(null)
      }
    }
  }, [crawlId, projectId, cancelSending])

  // Once conversations are loaded (and no external open request), auto-open first
  const conversationsLoadedRef = useRef(false)
  useEffect(() => {
    if (hasExternalConversationRequest || forceNewConversation) {
      conversationsLoadedRef.current = false
      return
    }
    if (!conversationsEnabled) {
      conversationsLoadedRef.current = false
      return
    }
    if (!conversationsData) return
    if (conversationsLoadedRef.current) return

    conversationsLoadedRef.current = true
    const firstConversation = conversationsData[0]
    if (firstConversation) {
      void loadConversation(firstConversation.id)
    } else {
      setMessages([])
      setActiveConversationId(null)
    }
  }, [
    conversationsData,
    conversationsEnabled,
    hasExternalConversationRequest,
    forceNewConversation,
    loadConversation,
  ])

  // Reset auto-load flag when crawl/project/forceNew changes
  useEffect(() => {
    conversationsLoadedRef.current = false
  }, [crawlId, projectId, forceNewConversation])

  // Apply external scope (e.g. from Recommend Fixes) when opening a conversation
  useEffect(() => {
    if (!openConversationId || !initialScope) return

    initialScopeAppliedRef.current = true
    setEmptyPollCount(0)
    dispatchScope({
      type: "SET_SCOPE",
      pillarId: initialScope.pillarId,
      bucketIds: initialScope.bucketIds,
      issueTypeIds: initialScope.issueTypeIds,
    })

    return () => {
      initialScopeAppliedRef.current = false
    }
  }, [openConversationId, initialScope])

  useEffect(() => {
    if (!openConversationId) return
    // Check if we already have this conversation detail cached
    const cached = queryClient.getQueryData<AIConversationDetailResponse>(
      aiConversationDetailQueryKey(openConversationId)
    )
    if (cached) {
      cancelSending()
      setActiveConversationId(cached.conversation.id)
      setMessages(cached.messages.map(newMessageFromResponse))
      setErrorMessage("")
      setIsLoadingMessages(false)
      if (cached.messages.length > 0) setEmptyPollCount(0)
      return
    }
    void loadConversation(openConversationId)
  }, [loadConversation, openConversationId, queryClient, cancelSending])

  // Poll when a conversation is open but has no messages yet (AI response in flight)
  useEffect(() => {
    if (!openConversationId) return
    if (isLoadingMessages) return
    if (messages.length > 0) {
      setEmptyPollCount(0)
      return
    }
    if (emptyPollCount >= MAX_EMPTY_POLLS) return

    const timer = window.setTimeout(() => {
      setEmptyPollCount((c) => c + 1)
      void loadConversation(openConversationIdRef.current!)
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [
    openConversationId,
    isLoadingMessages,
    messages.length,
    emptyPollCount,
    loadConversation,
  ])

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages.length, isSending, isLoadingMessages])

  async function handleSubmit() {
    const trimmedPrompt = prompt.trim()
    if (
      !projectId ||
      !breakdown?.crawl_id ||
      !selectedPillar ||
      !selectedBuckets.length ||
      !trimmedPrompt ||
      isSending
    ) {
      return
    }

    const requestId = crypto.randomUUID()
    const baseMessages = messages
    const optimisticUserMessage: RevserpAIMessage = {
      role: "user",
      content: trimmedPrompt,
    }

    // Batch related state updates
    const sendRequestId = requestId
    startSending(sendRequestId)
    setPrompt("")
    setErrorMessage("")
    setMessages([...baseMessages, optimisticUserMessage])
    resetTextareaHeight()

    let createdConversationId: string | null = null

    try {
      let conversationId = activeConversationId
      if (!conversationId) {
        const created = await clientApiPost<CreateAIConversationResponse>(
          `/projects/${projectId}/ai/conversations`,
          {
            crawl_id: breakdown.crawl_id,
            title: trimmedPrompt,
          }
        )
        if (!isActiveSendRequest(sendRequestId)) return
        conversationId = created.conversation.id
        createdConversationId = created.conversation.id
        setActiveConversationId(conversationId)
        // Update conversations list cache
        queryClient.setQueryData<AIConversationResponse[]>(
          aiConversationsListQueryKey(projectId, crawlId),
          (current) => upsertConversation(current ?? [], created.conversation)
        )
      }

      const selectedBucketIdsForRequest = selectedBuckets.map(
        (bucket) => bucket.id
      )
      const response = await clientApiPost<CreateAIConversationMessageResponse>(
        `/ai/conversations/${conversationId}/messages`,
        {
          crawl_id: breakdown.crawl_id,
          pillar_id: selectedPillar.id,
          bucket_id: selectedBucketIdsForRequest[0],
          bucket_ids: selectedBucketIdsForRequest,
          issue_type_ids: selectedIssueTypeIds,
          content: trimmedPrompt,
        }
      )
      if (!isActiveSendRequest(sendRequestId)) return
      const nextMessages = [
        ...baseMessages,
        newMessageFromResponse(response.user_message),
        newMessageFromResponse(response.assistant_message),
      ]
      setMessages(nextMessages)
      // Update conversation list cache
      queryClient.setQueryData<AIConversationResponse[]>(
        aiConversationsListQueryKey(projectId, crawlId),
        (current) => upsertConversation(current ?? [], response.conversation)
      )
      // Update detail cache
      queryClient.setQueryData<AIConversationDetailResponse>(
        aiConversationDetailQueryKey(conversationId),
        (current) =>
          current
            ? {
                ...current,
                conversation: response.conversation,
                messages: [
                  ...current.messages,
                  response.user_message,
                  response.assistant_message,
                ],
              }
            : {
                conversation: response.conversation,
                messages: [response.user_message, response.assistant_message],
              }
      )
      queryClient.invalidateQueries({
        queryKey: ["ai-conversations", projectId],
      })
    } catch (error) {
      if (!isActiveSendRequest(sendRequestId)) return
      setMessages(baseMessages)
      setPrompt(trimmedPrompt)
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to generate an AI fix."
      )
      if (createdConversationId) {
        // Roll back the optimistically-created conversation: it never
        // received a first message, so it shouldn't linger in the sidebar.
        queryClient.setQueryData<AIConversationResponse[]>(
          aiConversationsListQueryKey(projectId, crawlId),
          (current) =>
            current?.filter(
              (conversation) => conversation.id !== createdConversationId
            ) ?? current
        )
        setActiveConversationId(null)
      }
    } finally {
      finishSending(sendRequestId)
    }
  }

  function handlePromptKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (event.key !== "Enter" || event.shiftKey) return
    event.preventDefault()
    void handleSubmit()
  }

  async function copyMessage(content: string, messageIndex: number) {
    await navigator.clipboard.writeText(content)
    setCopiedMessageIndex(messageIndex)
    window.setTimeout(() => setCopiedMessageIndex(null), 1400)
  }

  function selectPillar(pillar: ScoreBreakdownPillarResponse) {
    dispatchScope({
      type: "SET_PILLAR",
      pillarId: pillar.id,
      bucketIds: pillar.buckets.map((b) => b.id),
      issueTypeIds: [],
    })
  }

  function toggleIssueType(issueType: ScoreBreakdownIssueTypeResponse) {
    dispatchScope({ type: "TOGGLE_ISSUE_TYPE", issueTypeId: issueType.id })
  }

  function clearIssueTypeIds() {
    dispatchScope({
      type: "SET_SCOPE",
      pillarId: selectedPillarId,
      bucketIds: selectedBucketIds,
      issueTypeIds: [],
    })
  }

  function handlePresetClick(presetPrompt: string) {
    setPrompt(presetPrompt)
    growTextarea()
  }

  function resetTextareaHeight() {
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.style.height = "auto"
    })
  }

  function growTextarea() {
    if (!textareaRef.current) return
    textareaRef.current.style.height = "auto"
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
  }

  const isLoadingConversation =
    isLoadingMessages ||
    (messages.length === 0 &&
      openConversationId !== null &&
      emptyPollCount < MAX_EMPTY_POLLS)

  return {
    prompt,
    setPrompt,
    selectedPillarId,
    selectedBucketIds,
    selectedIssueTypeIds,
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    isLoadingMessages,
    isSending,
    errorMessage,
    copiedMessageIndex,
    crawlId,
    selectedPillar,
    selectedIssueTypes,
    issueTypeLabel,
    selectedScopeLabel,
    canSend,
    isLoadingConversation,
    handleSubmit,
    handlePromptKeyDown,
    handlePresetClick,
    copyMessage,
    selectPillar,
    toggleIssueType,
    clearIssueTypeIds,
    growTextarea,
    onPromptChange: setPrompt,
    scrollContainerRef,
    textareaRef,
  }
}

function NoCrawlDataView() {
  return (
    <div className="flex min-h-[calc(100svh-5rem)] items-center justify-center p-6 text-center">
      <Card className="max-w-xl border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
        <CardContent className="py-12">
          <h1 className="text-4xl font-medium tracking-[-0.06em]">
            Revserp AI needs crawl data
          </h1>
          <p className="pt-5 text-sm leading-7 text-muted-foreground">
            Run a crawl first, then use Revserp AI to explain, prioritize, and
            fix scoped audit issues.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export function RevserpAIView({
  breakdown,
  openConversationId,
  projectId,
  initialScope,
  forceNewConversation,
}: {
  breakdown: ScoreBreakdownResponse | null
  openConversationId?: string | null
  projectId?: string
  initialScope?: {
    pillarId: string
    bucketIds: string[]
    issueTypeIds: string[]
  } | null
  forceNewConversation?: boolean
}) {
  const {
    prompt,
    selectedPillarId,
    selectedIssueTypeIds,
    messages,
    isSending,
    errorMessage,
    copiedMessageIndex,
    selectedPillar,
    issueTypeLabel,
    selectedScopeLabel,
    canSend,
    isLoadingConversation,
    handleSubmit,
    handlePromptKeyDown,
    handlePresetClick,
    copyMessage,
    selectPillar,
    toggleIssueType,
    clearIssueTypeIds,
    growTextarea,
    onPromptChange,
    scrollContainerRef,
    textareaRef,
  } = useAIConversation({
    breakdown,
    openConversationId,
    projectId,
    initialScope,
    forceNewConversation,
  })

  if (!breakdown) {
    return <NoCrawlDataView />
  }

  return (
    <section className="flex h-[calc(100svh-4.5rem)] min-h-0 flex-col overflow-hidden px-4 pt-5 sm:px-6 lg:px-4">
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
        <MessageList
          copiedMessageIndex={copiedMessageIndex}
          isLoadingConversation={isLoadingConversation}
          isSending={isSending}
          messages={messages}
          onCopyMessage={copyMessage}
          selectedScopeLabel={selectedScopeLabel}
        />
      </div>

      <div className="flex shrink-0 flex-col gap-3 pb-4">
        <Composer
          canSend={canSend}
          errorMessage={errorMessage}
          isSending={isSending}
          issueTypeLabel={issueTypeLabel}
          onPromptChange={onPromptChange}
          onSelectAllIssueTypes={clearIssueTypeIds}
          onSelectPillar={selectPillar}
          onToggleIssueType={toggleIssueType}
          onSubmit={() => {
            void handleSubmit()
          }}
          onKeyDown={handlePromptKeyDown}
          onTextareaInput={growTextarea}
          pillars={breakdown.pillars}
          prompt={prompt}
          selectedIssueTypeIds={selectedIssueTypeIds}
          selectedPillar={selectedPillar}
          selectedPillarBuckets={selectedPillar?.buckets ?? []}
          selectedPillarId={selectedPillarId}
          textareaRef={textareaRef}
        />

        <div className="mx-auto flex w-full max-w-4xl flex-wrap justify-center gap-2">
          <Button
            variant="ghost"
            className="group flex h-auto items-center gap-2 rounded-full border bg-transparent px-3 py-2 text-xs text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted/40 hover:text-foreground"
            onClick={() =>
              handlePresetClick("Prioritize these fixes by impact")
            }
          >
            <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span>Prioritize fixes</span>
          </Button>
          <Button
            variant="ghost"
            className="group flex h-auto items-center gap-2 rounded-full border bg-transparent px-3 py-2 text-xs text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted/40 hover:text-foreground"
            onClick={() =>
              handlePresetClick("Explain the root causes of these issues")
            }
          >
            <LightbulbIcon className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span>Explain causes</span>
          </Button>
          <Button
            variant="ghost"
            className="group flex h-auto items-center gap-2 rounded-full border bg-transparent px-3 py-2 text-xs text-muted-foreground transition-colors duration-200 ease-out hover:bg-muted/40 hover:text-foreground"
            onClick={() =>
              handlePresetClick("Suggest the highest-impact quick wins")
            }
          >
            <ZapIcon className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span>Quick wins</span>
          </Button>
        </div>
      </div>
    </section>
  )
}
