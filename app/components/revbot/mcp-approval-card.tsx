"use client"

import { Loader2Icon, LockIcon, ShieldCheckIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import type { CMSApproval } from "~/lib/api.types"

import {
  approvalConnectionLabel,
  approvalTargetLabel,
  approvalToolLabel,
  type MCPApprovalDecision,
} from "./mcp-approval-copy"

export type { MCPApprovalDecision }

/** Inline approval card for one pending MCP tool call. Plain untrusted text only.
 * `isOrganizationOwner` gates Always allow: that decision also saves a shared
 * project tool rule, which the server accepts from the organization owner only. */
export function MCPApprovalCard({
  approval,
  deciding,
  decisionError,
  isOrganizationOwner,
  onDecide,
}: {
  approval: CMSApproval
  deciding: MCPApprovalDecision | null
  decisionError: string | null
  isOrganizationOwner: boolean
  onDecide: (decision: MCPApprovalDecision) => void
}) {
  const busy = deciding !== null
  const tool = approvalToolLabel(
    approval.remote_tool_name ?? approval.tool_name
  )
  const connection = approvalConnectionLabel(approval)
  const target = approvalTargetLabel(approval.target ?? "")

  return (
    <Card
      aria-label={`Allow Revbot to ${tool} on ${connection}?`}
      className="mt-3 w-full max-w-[28rem] gap-3 p-3 sm:max-w-[28rem] sm:p-4"
      size="sm"
    >
      <div className="flex items-start gap-2">
        <ShieldCheckIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-pretty">
            Allow Revbot to {tool}?
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {target ? `${connection} · ${target}` : connection}
          </p>
        </div>
      </div>
      {decisionError ? (
        <p className="text-xs leading-relaxed text-destructive" role="alert">
          {decisionError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          onClick={() => onDecide("reject")}
          size="sm"
          type="button"
          variant="outline"
        >
          {deciding === "reject" ? (
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : null}
          {deciding === "reject" ? "Denying…" : "Deny once"}
        </Button>
        <Button
          disabled={busy}
          onClick={() => onDecide("approve")}
          size="sm"
          type="button"
        >
          {deciding === "approve" ? (
            <Loader2Icon
              aria-hidden="true"
              className="animate-spin"
              data-icon="inline-start"
            />
          ) : null}
          {deciding === "approve" ? "Allowing…" : "Allow once"}
        </Button>
        {isOrganizationOwner ? (
          <Button
            disabled={busy}
            onClick={() => onDecide("always_allow")}
            size="sm"
            type="button"
            variant="secondary"
          >
            {deciding === "always_allow" ? (
              <Loader2Icon
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : null}
            {deciding === "always_allow" ? "Saving…" : "Always allow"}
          </Button>
        ) : null}
      </div>
      {isOrganizationOwner ? null : (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-pretty text-muted-foreground">
          <LockIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Always allow changes shared settings for everyone in this project, so
          only the organization owner can use it.
        </p>
      )}
    </Card>
  )
}
