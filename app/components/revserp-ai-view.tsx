"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  Loader2Icon,
  MessageSquareIcon,
  PlusIcon,
  SendIcon,
  TrashIcon,
  SparklesIcon,
} from "lucide-react"

import { CompileLoader } from "~/components/compile-loader"
import { MarkdownMessage } from "~/components/markdown-message"
import { Badge } from "~/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Textarea } from "~/components/ui/textarea"
import {
  ApiError,
  clientApiDelete,
  clientApiFetch,
  clientApiPost,
} from "~/lib/api"
import type {
  AIConversationDetailResponse,
  AIConversationResponse,
  AIConversationsResponse,
  AIMessageResponse,
  CreateAIConversationMessageResponse,
  CreateAIConversationResponse,
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import { cn, formatBucketLabel } from "~/lib/utils"

type RevserpAIMessage = {
  id?: string
  role: "user" | "assistant"
  content: string
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
  const [prompt, setPrompt] = useState("")
  const [selectedPillarId, setSelectedPillarId] = useState("")
  const [selectedBucketIds, setSelectedBucketIds] = useState<string[]>([])
  const [selectedIssueTypeIds, setSelectedIssueTypeIds] = useState<string[]>([])
  const [conversations, setConversations] = useState<AIConversationResponse[]>(
    []
  )
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const [messages, setMessages] = useState<RevserpAIMessage[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState<
    string | null
  >(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(
    null
  )
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
  const groupedConversations = useMemo(
    () => groupConversationsByDate(conversations),
    [conversations]
  )
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
    setIsSending(true)
  }

  function finishSending(requestId: string) {
    if (activeSendRequestIdRef.current !== requestId) return
    activeSendRequestIdRef.current = null
    setIsSending(false)
  }

  function cancelSending() {
    activeSendRequestIdRef.current = null
    setIsSending(false)
  }

  function isActiveSendRequest(requestId: string) {
    return activeSendRequestIdRef.current === requestId
  }

  const loadConversation = useCallback(async (conversationId: string) => {
    cancelSending()
    setIsLoadingMessages(true)
    setErrorMessage("")
    try {
      const response = await clientApiFetch<AIConversationDetailResponse>(
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
  }, [])

  useEffect(() => {
    const nextScopeState = getNextScopeState(
      breakdown,
      selectedPillarId,
      selectedBucketIds,
      selectedIssueTypeIds
    )
    if (!nextScopeState) return
    setSelectedPillarId(nextScopeState.pillarId)
    setSelectedBucketIds(nextScopeState.bucketIds)
    setSelectedIssueTypeIds(nextScopeState.issueTypeIds)
  }, [breakdown, selectedPillarId, selectedBucketIds, selectedIssueTypeIds])

  useEffect(() => {
    let cancelled = false

    async function loadConversations() {
      cancelSending()
      setConversations([])
      setErrorMessage("")
      setIsLoadingHistory(false)
      setIsLoadingMessages(false)
      if (!projectId || !crawlId) {
        setMessages([])
        setActiveConversationId(null)
        return
      }

      setIsLoadingHistory(true)
      try {
        const response = await clientApiFetch<AIConversationsResponse>(
          `/projects/${projectId}/ai/conversations?crawl_id=${encodeURIComponent(crawlId)}&limit=50&offset=0`
        )
        if (cancelled) return
        setConversations(response.conversations)

        const hasExternalConversationRequest = Boolean(openConversationId)
        const firstConversation = hasExternalConversationRequest
          ? null
          : response.conversations[0]

        if (firstConversation) {

          const detail = await clientApiFetch<AIConversationDetailResponse>(
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
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false)
          setIsLoadingMessages(false)
        }
      }
    }

    void loadConversations()

    return () => {
      cancelled = true
    }
  }, [crawlId, projectId])

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
    setMessages([...baseMessages, optimisticUserMessage])
    setPrompt("")
    setErrorMessage("")
    startSending(requestId)
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
        if (!isActiveSendRequest(requestId)) return
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
      if (!isActiveSendRequest(requestId)) return
      setMessages([
        ...baseMessages,
        newMessageFromResponse(response.user_message),
        newMessageFromResponse(response.assistant_message),
      ])
      setConversations((current) =>
        upsertConversation(current, response.conversation)
      )
    } catch (error) {
      if (!isActiveSendRequest(requestId)) return
      setMessages(baseMessages)
      setPrompt(trimmedPrompt)
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to generate an AI fix."
      )
    } finally {
      finishSending(requestId)
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
    setSelectedPillarId(pillar.id)
    setSelectedBucketIds(pillar.buckets[0] ? [pillar.buckets[0].id] : [])
    setSelectedIssueTypeIds([])
  }

  function toggleBucket(bucket: ScoreBreakdownBucketResponse) {
    setSelectedBucketIds((current) => {
      const next = current.includes(bucket.id)
        ? current.filter((bucketId) => bucketId !== bucket.id)
        : [...current, bucket.id]
      return next.length ? next : current
    })
    setSelectedIssueTypeIds([])
  }

  function toggleIssueType(issueType: ScoreBreakdownIssueTypeResponse) {
    setSelectedIssueTypeIds((current) =>
      current.includes(issueType.id)
        ? current.filter((issueTypeId) => issueTypeId !== issueType.id)
        : [...current, issueType.id]
    )
  }

  function startNewChat() {
    cancelSending()
    setActiveConversationId(null)
    setMessages([])
    setErrorMessage("")
  }

  async function deleteConversation(conversationId: string) {
    if (deletingConversationId) return

    const previousConversations = conversations
    const previousActiveConversationId = activeConversationId
    const previousMessages = messages
    const wasActiveConversation = activeConversationId === conversationId
    setDeletingConversationId(conversationId)
    setErrorMessage("")
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== conversationId)
    )
    if (wasActiveConversation) {
      cancelSending()
      setActiveConversationId(null)
      setMessages([])
    }

    try {
      await clientApiDelete<null>(`/ai/conversations/${conversationId}`)
    } catch (error) {
      setConversations(previousConversations)
      if (wasActiveConversation) {
        setActiveConversationId(previousActiveConversationId)
        setMessages(previousMessages)
      }
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Unable to delete AI conversation."
      )
    } finally {
      setDeletingConversationId(null)
    }
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

  if (!breakdown) {
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

  return (
    <section className="flex h-[calc(100svh-4.5rem)] min-h-0 flex-col overflow-hidden px-4 pt-5 sm:px-6 lg:px-4">
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-xl">
              <CompileLoader size={22} />
              <span className="text-muted-foreground">
                Loading conversation...
              </span>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border bg-card shadow-xl">
                <SparklesIcon className="size-5" />
              </div>
              <h1 className="pt-5 text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
                What should we fix?
              </h1>
              <p className="mx-auto max-w-xl pt-5 text-sm leading-7 text-muted-foreground">
                {selectedScopeLabel}
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 px-2 py-4">
            {messages.map((message, messageIndex) => (
              <div
                key={message.id ?? `${message.role}-${messageIndex}`}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "user" ? (
                  <div className="max-w-[min(34rem,78%)] rounded-2xl bg-primary px-4 py-2.5 text-base leading-7 text-primary-foreground shadow-xl">
                    <MarkdownMessage content={message.content} />
                  </div>
                ) : (
                  <article className="w-full text-base leading-7 text-foreground">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                        <BotIcon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <MarkdownMessage content={message.content} />
                        <div className="pt-3">
                          <Button
                            aria-label="Copy response"
                            className="size-8 rounded-full"
                            onClick={() =>
                              void copyMessage(message.content, messageIndex)
                            }
                            size="icon"
                            variant="outline"
                          >
                            {copiedMessageIndex === messageIndex ? (
                              <CheckIcon className="size-4" />
                            ) : (
                              <CopyIcon className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                )}
              </div>
            ))}

            {isSending ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-xl">
                  <CompileLoader size={22} />
                  <span className="text-muted-foreground">Thinking...</span>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-6xl shrink-0">
        {errorMessage ? (
          <p className="mx-auto mb-2 max-w-3xl rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-200">
            {errorMessage}
          </p>
        ) : null}

        <div className="rounded-[1.15rem] border border-border bg-card/95 px-2 py-1.5 shadow-[0_18px_56px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
          <div className="flex min-w-0 items-center justify-between gap-2 px-1.5 py-1">
            <HistoryDropdown
              activeConversationId={activeConversationId}
              conversations={groupedConversations}
              isLoading={isLoadingHistory}
              onNewChat={startNewChat}
              deletingConversationId={deletingConversationId}
              onSelectConversation={(conversationId) =>
                void loadConversation(conversationId)
              }
              onDeleteConversation={(conversationId) =>
                void deleteConversation(conversationId)
              }
            />
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {activeConversation?.title || "New chat"}
            </span>
          </div>
          <ScopeBreadcrumb
            availableIssueTypes={availableIssueTypes}
            bucketLabel={bucketLabel}
            issueTypeLabel={issueTypeLabel}
            onSelectAllIssueTypes={() => setSelectedIssueTypeIds([])}
            onSelectPillar={selectPillar}
            onToggleBucket={toggleBucket}
            onToggleIssueType={toggleIssueType}
            selectedBucketIds={selectedBucketIds}
            selectedIssueTypeIds={selectedIssueTypeIds}
            selectedPillar={selectedPillar}
            selectedPillarId={selectedPillarId}
            selectedPillarBuckets={selectedPillar?.buckets ?? []}
            pillars={breakdown.pillars}
          />

          <div className="flex items-end gap-2 px-1.5 pt-0.5 pb-1">
            <Textarea
              ref={textareaRef}
              className="max-h-[22vh] min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-6 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              onChange={(event) => setPrompt(event.currentTarget.value)}
              onInput={growTextarea}
              onKeyDown={handlePromptKeyDown}
              placeholder="Ask Revserp to fix, rewrite, prioritize, or explain this context..."
              rows={1}
              value={prompt}
            />

            <Button
              aria-label="Send prompt"
              className="mb-0.5 size-8 rounded-full"
              disabled={!canSend}
              onClick={() => void handleSubmit()}
              size="icon"
            >
              {isSending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SendIcon className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function HistoryDropdown({
  activeConversationId,
  conversations,
  deletingConversationId,
  isLoading,
  onDeleteConversation,
  onNewChat,
  onSelectConversation,
}: {
  activeConversationId: string | null
  conversations: ConversationGroup[]
  deletingConversationId: string | null
  isLoading: boolean
  onDeleteConversation: (conversationId: string) => void
  onNewChat: () => void
  onSelectConversation: (conversationId: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="h-7 rounded-full px-2 text-xs" />
        }
      >
        <MessageSquareIcon className="size-3.5" />
        History
        <ChevronDownIcon className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-96 w-80 rounded-2xl p-1.5"
      >
        <DropdownMenuItem onClick={onNewChat}>
          <PlusIcon className="size-4" />
          New chat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem disabled>
            <Loader2Icon className="size-4 animate-spin" />
            Loading history...
          </DropdownMenuItem>
        ) : conversations.length === 0 ? (
          <DropdownMenuItem disabled>No saved chats yet</DropdownMenuItem>
        ) : (
          conversations.map((group) => (
            <DropdownMenuGroup key={group.label}>
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {group.conversations.map((conversation) => (
                <ContextMenu key={conversation.id}>
                  <ContextMenuTrigger>
                    <DropdownMenuItem
                      onClick={() => onSelectConversation(conversation.id)}
                      className="items-start gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">
                          {conversation.title || "Untitled chat"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatConversationTime(conversation.updated_at)}
                        </div>
                      </div>
                      {activeConversationId === conversation.id ? (
                        <CheckIcon className="mt-0.5 size-4" />
                      ) : null}
                    </DropdownMenuItem>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-40">
                    <ContextMenuGroup>
                      <ContextMenuItem
                        disabled={deletingConversationId === conversation.id}
                        onClick={() => onDeleteConversation(conversation.id)}
                        variant="destructive"
                      >
                        {deletingConversationId === conversation.id ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <TrashIcon />
                        )}
                        Delete
                      </ContextMenuItem>
                    </ContextMenuGroup>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </DropdownMenuGroup>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ScopeBreadcrumb({
  pillars,
  selectedPillar,
  selectedPillarId,
  selectedPillarBuckets,
  selectedBucketIds,
  selectedIssueTypeIds,
  availableIssueTypes,
  bucketLabel,
  issueTypeLabel,
  onSelectPillar,
  onToggleBucket,
  onToggleIssueType,
  onSelectAllIssueTypes,
}: {
  pillars: ScoreBreakdownPillarResponse[]
  selectedPillar: ScoreBreakdownPillarResponse | null
  selectedPillarId: string
  selectedPillarBuckets: ScoreBreakdownBucketResponse[]
  selectedBucketIds: string[]
  selectedIssueTypeIds: string[]
  availableIssueTypes: ScoreBreakdownIssueTypeResponse[]
  bucketLabel: string
  issueTypeLabel: string
  onSelectPillar: (pillar: ScoreBreakdownPillarResponse) => void
  onToggleBucket: (bucket: ScoreBreakdownBucketResponse) => void
  onToggleIssueType: (issueType: ScoreBreakdownIssueTypeResponse) => void
  onSelectAllIssueTypes: () => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-1.5 py-1 text-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-7 max-w-36 justify-start rounded-full px-2 text-xs"
                  />
                }
              >
                <span className="truncate">
                  {selectedPillar?.label ?? "Pillar"}
                </span>
                <ChevronDownIcon className="size-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56 rounded-2xl p-1.5"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Pillar</DropdownMenuLabel>
                  {pillars.map((pillar) => (
                    <DropdownMenuItem
                      key={pillar.id}
                      onClick={() => onSelectPillar(pillar)}
                    >
                      <span className="truncate">{pillar.label}</span>
                      {selectedPillarId === pillar.id ? (
                        <CheckIcon className="ml-auto size-4" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-7 max-w-44 justify-start rounded-full px-2 text-xs"
                  />
                }
              >
                <span className="truncate">{bucketLabel}</span>
                <ChevronDownIcon className="size-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-96 w-72 overflow-y-auto rounded-2xl p-1.5"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Buckets</DropdownMenuLabel>
                  {selectedPillarBuckets.map((bucket) => (
                    <DropdownMenuCheckboxItem
                      checked={selectedBucketIds.includes(bucket.id)}
                      key={bucket.id}
                      onCheckedChange={() => onToggleBucket(bucket)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {formatBucketLabel(bucket.id, bucket.label)}
                      </span>
                      <Badge
                        variant="outline"
                        className="ml-2 shrink-0 text-[10px]"
                      >
                        {bucket.affected_url_count}
                      </Badge>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-7 max-w-52 justify-start rounded-full px-2 text-xs"
                  />
                }
              >
                <span className="truncate">{issueTypeLabel}</span>
                <ChevronDownIcon className="size-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-96 w-80 overflow-y-auto rounded-2xl p-1.5"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Issue types</DropdownMenuLabel>
                  <DropdownMenuItem onClick={onSelectAllIssueTypes}>
                    All issue types
                    {selectedIssueTypeIds.length === 0 ? (
                      <CheckIcon className="ml-auto size-4" />
                    ) : null}
                  </DropdownMenuItem>
                  {availableIssueTypes.map((issueType) => (
                    <DropdownMenuCheckboxItem
                      checked={selectedIssueTypeIds.includes(issueType.id)}
                      key={issueType.id}
                      onCheckedChange={() => onToggleIssueType(issueType)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {issueType.label}
                      </span>
                      <Badge
                        variant="outline"
                        className="ml-2 shrink-0 text-[10px]"
                      >
                        {issueType.affected_url_count}
                      </Badge>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}

type AIScopeState = {
  pillarId: string
  bucketIds: string[]
  issueTypeIds: string[]
}

type ConversationGroup = {
  label: string
  conversations: AIConversationResponse[]
}

function getNextScopeState(
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

function areStringArraysEqual(left: string[], right: string[]) {
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

function newMessageFromResponse(message: AIMessageResponse): RevserpAIMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
  }
}

function upsertConversation(
  conversations: AIConversationResponse[],
  conversation: AIConversationResponse
) {
  return [
    conversation,
    ...conversations.filter((item) => item.id !== conversation.id),
  ]
}

function groupConversationsByDate(
  conversations: AIConversationResponse[]
): ConversationGroup[] {
  const groups: ConversationGroup[] = []
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

function formatConversationTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}
