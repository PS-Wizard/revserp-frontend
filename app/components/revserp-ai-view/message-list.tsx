import { BotIcon, CheckIcon, CopyIcon, SparklesIcon } from "lucide-react"
import { CompileLoader } from "~/components/compile-loader"
import { MarkdownMessage } from "~/components/markdown-message"
import { Button } from "~/components/ui/button"
import type { RevserpAIMessage } from "~/lib/ai-conversation"
import { cn } from "~/lib/utils"

export function MessageList({
  messages,
  isLoadingConversation,
  isSending,
  copiedMessageIndex,
  selectedScopeLabel,
  onCopyMessage,
}: {
  messages: RevserpAIMessage[]
  isLoadingConversation: boolean
  isSending: boolean
  copiedMessageIndex: number | null
  selectedScopeLabel: string
  onCopyMessage: (content: string, messageIndex: number) => void
}) {
  if (isLoadingConversation) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-xl">
          <CompileLoader size={22} />
          <span className="text-muted-foreground">
            Loading conversation...
          </span>
        </div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
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
    )
  }

  return (
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
                        void onCopyMessage(message.content, messageIndex)
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
  )
}
