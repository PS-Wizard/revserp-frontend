import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import {
  RevbotQuestionHistory,
  RevbotQuestionWizard,
} from "./revbot-question-card"
import type {
  UserQuestion,
  UserQuestionAnswer,
  UserQuestionRequest,
} from "~/lib/api.types"

installRevbotDom()

const T = "2024-01-01T00:00:00Z"

function question(overrides: Partial<UserQuestion> & { id: string }): UserQuestion {
  const n = overrides.id.replace("q-", "")
  return {
    header: `Step${n}`,
    prompt: `Prompt ${n}?`,
    description: `About ${n}`,
    mode: "single",
    allow_custom: true,
    options: [
      { id: `${overrides.id}-a`, label: `Alpha ${n}`, description: "First choice", recommended: true },
      { id: `${overrides.id}-b`, label: `Beta ${n}`, url: "https://example.com/docs" },
    ],
    ...overrides,
  }
}

function request(questions: UserQuestion[]): UserQuestionRequest {
  return {
    id: "qr-1",
    turn_id: "t-1",
    tool_call_id: "call-1",
    status: "pending",
    questions,
    created_at: T,
  }
}

async function mountWizard(
  questions: UserQuestion[],
  onSubmit: (a: UserQuestionAnswer[]) => void,
  seed?: Record<string, { selected: string[]; customText: string; customOpen: boolean; skipped: boolean }>
) {
  localStorage.clear()
  if (seed) {
    const { writeQuestionDraft } = await import("./revbot-user-questions")
    writeQuestionDraft("c-1", "qr-1", seed)
  }
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <RevbotQuestionWizard
        conversationId="c-1"
        request={request(questions)}
        busy={false}
        error={null}
        onSubmit={onSubmit}
      />
    )
    await flushRevbot()
  })
  return { root, container }
}

function buttons(container: ParentNode, label: string) {
  return [...container.querySelectorAll("button")].filter(
    (b) => b.textContent?.trim() === label
  )
}

function chip(container: ParentNode, header: string) {
  return container.querySelector(`button[aria-label^="Question "][aria-label$=": ${header}"]`)
}

async function click(el: Element | null) {
  if (!el) throw new Error("element not found")
  await act(async () => {
    ;(el as HTMLElement).click()
    await flushRevbot()
  })
}

async function unmount(root: Root) {
  await act(async () => {
    root.unmount()
  })
  document.body.innerHTML = ""
}

afterEach(() => {
  document.body.innerHTML = ""
  localStorage.clear()
})

