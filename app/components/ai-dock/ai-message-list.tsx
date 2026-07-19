import { useEffect, useId, useRef, useState } from "react"
import {
  BotIcon,
  ChevronDownIcon,
  Loader2Icon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react"

import { CompileLoader } from "~/components/compile-loader"
import { MarkdownMessage } from "~/components/markdown-message"
import type { RevserpAIMessage, ToolCallInfo } from "~/lib/ai-conversation"
import { cn } from "~/lib/utils"

const TOOL_LABELS: Record<string, string> = {
  list_projects: "Listing projects",
  switch_project: "Switching project",
  get_business_profile: "Reading business profile",
  list_pages: "Listing pages",
  get_page_content: "Reading page content",
  list_issues: "Reading issues",
  get_recommended_fix: "Looking up recommended fix",
  get_score_summary: "Reading score summary",
  start_crawl: "Starting a crawl",
  export_crawl: "Exporting crawl",
  export_audit: "Exporting audit",
  navigate: "Navigating",
}

function humanizeToolName(name: string) {
  return TOOL_LABELS[name] ?? name
}

function ToolCallRow({ toolCall }: { toolCall: ToolCallInfo }) {
  const isRunning = toolCall.status === "running"
  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      title={toolCall.args}
    >
      {isRunning ? (
        <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <WrenchIcon className="size-3.5 shrink-0" />
      )}
      <span className="shrink-0">{humanizeToolName(toolCall.name)}</span>
      {toolCall.summary ? (
        <span className="truncate text-muted-foreground/70">
          — {toolCall.summary}
        </span>
      ) : null}
    </div>
  )
}

function ThinkingBlock({
  reasoning,
  streaming,
  hasAnswer,
}: {
  reasoning: string
  streaming: boolean
  hasAnswer: boolean
}) {
  const [isOpen, setIsOpen] = useState(streaming)
  const detailsId = useId()
  const reasoningRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!streaming || hasAnswer) setIsOpen(false)
  }, [streaming, hasAnswer])

  useEffect(() => {
    if (!isOpen) return
    const el = reasoningRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [reasoning, isOpen])

  const isThinkingLive = streaming && !hasAnswer

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20">
      <button
        aria-controls={detailsId}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <ChevronDownIcon
          className={cn(
            "size-3 shrink-0 transition-transform",
            !isOpen && "-rotate-90"
          )}
        />
        <span>{isThinkingLive ? "Thinking..." : "Thinking"}</span>
        {isThinkingLive ? (
          <Loader2Icon className="size-3 shrink-0 animate-spin text-muted-foreground/70" />
        ) : null}
      </button>
      <div
        id={detailsId}
        hidden={!isOpen}
        ref={reasoningRef}
        className="max-h-[180px] overflow-y-auto border-t border-border/50 px-3 py-2 text-xs leading-6 whitespace-pre-wrap text-muted-foreground"
      >
        {reasoning}
      </div>
    </div>
  )
}

export function AIMessageList({
  messages,
  isLoadingConversation,
  emptyHint,
}: {
  messages: RevserpAIMessage[]
  isLoadingConversation: boolean
  emptyHint: string
}) {
  if (isLoadingConversation) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-xl">
          <CompileLoader size={20} />
          <span className="text-muted-foreground">Loading conversation...</span>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <div className="mx-auto flex size-11 items-center justify-center rounded-2xl border border-border bg-card shadow-xl">
            <SparklesIcon className="size-5" />
          </div>
          <h2 className="pt-4 text-xl font-medium tracking-[-0.04em]">
            How can I help?
          </h2>
          <p className="mx-auto max-w-md pt-2 text-sm leading-6 text-muted-foreground">
            {emptyHint}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-4">
      {messages.map((message, messageIndex) => (
        <div
          key={message.id ?? `${message.role}-${messageIndex}`}
          className={cn(
            "flex",
            message.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          {message.role === "user" ? (
            <div className="max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm leading-6 text-primary-foreground shadow-md">
              <MarkdownMessage content={message.content} />
            </div>
          ) : (
            <article className="w-full text-sm leading-6 text-foreground">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                  <BotIcon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  {message.reasoning ? (
                    <ThinkingBlock
                      reasoning={message.reasoning}
                      streaming={Boolean(message.streaming)}
                      hasAnswer={Boolean(message.content)}
                    />
                  ) : null}

                  {message.toolCalls?.length ? (
                    <div className="space-y-1.5">
                      {message.toolCalls.map((toolCall) => (
                        <ToolCallRow key={toolCall.id} toolCall={toolCall} />
                      ))}
                    </div>
                  ) : null}

                  {message.streaming && !message.content ? (
                    <div
                      aria-atomic="true"
                      aria-live="polite"
                      className="flex min-h-7 items-center gap-2 text-sm text-muted-foreground"
                      role="status"
                    >
                      <CompileLoader size={16} />
                      <span>Generating response…</span>
                    </div>
                  ) : (
                    <MarkdownMessage content={message.content} />
                  )}
                </div>
              </div>
            </article>
          )}
        </div>
      ))}
    </div>
  )
}
