import { describe, expect, test } from "bun:test"
import type { CMSApproval, CMSApprovalStatus } from "~/lib/api.types"
import {
  mergeApprovalCard,
  resolveTurnObserverStart,
  shouldKeepStreamedAssistantText,
  shouldReplaceApprovalCard,
  turnIdToResyncOnRefocus,
  type TurnObserver,
} from "./revbot-replay-state"

function approval(overrides: Partial<CMSApproval> = {}): CMSApproval {
  return {
    id: "approval-1",
    turn_id: "turn-1",
    tool_call_id: "call-1",
    tool_name: "update_post",
    provider: "wordpress",
    target: "post/1",
    before: "",
    after: "hello",
    status: "pending",
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

function observer(turnId: string, generation = 1): TurnObserver {
  return { controller: new AbortController(), turnId, generation }
}

describe("mergeApprovalCard", () => {
  test("appends an unknown card", () => {
    const merged = mergeApprovalCard([], approval())
    expect(merged).toHaveLength(1)
  })

  test("accepts real progress", () => {
    const stages: CMSApprovalStatus[] = [
      "approved",
      "executing",
      "completed",
      "failed",
    ]
    let cards = [approval()]
    for (const status of stages) {
      const next = mergeApprovalCard(cards, approval({ status }))
      expect(next[0].status).toBe(status)
      cards = next
    }
  })

  test("replayed approval_required never regresses a decided card", () => {
    const decided = [approval({ status: "approved", decided_at: "2024-01-02" })]
    const merged = mergeApprovalCard(decided, approval({ status: "pending" }))
    expect(merged).toBe(decided)
    expect(merged[0].status).toBe("approved")
  })

  test("replayed approval_decided never regresses a completed card", () => {
    const done = [approval({ status: "completed" })]
    const merged = mergeApprovalCard(
      done,
      approval({ status: "approved", decided_at: "2024-01-02" })
    )
    expect(merged).toBe(done)
  })

  test("terminal cards ignore later frames", () => {
    for (const status of ["rejected", "invalidated", "failed"] as const) {
      const settled = [approval({ status })]
      expect(mergeApprovalCard(settled, approval({ status: "pending" }))).toBe(
        settled
      )
      expect(
        mergeApprovalCard(settled, approval({ status: "executing" }))
      ).toBe(settled)
    }
  })

  test("stale decision timestamps are ignored", () => {
    const fresh = [approval({ status: "approved", decided_at: "2024-01-05" })]
    expect(
      mergeApprovalCard(
        fresh,
        approval({ status: "approved", decided_at: "2024-01-02" })
      )
    ).toBe(fresh)
  })

  test("a newly recorded decision timestamp wins", () => {
    const merged = mergeApprovalCard(
      [approval({ status: "pending" })],
      approval({ status: "approved", decided_at: "2024-01-05" })
    )
    expect(merged[0].status).toBe("approved")
    expect(merged[0].decided_at).toBe("2024-01-05")
  })

  test("cancel invalidation is forward progress from pending", () => {
    const merged = mergeApprovalCard(
      [approval({ status: "pending" })],
      approval({ status: "invalidated" })
    )
    expect(merged[0].status).toBe("invalidated")
  })

  test("different ids never replace each other", () => {
    expect(
      shouldReplaceApprovalCard(approval(), approval({ id: "approval-2" }))
    ).toBe(true)
  })
})

describe("resolveTurnObserverStart", () => {
  const base = {
    currentGeneration: 3,
    generation: 3,
    observer: null as TurnObserver | null,
    status: "running" as string | null,
    turnId: "turn-1",
  }

  test("starts a stream when none is live", () => {
    expect(resolveTurnObserverStart(base).kind).toBe("start")
  })

  test("keeps a live same-turn observer", () => {
    const decision = resolveTurnObserverStart({
      ...base,
      observer: observer("turn-1", 3),
    })
    expect(decision.kind).toBe("keep")
  })

  test("keeps a live observer even after the turn reports waiting", () => {
    expect(
      resolveTurnObserverStart({
        ...base,
        status: "waiting_for_user",
        observer: observer("turn-1", 3),
      }).kind
    ).toBe("keep")
  })

  test("restarts for a different turn", () => {
    expect(
      resolveTurnObserverStart({ ...base, observer: observer("turn-9", 3) })
        .kind
    ).toBe("start")
  })

  test("restarts when the generation moved on", () => {
    expect(
      resolveTurnObserverStart({ ...base, observer: observer("turn-1", 1) })
        .kind
    ).toBe("start")
  })

  test("parks a paused turn so it is never polled", () => {
    expect(
      resolveTurnObserverStart({ ...base, status: "waiting_for_user" }).kind
    ).toBe("parked")
  })

  test("skips a stale generation or a terminal turn", () => {
    expect(
      resolveTurnObserverStart({ ...base, generation: 2, currentGeneration: 3 })
        .kind
    ).toBe("skip")
    expect(
      resolveTurnObserverStart({ ...base, status: "completed" }).kind
    ).toBe("skip")
  })
})

describe("shouldKeepStreamedAssistantText", () => {
  test("keeps streamed text while the same turn is streaming", () => {
    expect(
      shouldKeepStreamedAssistantText({
        observer: observer("turn-1"),
        replay: false,
        status: "running",
        turnId: "turn-1",
      })
    ).toBe(true)
  })

  test("adopts the snapshot for other turns, replays, and idle state", () => {
    expect(
      shouldKeepStreamedAssistantText({
        observer: observer("turn-9"),
        replay: false,
        status: "running",
        turnId: "turn-1",
      })
    ).toBe(false)
    expect(
      shouldKeepStreamedAssistantText({
        observer: observer("turn-1"),
        replay: true,
        status: "running",
        turnId: "turn-1",
      })
    ).toBe(false)
    expect(
      shouldKeepStreamedAssistantText({
        observer: null,
        replay: false,
        status: "running",
        turnId: "turn-1",
      })
    ).toBe(false)
  })

  test("a terminal snapshot always wins over the streamed text", () => {
    expect(
      shouldKeepStreamedAssistantText({
        observer: observer("turn-1"),
        replay: false,
        status: "completed",
        turnId: "turn-1",
      })
    ).toBe(false)
  })
})

describe("turnIdToResyncOnRefocus", () => {
  test("restarts a lost stream", () => {
    expect(
      turnIdToResyncOnRefocus({
        observer: null,
        status: "running",
        turnId: "turn-1",
      })
    ).toBe("turn-1")
  })

  test("leaves a live stream alone", () => {
    expect(
      turnIdToResyncOnRefocus({
        observer: observer("turn-1"),
        status: "running",
        turnId: "turn-1",
      })
    ).toBeNull()
  })

  test("re-verifies a paused turn and ignores a settled one", () => {
    expect(
      turnIdToResyncOnRefocus({
        observer: null,
        status: "waiting",
        turnId: "turn-1",
      })
    ).toBe("turn-1")
    expect(
      turnIdToResyncOnRefocus({
        observer: null,
        status: "completed",
        turnId: "turn-1",
      })
    ).toBeNull()
    expect(
      turnIdToResyncOnRefocus({
        observer: null,
        status: "running",
        turnId: null,
      })
    ).toBeNull()
  })
})
