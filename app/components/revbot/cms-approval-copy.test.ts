import { describe, expect, test } from "bun:test"
import type { CMSApproval } from "~/lib/api.types"

import {
  approvalActionLabel,
  approvalProviderLabel,
  approvalTargetLabel,
  pendingApprovalsForTurn,
} from "./cms-approval-copy"

function approval(overrides: Partial<CMSApproval> = {}): CMSApproval {
  return {
    id: "approval-1",
    turn_id: "turn-1",
    tool_call_id: "call-1",
    tool_name: "wp__publish_content",
    provider: "wordpress",
    target: "posts/landing-page",
    before: "",
    after: "body",
    status: "pending",
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("pendingApprovalsForTurn", () => {
  test("shows the pending card of a live turn", () => {
    const visible = pendingApprovalsForTurn([approval()], true)
    expect(visible).toHaveLength(1)
  })

  test("shows nothing once every approval is resolved", () => {
    const resolved = [
      approval({ id: "a", status: "approved" }),
      approval({ id: "b", status: "executing" }),
      approval({ id: "c", status: "completed" }),
      approval({ id: "d", status: "rejected" }),
      approval({ id: "e", status: "invalidated" }),
      approval({ id: "f", status: "failed" }),
    ]
    expect(pendingApprovalsForTurn(resolved, true)).toHaveLength(0)
  })

  test("a completed conversation renders no card, even from a stale pending fetch", () => {
    expect(pendingApprovalsForTurn([approval()], false)).toHaveLength(0)
  })

  test("a reloaded waiting conversation still shows its pending card", () => {
    const reloaded = pendingApprovalsForTurn(
      [
        approval({ id: "old", status: "completed" }),
        approval({ id: "live", created_at: "2024-01-02T00:00:00Z" }),
      ],
      true
    )
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0]?.id).toBe("live")
  })

  test("a failed decision leaves the pending card in place", () => {
    // A failed decision never changes the card status, so the card stays.
    const afterFailure = [approval()]
    expect(pendingApprovalsForTurn(afterFailure, true)).toHaveLength(1)
  })
})

describe("approval labels", () => {
  test("strips the cms__ and wp__ namespaces", () => {
    expect(approvalActionLabel("cms__create_record")).toBe("Create record")
    expect(approvalActionLabel("wp__publish_content")).toBe("Publish content")
    expect(approvalActionLabel("update_post")).toBe("Update post")
  })

  test("names the provider in human words", () => {
    expect(approvalProviderLabel("wordpress")).toBe("WordPress")
    expect(approvalProviderLabel("rune")).toBe("Rune CMS")
  })

  test("keeps only a short plain-text target", () => {
    expect(approvalTargetLabel("posts/landing-page")).toBe("posts/landing-page")
    expect(approvalTargetLabel("  posts\n  landing  ")).toBe("posts landing")
    expect(approvalTargetLabel("")).toBe("")
    expect(approvalTargetLabel("x".repeat(200))).toBe("")
  })
})
