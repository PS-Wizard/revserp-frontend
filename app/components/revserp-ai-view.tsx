"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useEffectEvent, useReducer } from "react"

import { Card, CardContent } from "~/components/ui/card"
import { ApiError, clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  AIConversationDetailResponse,
  AIConversationResponse,
  AIConversationsResponse,
  CreateAIConversationMessageResponse,
  CreateAIConversationResponse,
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import { getNextScopeState, newMessageFromResponse, upsertConversation } from "~/lib/ai-conversation"
import type { RevserpAIMessage } from "~/lib/ai-conversation"
import { MessageList } from "~/components/revserp-ai-view/message-list"
import { Composer } from "~/components/revserp-ai-view/composer"

type ScopeState = {
  pillarId: string
  bucketIds: string[]
  issueTypeIds: string[]
}

type ScopeAction =
  | { type: "SET_PILLAR"; pillarId: string; bucketIds: string[]; issueTypeIds: string[] }
  | { type: "TOGGLE_BUCKET"; bucketId: string }
  | { type: "TOGGLE_ISSUE_TYPE"; issueTypeId: string }
  | { type: "SET_SCOPE"; pillarId: string; bucketIds: string[]; issueTypeIds: string[] }

const initialScope: ScopeState = { pillarId: "", bucketIds: [], issueTypeIds: [] }

function scopeReducer(state: ScopeState, action: ScopeAction): ScopeState {
  switch (action.type) {
    case "SET_PILLAR":
      return { pillarId: action.pillarId, bucketIds: action.bucketIds, issueTypeIds: action.issueTypeIds }
    case "TOGGLE_BUCKET": {
      const nextBucketIds = state.bucketIds.includes(action.bucketId)
        ? state.bucketIds.filter((id) => id !== action.bucketId)
        : [...state.bucketIds, action.bucketId]
      return {
        ...state,
        bucketIds: nextBucketIds.length ? nextBucketIds : state.bucketIds,
        issueTypeIds: [],
      }
    }
    case "TOGGLE_ISSUE_TYPE": {
      const nextIssueTypeIds = state.issueTypeIds.includes(action.issueTypeId)
        ? state.issueTypeIds.filter((id) => id !== action.issueTypeId)
        : [...state.issueTypeIds, action.issueTypeId]
      return { ...state, issueTypeIds: nextIssueTypeIds }
    }
    case "SET_SCOPE":
      return { pillarId: action.pillarId, bucketIds: action.bucketIds, issueTypeIds: action.issueTypeIds }
  }
}

function useAIConversation({
  breakdown,
  openConversationId,
  projectId,
}: {
  breakdown: ScoreBreakdownResponse | null
  openConversationId?: string | null
  projectId?: string
}) {
  const [scope, dispatchScope] = useReducer(scopeReducer, initialScope)
  const { pillarId: selectedPillarId, bucketIds: selectedBucketIds, issueTypeIds: selectedIssueTypeIds } = scope
  const [prompt, setPrompt] = useState("")
  const [conversations, setConversations] = useState<AIConversationResponse[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<RevserpAIMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [activeSendRequestId, setActiveSendRequestId] = useState<string | null>(null)
  const isSending = activeSendRequestId !== null
  const [errorMessage, setErrorMessage] = useState("")
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const activeSendRequestIdRef = useRef<string | null>(null)
  const crawlId = breakdown?.crawl_id ?? ""

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

  const bucketLabel =
    selectedBuckets.length === 0
      ? "Bucket"
      : selectedBuckets.length === 1
        ? selectedBuckets[0].label
        : `${selectedBuckets.length} buckets`
  const issueTypeLabel =
    selectedIssueTypeIds.length === 0
      ? "All issue types"
      : selectedIssueTypes.length === 1
        ? selectedIssueTypes[0].label
        : `${selectedIssueTypes.length} issue types`
  const selectedScopeLabel =
    selectedPillar && selectedBuckets.length
      ? `${selectedPillar.label} / ${bucketLabel} / ${issueTypeLabel}`
      : "Choose crawl context"
  const activeConversation =
    conversations.find(
      (conversation) => conversation.id === activeConversationId
    ) ?? null
  const canSend = Boolean(
    projectId &&
    breakdown?.crawl_id &&
    selectedPillar &&
    selectedBuckets.length &&
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

  const loadConversation = useCallback(async (conversationId: string) => {
    cancelSending()
    setIsLoadingMessages(true)
    setErrorMessage("")
    try {
      const response = await clientApiFetch<AIConversationDetailResponse >(
        `/ai/conversations/${conversationId}`
      )
      setActiveConversationId(response.conversation.id)
      setMessages(response.messages.map(newMessageFromResponse))
      setConversations((current) =>
        upsertConversation(current, response.conversation)
      )
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to load AI conversation."
      )
    } finally {
      setIsLoadingMessages(false)
    }
  }, [cancelSending])

  // Sync scope when breakdown changes (no-derived-state fix)
  const syncScope = useEffectEvent(() => {
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

  // Load conversations on mount / crawl change
  const hasExternalConversationRequest = Boolean(openConversationId)
  useEffect(() => {
    let cancelled = false

    void (async () => {
      cancelSending()
      setConversations([])
      setErrorMessage("")
      setIsLoadingMessages(false)
      if (!projectId || !crawlId) {
        setMessages([])
        setActiveConversationId(null)
        return
      }

      try {
        const response = await clientApiFetch<AIConversationsResponse >(
          `/projects/${projectId}/ai/conversations?crawl_id=${encodeURIComponent(crawlId)}&limit=50&offset=0`
        )
        if (cancelled) return
        setConversations(response.conversations)

        const firstConversation = hasExternalConversationRequest
          ? null
          : response.conversations[0]

        if (firstConversation) {
          const detail = await clientApiFetch<AIConversationDetailResponse >(
            `/ai/conversations/${firstConversation.id}`
          )
          if (cancelled) return
          setActiveConversationId(detail.conversation.id)
          setMessages(detail.messages.map(newMessageFromResponse))
          setConversations((current) =>
            upsertConversation(current, detail.conversation)
          )
        } else if (!hasExternalConversationRequest) {
          setMessages([])
          setActiveConversationId(null)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof ApiError
              ? error.message
              : "Unable to load AI history."
          )
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [crawlId, projectId, hasExternalConversationRequest])

  useEffect(() => {
    if (!openConversationId) return
    void loadConversation(openConversationId)
  }, [loadConversation, openConversationId])

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
        setActiveConversationId(conversationId)
        setConversations((current) =>
          upsertConversation(current, created.conversation)
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
      setMessages([
        ...baseMessages,
        newMessageFromResponse(response.user_message),
        newMessageFromResponse(response.assistant_message),
      ])
      setConversations((current) =>
        upsertConversation(current, response.conversation)
      )
    } catch (error) {
      if (!isActiveSendRequest(sendRequestId)) return
      setMessages(baseMessages)
      setPrompt(trimmedPrompt)
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to generate an AI fix."
      )
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
      bucketIds: pillar.buckets[0] ? [pillar.buckets[0].id] : [],
      issueTypeIds: [],
    })
  }

  function toggleBucket(bucket: ScoreBreakdownBucketResponse) {
    dispatchScope({ type: "TOGGLE_BUCKET", bucketId: bucket.id })
  }

  function toggleIssueType(issueType: ScoreBreakdownIssueTypeResponse) {
    dispatchScope({ type: "TOGGLE_ISSUE_TYPE", issueTypeId: issueType.id })
  }

  function clearIssueTypeIds() {
    dispatchScope({ type: "SET_SCOPE", pillarId: selectedPillarId, bucketIds: selectedBucketIds, issueTypeIds: [] })
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
    setCopiedMessageIndex,
    crawlId,
    selectedPillar,
    clearIssueTypeIds,
    availableIssueTypes,
    selectedIssueTypes,
    bucketLabel,
    issueTypeLabel,
    selectedScopeLabel,
    canSend,
    handleSubmit,
    handlePromptKeyDown,
    copyMessage,
    selectPillar,
    toggleBucket,
    toggleIssueType,
    growTextarea,
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
}: {
  breakdown: ScoreBreakdownResponse | null
  openConversationId?: string | null
  projectId?: string
}) {
  const {
    prompt,
    setPrompt,
    selectedPillarId,
    selectedBucketIds,
    selectedIssueTypeIds,
    activeConversation,
    messages,
    isLoadingMessages,
    isSending,
    errorMessage,
    copiedMessageIndex,
    selectedPillar,
    clearIssueTypeIds,
    availableIssueTypes,
    bucketLabel,
    issueTypeLabel,
    selectedScopeLabel,
    canSend,
    handleSubmit,
    handlePromptKeyDown,
    copyMessage,
    selectPillar,
    toggleBucket,
    toggleIssueType,
    growTextarea,
    scrollContainerRef,
    textareaRef,
  } = useAIConversation({ breakdown, openConversationId, projectId })

  if (!breakdown) {
    return <NoCrawlDataView />
  }

  return (
    <section className="flex h-[calc(100svh-4.5rem)] min-h-0 flex-col overflow-hidden px-4 pt-5 sm:px-6 lg:px-4">
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
          <MessageList
            copiedMessageIndex={copiedMessageIndex}
            isLoadingMessages={isLoadingMessages}
            isSending={isSending}
            messages={messages}
            onCopyMessage={copyMessage}
            selectedScopeLabel={selectedScopeLabel}
          />
      </div>

      <Composer
        activeConversationTitle={activeConversation?.title}
        availableIssueTypes={availableIssueTypes}
        bucketLabel={bucketLabel}
        canSend={canSend}
        errorMessage={errorMessage}
        isSending={isSending}
        issueTypeLabel={issueTypeLabel}
        onPromptChange={setPrompt}
        onSelectAllIssueTypes={clearIssueTypeIds}
        onSelectPillar={selectPillar}
        onToggleBucket={toggleBucket}
        onToggleIssueType={toggleIssueType}
        onSubmit={() => { void handleSubmit(); }}
        onKeyDown={handlePromptKeyDown}
        onTextareaInput={growTextarea}
        pillars={breakdown.pillars}
        prompt={prompt}
        selectedBucketIds={selectedBucketIds}
        selectedIssueTypeIds={selectedIssueTypeIds}
        selectedPillar={selectedPillar}
        selectedPillarBuckets={selectedPillar?.buckets ?? []}
        selectedPillarId={selectedPillarId}
        textareaRef={textareaRef}
      />
    </section>
  )
}
