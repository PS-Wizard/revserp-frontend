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

type FetchCall = { url: string; method: string; body: unknown }
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

function message(
  id: string,
  role: "user" | "assistant",
  content: string
): AITurnMessageResponse {
  return {
    id,
    role,
    status: role === "assistant" ? "partial" : "complete",
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

let turnFixture: AITurnResponse
let conversationTwoDetail: AIConversationDetailResponse

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
    messages: [message("u-1", "user", "hi"), message("a-1", "assistant", "Hello")],
    tool_calls: [],
    event_cursor: 12,
    approvals: [pendingApproval()],
  }
  conversationTwoDetail = {
    id: "c-2",
    project_id: "p-1",
    created_by_user_id: "user-1",
    title: "Second",
    created_at: T,
    updated_at: T,
    turn_status: "completed",
    turn_id: "t-2",
    messages: [
      message("u-2", "user", "second question"),
      { ...message("a-2", "assistant", "Done deal"), status: "complete" },
    ],
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
    turn_status: turnFixture.status === "completed" ? "completed" : turnFixture.status,
    turn_id: "t-1",
    messages: [message("u-1", "user", "hi")],
  }
}

function installFetch() {
  ;(globalThis as Record<string, unknown>).fetch = async (
    input: string | URL | { url: string },
    init?: { method?: string; body?: string }
  ) => {
    const url = typeof input === "string" ? input : String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown
    try {
      body = init?.body ? JSON.parse(init.body) : undefined
    } catch {
      body = undefined
    }
    fetchCalls.push({ url, method, body })
    if (url.includes("/events?after=")) {
      const turnId = url.match(/\/ai\/turns\/([^/]+)\/events/)?.[1] ?? ""
      const after = Number(url.split("after=")[1] ?? "0")
      let controller: ReadableStreamDefaultController<Uint8Array>
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
        },
      })
      const entry: SSEStream = {
        turnId,
        after,
        push: (frame: string) => controller.enqueue(encoder.encode(frame)),
        close: () => controller.close(),
      }
      sseStreams.push(entry)
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      })
    }
    if (url.includes("/approvals/") && url.endsWith("/decision") && method === "POST") {
      const decided = {
        ...pendingApproval(),
        status: "approved",
        decided_at: "2024-01-01T00:00:01Z",
      }
      return Response.json({ approval: decided, turn_id: "t-1" })
    }
    if (url.includes("/ai/conversations/c-2")) {
      return Response.json(conversationTwoDetail)
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

function eventsCalls(turnId: string) {
  return fetchCalls.filter((call) => call.url.includes(`/ai/turns/${turnId}/events`))
}

function assistantContent(handle: RevbotHandle | null) {
  return (
    handle?.messages.find((entry) => entry.role === "assistant")?.content ?? null
  )
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

async function mountHook(stored: { conversationId: string; turnId?: string } | null) {
  localStorage.clear()
  if (stored) {
    localStorage.setItem("revbot-turn:p-1", JSON.stringify(stored))
  }
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
  return { root, handleRef, queryClient }
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

beforeEach(() => {
  resetFixtures()
  fetchCalls.length = 0
  sseStreams = []
  installFetch()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  localStorage.clear()
})

describe("useRevbot snapshot and stream lifecycle", () => {
  test("load shows partial text and saved approval, subscribes after the cursor", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      const calls = eventsCalls("t-1")
      expect(calls.length).toBe(1)
      expect(calls[0]?.url).toContain("after=12")
      const handle = (await readHandle(handleRef)).current
      expect(assistantContent(handle)).toBe("Hello")
      expect(handle?.approvals.map((approval) => approval.status)).toEqual([
        "pending",
      ])

      await act(async () => {
        sseStreams[0]?.push(sseFrame(13, "text_delta", { text: " world" }))
        await flushRevbot()
      })
      expect(assistantContent((await readHandle(handleRef)).current)).toBe(
        "Hello world"
      )

      await act(async () => {
        sseStreams[0]?.push(sseFrame(12, "text_delta", { text: " STALE" }))
        await flushRevbot()
      })
      expect(assistantContent((await readHandle(handleRef)).current)).toBe(
        "Hello world"
      )
    } finally {
      await unmountHook(root)
    }
  })

  test("deciding an approval while live keeps the stream on the same run", async () => {
    const { root, handleRef } = await mountHook({
      conversationId: "c-1",
      turnId: "t-1",
    })
    try {
      await act(async () => {
        await handleRef.current?.decideApproval("ap-1", "approve")
        await flushRevbot()
        await flushRevbot()
      })
      const decision = fetchCalls.find((call) =>
        call.url.includes("/approvals/ap-1/decision")
      )
      expect(decision?.method).toBe("POST")
      expect(decision?.body).toEqual({ decision: "approve" })
      const reread = await readHandle(handleRef)
      expect(
        reread.current?.approvals.find((approval) => approval.id === "ap-1")
          ?.status
      ).toBe("approved")

      await act(async () => {
        sseStreams[0]?.push(sseFrame(14, "text_delta", { text: "!" }))
        await flushRevbot()
      })
      expect(assistantContent((await readHandle(handleRef)).current)).toBe("Hello!")
    } finally {
      await unmountHook(root)
    }
  })

  test("reopening the same run adopts the newer snapshot without replay", async () => {
    const first = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    expect(assistantContent(first.handleRef.current)).toBe("Hello")
    await unmountHook(first.root)

    turnFixture = {
      ...turnFixture,
      messages: [
        message("u-1", "user", "hi"),
        { ...message("a-1", "assistant", "Hello world, more"), status: "partial" },
      ],
      event_cursor: 16,
      approvals: [{ ...pendingApproval(), status: "approved" }],
    }
    const seenBefore = eventsCalls("t-1").length
    const second = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      expect(assistantContent(second.handleRef.current)).toBe(
        "Hello world, more"
      )
      const calls = eventsCalls("t-1").slice(seenBefore)
      expect(calls.length).toBe(1)
      expect(calls[0]?.url).toContain("after=16")
    } finally {
      await unmountHook(second.root)
    }
  })

  test("leaving and revisiting a conversation resets stream state per turn", async () => {
    const { root, handleRef } = await mountHook({
      conversationId: "c-1",
      turnId: "t-1",
    })
    try {
      expect(eventsCalls("t-1").length).toBe(1)

      await act(async () => {
        await handleRef.current?.selectConversation("c-2")
        await flushRevbot()
        await flushRevbot()
      })
      expect(assistantContent(handleRef.current)).toBe("Done deal")
      expect(handleRef.current?.approvals).toEqual([])
      expect(
        fetchCalls.some((call) => call.url.includes("/ai/turns/t-2"))
      ).toBe(false)

      await act(async () => {
        await handleRef.current?.selectConversation("c-1")
        await flushRevbot()
        await flushRevbot()
        await flushRevbot()
      })
      expect(assistantContent(handleRef.current)).toBe("Hello")
      const calls = eventsCalls("t-1")
      expect(calls.length).toBe(2)
      expect(calls[1]?.url).toContain("after=12")
    } finally {
      await unmountHook(root)
    }
  })

  test("terminal refresh adopts the final snapshot", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      turnFixture = {
        ...turnFixture,
        status: "completed",
        messages: [
          message("u-1", "user", "hi"),
          { ...message("a-1", "assistant", "Hello world, final"), status: "complete" },
        ],
        approvals: [],
      }
      await act(async () => {
        sseStreams[0]?.push(sseFrame(20, "completed", {}))
        await flushRevbot()
        await flushRevbot()
      })
      expect(assistantContent((await readHandle(handleRef)).current)).toBe(
        "Hello world, final"
      )
    } finally {
      await unmountHook(root)
    }
  })

  test("a response without a cursor falls back to a full replay from zero", async () => {
    const { event_cursor: _dropped, approvals: _droppedApprovals, ...legacy } =
      turnFixture
    turnFixture = legacy as AITurnResponse
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      expect(assistantContent((await readHandle(handleRef)).current)).toBe("")
      expect(eventsCalls("t-1")[0]?.url).toContain("after=0")
      await act(async () => {
        sseStreams[0]?.push(sseFrame(1, "text_delta", { text: "Hello" }))
        await flushRevbot()
        sseStreams[0]?.push(sseFrame(2, "text_delta", { text: " world" }))
        await flushRevbot()
      })
      expect(assistantContent((await readHandle(handleRef)).current)).toBe(
        "Hello world"
      )
    } finally {
      await unmountHook(root)
    }
  })
})

async function readHandle(handleRef: HandleRef) {
  await flushRevbot()
  if (!handleRef.current) throw new Error("revbot handle was never mounted")
  return handleRef
}
