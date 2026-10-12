import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import { RevbotViewContent } from "./revbot-view"
import type { RevbotHandle } from "./use-revbot"
import type {
  AITurnMessageResponse,
  ProjectResponse,
  UserQuestionRequest,
} from "~/lib/api.types"

installRevbotDom()

const T = "2024-01-01T00:00:00Z"
const PROJECT: ProjectResponse = {
  id: "p-1",
  organization_id: "o-1",
  name: "P",
  base_url: "https://example.com",
}

function userMessage(): AITurnMessageResponse {
  return { id: "u-1", role: "user", status: "complete", content: "hi", created_at: T, updated_at: T }
}

function assistantMessage(content: string, toolCalls?: AITurnMessageResponse["tool_calls"]): AITurnMessageResponse {
  return { id: "a-1", role: "assistant", status: "partial", content, created_at: T, updated_at: T, tool_calls: toolCalls }
}

function pendingQuestion(id: string, prompt: string): UserQuestionRequest {
  return {
    id,
    turn_id: "t-1",
    tool_call_id: "call-1",
    status: "pending",
    questions: [
      {
        id: "q-1",
        header: "Sources",
        prompt,
        mode: "single",
        allow_custom: false,
        options: [
          { id: "o-1", label: "Alpha" },
          { id: "o-2", label: "Beta" },
        ],
      },
    ],
    created_at: T,
  }
}

function answeredQuestion(): UserQuestionRequest {
  return {
    ...pendingQuestion("qr-1", "Which source?"),
    status: "answered",
    answers: [{ question_id: "q-1", selected_option_ids: ["o-1"] }],
    answered_at: T,
  }
}

function questionHandle(overrides: Partial<RevbotHandle> & { messages: AITurnMessageResponse[] }): RevbotHandle {
  const noop = () => {}
  return {
    activityStartedAt: null,
    conversationActive: () => false,
    conversationId: "c-1",
    conversations: [],
    deleteConversation: () => Promise.resolve(),
    effort: "none",
    loading: false,
    newChat: noop,
    phase: null,
    retry: noop,
    selectConversation: () => Promise.resolve(),
    send: () => Promise.resolve(),
    setEffort: noop,
    status: "waiting_for_user",
    stopping: false,
    stop: () => Promise.resolve(),
    toolCalls: [],
    approvals: [],
    questions: [],
    pendingQuestion: null,
    waitingForQuestion: false,
    answeringQuestion: null,
    questionErrors: {},
    submitQuestionAnswers: noop,
    syncQuestions: () => Promise.resolve(),
    decidingApproval: null,
    approvalDecisionErrors: {},
    decideApproval: () => Promise.resolve(),
    waitingForApproval: false,
    ...overrides,
  } as unknown as RevbotHandle
}

async function mountView(handle: RevbotHandle, showMessageAvatar = false) {
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
        isOrganizationOwner
        showMessageAvatar={showMessageAvatar}
        showMic={false}
        variant="default"
      />
    )
    await flushRevbot()
  })
  return { root, container }
}

async function rerenderView(root: Root, container: HTMLDivElement, handle: RevbotHandle) {
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
        isOrganizationOwner
        showMic={false}
        variant="default"
      />
    )
    await flushRevbot()
  })
  return container
}

async function unmount(root: Root) {
  await act(async () => {
    root.unmount()
  })
  document.body.innerHTML = ""
}

afterEach(() => {
  document.body.innerHTML = ""
  localStorage.clear()
})

