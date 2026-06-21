import { Loader2Icon, SendIcon } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
} from "~/lib/api.types"
import { ContextDropdown } from "~/components/revserp-ai-view/context-dropdown"

export function Composer({
  prompt,
  canSend,
  isSending,
  errorMessage,
  onPromptChange,
  onSubmit,
  onKeyDown,
  onTextareaInput,
  pillars,
  selectedPillar,
  selectedPillarId,
  selectedPillarBuckets,
  selectedIssueTypeIds,
  issueTypeLabel,
  onSelectPillar,
  onToggleIssueType,
  onSelectAllIssueTypes,
  textareaRef,
}: {
  prompt: string
  canSend: boolean
  isSending: boolean
  errorMessage: string
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onTextareaInput: () => void
  pillars: ScoreBreakdownPillarResponse[]
  selectedPillar: ScoreBreakdownPillarResponse | null
  selectedPillarId: string
  selectedPillarBuckets: ScoreBreakdownBucketResponse[]
  selectedIssueTypeIds: string[]
  issueTypeLabel: string
  onSelectPillar: (pillar: ScoreBreakdownPillarResponse) => void
  onToggleIssueType: (issueType: ScoreBreakdownIssueTypeResponse) => void
  onSelectAllIssueTypes: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className="mx-auto w-full max-w-4xl shrink-0">
      {errorMessage ? (
        <p className="mx-auto mb-2 max-w-3xl rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="rounded-2xl border border-border/60 bg-neutral-900">
        <Textarea
          ref={textareaRef}
          className="max-h-[22vh] min-h-[56px] resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-base leading-7 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          onInput={onTextareaInput}
          onKeyDown={onKeyDown}
          placeholder="Ask Revserp to fix, rewrite, prioritize, or explain this context..."
          rows={1}
          value={prompt}
        />

        <div className="flex items-center gap-2 px-3 pb-2">
          <ContextDropdown
            issueTypeLabel={issueTypeLabel}
            onSelectAllIssueTypes={onSelectAllIssueTypes}
            onSelectPillar={onSelectPillar}
            onToggleIssueType={onToggleIssueType}
            pillars={pillars}
            selectedIssueTypeIds={selectedIssueTypeIds}
            selectedPillar={selectedPillar}
            selectedPillarBuckets={selectedPillarBuckets}
            selectedPillarId={selectedPillarId}
          />

          <Button
            aria-label="Send prompt"
            className="mb-0.5 ml-auto size-9 rounded-full"
            disabled={!canSend}
            onClick={() => void onSubmit()}
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
  )
}
