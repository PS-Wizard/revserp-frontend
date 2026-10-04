import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import { RevbotTurnActivity } from "./revbot-turn-activity"
import type { RevbotToolCall } from "./use-revbot"

installRevbotDom()

afterEach(() => {
  document.body.innerHTML = ""
})

function countingCall(
  counter: { reads: number },
  status: RevbotToolCall["status"]
): RevbotToolCall {
  const call: RevbotToolCall = {
    callId: "call-1",
    name: "crawl_pages",
    args: { url: "https://example.com" },
    status,
    summary: null,
    seq: 0,
  }
  Object.defineProperty(call, "summary", {
    enumerable: true,
    configurable: true,
    get() {
      counter.reads += 1
      return "Crawled 12 pages"
    },
  })
  return call
}

type ActivityProps = {
  active: boolean
  startedAt: number | null
  endedAt: number | null
  toolCalls: RevbotToolCall[]
}

async function mountActivity(initial: ActivityProps) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const renderProps = (props: ActivityProps) => (
    <RevbotTurnActivity
      active={props.active}
      endedAt={props.endedAt}
      phase="thinking"
      startedAt={props.startedAt}
      toolCalls={props.toolCalls}
    />
  )
  await act(async () => {
    root.render(renderProps(initial))
    await flushRevbot()
  })
  async function update(next: ActivityProps) {
    await act(async () => {
      root.render(renderProps(next))
      await flushRevbot()
    })
  }
  async function unmount() {
    await act(async () => {
      root.unmount()
    })
  }
  return { container, update, unmount }
}

async function advanceRevbotClock(ms: number) {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  })
}

describe("RevbotTurnActivity clock isolation", () => {
  test("the live clock ticks without re-rendering tool rows", async () => {
    const counter = { reads: 0 }
    const startedAt = Date.now()
    const { container, unmount } = await mountActivity({
      active: true,
      startedAt,
      endedAt: null,
      toolCalls: [countingCall(counter, "running")],
    })
    try {
      const toggle = container.querySelector("button[aria-expanded]")
      expect(toggle).toBeTruthy()
      await act(async () => {
        toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        await flushRevbot()
      })
      const baseline = counter.reads
      expect(baseline > 0).toBe(true)
      expect((container.textContent ?? "").includes("Churning")).toBe(true)
      await advanceRevbotClock(350)
      expect(counter.reads).toBe(baseline)
      expect((container.textContent ?? "").includes("Churning")).toBe(true)
    } finally {
      await unmount()
    }
  })

  test("a finished thought freezes the rows", async () => {
    const counter = { reads: 0 }
    const startedAt = Date.now() - 5000
    const toolCalls = [countingCall(counter, "completed")]
    const { container, update, unmount } = await mountActivity({
      active: true,
      startedAt,
      endedAt: null,
      toolCalls,
    })
    try {
      await update({
        active: false,
        startedAt,
        endedAt: startedAt + 2500,
        toolCalls,
      })
      expect((container.textContent ?? "").includes("Thought for 2.5s")).toBe(
        true
      )
      const baseline = counter.reads
      await advanceRevbotClock(250)
      expect(counter.reads).toBe(baseline)
    } finally {
      await unmount()
    }
  })

  test("a null start renders the live header", async () => {
    const { container, unmount } = await mountActivity({
      active: true,
      startedAt: null,
      endedAt: null,
      toolCalls: [],
    })
    try {
      const text = container.textContent ?? ""
      expect(text.includes("Churning")).toBe(true)
      expect(text.includes("0.0s")).toBe(true)
    } finally {
      await unmount()
    }
  })
})
