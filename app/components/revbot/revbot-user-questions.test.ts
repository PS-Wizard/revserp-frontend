import { beforeEach, describe, expect, test } from "bun:test"

import { installRevbotDom } from "./revbot-dom-test-setup"
import {
  buildQuestionAnswers,
  mergeQuestionRequest,
  pendingQuestionRequest,
  questionRequestSummaryLines,
  questionStepComplete,
  readQuestionDraft,
  resolvedQuestionRequests,
  writeQuestionDraft,
  clearQuestionDraft,
  type DraftSelection,
  type QuestionDraft,
} from "./revbot-user-questions"
import type {
  UserQuestion,
  UserQuestionRequest,
} from "~/lib/api.types"

installRevbotDom()

const T = "2024-01-01T00:00:00Z"

function question(overrides: Partial<UserQuestion> = {}): UserQuestion {
  return {
    id: "q-1",
    header: "Sources",
    prompt: "Which source?",
    mode: "single",
    allow_custom: true,
    options: [
      { id: "o-1", label: "Docs" },
      { id: "o-2", label: "Blog", description: "One line" },
    ],
    ...overrides,
  }
}

function request(overrides: Partial<UserQuestionRequest> = {}): UserQuestionRequest {
  return {
    id: "qr-1",
    turn_id: "t-1",
    tool_call_id: "call-1",
    status: "pending",
    questions: [question()],
    created_at: T,
    ...overrides,
  }
}

function selection(overrides: Partial<DraftSelection> = {}): DraftSelection {
  return { selected: [], customText: "", customOpen: false, skipped: false, ...overrides }
}

describe("mergeQuestionRequest", () => {
  test("resolved never regresses to pending, even with a newer timestamp", () => {
    const resolved = request({ status: "answered", answered_at: T })
    const replayedPending = request({ status: "pending", answered_at: "2024-06-01T00:00:00Z" })
    expect(mergeQuestionRequest([resolved], replayedPending)[0]?.status).toBe("answered")
  })

  test("one resolved outcome never swaps for another", () => {
    const answered = request({ status: "answered", answered_at: T })
    const skipped = request({ status: "skipped", answered_at: "2024-06-01T00:00:00Z" })
    expect(mergeQuestionRequest([answered], skipped)[0]?.status).toBe("answered")
  })

  test("pending still advances to resolved", () => {
    const next = mergeQuestionRequest([request()], request({ status: "answered", answered_at: T }))
    expect(next[0]?.status).toBe("answered")
  })
})

describe("pendingQuestionRequest", () => {
  test("prefers the selected turn, one active card", () => {
    const other = request({ id: "qr-2", turn_id: "t-9" })
    expect(pendingQuestionRequest([other, request()], "t-1")?.id).toBe("qr-1")
    expect(pendingQuestionRequest([other], "t-1")?.id).toBe("qr-2")
    expect(pendingQuestionRequest([request({ status: "answered", answered_at: T })], "t-1")).toBeNull()
  })

  test("resolved sets sort oldest first for history", () => {
    const older = request({ id: "a", status: "answered", created_at: T, answered_at: T })
    const newer = request({ id: "b", status: "skipped", created_at: "2024-02-01T00:00:00Z" })
    expect(resolvedQuestionRequests([newer, older]).map((r) => r.id)).toEqual(["a", "b"])
  })
})

