"use client"

import { Loader2Icon, ShieldCheckIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import type { CMSApproval } from "~/lib/api.types"

import {
  approvalActionLabel,
  approvalProviderLabel,
  approvalTargetLabel,
  type CMSApprovalDecision,
} from "./cms-approval-copy"

export type { CMSApprovalDecision }

/** Inline permission card for one pending CMS write. Plain untrusted text only,
 * never HTML: the operator authorizes a proposed action, nothing more. */
export function CMSApprovalCard({
  approval,
  deciding,
  decisionError,
  onDecide,
}: {
  approval: CMSApproval
  deciding: CMSApprovalDecision | null
  decisionError: string | null
  onDecide: (decision: CMSApprovalDecision) => void
}) {
  const busy = deciding !== null
  const action = approvalActionLabel(approval.tool_name)
  const provider = approvalProviderLabel(approval.provider)
  const target = approvalTargetLabel(approval.target ?? "")

  return (
    <Card
      aria-label={`Allow Revbot to ${action.toLowerCase()} in ${provider}?`}
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
            Allow Revbot to {action.toLowerCase()}?
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {target ? `${provider} · ${target}` : provider}
          </p>
        </div>
      </div>
      {decisionError ? (
        <p className="text-xs leading-relaxed text-destructive" role="alert">
          {decisionError}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
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
          {deciding === "approve" ? "Allowing…" : "Allow"}
        </Button>
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
          {deciding === "reject" ? "Denying…" : "Deny"}
        </Button>
      </div>
    </Card>
  )
}
