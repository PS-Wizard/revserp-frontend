"use client"

import { useState } from "react"
import { Loader2Icon, PlusIcon, TrashIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { TabsTrigger } from "~/components/ui/tabs"
import { clientApiDelete, clientApiFetch } from "~/lib/api"
import type {
  AIConversationResponse,
  AIConversationsResponse,
} from "~/lib/api.types"
import {
  formatConversationTime,
  groupConversationsByDate,
} from "~/lib/ai-conversation"

import type { DashboardView } from "./types"

type AiConversationsPopoverProps = {
  activeProjectId?: string | null
  onViewChange: (value: DashboardView) => void
  onSelectConversation?: (conversationId: string) => void
  onDeleteConversation?: (conversationId: string) => void
}

export function AiConversationsPopover({
  activeProjectId,
  onViewChange,
  onSelectConversation,
  onDeleteConversation,
}: AiConversationsPopoverProps) {
  const [aiConversations, setAiConversations] = useState<
    AIConversationResponse[]
  >([])
  const [isLoadingAiConversations, setIsLoadingAiConversations] =
    useState(false)
  const [isAiChatMenuOpen, setIsAiChatMenuOpen] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState<
    string | null
  >(null)

  async function fetchAiConversations() {
    if (!activeProjectId) return
    setIsLoadingAiConversations(true)
    try {
      const response = await clientApiFetch<AIConversationsResponse>(
        `/projects/${activeProjectId}/ai/conversations`
      )
      setAiConversations(response.conversations)
    } catch (error) {
      console.error("Failed to fetch AI conversations:", error)
      setAiConversations([])
    } finally {
      setIsLoadingAiConversations(false)
    }
  }

  function handleMouseEnter() {
    setIsAiChatMenuOpen(true)
    void fetchAiConversations()
  }

  function handleMouseLeave() {
    setIsAiChatMenuOpen(false)
  }

  function handleConversationSelect(conversationId: string) {
    setIsAiChatMenuOpen(false)
    onSelectConversation?.(conversationId)
    onViewChange("revserp-ai")
  }

  async function handleDeleteConversation(conversationId: string) {
    if (deletingConversationId) return

    setDeletingConversationId(conversationId)
    try {
      await clientApiDelete<null>(`/ai/conversations/${conversationId}`)
      setAiConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId)
      )
      onDeleteConversation?.(conversationId)
    } catch (error) {
      console.error("Failed to delete AI conversation:", error)
    } finally {
      setDeletingConversationId(null)
    }
  }

  return (
    <DropdownMenu open={isAiChatMenuOpen} onOpenChange={setIsAiChatMenuOpen}>
      <DropdownMenuTrigger
        render={
          <TabsTrigger
            value="revserp-ai"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={() => {
              onViewChange("revserp-ai")
              if (aiConversations.length > 0) {
                onSelectConversation?.(aiConversations[0].id)
              }
            }}
          />
        }
      >
        Revserp AI
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-96 w-80 overflow-y-auto rounded-2xl p-1.5"
        onMouseEnter={() => setIsAiChatMenuOpen(true)}
        onMouseLeave={handleMouseLeave}
      >
        <DropdownMenuItem
          onClick={() => {
            setIsAiChatMenuOpen(false)
            onViewChange("revserp-ai")
          }}
        >
          <PlusIcon className="size-4" />
          New chat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isLoadingAiConversations ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            Loading chats...
          </div>
        ) : aiConversations.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No saved chats yet
          </div>
        ) : (
          groupConversationsByDate(aiConversations).map((group) => (
            <DropdownMenuGroup key={group.label}>
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {group.conversations.map((conv) => (
                <button
                  key={conv.id}
                  className="group/conv flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => handleConversationSelect(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleConversationSelect(conv.id)
                    }
                  }}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      {conv.title || "Untitled chat"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatConversationTime(conv.updated_at)}
                    </div>
                  </div>
                  <Button
                    aria-label="Delete chat"
                    className="size-7 shrink-0 opacity-0 transition-opacity group-hover/conv:opacity-100"
                    disabled={deletingConversationId === conv.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleDeleteConversation(conv.id)
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    {deletingConversationId === conv.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <TrashIcon className="size-4" />
                    )}
                  </Button>
                </button>
              ))}
            </DropdownMenuGroup>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
