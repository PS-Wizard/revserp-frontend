import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import { RevbotViewContent } from "./revbot-view"
import type { RevbotHandle } from "./use-revbot"
import type { RevbotAuditSuggestion } from "./revbot-audit-suggestions"
import type {
  AITurnMessageResponse,
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

const SUGGESTION: RevbotAuditSuggestion = {
  id: "seo:meta-tags",
  crawlId: "crawl-1",
  pillarId: "seo",
  pillarLabel: "SEO",
  bucketId: "meta-tags",
  bucketLabel: "Meta Tags",
  affectedUrlCount: 3,
  message: "Help me fix the Meta Tags bucket under SEO.",
}

function assistantMessage(content: string): AITurnMessageResponse {
  return {
    id: "a-1",
    role: "assistant",
    status: "complete",
    content,
    created_at: T,
    updated_at: T,
  }
}

function fakeHandle(
  send: (content: string, options?: { crawlId?: string }) => Promise<unknown>,
  overrides?: {
    messages?: AITurnMessageResponse[]
    status?: RevbotHandle["status"]
    loading?: boolean
    approvals?: RevbotHandle["approvals"]
    waitingForQuestion?: boolean
  }
): RevbotHandle {
  const noop = () => {}
  return {
    activityStartedAt: null,
    conversationActive: () => false,
    conversationId: null,
    conversations: [],
    deleteConversation: () => Promise.resolve(),
    effort: "none",
    loading: overrides?.loading ?? false,
    messages: overrides?.messages ?? [],
    newChat: noop,
    phase: null,
    retry: noop,
    selectConversation: () => Promise.resolve(),
    send: send as RevbotHandle["send"],
    setEffort: noop,
    status: overrides?.status ?? "idle",
    stopping: false,
    stop: () => Promise.resolve(),
    toolCalls: [],
    approvals: overrides?.approvals ?? [],
    decidingApproval: null,
    approvalDecisionErrors: {},
    decideApproval: () => Promise.resolve(),
    waitingForApproval: (overrides?.approvals ?? []).some(
      (approval) => approval.status === "pending"
    ),
    questions: [],
    pendingQuestion: null,
    waitingForQuestion: overrides?.waitingForQuestion ?? false,
    answeringQuestion: null,
    questionErrors: {},
    submitQuestionAnswers: noop,
    syncQuestions: () => Promise.resolve(),
  } as unknown as RevbotHandle
}

describe("RevbotViewContent audit suggestion starters", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }
    root = null
    host?.remove()
    host = null
    document.body.innerHTML = ""
  })

  async function mountView(
    send: (content: string, options?: { crawlId?: string }) => Promise<unknown>,
    overrides?: Parameters<typeof fakeHandle>[1],
    suggestions: RevbotAuditSuggestion[] = [SUGGESTION]
  ) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <RevbotViewContent
          activeProject={PROJECT}
          allowedEfforts={["none"]}
          revbot={fakeHandle(send, overrides)}
          compact
          defaultHistoryOpen={false}
          hideCompactHeader
          hideHistory
          canManageOrganization
          showMic={false}
          suggestions={suggestions}
          variant="default"
        />
      )
      await flushRevbot()
    })
    return host
  }

  function starterButtons(container: HTMLDivElement) {
    return [...container.querySelectorAll("button")].filter((button) =>
      button.textContent?.includes("Help me fix")
    )
  }

  test("one click sends the suggestion message with its crawl", async () => {
    const calls: Array<{ content: string; options?: { crawlId?: string } }> = []
    const container = await mountView(async (content, options) => {
      calls.push({ content, options })
    })
    expect(calls.length).toBe(0)
    const buttons = starterButtons(container)
    expect(buttons.length).toBe(1)
    await act(async () => {
      buttons[0]?.click()
      await flushRevbot()
    })
    expect(calls.length).toBe(1)
    expect(calls[0]).toEqual({
      content: SUGGESTION.message,
      options: { crawlId: "crawl-1" },
    })
  })

  test("existing chats hide the starters", async () => {
    const container = await mountView(
      async () => {},
      { messages: [assistantMessage("Hello")] }
    )
    expect(container.textContent).toContain("Hello")
    expect(starterButtons(container).length).toBe(0)
  })

  test("busy starters stay visible but disabled", async () => {
    const pendingApproval = {
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
    } as const
    for (const overrides of [
      { loading: true },
      { status: "running" as const },
      { status: "queued" as const },
      { status: "waiting_for_user" as const },
      { status: "waiting_for_user" as const, approvals: [pendingApproval] },
      { waitingForQuestion: true },
    ]) {
      const calls: unknown[] = []
      const container = await mountView(
        async (content, options) => {
          calls.push({ content, options })
        },
        overrides
      )
      const buttons = starterButtons(container)
      expect(buttons.length).toBe(1)
      expect(buttons[0]?.hasAttribute("disabled")).toBe(true)
      await act(async () => {
        buttons[0]?.click()
        await flushRevbot()
      })
      expect(calls.length).toBe(0)
      await act(async () => {
        root?.unmount()
      })
      root = null
      host?.remove()
      host = null
      document.body.innerHTML = ""
    }
  })
})
