import type { CMSApproval } from "~/lib/api.types"

/** Chat approval actions. allow and deny decide once, always_allow also saves the tool rule. */
export type MCPApprovalDecision = "approve" | "reject" | "always_allow"

const SERVICE_LABELS: Record<string, string> = {
  wordpress: "WordPress",
  custom: "Custom",
}

const MAX_APPROVAL_TARGET_LENGTH = 80
const MAX_APPROVAL_ARGS_LENGTH = 500

export function pendingApprovalsForTurn(
  approvals: CMSApproval[],
  turnIsActive: boolean
): CMSApproval[] {
  if (!turnIsActive) return []
  return approvals
    .filter((approval) => approval.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export function approvalConnectionLabel(approval: CMSApproval) {
  if (approval.connection_name?.trim()) return approval.connection_name.trim()
  const service = approval.service ?? approval.provider ?? ""
  return SERVICE_LABELS[service] ?? "MCP"
}

/** Exact remote tool name, humanized for display. Never a guessed prefix. */
export function approvalToolLabel(toolName: string) {
  const words = toolName.split(/[-_\s:]+/).filter(Boolean)
  if (words.length === 0) return "Run this tool"
  const text = words.join(" ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function approvalTargetLabel(target: string) {
  const text = target.replace(/\s+/g, " ").trim()
  return text.length > 0 && text.length <= MAX_APPROVAL_TARGET_LENGTH
    ? text
    : ""
}

/** Bounded JSON preview of the exact proposed args. Plain text, never HTML. */
export function approvalArgsPreview(args: Record<string, unknown> | undefined) {
  if (!args) return ""
  let text: string
  try {
    text = JSON.stringify(args)
  } catch {
    return ""
  }
  if (text.length <= MAX_APPROVAL_ARGS_LENGTH) return text
  return `${text.slice(0, MAX_APPROVAL_ARGS_LENGTH)}…`
}
