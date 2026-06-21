import { Loader2Icon, SendIcon } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
} from "~/lib/api.types"
import { ScopeBreadcrumb } from "~/components/revserp-ai-view/scope-breadcrumb"

export function Composer({
  prompt,
  canSend,
  isSending,
  errorMessage,
  activeConversationTitle,
  onPromptChange,
  onSubmit,
  onKeyDown,
  onTextareaInput,
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
  textareaRef,
}: {
  prompt: string
  canSend: boolean
  isSending: boolean
  errorMessage: string
  activeConversationTitle: string | undefined
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onTextareaInput: () => void
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
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className="mx-auto w-full max-w-6xl shrink-0">
      {errorMessage ? (
        <p className="mx-auto mb-2 max-w-3xl rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="rounded-[1.15rem] border border-border bg-card/95 px-2 py-1.5 shadow-[0_18px_56px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
        <div className="flex min-w-0 items-center justify-between gap-2 px-1.5 py-1">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {activeConversationTitle || "New chat"}
          </span>
        </div>
        <ScopeBreadcrumb
          availableIssueTypes={availableIssueTypes}
          bucketLabel={bucketLabel}
          issueTypeLabel={issueTypeLabel}
          onSelectAllIssueTypes={onSelectAllIssueTypes}
          onSelectPillar={onSelectPillar}
          onToggleBucket={onToggleBucket}
          onToggleIssueType={onToggleIssueType}
          selectedBucketIds={selectedBucketIds}
          selectedIssueTypeIds={selectedIssueTypeIds}
          selectedPillar={selectedPillar}
          selectedPillarId={selectedPillarId}
          selectedPillarBuckets={selectedPillarBuckets}
          pillars={pillars}
        />

        <div className="flex items-end gap-2 px-1.5 pt-0.5 pb-1">
          <Textarea
            ref={textareaRef}
            className="max-h-[22vh] min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-6 shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            onChange={(event) => onPromptChange(event.currentTarget.value)}
            onInput={onTextareaInput}
            onKeyDown={onKeyDown}
            placeholder="Ask Revserp to fix, rewrite, prioritize, or explain this context..."
            rows={1}
            value={prompt}
          />

          <Button
            aria-label="Send prompt"
            className="mb-0.5 size-8 rounded-full"
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
