import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import { useRevbot, type RevbotHandle } from "./use-revbot"
import type {
  AIConversationDetailResponse,
  AIConversationResponse,
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
const LOCATION = "loc-1"
const PARENT_KEY = "revbot-turn:p-1"
const LOCATION_KEY = `revbot-turn:p-1:${LOCATION}`

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

type SSEStream = {
  turnId: string
  push: (frame: string) => void
  close: () => void
}
let sseStreams: SSEStream[] = []
const encoder = new TextEncoder()

function message(
  id: string,
  role: "user" | "assistant",
  content: string
): AITurnMessageResponse {
  return {
    id,
    role,
    status: role === "assistant" ? "complete" : "complete",
    content,
    created_at: T,
    updated_at: T,
  }
}

function detail(
  id: string,
  locationId: string | null,
  title: string,
  texts: Array<[string, "user" | "assistant", string]>
): AIConversationDetailResponse {
  return {
    id,
    project_id: "p-1",
    created_by_user_id: "user-1",
    title,
    created_at: T,
    updated_at: T,
    turn_status: null,
    turn_id: null,
    location_id: locationId,
    messages: texts.map(([mid, role, content]) => message(mid, role, content)),
  }
}

const PARENT_DETAIL = () =>
  detail("c-parent", null, "Parent chat", [
    ["u-p", "user", "parent question"],
    ["a-p", "assistant", "parent answer"],
  ])

const LOCATION_DETAIL = () =>
  detail("c-loc", LOCATION, "Location chat", [
    ["u-l", "user", "location question"],
    ["a-l", "assistant", "location answer"],
  ])

function listItem(detailResponse: AIConversationDetailResponse) {
  const { messages: _dropped, ...rest } = detailResponse
  return rest as AIConversationResponse
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
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c
        },
      })
      const entry: SSEStream = {
        turnId,
        push: (frame: string) => controller.enqueue(encoder.encode(frame)),
        close: () => controller.close(),
      }
      sseStreams.push(entry)
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      })
    }
    if (url.includes("/projects/p-1/ai/conversations") && method === "POST") {
      const record = (body ?? {}) as Record<string, unknown>
      const locationId =
        typeof record.location_id === "string" ? record.location_id : null
      const created: AIConversationResponse = {
        id: locationId ? "c-new-loc" : "c-new-parent",
        project_id: "p-1",
        created_by_user_id: "user-1",
        title: "New conversation",
        created_at: T,
        updated_at: T,
        turn_status: null,
        turn_id: null,
        location_id: locationId,
      }
      return Response.json(created)
    }
    if (url.includes("/projects/p-1/ai/conversations")) {
      const params = new URL(url, "http://localhost").searchParams
      const filter = params.get("location_id")
      const all = [listItem(PARENT_DETAIL()), listItem(LOCATION_DETAIL())]
      const conversations = all.filter((item) =>
        filter === null
          ? (item.location_id ?? null) === null
          : (item.location_id ?? null) === filter
      )
      return Response.json({
        conversations,
        pagination: {
          limit: 50,
          offset: 0,
          count: conversations.length,
          total: conversations.length,
        },
      })
    }
    if (url.includes("/ai/conversations/c-parent/turns") && method === "POST") {
      return Response.json({
        conversation_id: "c-parent",
        turn_id: "t-parent-new",
        user_message_id: "u-parent-new",
        assistant_message_id: "a-parent-new",
        status: "queued",
      })
    }
    if (
      url.includes("/ai/conversations/c-new-loc/turns") &&
      method === "POST"
    ) {
      return Response.json({
        conversation_id: "c-new-loc",
        turn_id: "t-loc-new",
        user_message_id: "u-loc-new",
        assistant_message_id: "a-loc-new",
        status: "queued",
      })
    }
    if (
      url.includes("/ai/conversations/c-new-parent/turns") &&
      method === "POST"
    ) {
      return Response.json({
        conversation_id: "c-new-parent",
        turn_id: "t-parent-fresh",
        user_message_id: "u-parent-fresh",
        assistant_message_id: "a-parent-fresh",
        status: "queued",
      })
    }
    if (url.includes("/ai/conversations/c-parent")) {
      return Response.json(PARENT_DETAIL())
    }
    if (url.includes("/ai/conversations/c-loc")) {
      return Response.json(LOCATION_DETAIL())
    }
    return Response.json({}, { status: 404 })
  }
}

