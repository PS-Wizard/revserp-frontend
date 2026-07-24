import type { AIConversationSummary, AIDockMessage } from "~/lib/api.types"

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

export type ChartType = "line" | "bar" | "area" | "pie"

export type ChartSeries = { key: string; label: string }

export type ChartSpec = {
  id: string
  type: ChartType
  title: string
  x_key: string
  series: ChartSeries[]
  data: Record<string, unknown>[]
}

const CHART_TYPES: ChartType[] = ["line", "bar", "area", "pie"]

// normalizeChartSpec validates an untrusted chart object (from a live `chart`
// SSE frame or a persisted render_chart tool row) and stamps it with `id`.
// Returns null on any structural problem so a malformed chart is skipped
// rather than crashing the message list.
export function normalizeChartSpec(raw: unknown, id: string): ChartSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !id) return null
  const value = raw as Record<string, unknown>
  const type = value.type
  if (!CHART_TYPES.includes(type as ChartType)) return null
  if (typeof value.title !== "string" || !value.title.trim()) return null
  if (typeof value.x_key !== "string" || !value.x_key.trim()) return null
  if (!Array.isArray(value.series) || value.series.length === 0) return null
  const series: ChartSeries[] = []
  for (const entry of value.series) {
    if (!entry || typeof entry !== "object") return null
    const { key, label } = entry as Record<string, unknown>
    if (typeof key !== "string" || !key || typeof label !== "string" || !label)
      return null
    series.push({ key, label })
  }
  if (!Array.isArray(value.data) || value.data.length === 0) return null
  return {
    id,
    type: type as ChartType,
    title: value.title,
    x_key: value.x_key,
    series,
    data: value.data as Record<string, unknown>[],
  }
}

export type RevserpAIMessage = {
  id?: string
  role: "user" | "assistant"
  content: string
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  charts?: ChartSpec[]
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
      // render_chart rows persist the chart spec JSON as their content; rebuild
      // the chart from it rather than showing the raw JSON as a tool summary.
      if (message.tool_name === "render_chart") {
        let chart: ChartSpec | null = null
        try {
          chart = normalizeChartSpec(
            JSON.parse(message.content),
            message.tool_call_id ?? message.id
          )
        } catch {
          chart = null
        }
        if (chart && assistantMessage) {
          assistantMessage.charts = [...(assistantMessage.charts ?? []), chart]
        }
        if (toolCall) {
          toolCall.summary = chart ? `Chart: ${chart.title}` : "Chart"
          toolCall.status = "done"
        }
        continue
      }
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
