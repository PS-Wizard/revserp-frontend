import { SendIcon, SquareIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"

export function AIComposer({
  prompt,
  canSend,
  isSending,
  errorMessage,
  onPromptChange,
  onSubmit,
  onStop,
}: {
  prompt: string
  canSend: boolean
  isSending: boolean
  errorMessage: string
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return
    event.preventDefault()
    onSubmit()
  }

  return (
    <div className="shrink-0 px-3 pb-3">
      {errorMessage ? (
        <p
          aria-live="assertive"
          className="mb-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/40 p-1.5">
        <Textarea
          className="max-h-40 min-h-9 w-full min-w-0 flex-1 resize-none border-0 bg-transparent px-2.5 py-1.5 text-sm leading-6 break-words shadow-none outline-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Revserp AI…"
          rows={1}
          value={prompt}
        />
        {isSending ? (
          <Button
            aria-label="Stop generating"
            className="size-8 shrink-0 rounded-full"
            onClick={onStop}
            size="icon"
            variant="secondary"
          >
            <SquareIcon className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            aria-label="Send message"
            className="size-8 shrink-0 rounded-full"
            disabled={!canSend}
            onClick={onSubmit}
            size="icon"
          >
            <SendIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
