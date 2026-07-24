import { BotIcon, SparklesIcon, WrenchIcon } from "lucide-react"

import { ThinkingOrb } from "thinking-orbs"
import { MarkdownMessage } from "~/components/markdown-message"
import type { RevserpAIMessage, ToolCallInfo } from "~/lib/ai-conversation"
import { cn } from "~/lib/utils"
import { ChartMessage } from "./chart-message"

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
  configure_auto_crawl: "Configuring auto-crawl",
  update_business_profile: "Updating business profile",
  export_crawl: "Exporting crawl",
  export_audit: "Exporting audit",
  navigate: "Navigating",
  render_chart: "Rendering chart",
}

function humanizeToolName(name: string) {
  return TOOL_LABELS[name] ?? name
}

// Summary of the backend's page-read guardrail stub. These rows are internal
// noise, so they're hidden from the tool-call list shown to clients.
const HIDDEN_TOOL_SUMMARY = "page-read limit reached"

function isVisibleToolCall(toolCall: ToolCallInfo) {
  return toolCall.summary !== HIDDEN_TOOL_SUMMARY
}

function ToolCallRow({ toolCall }: { toolCall: ToolCallInfo }) {
  const isRunning = toolCall.status === "running"
  if (isRunning) {
    return (
      <div className="flex items-center text-xs" title={toolCall.args}>
        <span className="shrink-0 shimmer">
          {humanizeToolName(toolCall.name)}…
        </span>
      </div>
    )
  }
  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      title={toolCall.args}
    >
      <WrenchIcon className="size-3.5 shrink-0" />
      <span className="shrink-0">{humanizeToolName(toolCall.name)}</span>
      {toolCall.summary ? (
        <span className="min-w-0 truncate text-muted-foreground/70">
          — {toolCall.summary}
        </span>
      ) : null}
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
          <ThinkingOrb
            aria-hidden="true"
            className="shrink-0"
            size={20}
            state="searching"
          />
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
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5 px-3 py-4">
      {messages.map((message, messageIndex) => (
        <div
          key={message.id ?? `${message.role}-${messageIndex}`}
          className={cn(
            "flex",
            message.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          {message.role === "user" ? (
            <div className="max-w-[85%] overflow-hidden rounded-2xl bg-primary px-3.5 py-2 text-sm leading-6 break-words text-primary-foreground shadow-md">
              <MarkdownMessage content={message.content} />
            </div>
          ) : (
            <article className="w-full min-w-0 text-sm leading-6 text-foreground">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
                  {message.streaming ? (
                    <ThinkingOrb
                      aria-hidden="true"
                      size={20}
                      state={message.content ? "composing" : "searching"}
                    />
                  ) : (
                    <BotIcon className="size-3.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  {message.toolCalls?.some(isVisibleToolCall) ? (
                    <div className="space-y-1.5">
                      {message.toolCalls
                        .filter(isVisibleToolCall)
                        .map((toolCall) => (
                          <ToolCallRow key={toolCall.id} toolCall={toolCall} />
                        ))}
                    </div>
                  ) : null}

                  {message.streaming &&
                  !message.content &&
                  !message.toolCalls?.some(isVisibleToolCall) ? (
                    <div
                      aria-atomic="true"
                      aria-live="polite"
                      className="flex min-h-7 items-center text-sm"
                      role="status"
                    >
                      <span className="shimmer">Thinking…</span>
                    </div>
                  ) : null}

                  {message.content ? (
                    <MarkdownMessage content={message.content} />
                  ) : null}

                  {message.charts?.map((chart) => (
                    <ChartMessage key={chart.id} spec={chart} />
                  ))}
                </div>
              </div>
            </article>
          )}
        </div>
      ))}
    </div>
  )
}
