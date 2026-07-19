import type {
  AIConversationSummary,
  AIDockMessage,
} from "~/lib/api.types"

export type AiConversationGroup = {
  label: string
  conversations: AIConversationSummary[]
}

function formatConversationDate(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatConversationTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function groupConversationsByDate(
  conversations: AIConversationSummary[]
): AiConversationGroup[] {
  const groups: AiConversationGroup[] = []
  const groupByLabel = new Map<string, AIConversationSummary[]>()

  for (const conversation of conversations) {
    const label = formatConversationDate(conversation.updated_at)
    const group = groupByLabel.get(label)
    if (group) {
      group.push(conversation)
      continue
    }

    const conversationsForDate = [conversation]
    groupByLabel.set(label, conversationsForDate)
    groups.push({ label, conversations: conversationsForDate })
  }

  return groups
}

export type ToolCallInfo = {
  id: string
  name: string
  args?: string
  summary?: string
  status: "running" | "done" | "error"
}

export type RevserpAIMessage = {
  id?: string
  role: "user" | "assistant"
  content: string
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  streaming?: boolean
}

// Folds backend `role: "tool"` rows into the preceding assistant message's
// toolCalls (matched by tool_call_id), so the UI model stays a clean
// user/assistant alternation.
export function messagesFromResponses(
  messages: AIDockMessage[]
): RevserpAIMessage[] {
  const result: RevserpAIMessage[] = []

  for (const message of messages) {
    if (message.role === "tool") {
      const assistantMessage = result[result.length - 1]
      const toolCall = assistantMessage?.toolCalls?.find(
        (call) => call.id === message.tool_call_id
      )
      if (toolCall) {
        toolCall.summary = message.content
        toolCall.status = "done"
      }
      continue
    }

    result.push({
      id: message.id,
      role: message.role,
      content: message.content,
      reasoning: message.reasoning_content,
      toolCalls: message.tool_calls?.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        // The server persists tool_calls[].args as an inline JSON object, so
        // normalize to a string here exactly as the live tool_call frame does.
        args:
          typeof toolCall.args === "string"
            ? toolCall.args
            : toolCall.args != null
              ? JSON.stringify(toolCall.args)
              : undefined,
        status: "done" as const,
      })),
    })
  }

  return result
}

export function upsertConversation(
  conversations: AIConversationSummary[],
  conversation: AIConversationSummary
) {
  return [
    conversation,
    ...conversations.filter((item) => item.id !== conversation.id),
  ]
}
