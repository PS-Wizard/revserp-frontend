import { PlusIcon, TrashIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  formatConversationTime,
  groupConversationsByDate,
} from "~/lib/ai-conversation"
import type { AIConversationSummary } from "~/lib/api.types"
import { cn } from "~/lib/utils"

export function ConversationHistory({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  onDelete,
}: {
  conversations: AIConversationSummary[]
  activeConversationId: string | null
  onSelect: (conversationId: string) => void
  onNewChat: () => void
  onDelete: (conversationId: string) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 p-2">
        <Button
          className="w-full justify-start gap-2"
          onClick={onNewChat}
          size="sm"
          variant="outline"
        >
          <PlusIcon className="size-4" />
          New chat
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No saved chats yet
          </p>
        ) : (
          groupConversationsByDate(conversations).map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {group.label}
              </div>
              {group.conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "group/conv flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    conversation.id === activeConversationId && "bg-accent"
                  )}
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onSelect(conversation.id)}
                    type="button"
                  >
                    <div className="truncate">
                      {conversation.title || "Untitled chat"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatConversationTime(conversation.updated_at)}
                    </div>
                  </button>
                  <Button
                    aria-label="Delete chat"
                    className="size-7 shrink-0 opacity-0 transition-opacity group-hover/conv:opacity-100"
                    onClick={() => onDelete(conversation.id)}
                    size="icon"
                    variant="ghost"
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
