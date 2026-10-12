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
  UserQuestion,
  UserQuestionAnswer,
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

function q(id: string, header: string): UserQuestion {
  return {
    id,
    header,
    prompt: `Prompt ${id}?`,
    mode: "single",
    allow_custom: true,
    options: [
      { id: `${id}-a`, label: `Alpha ${id}` },
      { id: `${id}-b`, label: `Beta ${id}` },
    ],
  }
}

function pendingRequest(): UserQuestionRequest {
  return {
    id: "qr-1",
    turn_id: "t-1",
    tool_call_id: "call-1",
    status: "pending",
    questions: [q("q-1", "Sources"), q("q-2", "Pages")],
    created_at: T,
  }
}

function resolvedRequest(): UserQuestionRequest {
  return {
    ...pendingRequest(),
    status: "answered",
    answers: [
      { question_id: "q-1", selected_option_ids: ["q-1-a"] },
      { question_id: "q-2", selected_option_ids: [], skipped: true },
    ],
    answered_at: "2024-01-01T00:00:01Z",
  }
}

function message(id: string, role: "user" | "assistant", content: string): AITurnMessageResponse {
  return {
    id,
    role,
    status: role === "assistant" ? "partial" : "complete",
    content,
    created_at: T,
    updated_at: T,
  }
}

let turnFixture: AITurnResponse
let listFixture: UserQuestionRequest[]
let answerCalls: { url: string; body: unknown }[]
let answerFailure: number | null

function resetFixtures() {
  turnFixture = {
    id: "t-1",
    conversation_id: "c-1",
    status: "waiting_for_user",
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
    approvals: [],
    question_requests: [pendingRequest()],
  }
  listFixture = [pendingRequest()]
  answerCalls = []
  answerFailure = null
}

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

type SSEStream = { turnId: string; push: (frame: string) => void; close: () => void }
let sseStreams: SSEStream[] = []
const encoder = new TextEncoder()

function sseFrame(id: number, event: string, payload: unknown) {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
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
      let controller: ReadableStreamDefaultController<Uint8Array>
      const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c } })
      const entry: SSEStream = {
        turnId,
        push: (frame: string) => controller.enqueue(encoder.encode(frame)),
        close: () => controller.close(),
      }
      sseStreams.push(entry)
      return new Response(stream, { headers: { "Content-Type": "text/event-stream" } })
    }
    if (url.includes("/questions/") && url.endsWith("/answer") && method === "POST") {
      const payload = body as { decision?: string; answers?: UserQuestionAnswer[]; reply?: string }
      answerCalls.push({ url, body })
      if (answerFailure !== null)
        return Response.json({ error: "forbidden" }, { status: answerFailure })
      const resolved =
        payload.decision === "skip"
          ? { ...pendingRequest(), status: "skipped" as const, answered_at: "2024-01-01T00:00:02Z" }
          : payload.reply
            ? { ...pendingRequest(), status: "answered" as const, reply: payload.reply, answered_at: "2024-01-01T00:00:02Z" }
            : { ...resolvedRequest() }
      return Response.json({ question_request: resolved, turn_id: "t-1" })
    }
    if (url.includes("/ai/conversations/c-1/questions")) {
      return Response.json({ question_requests: listFixture })
    }
    if (url.includes("/ai/conversations/c-2/questions")) {
      return Response.json({ question_requests: [resolvedRequest()] })
    }
    if (url.includes("/ai/conversations/c-2")) {
      const detail: AIConversationDetailResponse = {
        id: "c-2",
        project_id: "p-1",
        created_by_user_id: "user-1",
        title: "Second",
        created_at: T,
        updated_at: T,
        turn_status: "completed",
        turn_id: null,
        messages: [message("u-2", "user", "old"), { ...message("a-2", "assistant", "done"), status: "complete" }],
      }
      return Response.json(detail)
    }
    if (url.includes("/ai/conversations/c-1")) {
      const detail: AIConversationDetailResponse = {
        id: "c-1",
        project_id: "p-1",
        created_by_user_id: "user-1",
        title: "First",
        created_at: T,
        updated_at: T,
        turn_status: turnFixture.status,
        turn_id: "t-1",
        messages: [message("u-1", "user", "hi")],
      }
      return Response.json(detail)
    }
    if (url.includes("/ai/turns/t-1/cancel") && method === "POST") {
      turnFixture = { ...turnFixture, status: "stopped", question_requests: [{ ...pendingRequest(), status: "cancelled" }] }
      return Response.json(turnFixture)
    }
    if (url.includes("/ai/turns/t-1") && !url.includes("/events")) {
      return Response.json(turnFixture)
    }
    if (url.includes("/ai/conversations?")) {
      return Response.json({ conversations: [], pagination: { limit: 50, offset: 0, count: 0, total: 0 } })
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

async function mountHook(stored: { conversationId: string; turnId?: string } | null) {
  localStorage.clear()
  if (stored) localStorage.setItem("revbot-turn:p-1", JSON.stringify(stored))
  const handleRef: HandleRef = { current: null }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe handleRef={handleRef} />
      </QueryClientProvider>
    )
    for (let i = 0; i < 6; i += 1) await flushRevbot()
  })
  return { root, handleRef }
}