describe("readQuestionDraft", () => {
  beforeEach(() => localStorage.clear())

  test("malformed storage never crashes and drops bad entries", () => {
    localStorage.setItem("revbot-questions:c-1:qr-1", "{nope")
    expect(readQuestionDraft("c-1", "qr-1", [question()])).toBeNull()
    localStorage.setItem("revbot-questions:c-1:qr-1", JSON.stringify({ "q-1": { selected: "o-1" } }))
    expect(readQuestionDraft("c-1", "qr-1", [question()])).toEqual({})
  })

  test("unknown option ids are filtered, single keeps first, custom gated", () => {
    const draft: QuestionDraft = {
      "q-1": selection({ selected: ["o-2", "o-1", "ghost"], customText: "hi", customOpen: true }),
      stale: selection({ selected: ["o-1"] }),
    }
    writeQuestionDraft("c-1", "qr-1", draft)
    expect(readQuestionDraft("c-1", "qr-1", [question()])).toEqual({
      "q-1": selection({ selected: ["o-2"], customText: "hi", customOpen: true }),
    })
    const locked = question({ allow_custom: false })
    expect(readQuestionDraft("c-1", "qr-1", [locked])?.["q-1"]).toEqual(
      selection({ selected: ["o-2"] })
    )
    clearQuestionDraft("c-1", "qr-1")
    expect(localStorage.getItem("revbot-questions:c-1:qr-1")).toBeNull()
  })
})

describe("questionStepComplete", () => {
  test("unknown ids and disallowed custom never count", () => {
    const q = question()
    expect(questionStepComplete(q, selection({ selected: ["ghost"] }))).toBe(false)
    expect(questionStepComplete(q, selection({ selected: ["o-1"] }))).toBe(true)
    expect(questionStepComplete(q, selection({ customText: "  hi " }))).toBe(true)
    const locked = question({ allow_custom: false })
    expect(questionStepComplete(locked, selection({ customText: "hi" }))).toBe(false)
    expect(questionStepComplete(q, selection({ skipped: true }))).toBe(true)
  })
})

describe("buildQuestionAnswers", () => {
  test("absent or invalid entries fail closed, never silent-skip", () => {
    const qs = [question(), question({ id: "q-2", header: "Pages" })]
    const answers = buildQuestionAnswers(qs, { "q-1": selection({ selected: ["o-2", "o-1", "ghost"] }) })
    expect(answers[0]).toEqual({ question_id: "q-1", selected_option_ids: ["o-1"] })
    expect(answers[1]).toEqual({ question_id: "q-2", selected_option_ids: [] })
    expect(answers[1]?.skipped).toBeUndefined()
  })

  test("single custom replaces, multi custom accompanies, locked custom drops", () => {
    const single = buildQuestionAnswers([question()], {
      "q-1": selection({ selected: ["o-1"], customText: "mine" }),
    })
    expect(single[0]).toEqual({ question_id: "q-1", selected_option_ids: [], custom_text: "mine" })
    const multi = buildQuestionAnswers([question({ mode: "multiple" })], {
      "q-1": selection({ selected: ["o-2"], customText: "plus" }),
    })
    expect(multi[0]).toEqual({ question_id: "q-1", selected_option_ids: ["o-2"], custom_text: "plus" })
    const locked = buildQuestionAnswers([question({ allow_custom: false })], {
      "q-1": selection({ customText: "nope" }),
    })
    expect(locked[0]).toEqual({ question_id: "q-1", selected_option_ids: [] })
    const skipped = buildQuestionAnswers([question()], { "q-1": selection({ skipped: true }) })
    expect(skipped[0]).toEqual({ question_id: "q-1", selected_option_ids: [], skipped: true })
  })
})

describe("questionRequestSummaryLines", () => {
  test("labels, custom text, reply, skipped and cancelled", () => {
    const answered = request({
      status: "answered",
      answers: [{ question_id: "q-1", selected_option_ids: ["o-1"], custom_text: "extra" }],
      answered_at: T,
    })
    expect(questionRequestSummaryLines(answered)).toEqual(["Which source? — Docs · “extra”"])
    expect(questionRequestSummaryLines(request({ status: "answered", reply: "go ahead", answers: [], answered_at: T }))).toEqual([
      "You replied: go ahead",
    ])
    expect(questionRequestSummaryLines(request({ status: "skipped" }))).toEqual(["Questions skipped"])
    expect(questionRequestSummaryLines(request({ status: "cancelled" }))).toEqual(["Question cancelled"])
  })
})
