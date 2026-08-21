"use client"

import { useEffect, useLayoutEffect, useState } from "react"

import {
  BotIcon,
  Loader2,
  FilePenLineIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react"
import type { Components } from "react-markdown"

import { Button } from "~/components/ui/button"
import { HoverPill, useHoverPill } from "~/components/ui/hover-pill"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
} from "~/components/ui/message-scroller"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { revbotHashTarget } from "~/components/app-navbar/types"
import type {
  AIReasoningEffort,
  AIConversationResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"

import {
  filterConversations,
  RevbotConversationSearchInput,
} from "./revbot-conversation-search"
import { RevbotComposer } from "./revbot-composer"
import { RevbotMarkdown } from "./revbot-markdown"
import { RevbotTurnActivity } from "./revbot-turn-activity"
import { useRevbot, type RevbotHandle } from "./use-revbot"

/** Stick to bottom while content grows; stop when the user scrolls up. */
function RevbotScrollFollow({ followKey }: { followKey: string }) {
  const { scrollToEnd } = useMessageScroller()
  const scrollable = useMessageScrollerScrollable()

  useLayoutEffect(() => {
    if (scrollable.end) return
    scrollToEnd({ behavior: "auto" })
  }, [followKey, scrollable.end, scrollToEnd])

  return null
}

/** First letter of the link's domain (external) or hash (internal). */
function citationLetter(href: string) {
  const seed = href.startsWith("#") ? href.slice(1) : href
  try {
    const host = href.startsWith("#") ? seed : new URL(href).hostname
    return host.trim().charAt(0).toLowerCase() || "?"
  } catch {
    return "?"
  }
}

/** Deterministic color per link so the same source always gets the same tint. */
function citationColor(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return `hsl(${hash % 360} 60% 42%)`
}

function StreamingAssistantMessage({
  content,
  messageId,
}: {
  content: string
  messageId: string
}) {
  return (
    <div className="typeset typeset-docs w-full whitespace-pre-wrap">
      {content
        ? content.split(/(\s+)/).map((word, index) =>
            /\s/.test(word) ? (
              word
            ) : (
              <span
                className="inline-block animate-[revbot-stream-word_180ms_ease-out_both] motion-reduce:animate-none"
                key={`${messageId}-${index}`}
              >
                {word}
              </span>
            )
          )
        : null}
      <span
        aria-hidden="true"
        className="ml-0.5 inline-block h-[1.1em] w-px animate-pulse bg-current align-[-0.15em]"
      />
    </div>
  )
}

function RevbotEmptyState({
  isDark,
  projectName,
}: {
  isDark: boolean
  projectName: string
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div
        className={cn(
          "mb-4 flex size-14 items-center justify-center rounded-2xl border shadow-sm",
          isDark
            ? "border-white/10 bg-white/[0.04] shadow-black/20"
            : "border-border bg-muted/40"
        )}
      >
        <BotIcon
          aria-hidden="true"
          className={cn(
            "size-7",
            isDark ? "text-white/75" : "text-muted-foreground"
          )}
          strokeWidth={1.5}
        />
      </div>
      <p
        className={cn(
          "text-[15px] font-medium tracking-tight",
          isDark ? "text-white/90" : "text-foreground"
        )}
      >
        Ask Revserp about something
      </p>
      <p
        className={cn(
          "mt-2 max-w-[18rem] text-xs leading-relaxed",
          isDark ? "text-white/40" : "text-muted-foreground"
        )}
      >
        SEO, PageSpeed, crawl data — ask anything about {projectName}.
      </p>
    </div>
  )
}

/** History list with isolated pill state — hover won't re-render the message column. */
function RevbotConversationHistoryList({
  conversations,
  activeConversationId,
  disabled,
  emptyLabel = "No conversations yet",
  isConversationActive,
  isDark,
  onSelectConversation,
  onDeleteConversation,
}: {
  conversations: AIConversationResponse[]
  activeConversationId: string | null
  disabled: boolean
  emptyLabel?: string
  isConversationActive: (conversationId: string) => boolean
  isDark: boolean
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
}) {
  const historyPill = useHoverPill()

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
      onMouseLeave={historyPill.clearPill}
    >
      <HoverPill
        className={isDark ? "bg-white/10" : undefined}
        pill={historyPill.pill}
      />
      {conversations.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      ) : null}
      {conversations.map((conversation, index) => {
        const itemProps = historyPill.getItemProps(index)
        const isCurrent = conversation.id === activeConversationId
        const isRunning = isConversationActive(conversation.id)
        return (
          <div
            {...itemProps}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              itemProps.className,
              "group flex w-full items-center gap-0.5 rounded-md px-1 py-0.5"
            )}
            key={conversation.id}
          >
            <button
              className={cn(
                "min-w-0 flex-1 truncate rounded-md px-1 py-2 text-left text-sm",
                isCurrent
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
              disabled={disabled}
              onClick={() => onSelectConversation(conversation.id)}
              type="button"
            >
              {conversation.title}
            </button>
            {isRunning ? (
              <Loader2
                aria-hidden="true"
                className="size-3.5 shrink-0 animate-spin text-muted-foreground"
              />
            ) : null}
            <button
              aria-label={`Delete ${conversation.title}`}
              className={cn(
                "shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100",
                isDark
                  ? "hover:bg-white/10"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
              disabled={disabled || isRunning}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onDeleteConversation(conversation.id)
              }}
              type="button"
            >
              <TrashIcon aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function RevbotView({
  activeProject,
  allowedEfforts,
  requestedConversationId,
  onConversationChange,
  compact = false,
  defaultHistoryOpen = true,
  hideCompactHeader = false,
  hideHistory = false,
  onActivityChange,
  onEditorLink,
  onInternalLink,
  onTitleChange,
  showMic = true,
  variant = "default",
}: {
  activeProject: ProjectResponse | null
  allowedEfforts: AIReasoningEffort[]
  requestedConversationId: string | null
  onConversationChange: (conversationId: string | null) => void
  compact?: boolean
  defaultHistoryOpen?: boolean
  hideCompactHeader?: boolean
  hideHistory?: boolean
  onActivityChange?: (active: boolean) => void
  onEditorLink?: (url: string) => void
  onInternalLink?: (hash: string) => void
  onTitleChange?: (title: string) => void
  showMic?: boolean
  variant?: "default" | "dark"
}) {
  if (!activeProject) {
    return (
      <section className="flex min-h-[calc(100svh-5rem)] items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h1 className="text-lg font-semibold">Revbot</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Select a project to use Revbot.
          </p>
        </div>
      </section>
    )
  }

  const revbot = useRevbot({
    activeProject,
    allowedEfforts,
    requestedConversationId,
    onConversationChange,
  })

  return (
    <RevbotViewContent
      activeProject={activeProject}
      allowedEfforts={allowedEfforts}
      compact={compact}
      defaultHistoryOpen={defaultHistoryOpen}
      hideCompactHeader={hideCompactHeader}
      hideHistory={hideHistory}
      onActivityChange={onActivityChange}
      onEditorLink={onEditorLink}
      onInternalLink={onInternalLink}
      onTitleChange={onTitleChange}
      revbot={revbot}
      showMic={showMic}
      variant={variant}
    />
  )
}

export function RevbotViewContent({
  activeProject,
  allowedEfforts,
  revbot,
  compact,
  defaultHistoryOpen,
  hideCompactHeader,
  hideHistory,
  onActivityChange,
  onEditorLink,
  onInternalLink,
  onTitleChange,
  showMic,
  variant,
}: {
  activeProject: ProjectResponse
  allowedEfforts: AIReasoningEffort[]
  revbot: RevbotHandle
  compact: boolean
  defaultHistoryOpen: boolean
  hideCompactHeader: boolean
  hideHistory: boolean
  onActivityChange?: (active: boolean) => void
  onEditorLink?: (url: string) => void
  onInternalLink?: (hash: string) => void
  onTitleChange?: (title: string) => void
  showMic: boolean
  variant: "default" | "dark"
}) {
  const [historyOpen, setHistoryOpen] = useState(defaultHistoryOpen)
  const [historySearch, setHistorySearch] = useState("")
  const markdownComponents: Components = {
    a: ({ href, node: _node, title, children, ...props }) => {
      if (!href) return <a {...props}>{children}</a>
      if (title === "revserp-editor") {
        return (
          <span className="editor-link-row">
            <a
              {...props}
              className="citation-link editor-link"
              href={href}
              onClick={(event) => {
                if (!onEditorLink) return
                event.preventDefault()
                onEditorLink(href)
              }}
              rel="noopener noreferrer"
            >
              <span
                aria-hidden="true"
                className="citation-avatar"
                style={{ backgroundColor: citationColor(href) }}
              >
                <FilePenLineIcon className="size-3" />
              </span>
              <span className="citation-text">{children}</span>
            </a>
          </span>
        )
      }
      // Citation chip only for known internal targets (#seo, #aeo-tab, …).
      // Everything else keeps the default markdown link.
      if (revbotHashTarget(href.replace(/^#/, "")) === null) {
        return (
          <a
            {...props}
            href={href}
            rel="noopener noreferrer"
            target="_blank"
            title={title}
          >
            {children}
          </a>
        )
      }
      return (
        <a
          {...props}
          className="citation-link"
          href={href}
          onClick={(event) => {
            event.preventDefault()
            onInternalLink?.(href.slice(1))
          }}
        >
          <span
            aria-hidden="true"
            className="citation-avatar"
            style={{ backgroundColor: citationColor(href) }}
          >
            {citationLetter(href)}
          </span>
          <span className="citation-text">{children}</span>
        </a>
      )
    },
  }

  useEffect(() => {
    setHistoryOpen(
      window.matchMedia("(max-width: 639px)").matches
        ? false
        : defaultHistoryOpen
    )
  }, [defaultHistoryOpen])
  const active = revbot.status === "queued" || revbot.status === "running"
  const activeAssistantMessageId = active
    ? [...revbot.messages]
        .reverse()
        .find((message) => message.role === "assistant")?.id
    : null
  const activeAssistantContent =
    revbot.messages.find((message) => message.id === activeAssistantMessageId)
      ?.content ?? ""
  const scrollFollowKey = [
    revbot.messages.length,
    revbot.toolCalls.length,
    revbot.phase,
    activeAssistantContent.length,
  ].join(":")
  useEffect(() => {
    onActivityChange?.(active)
  }, [active, onActivityChange])
  /** New chat and history switching stay available while a turn runs. */
  const historyControlsDisabled = revbot.loading

  const activeConversation = revbot.conversations.find(
    (conversation) => conversation.id === revbot.conversationId
  )
  const conversationTitle = activeConversation?.title ?? "New chat"
  const filteredConversations = filterConversations(
    revbot.conversations,
    historySearch
  )
  const isDark = variant === "dark"
  const messageColumnClass = "mx-auto w-full max-w-3xl px-4"

  useEffect(() => {
    onTitleChange?.(conversationTitle)
  }, [conversationTitle, onTitleChange])

  const chatColumn = (
    <>
      {compact && !hideCompactHeader ? (
        <header
          className={cn(
            "flex min-w-0 shrink-0 items-center",
            messageColumnClass
          )}
        >
          <h1 className="truncate text-sm font-semibold">
            {conversationTitle}
          </h1>
        </header>
      ) : null}
      {!compact ? (
        <header className="flex shrink-0 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BotIcon aria-hidden="true" className="size-5" />
            <div>
              <h1 className="text-lg font-semibold">Revbot</h1>
              <p className="text-sm text-muted-foreground">
                Ask about {activeProject.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select
              disabled={historyControlsDisabled}
              onValueChange={(value) => {
                if (typeof value === "string")
                  void revbot.selectConversation(value)
              }}
              value={revbot.conversationId ?? undefined}
            >
              <SelectTrigger
                aria-label="Select a Revbot conversation"
                className="w-52"
                size="sm"
              >
                <SelectValue placeholder="New chat" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {revbot.conversations.map((conversation) => (
                    <SelectItem key={conversation.id} value={conversation.id}>
                      {conversation.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              disabled={historyControlsDisabled}
              onClick={revbot.newChat}
              size="sm"
              type="button"
              variant="outline"
            >
              New chat
            </Button>
          </div>
        </header>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <MessageScrollerProvider
          key={revbot.conversationId ?? "new"}
          autoScroll
          defaultScrollPosition="end"
        >
          <MessageScroller className="min-h-0 flex-1">
            <RevbotScrollFollow followKey={scrollFollowKey} />
            <MessageScrollerViewport aria-label="Conversation">
              <MessageScrollerContent
                aria-busy={active}
                className={cn(
                  "gap-5 pt-1",
                  revbot.messages.length > 0 ? "pb-24" : "min-h-full",
                  messageColumnClass
                )}
              >
                {revbot.messages.length === 0 ? (
                  <MessageScrollerItem className="flex min-h-full items-center justify-center">
                    <RevbotEmptyState
                      isDark={isDark}
                      projectName={activeProject.name}
                    />
                  </MessageScrollerItem>
                ) : (
                  revbot.messages.map((message) => (
                    <MessageScrollerItem
                      className="w-full"
                      key={message.id}
                      messageId={message.id}
                    >
                      <article
                        className={cn(
                          "flex w-full py-1",
                          message.role === "user"
                            ? "justify-end"
                            : "justify-start"
                        )}
                      >
                        {message.role === "assistant" ? (
                          <div className="w-full min-w-0">
                            {(() => {
                              const isActiveMessage =
                                message.id === activeAssistantMessageId
                              const messageToolCalls = isActiveMessage
                                ? revbot.toolCalls
                                : message.toolCalls
                              const messageActivityStartedAt = isActiveMessage
                                ? revbot.activityStartedAt
                                : (message.activityStartedAt ?? null)
                              const messageActivityEndedAt = isActiveMessage
                                ? null
                                : (message.activityEndedAt ?? null)
                              const hasPersistedActivity =
                                messageActivityStartedAt !== null &&
                                messageActivityEndedAt !== null
                              const showActivity =
                                (isActiveMessage &&
                                  (active ||
                                    revbot.phase ||
                                    revbot.toolCalls.length > 0 ||
                                    revbot.activityStartedAt)) ||
                                (messageToolCalls?.length ?? 0) > 0 ||
                                hasPersistedActivity
                              const hasToolCalls =
                                (messageToolCalls?.length ?? 0) > 0
                              const hasResponse =
                                message.id === activeAssistantMessageId
                                  ? Boolean(message.content) ||
                                    revbot.phase === "writing"
                                  : Boolean(message.content)

                              return showActivity ? (
                                <RevbotTurnActivity
                                  active={isActiveMessage && active}
                                  endedAt={messageActivityEndedAt}
                                  phase={isActiveMessage ? revbot.phase : null}
                                  showDivider={hasToolCalls && hasResponse}
                                  startedAt={messageActivityStartedAt}
                                  toolCalls={messageToolCalls ?? []}
                                  variant={variant}
                                />
                              ) : null
                            })()}
                            {message.id === activeAssistantMessageId &&
                            (message.content || revbot.phase === "writing") ? (
                              <StreamingAssistantMessage
                                content={message.content}
                                messageId={message.id}
                              />
                            ) : message.id !== activeAssistantMessageId ? (
                              <RevbotMarkdown components={markdownComponents}>
                                {message.content}
                              </RevbotMarkdown>
                            ) : null}
                          </div>
                        ) : (
                          <p
                            className={cn(
                              "max-w-[min(85%,28rem)] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap",
                              isDark ? "bg-white/10" : "bg-muted"
                            )}
                          >
                            {message.content}
                          </p>
                        )}
                      </article>
                    </MessageScrollerItem>
                  ))
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      <div
        className={cn(
          "relative mt-auto shrink-0 pt-3 pb-2",
          messageColumnClass
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 -top-12 h-12 bg-gradient-to-t to-transparent",
            isDark ? "from-[#0b0b0c]" : "from-background"
          )}
        />
        <RevbotComposer
          key={revbot.conversationId ?? "new"}
          active={active}
          allowedEfforts={allowedEfforts}
          disabled={revbot.loading || active || revbot.stopping}
          effort={revbot.effort}
          onEffortChange={revbot.setEffort}
          onSend={(content) => void revbot.send(content)}
          onStop={() => void revbot.stop()}
          showMic={showMic}
          stopping={revbot.stopping}
          variant={variant}
        />
      </div>
    </>
  )

  return (
    <section
      className={cn(
        "h-full min-h-0 w-full overflow-hidden",
        compact
          ? cn(
              "p-2",
              hideHistory
                ? "flex flex-col"
                : cn(
                    "grid gap-2",
                    historyOpen
                      ? "grid-cols-[13rem_minmax(0,1fr)]"
                      : "grid-cols-[2.5rem_minmax(0,1fr)]"
                  ),
              isDark && "surface-dialog"
            )
          : "mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6",
        !compact && "h-[calc(100svh-5rem)]"
      )}
    >
      {compact && !hideHistory ? (
        <aside
          aria-label="Conversation history"
          className={cn(
            "flex min-h-0 flex-col pr-3",
            isDark
              ? "surface-dialog border-r border-white/10"
              : "border-r border-border"
          )}
        >
          {historyOpen ? (
            <>
              <div className="flex h-8 shrink-0 items-center justify-between gap-2 px-1 pb-2">
                <h2 className="text-sm leading-none font-medium">
                  Conversations
                </h2>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Collapse conversation history"
                        className="shrink-0"
                        onClick={() => setHistoryOpen(false)}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <PanelLeftCloseIcon aria-hidden="true" />
                      </Button>
                    }
                  />
                  <TooltipContent>Collapse history</TooltipContent>
                </Tooltip>
              </div>
              <button
                className={cn(
                  "mb-1 flex w-full shrink-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground",
                  isDark
                    ? "hover:bg-white/10"
                    : "hover:bg-accent hover:text-accent-foreground",
                  historyControlsDisabled && "pointer-events-none opacity-50"
                )}
                disabled={historyControlsDisabled}
                onClick={revbot.newChat}
                type="button"
              >
                <PlusIcon aria-hidden="true" className="size-4 shrink-0" />
                New chat
              </button>
              <RevbotConversationSearchInput
                className="mb-2 shrink-0 px-1"
                isDark={isDark}
                onChange={setHistorySearch}
                value={historySearch}
              />
              <RevbotConversationHistoryList
                activeConversationId={revbot.conversationId}
                conversations={filteredConversations}
                disabled={historyControlsDisabled}
                emptyLabel={
                  historySearch.trim()
                    ? "No matching conversations"
                    : "No conversations yet"
                }
                isConversationActive={revbot.conversationActive}
                isDark={isDark}
                onDeleteConversation={(id) =>
                  void revbot.deleteConversation(id)
                }
                onSelectConversation={(id) =>
                  void revbot.selectConversation(id)
                }
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="Expand conversation history"
                      onClick={() => setHistoryOpen(true)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <PanelLeftOpenIcon aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipContent side="right">Expand history</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="New chat"
                      disabled={historyControlsDisabled}
                      onClick={revbot.newChat}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <PlusIcon aria-hidden="true" />
                    </Button>
                  }
                />
                <TooltipContent side="right">New chat</TooltipContent>
              </Tooltip>
            </div>
          )}
        </aside>
      ) : null}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col",
          compact ? "flex-1" : "contents"
        )}
      >
        {chatColumn}
      </div>
    </section>
  )
}