type HandleRef = { current: RevbotHandle | null }

function Probe({
  handleRef,
  requestedConversationId,
  locationId,
  onConversationChange,
}: {
  handleRef: HandleRef
  requestedConversationId: string | null
  locationId?: string
  onConversationChange: (conversationId: string | null) => void
}) {
  const revbot = useRevbot({
    activeProject: PROJECT,
    allowedEfforts: ["none"],
    requestedConversationId,
    locationId,
    onConversationChange,
  })
  useEffect(() => {
    handleRef.current = revbot
  })
  return null
}

async function mountHook(options?: {
  stored?: Record<string, { conversationId: string; turnId?: string }>
  requestedConversationId?: string | null
  locationId?: string
  onConversationChange?: (conversationId: string | null) => void
}) {
  localStorage.clear()
  for (const [key, value] of Object.entries(options?.stored ?? {})) {
    localStorage.setItem(key, JSON.stringify(value))
  }
  const handleRef: HandleRef = { current: null }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (
    locationId?: string,
    requestedConversationId?: string | null
  ) =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe
          handleRef={handleRef}
          requestedConversationId={
            requestedConversationId ?? options?.requestedConversationId ?? null
          }
          locationId={locationId ?? options?.locationId}
          onConversationChange={options?.onConversationChange ?? (() => {})}
        />
      </QueryClientProvider>
    )
  await act(async () => {
    render(options?.locationId, options?.requestedConversationId ?? null)
    await flushRevbot()
    await flushRevbot()
    await flushRevbot()
    await flushRevbot()
  })
  return { root, handleRef, render }
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

function listCalls() {
  return fetchCalls.filter(
    (call) =>
      call.method === "GET" && call.url.includes("/ai/conversations?limit=")
  )
}

function createCalls() {
  return fetchCalls.filter(
    (call) =>
      call.method === "POST" &&
      call.url.includes("/projects/p-1/ai/conversations")
  )
}

async function readHandle(
  handleRef: HandleRef
): Promise<Awaited<ReturnType<typeof useRevbot>>> {
  await flushRevbot()
  const handle = handleRef.current
  if (!handle) throw new Error("revbot handle was never mounted")
  return handle
}

beforeEach(() => {
  fetchCalls.length = 0
  sseStreams = []
  installFetch()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  localStorage.clear()
})