async function readHandle(handleRef: HandleRef) {
  await flushRevbot()
  if (!handleRef.current) throw new Error("revbot handle was never mounted")
  return handleRef
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

function eventsCalls(turnId: string) {
  return fetchCalls.filter((call) => call.url.includes(`/ai/turns/${turnId}/events`))
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

describe("useRevbot user questions", () => {
  test("pending snapshot parks the stream and shows one active card", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      const handle = (await readHandle(handleRef)).current
      expect(handle?.pendingQuestion?.id).toBe("qr-1")
      expect(handle?.waitingForQuestion).toBe(true)
      expect(handle?.status).toBe("waiting_for_user")
      expect(eventsCalls("t-1")).toHaveLength(0)
    } finally {
      await unmountHook(root)
    }
  })

  test("wizard submit answers the set once and resubscribes the same turn", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      turnFixture = { ...turnFixture, status: "running", question_requests: [resolvedRequest()] }
      await act(async () => {
        await handleRef.current?.submitQuestionAnswers("qr-1", [
          { question_id: "q-1", selected_option_ids: ["q-1-a"] },
          { question_id: "q-2", selected_option_ids: [], skipped: true },
        ])
        await flushRevbot()
        await flushRevbot()
        await flushRevbot()
      })
      expect(answerCalls).toHaveLength(1)
      expect(answerCalls[0]?.url).toContain("/ai/conversations/c-1/questions/qr-1/answer")
      expect(answerCalls[0]?.body).toEqual({
        decision: "answer",
        answers: [
          { question_id: "q-1", selected_option_ids: ["q-1-a"] },
          { question_id: "q-2", selected_option_ids: [], skipped: true },
        ],
      })
      const handle = (await readHandle(handleRef)).current
      expect(handle?.pendingQuestion).toBeNull()
      expect(eventsCalls("t-1")).toHaveLength(1)
      expect(fetchCalls.some((call) => call.method === "POST" && call.url.endsWith("/turns"))).toBe(false)
    } finally {
      await unmountHook(root)
    }
  })

  test("plain composer text while pending is a same-turn direct reply", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      turnFixture = { ...turnFixture, status: "running", question_requests: [{ ...resolvedRequest(), reply: "go now" }] }
      await act(async () => {
        await handleRef.current?.send("go now")
        await flushRevbot()
        await flushRevbot()
      })
      expect(answerCalls).toHaveLength(1)
      expect(answerCalls[0]?.body).toEqual({ decision: "answer", reply: "go now" })
      expect(fetchCalls.some((call) => call.method === "POST" && call.url.endsWith("/turns"))).toBe(false)
    } finally {
      await unmountHook(root)
    }
  })

  test("replayed pending never overwrites a resolved set", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      turnFixture = { ...turnFixture, status: "running", question_requests: [resolvedRequest()] }
      listFixture = [resolvedRequest()]
      await act(async () => {
        await handleRef.current?.submitQuestionAnswers("qr-1", [
          { question_id: "q-1", selected_option_ids: ["q-1-a"] },
          { question_id: "q-2", selected_option_ids: [], skipped: true },
        ])
        await flushRevbot()
        await flushRevbot()
      })
      expect((await readHandle(handleRef)).current?.pendingQuestion).toBeNull()
      turnFixture = { ...turnFixture, status: "waiting_for_user", question_requests: [pendingRequest()] }
      await act(async () => {
        sseStreams[0]?.push(sseFrame(13, "question_required", { question_request: pendingRequest() }))
        await flushRevbot()
        await flushRevbot()
        await flushRevbot()
      })
      const handle = (await readHandle(handleRef)).current
      expect(handle?.pendingQuestion).toBeNull()
      expect(handle?.questions.find((r) => r.id === "qr-1")?.status).toBe("answered")
    } finally {
      await unmountHook(root)
    }
  })

  test("completed conversation restores answered history via the list endpoint", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      await act(async () => {
        await handleRef.current?.selectConversation("c-2")
        await flushRevbot()
        await flushRevbot()
        await flushRevbot()
      })
      const handle = (await readHandle(handleRef)).current
      expect(handle?.pendingQuestion).toBeNull()
      expect(handle?.questions.map((r) => r.status)).toEqual(["answered"])
      expect(fetchCalls.some((call) => call.url.includes("/ai/conversations/c-2/questions"))).toBe(true)
    } finally {
      await unmountHook(root)
    }
  })

  test("stop cancels the pending set and refreshes its state", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      listFixture = [{ ...pendingRequest(), status: "cancelled" }]
      await act(async () => {
        await handleRef.current?.stop()
        await flushRevbot()
        await flushRevbot()
      })
      const handle = (await readHandle(handleRef)).current
      expect(handle?.pendingQuestion).toBeNull()
      expect(handle?.questions.find((r) => r.id === "qr-1")?.status).toBe("cancelled")
      expect(fetchCalls.some((call) => call.url.includes("/ai/conversations/c-1/questions"))).toBe(true)
    } finally {
      await unmountHook(root)
    }
  })

  test("failed direct reply returns false and never starts a new turn", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      answerFailure = 403
      let result: boolean | void = true
      await act(async () => {
        result = await handleRef.current?.send("keep me")
        await flushRevbot()
        await flushRevbot()
      })
      expect(result).toBe(false)
      expect(answerCalls).toHaveLength(1)
      expect(fetchCalls.some((call) => call.method === "POST" && call.url.endsWith("/turns"))).toBe(false)
      const handle = (await readHandle(handleRef)).current
      expect(handle?.pendingQuestion?.id).toBe("qr-1")
      expect(handle?.answeringQuestion).toBeNull()
    } finally {
      await unmountHook(root)
    }
  })

  test("resolving clears the stored draft", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    try {
      localStorage.setItem(
        "revbot-questions:c-1:qr-1",
        JSON.stringify({ "q-1": { selected: ["q-1-a"], customText: "", customOpen: false, skipped: false } })
      )
      turnFixture = { ...turnFixture, status: "running", question_requests: [resolvedRequest()] }
      await act(async () => {
        await handleRef.current?.submitQuestionAnswers("qr-1", [
          { question_id: "q-1", selected_option_ids: ["q-1-a"] },
          { question_id: "q-2", selected_option_ids: [], skipped: true },
        ])
        await flushRevbot()
        await flushRevbot()
        await flushRevbot()
      })
      expect(localStorage.getItem("revbot-questions:c-1:qr-1")).toBeNull()
    } finally {
      await unmountHook(root)
    }
  })

  test("switching conversations keeps the unresolved draft", async () => {
    const { root, handleRef } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    const draft = JSON.stringify({ "q-1": { selected: ["q-1-a"], customText: "", customOpen: false, skipped: false } })
    try {
      localStorage.setItem("revbot-questions:c-1:qr-1", draft)
      await act(async () => {
        await handleRef.current?.selectConversation("c-2")
        await flushRevbot()
        await flushRevbot()
        await flushRevbot()
      })
      expect(localStorage.getItem("revbot-questions:c-1:qr-1")).toBe(draft)
    } finally {
      await unmountHook(root)
    }
  })

  test("unmounting with a pending set keeps the unresolved draft", async () => {
    const { root } = await mountHook({ conversationId: "c-1", turnId: "t-1" })
    const draft = JSON.stringify({ "q-1": { selected: ["q-1-a"], customText: "", customOpen: false, skipped: false } })
    localStorage.setItem("revbot-questions:c-1:qr-1", draft)
    await unmountHook(root)
    expect(localStorage.getItem("revbot-questions:c-1:qr-1")).toBe(draft)
  })
})
