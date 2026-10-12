import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import { useRevbot, type RevbotHandle } from "./use-revbot"
import type {
  AIConversationDetailResponse,
  AITurnMessageResponse,
  AITurnResponse,
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

type FetchCall = { url: string; method: string }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

type SSEStream = {
  turnId: string
  after: number
  push: (frame: string) => void
  close: () => void
}
let sseStreams: SSEStream[] = []

const encoder = new TextEncoder()

function sseFrame(id: number, event: string, payload: unknown) {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
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

function assistantMessage(
  content: string,
  overrides: Partial<AITurnMessageResponse> = {}
): AITurnMessageResponse {
  return {
    id: "a-1",
    role: "assistant",
    status: "partial",
    content,
    created_at: T,
    updated_at: T,
    ...overrides,
  }
}

let turnFixture: AITurnResponse

function resetFixtures() {
  turnFixture = {
    id: "t-1",
    conversation_id: "c-1",
    status: "running",
    requested_effort: "none",
    effective_effort: "none",
    model: "m",
    attempt_count: 1,
    cancel_requested: false,
    prompt_tokens: null,
    reasoning_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    error_code: null,
    queued_at: T,
    started_at: T,
    completed_at: null,
    created_at: T,
    updated_at: T,
    messages: [userMessage(), assistantMessage("Hello")],
    tool_calls: [],
    event_cursor: 12,
    approvals: [],
  }
}

function conversationOneDetail(): AIConversationDetailResponse {
  return {
    id: "c-1",
    project_id: "p-1",
    created_by_user_id: "user-1",
    title: "First",
    created_at: T,
    updated_at: T,
    turn_status: turnFixture.status,
    turn_id: "t-1",
    messages: [userMessage()],
  }
}

function installFetch() {
  ;(globalThis as Record<string, unknown>).fetch = async (
    input: string | URL | { url: string },
    init?: { method?: string }
  ) => {
    const url = typeof input === "string" ? input : String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    fetchCalls.push({ url, method })
    if (url.includes("/events?after=")) {
      const turnId = url.match(/\/ai\/turns\/([^/]+)\/events/)?.[1] ?? ""
      const after = Number(url.split("after=")[1] ?? "0")
      let controller: ReadableStreamDefaultController<Uint8Array>
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
        },
      })
      sseStreams.push({
        turnId,
        after,
        push: (frame: string) => controller.enqueue(encoder.encode(frame)),
        close: () => controller.close(),
      })
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      })
    }
    if (url.includes("/ai/conversations/c-1")) {
      return Response.json(conversationOneDetail())
    }
    if (url.includes("/ai/turns/t-1") && !url.includes("/events")) {
      return Response.json(turnFixture)
    }
    if (url.includes("/ai/conversations?")) {
      return Response.json({
        conversations: [],
        pagination: { limit: 50, offset: 0, count: 0, total: 0 },
      })
    }
    return Response.json({}, { status: 404 })
  }
}

type HandleRef = { current: RevbotHandle | null }

function Probe({ handleRef }: { handleRef: HandleRef }) {
  const revbot = useRevbot({
    activeProject: PROJECT,
    allowedEfforts: ["none"],
    requestedConversationId: null,
    onConversationChange: () => {},
  })
  useEffect(() => {
    handleRef.current = revbot
  })
  return null
}

async function mountHook() {
  localStorage.clear()
  localStorage.setItem(
    "revbot-turn:p-1",
    JSON.stringify({ conversationId: "c-1", turnId: "t-1" })
  )
  const handleRef: HandleRef = { current: null }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe handleRef={handleRef} />
      </QueryClientProvider>
    )
    await flushRevbot()
    await flushRevbot()
    await flushRevbot()
    await flushRevbot()
  })
  if (!handleRef.current) throw new Error("revbot handle was never mounted")
  return { root, handleRef }
}

async function unmountHook(root: Root) {
  await act(async () => {
    root.unmount()
  })
  for (const stream of sseStreams) {
    try {
      stream.close()
    } catch {
      continue
    }
  }
  sseStreams = []
}

function assistantOf(handle: RevbotHandle | null) {
  const message =
    handle?.messages.find((entry) => entry.role === "assistant") ?? null
  return {
    content: message?.content ?? null,
    activity: (message?.activity ?? []).map((round) => ({ ...round })),
  }
}

async function push(frame: string) {
  await act(async () => {
    sseStreams[0]?.push(frame)
    await flushRevbot()
  })
}

function questionPayload() {
  return {
    question_request: {
      id: "q-1",
      turn_id: "t-1",
      tool_call_id: "call-9",
      status: "pending",
      questions: [
        {
          id: "qq-1",
          header: "Pick",
          prompt: "Which?",
          mode: "single",
          allow_custom: false,
          options: [{ id: "o-1", label: "A" }],
        },
      ],
      created_at: T,
    },
  }
}

beforeEach(() => {
  resetFixtures()
  fetchCalls.length = 0
  sseStreams = []
  installFetch()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  localStorage.clear()
  document.body.innerHTML = ""
})

