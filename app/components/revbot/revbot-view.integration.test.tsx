import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import { RevbotViewContent } from "./revbot-view"
import type { RevbotHandle } from "./use-revbot"
import type {
  AITurnMessageResponse,
  CMSApproval,
  ProjectResponse,
} from "~/lib/api.types"

installRevbotDom()

const T = "2024-01-01T00:00:00Z"
const PROJECT: ProjectResponse = {
  id: "p-1",
  organization_id: "o-1",
  name: "P",
  base_url: "https://example.com",
}

function assistantMessage(content: string): AITurnMessageResponse {
  return {
    id: "a-1",
    role: "assistant",
    status: "partial",
    content,
    created_at: T,
    updated_at: T,
  }
}

function pendingApproval(): CMSApproval {
  return {
    id: "ap-1",
    turn_id: "t-1",
    tool_call_id: "call-1",
    tool_name: "mcp_abc_update_post",
    connection_id: "conn-1",
    connection_name: "WordPress",
    remote_tool_name: "update_post",
    service: "wordpress",
    target: "post/1",
    before: "",
    after: "",
    status: "pending",
    created_at: T,
  }
}

function fakeHandle(overrides: {
  messages: AITurnMessageResponse[]
  status: "running" | "waiting_for_user"
  waitingForApproval: boolean
}): RevbotHandle {
  const noop = () => {}
  return {
    activityStartedAt: null,
    conversationActive: () => false,
    conversationId: "c-1",
    conversations: [],
    deleteConversation: () => Promise.resolve(),
    effort: "none",
    loading: false,
    messages: overrides.messages,
    newChat: noop,
    phase: null,
    retry: noop,
    selectConversation: () => Promise.resolve(),
    send: () => Promise.resolve(),
    setEffort: noop,
    status: overrides.status,
    stopping: false,
    stop: () => Promise.resolve(),
    toolCalls: [],
    approvals: [pendingApproval()],
    decidingApproval: null,
    approvalDecisionErrors: {},
    decideApproval: () => Promise.resolve(),
    waitingForApproval: overrides.waitingForApproval,
  } as unknown as RevbotHandle
}

function userMessage(): AITurnMessageResponse {
  return {
    id: "u-1",
    role: "user",
    status: "complete",
    content: "hi",
    created_at: T,
    updated_at: T,
  }
}

async function mountView(handle: RevbotHandle, isOrganizationOwner = true) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <RevbotViewContent
        activeProject={PROJECT}
        allowedEfforts={["none"]}
        revbot={handle}
        compact
        defaultHistoryOpen={false}
        hideCompactHeader
        hideHistory
        isOrganizationOwner={isOrganizationOwner}
        showMic={false}
        variant="default"
      />
    )
    await flushRevbot()
  })
  return { root, container }
}

async function rerenderView(
  root: Root,
  container: HTMLDivElement,
  handle: RevbotHandle,
  isOrganizationOwner = true
) {
  await act(async () => {
    root.render(
      <RevbotViewContent
        activeProject={PROJECT}
        allowedEfforts={["none"]}
        revbot={handle}
        compact
        defaultHistoryOpen={false}
        hideCompactHeader
        hideHistory
        isOrganizationOwner={isOrganizationOwner}
        showMic={false}
        variant="default"
      />
    )
    await flushRevbot()
  })
  return container.textContent ?? ""
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("RevbotViewContent approval renderer", () => {
  test("waiting keeps the live renderer with the full backlog and the approval card", async () => {
    const { root, container } = await mountView(
      fakeHandle({
        messages: [userMessage(), assistantMessage("Hello world")],
        status: "waiting_for_user",
        waitingForApproval: true,
      })
    )
    try {
      const text = container.textContent ?? ""
      expect(text).toContain("Hello world")
      expect(container.innerHTML).toContain("revbot-stream-word")
      expect(text).toContain("Deny once")
      expect(text).toContain("Allow once")
      expect(text).toContain("Always allow")

      const rerendered = await rerenderView(
        root,
        container,
        fakeHandle({
          messages: [userMessage(), assistantMessage("Hello world")],
          status: "running",
          waitingForApproval: false,
        })
      )
      expect(rerendered).toContain("Hello world")
      expect(container.innerHTML).toContain("revbot-stream-word")
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })

  test("only the new live tail animates after approval", async () => {
    const { root, container } = await mountView(
      fakeHandle({
        messages: [userMessage(), assistantMessage("Hello world")],
        status: "waiting_for_user",
        waitingForApproval: true,
      })
    )
    try {
      expect(container.textContent ?? "").toContain("Hello world")

      const withTail = await rerenderView(
        root,
        container,
        fakeHandle({
          messages: [userMessage(), assistantMessage("Hello world and more")],
          status: "running",
          waitingForApproval: false,
        })
      )
      expect(withTail).toContain("Hello world")
      expect(withTail).toContain("and")

      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 900)
        })
      })
      expect(container.textContent ?? "").toContain("Hello world and more")
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })
})

describe("MCPApprovalCard always allow owner gate", () => {
  const DECISION_LABELS = ["Deny once", "Allow once", "Always allow"]

  function approvalActions(container: ParentNode) {
    return [...container.querySelectorAll("button")]
      .map((button) => button.textContent?.trim() ?? "")
      .filter((label) => DECISION_LABELS.includes(label))
  }

  function waitingHandle() {
    return fakeHandle({
      messages: [userMessage(), assistantMessage("Hello world")],
      status: "waiting_for_user",
      waitingForApproval: true,
    })
  }

  test("approval cards ask without showing raw tool arguments", async () => {
    const handle = waitingHandle()
    handle.approvals = [
      {
        ...pendingApproval(),
        proposed_args: { query: "hidden-argument-value", limit: 30 },
      },
    ]
    const { root, container } = await mountView(handle, true)
    try {
      expect(container.textContent ?? "").toContain("Allow Revbot to Update post?")
      expect(container.textContent ?? "").toContain("WordPress")
      expect((container.textContent ?? "").includes("hidden-argument-value")).toBe(
        false
      )
      expect(approvalActions(container)).toEqual(DECISION_LABELS)
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })

  test("an organization owner gets all three decisions", async () => {
    const { root, container } = await mountView(waitingHandle(), true)
    try {
      expect(approvalActions(container)).toEqual([
        "Deny once",
        "Allow once",
        "Always allow",
      ])
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })

  test("a non-owner keeps once-only decisions and sees why", async () => {
    const { root, container } = await mountView(waitingHandle(), false)
    try {
      expect(approvalActions(container)).toEqual(["Deny once", "Allow once"])
      expect(container.textContent ?? "").toContain(
        "only the organization owner can use it"
      )
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })
})
