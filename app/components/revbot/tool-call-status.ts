import type { AIToolCallStatus } from "~/lib/api.types"

export type ToolOutcome = "running" | "failed" | "partial" | "success"

const VALID_TOOL_STATUSES: ReadonlySet<string> = new Set([
  "running",
  "completed",
  "failed",
  "awaiting",
])

export function normalizeToolCallStatus(status: unknown): AIToolCallStatus {
  if (typeof status === "string" && VALID_TOOL_STATUSES.has(status)) {
    return status as AIToolCallStatus
  }
  return "completed"
}

export function resolveToolOutcome(call: {
  status: AIToolCallStatus
  summary: string | null
  name: string
}): ToolOutcome {
  if (call.status === "running" || call.status === "awaiting") return "running"
  if (call.status === "failed") return "failed"

  const summary = call.summary?.trim() ?? ""
  if (!summary) return "partial"

  if (call.name === "read_issues") {
    const match = summary.match(/^(\d+)\s+issues?\s+shown\b/i)
    if (match && Number(match[1]) === 0) return "partial"
  }

  return "success"
}