describe("useRevbot location scope", () => {
  test("parent scope keeps the unfiltered list, empty create body, and legacy key", async () => {
    const { root, handleRef } = await mountHook({
      stored: { [PARENT_KEY]: { conversationId: "c-parent" } },
    })
    try {
      expect(listCalls().length).toBe(1)
      const listUrl = listCalls()[0]?.url ?? ""
      expect(
        listUrl.endsWith("/projects/p-1/ai/conversations?limit=50&offset=0")
      ).toBe(true)
      expect(listUrl.includes("location_id")).toBe(false)
      const handle = await readHandle(handleRef)
      expect(handle.conversationId).toBe("c-parent")
      expect(
        handle.messages.find((entry) => entry.role === "assistant")?.content
      ).toBe("parent answer")

      await act(async () => {
        await handleRef.current?.selectConversation("c-loc")
        await flushRevbot()
        await flushRevbot()
      })
      const rejected = await readHandle(handleRef)
      expect(rejected.conversationId).toBe("c-parent")
      expect(
        rejected.messages.find((entry) => entry.role === "assistant")?.content
      ).toBe("parent answer")
    } finally {
      await unmountHook(root)
    }
  })

  test("parent scope creates with an empty body", async () => {
    const { root, handleRef } = await mountHook()
    try {
      await act(async () => {
        await handleRef.current?.send("hello parent")
        await flushRevbot()
      })
      expect(createCalls().length).toBe(1)
      expect(createCalls()[0]?.body).toEqual({})
      expect(
        fetchCalls.some(
          (call) =>
            call.method === "POST" &&
            call.url.includes("/ai/conversations/c-new-parent/turns")
        )
      ).toBe(true)
    } finally {
      await unmountHook(root)
    }
  })

  test("location scope filters the list, ignores the parent key, and creates with location_id", async () => {
    const { root, handleRef } = await mountHook({
      locationId: LOCATION,
      stored: { [PARENT_KEY]: { conversationId: "c-parent" } },
    })
    try {
      expect(listCalls().length).toBe(1)
      expect(listCalls()[0]?.url).toContain(
        `location_id=${encodeURIComponent(LOCATION)}`
      )
      expect(
        fetchCalls.some((call) =>
          call.url.includes("/ai/conversations/c-parent")
        )
      ).toBe(false)
      const handle = await readHandle(handleRef)
      expect(handle.conversationId).toBeNull()
      expect(handle.messages).toEqual([])

      await act(async () => {
        await handleRef.current?.send("hello location")
        await flushRevbot()
      })
      expect(createCalls().length).toBe(1)
      expect(createCalls()[0]?.body).toEqual({ location_id: LOCATION })
      expect(
        fetchCalls.some(
          (call) =>
            call.method === "POST" &&
            call.url.includes("/ai/conversations/c-new-loc/turns")
        )
      ).toBe(true)
      expect(
        fetchCalls.some((call) =>
          call.url.includes("/ai/conversations/c-parent/turns")
        )
      ).toBe(false)
      expect(localStorage.getItem(LOCATION_KEY)).toContain("c-new-loc")
      expect(localStorage.getItem(PARENT_KEY)).toContain("c-parent")
    } finally {
      await unmountHook(root)
    }
  })

  test("rejects a hydrated conversation from another scope", async () => {
    const seen: Array<string | null> = []
    const { root, handleRef } = await mountHook({
      locationId: LOCATION,
      stored: { [LOCATION_KEY]: { conversationId: "c-parent" } },
      onConversationChange: (conversationId) => {
        seen.push(conversationId)
      },
    })
    try {
      const handle = await readHandle(handleRef)
      expect(handle.conversationId).toBeNull()
      expect(handle.messages).toEqual([])
      expect(handle.loading).toBe(false)
      expect(seen.includes("c-parent")).toBe(false)
      expect(localStorage.getItem(LOCATION_KEY)).toBeNull()
    } finally {
      await unmountHook(root)
    }
  })

  test("a stale requested conversation from another scope never renders", async () => {
    const { root, handleRef } = await mountHook({
      locationId: LOCATION,
      requestedConversationId: "c-parent",
    })
    try {
      const handle = await readHandle(handleRef)
      expect(handle.conversationId).toBeNull()
      expect(handle.messages).toEqual([])
    } finally {
      await unmountHook(root)
    }
  })

  test("switching scope resets to a fresh chat and never sends to the parent conversation", async () => {
    const { root, handleRef, render } = await mountHook({
      stored: { [PARENT_KEY]: { conversationId: "c-parent" } },
    })
    try {
      expect((await readHandle(handleRef)).conversationId).toBe("c-parent")
      await act(async () => {
        render(LOCATION, null)
        await flushRevbot()
        await flushRevbot()
        await flushRevbot()
        await flushRevbot()
      })
      const scoped = await readHandle(handleRef)
      expect(scoped.conversationId).toBeNull()
      expect(scoped.messages).toEqual([])

      await act(async () => {
        await handleRef.current?.send("hello location")
        await flushRevbot()
      })
      expect(createCalls()[0]?.body).toEqual({ location_id: LOCATION })
      expect(
        fetchCalls.some((call) =>
          call.url.includes("/ai/conversations/c-parent/turns")
        )
      ).toBe(false)
    } finally {
      await unmountHook(root)
    }
  })
})
