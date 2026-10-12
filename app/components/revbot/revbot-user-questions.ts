"use client"

import type {
  UserQuestion,
  UserQuestionAnswer,
  UserQuestionRequest,
} from "~/lib/api.types"

/** Pure rules for the ask_user_question wizard. SSE frames replay, so a
 * resolved set must never be pushed back to pending by a stale frame. */

export function isQuestionPending(request: UserQuestionRequest) {
  return request.status === "pending"
}

function isResolvedStatus(status: UserQuestionRequest["status"]) {
  return status === "answered" || status === "skipped" || status === "cancelled"
}

/** Forward-only merge by id. Resolved sets are terminal: never regress one to
 * pending, and never swap one resolved outcome for another. Returns the same
 * array when nothing moved, so a replayed frame does not re-render. */
export function mergeQuestionRequest(
  requests: UserQuestionRequest[],
  incoming: UserQuestionRequest
): UserQuestionRequest[] {
  const index = requests.findIndex((item) => item.id === incoming.id)
  if (index === -1) return [...requests, incoming]
  const existing = requests[index]!
  if (isResolvedStatus(existing.status)) return requests
  if (existing === incoming) return requests
  const next = [...requests]
  next[index] = incoming
  return next
}

export function mergeQuestionRequests(
  requests: UserQuestionRequest[],
  incoming: UserQuestionRequest[]
): UserQuestionRequest[] {
  let next = requests
  for (const item of incoming) next = mergeQuestionRequest(next, item)
  return next
}

/** One active card: the pending set for this turn first, else any pending set. */
export function pendingQuestionRequest(
  requests: UserQuestionRequest[],
  turnId: string | null
): UserQuestionRequest | null {
  const pending = requests.filter(isQuestionPending)
  if (pending.length === 0) return null
  if (turnId) {
    const scoped = pending.find((item) => item.turn_id === turnId)
    if (scoped) return scoped
  }
  return pending[0] ?? null
}

export function resolvedQuestionRequests(requests: UserQuestionRequest[]) {
  return requests
    .filter((item) => !isQuestionPending(item))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export type DraftSelection = {
  selected: string[]
  customText: string
  customOpen: boolean
  skipped: boolean
}

export type QuestionDraft = Record<string, DraftSelection>

const DRAFT_PREFIX = "revbot-questions:"

export function questionDraftKey(conversationId: string, requestId: string) {
  return `${DRAFT_PREFIX}${conversationId}:${requestId}`
}

function sanitizeDraftSelection(
  value: unknown,
  question: UserQuestion | undefined
): DraftSelection | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.selected)) return null
  if (typeof record.customText !== "string") return null
  if (typeof record.customOpen !== "boolean") return null
  if (typeof record.skipped !== "boolean") return null
  const selected = record.selected.filter((id): id is string => typeof id === "string")
  if (record.skipped) return { selected: [], customText: "", customOpen: false, skipped: true }
  if (!question) return { selected, customText: record.customText, customOpen: record.customOpen, skipped: false }
  const known = new Set(question.options.map((option) => option.id))
  const valid = selected.filter((id) => known.has(id))
  if (!question.allow_custom)
    return {
      selected: question.mode === "single" ? valid.slice(0, 1) : valid,
      customText: "",
      customOpen: false,
      skipped: false,
    }
  return {
    selected: question.mode === "single" ? valid.slice(0, 1) : valid,
    customText: record.customText,
    customOpen: record.customOpen,
    skipped: false,
  }
}

/** Stale or malformed storage never crashes the wizard; bad entries are
 * dropped and unknown option ids are filtered against the live questions. */
export function readQuestionDraft(
  conversationId: string,
  requestId: string,
  questions?: UserQuestion[]
): QuestionDraft | null {
  try {
    const raw = localStorage.getItem(
      questionDraftKey(conversationId, requestId)
    )
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object") return null
    const record = value as Record<string, unknown>
    const byId = new Map((questions ?? []).map((item) => [item.id, item]))
    const draft: QuestionDraft = {}
    for (const [id, entry] of Object.entries(record)) {
      if (questions && !byId.has(id)) continue
      const clean = sanitizeDraftSelection(entry, byId.get(id))
      if (clean) draft[id] = clean
    }
    return draft
  } catch {
    return null
  }
}

export function writeQuestionDraft(
  conversationId: string,
  requestId: string,
  draft: QuestionDraft
) {
  try {
    localStorage.setItem(
      questionDraftKey(conversationId, requestId),
      JSON.stringify(draft)
    )
  } catch {}
}

export function clearQuestionDraft(conversationId: string, requestId: string) {
  try {
    localStorage.removeItem(questionDraftKey(conversationId, requestId))
  } catch {}
}

/** A step is done only with an explicit skip, a known option id, or allowed
 * custom text. Unknown ids and disallowed custom text never count. */
export function questionStepComplete(
  question: UserQuestion,
  selection: DraftSelection
): boolean {
  if (selection.skipped) return true
  const known = new Set(question.options.map((option) => option.id))
  if (selection.selected.some((id) => known.has(id))) return true
  if (!question.allow_custom) return false
  return selection.customText.trim().length > 0
}

/** Canonical answers in question order, selections in option order. Absent or
 * invalid entries emit an empty non-skipped answer so the server rejects
 * them — a silent skip is never invented. */
export function buildQuestionAnswers(
  questions: UserQuestion[],
  draft: QuestionDraft
): UserQuestionAnswer[] {
  return questions.map((question) => {
    const empty: UserQuestionAnswer = { question_id: question.id, selected_option_ids: [] }
    const selection = draft[question.id]
    if (!selection) return empty
    if (selection.skipped)
      return { question_id: question.id, selected_option_ids: [], skipped: true }
    const order = new Map(question.options.map((option, i) => [option.id, i]))
    const selected = [...new Set(selection.selected)]
      .filter((id) => order.has(id))
      .sort((a, b) => order.get(a)! - order.get(b)!)
    const custom = question.allow_custom ? selection.customText.trim() : ""
    if (question.mode === "single") {
      if (custom) return { question_id: question.id, selected_option_ids: [], custom_text: custom }
      const first = selected[0]
      return first
        ? { question_id: question.id, selected_option_ids: [first] }
        : empty
    }
    if (selected.length === 0 && !custom) return empty
    const answer: UserQuestionAnswer = {
      question_id: question.id,
      selected_option_ids: selected,
    }
    if (custom) answer.custom_text = custom
    return answer
  })
}

function optionLabel(
  question: UserQuestion,
  optionId: string
): string | null {
  return (
    question.options.find((option) => option.id === optionId)?.label ?? null
  )
}

/** One-line history summary per question, plus the direct-reply case. */
export function questionRequestSummaryLines(
  request: UserQuestionRequest
): string[] {
  if (request.status === "cancelled") return ["Question cancelled"]
  if (request.status === "skipped") return ["Questions skipped"]
  if (request.reply?.trim()) return [`You replied: ${request.reply.trim()}`]
  const byId = new Map(
    (request.answers ?? []).map((answer) => [answer.question_id, answer])
  )
  return request.questions.map((question) => {
    const answer = byId.get(question.id)
    if (!answer || answer.skipped) return `${question.prompt} — skipped`
    const picked = answer.selected_option_ids
      .map((id) => optionLabel(question, id))
      .filter((label): label is string => label !== null)
    const custom = answer.custom_text?.trim()
    const detail = [...picked, ...(custom ? [`“${custom}”`] : [])].join(" · ")
    return detail ? `${question.prompt} — ${detail}` : question.prompt
  })
}