describe("useRevbot provider rounds", () => {
  test("tagged deltas run as activity, never answer text, with reconnect dedupe", async () => {
    const { root, handleRef } = await mountHook()
    try {
      await push(sseFrame(13, "text_delta", { text: "Checking", round: 0 }))
      await push(sseFrame(14, "text_delta", { text: " crawl", round: 0 }))
      expect(assistantOf(handleRef.current)).toEqual({
        content: "Hello",
        activity: [{ round: 0, text: "Checking crawl", status: "running" }],
      })

      await push(sseFrame(14, "text_delta", { text: " crawl", round: 0 }))
      expect(assistantOf(handleRef.current).activity).toEqual([
        { round: 0, text: "Checking crawl", status: "running" },
      ])
    } finally {
      await unmountHook(root)
    }
  })

  test("activity rounds complete while answers promote without duplication", async () => {
    const { root, handleRef } = await mountHook()
    try {
      await push(sseFrame(13, "text_delta", { text: "Checking", round: 0 }))
      await push(
        sseFrame(14, "assistant_round", {
          round: 0,
          kind: "activity",
          text: "Checked the crawl",
        })
      )
      expect(assistantOf(handleRef.current)).toEqual({
        content: "Hello",
        activity: [{ round: 0, text: "Checked the crawl", status: "complete" }],
      })

      await push(sseFrame(15, "text_delta", { text: "draft", round: 1 }))
      await push(
        sseFrame(16, "assistant_round", {
          round: 1,
          kind: "answer",
          text: "All fixed",
        })
      )
      expect(assistantOf(handleRef.current)).toEqual({
        content: "All fixed",
        activity: [{ round: 0, text: "Checked the crawl", status: "complete" }],
      })

      await push(
        sseFrame(17, "assistant_round", {
          round: 1,
          kind: "answer",
          text: "All fixed",
        })
      )
      expect(assistantOf(handleRef.current)).toEqual({
        content: "All fixed",
        activity: [{ round: 0, text: "Checked the crawl", status: "complete" }],
      })
    } finally {
      await unmountHook(root)
    }
  })

  test("reconnect adopts snapshot activity without duplicating streamed rounds", async () => {
    const first = await mountHook()
    try {
      await push(sseFrame(13, "text_delta", { text: "Checking", round: 0 }))
    } finally {
      await unmountHook(first.root)
    }

    turnFixture = {
      ...turnFixture,
      messages: [
        userMessage(),
        assistantMessage("Hello", {
          activity: [{ round: 0, text: "Checking crawl", status: "running" }],
        }),
      ],
      event_cursor: 16,
    }
    const second = await mountHook()
    try {
      expect(assistantOf(second.handleRef.current)).toEqual({
        content: "Hello",
        activity: [{ round: 0, text: "Checking crawl", status: "running" }],
      })
      const calls = fetchCalls.filter((call) =>
        call.url.includes("/ai/turns/t-1/events")
      )
      expect(calls[calls.length - 1]?.url).toContain("after=16")

      await push(sseFrame(17, "text_delta", { text: " now", round: 0 }))
      expect(assistantOf(second.handleRef.current).activity).toEqual([
        { round: 0, text: "Checking crawl now", status: "running" },
      ])
    } finally {
      await unmountHook(second.root)
    }
  })

  test("a question pause keeps streamed rounds stable", async () => {
    const { root, handleRef } = await mountHook()
    try {
      await push(sseFrame(13, "text_delta", { text: "Checking", round: 0 }))
      await push(sseFrame(14, "question_required", questionPayload()))
      await act(async () => {
        await flushRevbot()
        await flushRevbot()
      })
      expect(handleRef.current?.pendingQuestion?.id).toBe("q-1")
      expect(assistantOf(handleRef.current).activity).toEqual([
        { round: 0, text: "Checking", status: "running" },
      ])
    } finally {
      await unmountHook(root)
    }
  })

  test("completed terminal adopts the final snapshot", async () => {
    const { root, handleRef } = await mountHook()
    try {
      turnFixture = {
        ...turnFixture,
        status: "completed",
        messages: [
          userMessage(),
          assistantMessage("Final answer", {
            status: "complete",
            activity: [{ round: 0, text: "Checked", status: "complete" }],
          }),
        ],
      }
      await push(sseFrame(20, "completed", {}))
      await act(async () => {
        await flushRevbot()
      })
      expect(assistantOf(handleRef.current)).toEqual({
        content: "Final answer",
        activity: [{ round: 0, text: "Checked", status: "complete" }],
      })
    } finally {
      await unmountHook(root)
    }
  })

  test("failed and stopped turns keep provisional text as activity, never a fake answer", async () => {
    const failed = await mountHook()
    try {
      turnFixture = {
        ...turnFixture,
        status: "failed",
        error_code: "provider_invalid_request",
        messages: [
          userMessage(),
          assistantMessage("", {
            status: "partial",
            activity: [{ round: 0, text: "Checking", status: "running" }],
          }),
        ],
      }
      await push(sseFrame(20, "failed", {}))
      await act(async () => {
        await flushRevbot()
      })
      expect(assistantOf(failed.handleRef.current)).toEqual({
        content: "",
        activity: [{ round: 0, text: "Checking", status: "running" }],
      })
    } finally {
      await unmountHook(failed.root)
    }

    resetFixtures()
    const stopped = await mountHook()
    try {
      turnFixture = {
        ...turnFixture,
        status: "stopped",
        error_code: "cancelled",
        messages: [
          userMessage(),
          assistantMessage("Half", {
            status: "partial",
            activity: [{ round: 0, text: "Checking", status: "running" }],
          }),
        ],
      }
      await push(sseFrame(20, "stopped", {}))
      await act(async () => {
        await flushRevbot()
      })
      expect(assistantOf(stopped.handleRef.current)).toEqual({
        content: "Half",
        activity: [{ round: 0, text: "Checking", status: "running" }],
      })
    } finally {
      await unmountHook(stopped.root)
    }
  })

  test("legacy untagged deltas still append to the answer", async () => {
    const { root, handleRef } = await mountHook()
    try {
      await push(sseFrame(13, "text_delta", { text: " world" }))
      expect(assistantOf(handleRef.current)).toEqual({
        content: "Hello world",
        activity: [],
      })
    } finally {
      await unmountHook(root)
    }
  })
})
