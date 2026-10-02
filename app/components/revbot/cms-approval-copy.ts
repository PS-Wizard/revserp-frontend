import type { CMSApproval } from "~/lib/api.types"

/** Backend decision vocabulary. The card shows Allow/Deny; the wire keeps it. */
export type CMSApprovalDecision = "approve" | "reject"

const PROVIDER_LABELS: Record<string, string> = {
  wordpress: "WordPress",
  rune: "Rune CMS",
}

const MAX_APPROVAL_TARGET_LENGTH = 80

export function pendingApprovalsForTurn(
  approvals: CMSApproval[],
  turnIsActive: boolean
): CMSApproval[] {
  if (!turnIsActive) return []
  return approvals
    .filter((approval) => approval.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export function approvalProviderLabel(provider: CMSApproval["provider"]) {
  return PROVIDER_LABELS[provider] ?? "CMS"
}

/** "wp__publish_content" -> "Publish content". */
export function approvalActionLabel(toolName: string) {
  const words = toolName
    .replace(/^(cms|wp)__/, "")
    .split("_")
    .filter(Boolean)
  if (words.length === 0) return "Make this CMS change"
  const text = words.join(" ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function approvalTargetLabel(target: string) {
  const text = target.replace(/\s+/g, " ").trim()
  return text.length > 0 && text.length <= MAX_APPROVAL_TARGET_LENGTH ? text : ""
}