describe("RevbotQuestionWizard", () => {
  test("no defaults: nothing checked, Continue blocked, chips show headers", async () => {
    const { root, container } = await mountWizard(
      [question({ id: "q-1" }), question({ id: "q-2" })],
      () => {}
    )
    try {
      expect(container.textContent).toContain("Prompt 1?")
      expect(chip(container, "Step1")?.getAttribute("aria-current")).toBe("step")
      expect(chip(container, "Step2")?.getAttribute("aria-current")).toBeNull()
      expect([...container.querySelectorAll('input[type="radio"]')].some((i) => (i as HTMLInputElement).checked)).toBe(false)
      expect(buttons(container, "Continue")[0]?.hasAttribute("disabled")).toBe(true)
    } finally {
      await unmount(root)
    }
  })

  test("select, continue, back preserves; chip jump preserves drafts", async () => {
    const seen: UserQuestionAnswer[][] = []
    const { root, container } = await mountWizard(
      [question({ id: "q-1" }), question({ id: "q-2" })],
      (a) => void seen.push(a)
    )
    try {
      await click(container.querySelector('input[type="radio"]'))
      await click(buttons(container, "Continue")[0])
      expect(container.textContent).toContain("Prompt 2?")
      await click(buttons(container, "Back")[0])
      expect(container.textContent).toContain("Prompt 1?")
      expect([...container.querySelectorAll('input[type="radio"]')].filter((i) => (i as HTMLInputElement).checked)).toHaveLength(1)
      await click(chip(container, "Step2"))
      expect(container.textContent).toContain("Prompt 2?")
      await click(chip(container, "Step1"))
      expect([...container.querySelectorAll('input[type="radio"]')].filter((i) => (i as HTMLInputElement).checked)).toHaveLength(1)
      expect(seen).toHaveLength(0)
    } finally {
      await unmount(root)
    }
  })

  test("single custom replaces selection; picking an option closes the textarea", async () => {
    const seen: UserQuestionAnswer[][] = []
    const first = await mountWizard([question({ id: "q-1" })], (a) => void seen.push(a))
    try {
      await click(first.container.querySelector('input[type="radio"]'))
      await click(buttons(first.container, "Something else")[0])
      expect(first.container.querySelector("textarea") === null).toBe(false)
      await click(first.container.querySelectorAll('input[type="radio"]')[1])
      expect(first.container.querySelector("textarea")).toBeNull()
      expect(
        [...first.container.querySelectorAll('input[type="radio"]')].filter(
          (i) => (i as HTMLInputElement).checked
        )
      ).toHaveLength(1)
    } finally {
      await unmount(first.root)
    }
    const seeded = await mountWizard([question({ id: "q-1" })], (a) => void seen.push(a), {
      "q-1": { selected: ["q-1-a"], customText: "custom words", customOpen: true, skipped: false },
    })
    try {
      expect((seeded.container.querySelector("textarea") as HTMLTextAreaElement)?.value).toBe("custom words")
      await click(buttons(seeded.container, "Submit answers")[0])
      expect(seen).toHaveLength(1)
      expect(seen[0]?.[0]).toEqual({ question_id: "q-1", selected_option_ids: [], custom_text: "custom words" })
    } finally {
      await unmount(seeded.root)
    }
  })

  test("final submit validates every step even after chip jumps", async () => {
    const seen: UserQuestionAnswer[][] = []
    const qs = [question({ id: "q-1" }), question({ id: "q-2" }), question({ id: "q-3" })]
    const { root, container } = await mountWizard(qs, (a) => void seen.push(a))
    try {
      await click(container.querySelector('input[type="radio"]'))
      await click(chip(container, "Step3"))
      await click(container.querySelector('input[type="radio"]'))
      await click(buttons(container, "Submit answers")[0])
      expect(seen).toHaveLength(0)
      expect(container.textContent).toContain("Prompt 2?")
      await click(buttons(container, "Skip question")[0])
      expect(seen).toHaveLength(0)
      expect(container.textContent).toContain("Prompt 3?")
      await click(buttons(container, "Submit answers")[0])
      expect(seen).toHaveLength(1)
      expect(seen[0]).toEqual([
        { question_id: "q-1", selected_option_ids: ["q-1-a"] },
        { question_id: "q-2", selected_option_ids: [], skipped: true },
        { question_id: "q-3", selected_option_ids: ["q-3-a"] },
      ])
    } finally {
      await unmount(root)
    }
  })

  test("option description is one line with full text available; source link independent", async () => {
    const { root, container } = await mountWizard([question({ id: "q-1" })], () => {})
    try {
      const desc = [...container.querySelectorAll("span")].find((s) => s.textContent === "First choice")
      expect(desc?.className).toContain("truncate")
      expect(desc?.getAttribute("title")).toBe("First choice")
      const link = container.querySelector('a[href="https://example.com/docs"]')
      expect(link?.getAttribute("target")).toBe("_blank")
      expect(link?.getAttribute("rel")).toContain("noopener")
    } finally {
      await unmount(root)
    }
  })
})

describe("RevbotQuestionHistory", () => {
  test("renders chosen labels, reply, skipped and cancelled", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    const answered = request([question({ id: "q-1" })])
    answered.status = "answered"
    answered.answers = [{ question_id: "q-1", selected_option_ids: ["q-1-a"] }]
    answered.answered_at = T
    const skipped = request([question({ id: "q-2" })])
    skipped.id = "qr-2"
    skipped.status = "skipped"
    await act(async () => {
      root.render(<RevbotQuestionHistory requests={[answered, skipped]} />)
      await flushRevbot()
    })
    try {
      expect(container.textContent).toContain("Alpha 1")
      expect(container.textContent).toContain("Questions skipped")
    } finally {
      await unmount(root)
    }
  })
})
