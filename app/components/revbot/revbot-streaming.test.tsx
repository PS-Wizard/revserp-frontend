import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { hasReducedMotionListener, prefersReducedMotion } from "motion/react"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import { RevbotViewContent } from "./revbot-view"
import type { RevbotHandle } from "./use-revbot"
import type { AITurnMessageResponse, ProjectResponse } from "~/lib/api.types"

installRevbotDom()

const T = "2024-01-01T00:00:00Z"
const PROJECT: ProjectResponse = {
  id: "p-1",
  organization_id: "o-1",
  name: "P",
  base_url: "https://example.com",
}

let restoreSplit: (() => void) | null = null

afterEach(() => {
  restoreSplit?.()
  restoreSplit = null
  document.body.innerHTML = ""
})

function assistantMessage(id: string, content: string): AITurnMessageResponse {
  return {
    id,
    role: "assistant",
    status: "partial",
    content,
    created_at: T,
    updated_at: T,
  }
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

function liveHandle(messages: AITurnMessageResponse[]): RevbotHandle {
  const noop = () => {}
  return {
    activityStartedAt: null,
    conversationActive: () => false,
    conversationId: "c-1",
    conversations: [],
    deleteConversation: () => Promise.resolve(),
    effort: "none",
    loading: false,
    messages,
    newChat: noop,
    phase: null,
    retry: noop,
    selectConversation: () => Promise.resolve(),
    send: () => Promise.resolve(),
    setEffort: noop,
    status: "running",
    stopping: false,
    stop: () => Promise.resolve(),
    toolCalls: [],
    approvals: [],
    decidingApproval: null,
    approvalDecisionErrors: {},
    decideApproval: () => Promise.resolve(),
    waitingForApproval: false,
  } as unknown as RevbotHandle
}

function viewElement(messages: AITurnMessageResponse[]) {
  return (
    <RevbotViewContent
      activeProject={PROJECT}
      allowedEfforts={["none"]}
      revbot={liveHandle(messages)}
      compact
      defaultHistoryOpen={false}
      hideCompactHeader
      hideHistory
      isOrganizationOwner
      showMic={false}
      variant="default"
    />
  )
}

async function mountStream(messages: AITurnMessageResponse[]) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(viewElement(messages))
    await flushRevbot()
  })
  return { root, container }
}

async function updateStream(
  root: Root,
  messages: AITurnMessageResponse[]
): Promise<string> {
  await act(async () => {
    root.render(viewElement(messages))
    await flushRevbot()
  })
  return document.body.textContent ?? ""
}

async function unmountStream(root: Root) {
  await act(async () => {
    root.unmount()
  })
}

function wordList(count: number) {
  return Array.from({ length: count }, (_, index) => `w${index}`)
}

describe("streaming word blocks", () => {
  test("a loaded backlog shows immediately", async () => {
    const words = wordList(150)
    const { root } = await mountStream([
      userMessage(),
      assistantMessage("a-1", words.join(" ")),
    ])
    try {
      expect((document.body.textContent ?? "").includes("w149")).toBe(true)
    } finally {
      await unmountStream(root)
    }
  })

  test("a completed 64-word block never re-splits when the tail grows", async () => {
    const words150 = wordList(150)
    const first64 = words150.slice(0, 64).join(" ")
    const nativeSplit = String.prototype.split
    let firstBlockSplits = 0
    String.prototype.split = function (this: unknown, ...args: never[]) {
      if (String(this) === first64) firstBlockSplits += 1
      return Reflect.apply(nativeSplit, this, args)
    } as unknown as typeof String.prototype.split
    restoreSplit = () => {
      String.prototype.split = nativeSplit
    }

    const { root } = await mountStream([
      userMessage(),
      assistantMessage("a-1", words150.join(" ")),
    ])
    try {
      expect(firstBlockSplits).toBe(1)
      const words160 = [...words150, ...wordList(10).map((word) => `${word}x`)]
      const text = await updateStream(root, [
        userMessage(),
        assistantMessage("a-1", words160.join(" ")),
      ])
      expect(text.includes("w149")).toBe(true)
      expect(firstBlockSplits).toBe(1)
    } finally {
      await unmountStream(root)
    }
  })

  test("whitespace survives the block split", async () => {
    const content = "hello   world\nnext  line"
    const { root } = await mountStream([
      userMessage(),
      assistantMessage("a-1", content),
    ])
    try {
      const text = document.body.textContent ?? ""
      expect(text.includes("hello   world")).toBe(true)
      expect(text.includes("world\nnext  line")).toBe(true)
    } finally {
      await unmountStream(root)
    }
  })

  test("a new message id shows its content right away", async () => {
    const { root } = await mountStream([
      userMessage(),
      assistantMessage("a-1", "alpha beta gamma"),
    ])
    try {
      const text = await updateStream(root, [
        userMessage(),
        assistantMessage("a-2", "delta epsilon"),
      ])
      expect(text.includes("delta epsilon")).toBe(true)
    } finally {
      await unmountStream(root)
    }
  })

  test("same-id replacement shows right away", async () => {
    const { root } = await mountStream([
      userMessage(),
      assistantMessage("a-1", "alpha beta gamma"),
    ])
    try {
      const text = await updateStream(root, [
        userMessage(),
        assistantMessage("a-1", "totally different words here"),
      ])
      expect(text.includes("totally different words here")).toBe(true)
    } finally {
      await unmountStream(root)
    }
  })

  test("reduced motion shows appended words right away", async () => {
    // Motion caches the setting in module refs on first render, so flip them
    // directly instead of stubbing matchMedia.
    const prevReduced = prefersReducedMotion.current
    const prevInit = hasReducedMotionListener.current
    hasReducedMotionListener.current = true
    prefersReducedMotion.current = true
    const words = wordList(150)
    const { root } = await mountStream([
      userMessage(),
      assistantMessage("a-1", words.join(" ")),
    ])
    try {
      const grown = [...words, ...wordList(10).map((word) => `${word}x`)]
      const text = await updateStream(root, [
        userMessage(),
        assistantMessage("a-1", grown.join(" ")),
      ])
      expect(text.includes("w9x")).toBe(true)
    } finally {
      prefersReducedMotion.current = prevReduced
      hasReducedMotionListener.current = prevInit
      await unmountStream(root)
    }
  })
})

test("streaming preserves leading, trailing, and whitespace-only content", async () => {
  for (const content of [
    " \nhello   world\n\n\t  ",
    `${wordList(64).join(" ")}\n\n`,
    " \n\t ",
  ]) {
    const { root, container } = await mountStream([
      userMessage(),
      assistantMessage("a-1", content),
    ])
    try {
      expect(
        container.querySelector(".typeset.whitespace-pre-wrap")?.textContent
      ).toBe(content)
    } finally {
      await unmountStream(root)
    }
  }
})
