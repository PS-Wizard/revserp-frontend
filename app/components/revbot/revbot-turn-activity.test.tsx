import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import {
  resolveRevbotLiveStatusLabel,
  resolveRevbotToolDisplayName,
  RevbotTurnActivity,
} from "./revbot-turn-activity"
import type { RevbotActivityRound } from "./revbot-replay-state"
import type { RevbotToolCall } from "./use-revbot"
import type { AIStreamPhase, CMSApproval } from "~/lib/api.types"

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
  phase?: AIStreamPhase
}

async function mountActivity(initial: ActivityProps) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const renderProps = (props: ActivityProps) => (
    <RevbotTurnActivity
      active={props.active}
      endedAt={props.endedAt}
      phase={props.phase ?? "thinking"}
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
      expect((container.textContent ?? "").includes("Crawl Pages")).toBe(true)
      await advanceRevbotClock(350)
      expect(counter.reads).toBe(baseline)
      expect((container.textContent ?? "").includes("Crawl Pages")).toBe(true)
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
      expect((container.textContent ?? "").includes("Activity · 2.5s")).toBe(
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
      expect(text.includes("Thinking")).toBe(true)
      expect(text.includes("0.0s")).toBe(true)
    } finally {
      await unmount()
    }
  })
})

describe("RevbotTurnActivity public rounds", () => {
  function toolCall(overrides: Partial<RevbotToolCall> = {}): RevbotToolCall {
    return {
      callId: "call-1",
      name: "crawl_pages",
      args: {},
      status: "completed",
      summary: "Crawled 12 pages",
      seq: 0,
      ...overrides,
    }
  }

  function approval(overrides: Partial<CMSApproval> = {}): CMSApproval {
    return {
      id: "ap-1",
      turn_id: "t-1",
      tool_call_id: "call-1",
      tool_name: "mcp_abc_update_post",
      connection_name: "WordPress",
      remote_tool_name: "update_post",
      service: "wordpress",
      target: "post/1",
      before: "",
      after: "",
      status: "pending",
      created_at: "2024-01-01T00:00:00Z",
      ...overrides,
    }
  }

  test("a hashed MCP name resolves through its approval, else strips the hash", () => {
    const hashed = toolCall({ callId: "call-1", name: "mcp_abc_update_post" })
    expect(resolveRevbotToolDisplayName(hashed, [approval()])).toBe(
      "Update post"
    )
    expect(resolveRevbotToolDisplayName(hashed, [])).toBe("Update post")
    expect(resolveRevbotToolDisplayName(toolCall(), [])).toBe("Crawl Pages")
  })

  test("the live label prefers the running tool, then narration, then phase", () => {
    const running = toolCall({ status: "running", summary: null })
    expect(
      resolveRevbotLiveStatusLabel({
        activity: [{ round: 0, text: "Looking things up", status: "running" }],
        phase: "thinking",
        toolCalls: [running],
      })
    ).toBe("Crawl Pages…")
    expect(
      resolveRevbotLiveStatusLabel({
        activity: [{ round: 0, text: "Looking things up", status: "running" }],
        phase: "thinking",
        toolCalls: [],
      })
    ).toBe("Looking things up")
    expect(
      resolveRevbotLiveStatusLabel({
        activity: [],
        phase: "writing",
        toolCalls: [],
      })
    ).toBe("Writing…")
    expect(
      resolveRevbotLiveStatusLabel({ activity: [], phase: null, toolCalls: [] })
    ).toBe("Working…")
  })

  test("completed rounds stay in the collapsed thought panel", async () => {
    const startedAt = Date.now() - 5000
    const activity: RevbotActivityRound[] = [
      { round: 0, text: "Checked the crawl", status: "complete" },
    ]
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(
          <RevbotTurnActivity
            active={false}
            activity={activity}
            endedAt={startedAt + 2500}
            phase={null}
            startedAt={startedAt}
            toolCalls={[]}
          />
        )
        await flushRevbot()
      })
      const text = container.textContent ?? ""
      expect(text.includes("Activity · 2.5s")).toBe(true)
      // Collapsed: the narration is mounted but hidden.
      expect(text.includes("Checked the crawl")).toBe(true)
      const toggle = container.querySelector("button[aria-expanded='false']")
      expect(toggle).toBeTruthy()
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })
})

describe("RevbotTurnActivity interrupted and failed runs", () => {
  async function mountPanel(props: {
    activity: RevbotActivityRound[]
    toolCalls: RevbotToolCall[]
  }) {
    const startedAt = Date.now() - 5000
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <RevbotTurnActivity
          active={false}
          activity={props.activity}
          endedAt={startedAt + 2500}
          phase={null}
          startedAt={startedAt}
          toolCalls={props.toolCalls}
        />
      )
      await flushRevbot()
    })
    return { container, root }
  }

  test("an interrupted round shows an incomplete mark, never a spinner", async () => {
    const { container, root } = await mountPanel({
      activity: [{ round: 0, text: "Checking", status: "running" }],
      toolCalls: [],
    })
    try {
      const text = container.textContent ?? ""
      expect(text.includes("Checking")).toBe(true)
      expect(container.querySelector(".animate-spin")).toBeNull()
      expect(text.includes("~")).toBe(true)
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })

  test("a failed tool auto-expands the finished panel", async () => {
    const { container, root } = await mountPanel({
      activity: [],
      toolCalls: [
        {
          callId: "call-1",
          name: "crawl_pages",
          args: {},
          status: "failed",
          summary: "boom",
          seq: 0,
        },
      ],
    })
    try {
      const toggle = container.querySelector("button[aria-expanded='true']")
      expect(toggle).toBeTruthy()
      expect((container.textContent ?? "").includes("boom")).toBe(true)
    } finally {
      await act(async () => {
        root.unmount()
      })
    }
  })
})
