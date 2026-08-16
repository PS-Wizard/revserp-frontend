import { SearchIcon } from "lucide-react"

import { Input } from "~/components/ui/input"
import type { AIConversationResponse } from "~/lib/api.types"
import { cn } from "~/lib/utils"

export function filterConversations(
  conversations: AIConversationResponse[],
  query: string
) {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return conversations
  return conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(trimmed)
  )
}

type RevbotConversationSearchInputProps = {
  value: string
  onChange: (value: string) => void
  isDark?: boolean
  className?: string
  autoFocus?: boolean
  /** Stops the parent menu from stealing focus / closing on pointer down. */
  inDropdown?: boolean
}

export function RevbotConversationSearchInput({
  value,
  onChange,
  isDark = false,
  className,
  autoFocus = false,
  inDropdown = false,
}: RevbotConversationSearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label="Search conversations"
        autoFocus={autoFocus}
        className={cn(
          "h-8 pl-8 text-xs",
          isDark && "border-white/10 bg-white/5 placeholder:text-white/35"
        )}
        onChange={(event) => onChange(event.target.value)}
        onClick={inDropdown ? (event) => event.stopPropagation() : undefined}
        onKeyDown={
          inDropdown ? (event) => event.stopPropagation() : undefined
        }
        onPointerDown={
          inDropdown ? (event) => event.stopPropagation() : undefined
        }
        placeholder="Search conversations…"
        value={value}
      />
    </div>
  )
}
