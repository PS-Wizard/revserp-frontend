import { describe, expect, test } from "bun:test"
import type { CMSApproval } from "~/lib/api.types"
import {
  approvalArgsPreview,
  approvalConnectionLabel,
  approvalTargetLabel,
  approvalToolLabel,
  pendingApprovalsForTurn,
} from "./mcp-approval-copy"

function approval(overrides: Partial<CMSApproval> = {}): CMSApproval {
  return {
    id: "approval-1",
    turn_id: "turn-1",
    tool_call_id: "call-1",
    tool_name: "mcp_abc123_update_post",
    connection_id: "conn-1",
    connection_name: "WordPress",
    remote_tool_name: "update_post",
    service: "wordpress",
    target: "post/1",
    before: "",
    after: "hello",
    status: "pending",
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("pendingApprovalsForTurn", () => {
  test("only pending cards show while the turn is active", () => {
    const approvals = [
      approval(),
      approval({ id: "approval-2", status: "approved" }),
    ]
    expect(pendingApprovalsForTurn(approvals, true).map((a) => a.id)).toEqual([
      "approval-1",
    ])
    expect(pendingApprovalsForTurn(approvals, false)).toEqual([])
  })
})

describe("approval labels", () => {
  test("connection name wins, service is the fallback", () => {
    expect(approvalConnectionLabel(approval())).toBe("WordPress")
    expect(
      approvalConnectionLabel(approval({ connection_name: undefined }))
    ).toBe("WordPress")
    expect(
      approvalConnectionLabel(
        approval({ connection_name: "  ", service: "custom" })
      )
    ).toBe("Custom")
    expect(
      approvalConnectionLabel(
        approval({ connection_name: undefined, service: undefined, provider: undefined })
      )
    ).toBe("MCP")
  })

  test("exact remote tool name is humanized without guessed prefixes", () => {
    expect(approvalToolLabel("update_post")).toBe("Update post")
    expect(approvalToolLabel("wp-publish-content")).toBe("Wp publish content")
    expect(approvalToolLabel("")).toBe("Run this tool")
  })

  test("long targets are hidden rather than truncated mid-word", () => {
    expect(approvalTargetLabel("post/1")).toBe("post/1")
    expect(approvalTargetLabel("x".repeat(200))).toBe("")
  })

  test("args preview is bounded JSON", () => {
    expect(approvalArgsPreview(undefined)).toBe("")
    expect(approvalArgsPreview({ id: 1 })).toBe('{"id":1}')
    const preview = approvalArgsPreview({ body: "x".repeat(2000) })
    expect(preview.length <= 501).toBe(true)
  })
})
