import { Loader2Icon } from "lucide-react"

export function DataLoadingState({ label }: { label: string }) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-[22rem] items-center justify-center px-6 py-16"
      role="status"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-full border border-border/60 bg-card shadow-sm">
          <Loader2Icon
            aria-hidden="true"
            className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