describe("RevbotViewContent question waiting", () => {
  test("parked questions suppress working animation, activity and busy", async () => {
    const base = {
      messages: [userMessage(), assistantMessage("Hello")],
      phase: "working" as const,
      waitingForQuestion: true,
      pendingQuestion: pendingQuestion("qr-1", "Which source?"),
      questions: [pendingQuestion("qr-1", "Which source?")],
    }
    const { root, container } = await mountView(questionHandle(base), true)
    try {
      expect(container.querySelector("[aria-busy]")?.getAttribute("aria-busy")).toBe("false")
      const viewport = container.querySelector('[aria-label="Conversation"]')
      expect(viewport?.querySelector("[aria-expanded]")).toBeNull()
      expect(viewport?.querySelector('span[class*="-inset-1"]')).toBeNull()
      expect(viewport?.querySelector(".animate-pulse")).toBeNull()
      expect(container.textContent).toContain("Waiting for your answer")
    } finally {
      await unmount(root)
    }
  })

  test("running turns keep busy state and activity", async () => {
    const { root, container } = await mountView(
      questionHandle({
        messages: [userMessage(), assistantMessage("Hello")],
        status: "running",
        phase: "working",
        waitingForQuestion: false,
      })
    )
    try {
      expect(container.querySelector("[aria-busy]")?.getAttribute("aria-busy")).toBe("true")
      expect(container.querySelector("[aria-expanded]") === null).toBe(false)
    } finally {
      await unmount(root)
    }
  })
})

describe("RevbotViewContent question history placement", () => {
  test("owned summaries render in the message transcript, not the composer region", async () => {
    const { root, container } = await mountView(
      questionHandle({
        messages: [
          userMessage(),
          {
            ...assistantMessage("done", [
              { call_id: "call-1", name: "ask_user_question", args: {}, status: "completed", summary: "", seq: 0, created_at: T },
            ]),
            status: "complete",
            toolCalls: [{ callId: "call-1", name: "ask_user_question", args: {}, status: "completed", summary: null, seq: 0 }],
          } as unknown as AITurnMessageResponse,
        ],
        status: "completed",
        questions: [answeredQuestion()],
      })
    )
    try {
      expect(container.textContent).toContain("Alpha")
      const viewport = container.querySelector('[aria-label="Conversation"]')
      expect(viewport?.textContent).toContain("Alpha")
      const composerRegion = container.querySelector("textarea")?.closest("section")
      expect(composerRegion?.textContent?.includes("Alpha") ?? false).toBe(false)
    } finally {
      await unmount(root)
    }
  })

  test("unmatched sets render once as fallback in the transcript", async () => {
    const orphan = { ...answeredQuestion(), tool_call_id: "call-zzz" }
    const { root, container } = await mountView(
      questionHandle({
        messages: [userMessage(), { ...assistantMessage("done"), status: "complete" }],
        status: "completed",
        questions: [orphan],
      })
    )
    try {
      const viewport = container.querySelector('[aria-label="Conversation"]')
      expect(viewport?.querySelector('[aria-label="Answered questions"]') === null).toBe(false)
      expect(viewport?.textContent).toContain("Alpha")
    } finally {
      await unmount(root)
    }
  })
})

describe("RevbotViewContent pending wizard", () => {
  test("a new request id resets the wizard above the composer", async () => {
    const { root, container } = await mountView(
      questionHandle({
        messages: [userMessage(), assistantMessage("")],
        pendingQuestion: pendingQuestion("qr-1", "First prompt?"),
        waitingForQuestion: true,
      })
    )
    try {
      expect(container.textContent).toContain("First prompt?")
      const textarea = container.querySelector("textarea")
      expect(textarea === null).toBe(false)
      const wizard = container.querySelector('[aria-label="Answer Revbot\'s questions"]')
      const composerBox = container.querySelector("textarea")
      expect(wizard !== null && composerBox !== null).toBe(true)
      if (wizard && composerBox) {
        expect(Boolean(wizard.compareDocumentPosition(composerBox) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
      }
      await rerenderView(
        root,
        container,
        questionHandle({
          messages: [userMessage(), assistantMessage("")],
          pendingQuestion: pendingQuestion("qr-2", "Second prompt?"),
          waitingForQuestion: true,
        })
      )
      expect(container.textContent).toContain("Second prompt?")
      expect(container.textContent?.includes("First prompt?")).toBe(false)
    } finally {
      await unmount(root)
    }
  })
})
