import { afterEach, describe, expect, test } from "bun:test"
import { act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import type { Components } from "react-markdown"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import { RevbotMarkdown } from "./revbot-markdown"

installRevbotDom()

let pRenders = 0

afterEach(() => {
  pRenders = 0
  document.body.innerHTML = ""
})

function CountingP({ children }: { children?: ReactNode }) {
  pRenders += 1
  return <p>{children}</p>
}

async function mountMarkdown(children: string, components: Components) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <RevbotMarkdown components={components}>{children}</RevbotMarkdown>
    )
    await flushRevbot()
  })
  async function update(nextChildren: string, nextComponents: Components) {
    await act(async () => {
      root.render(
        <RevbotMarkdown components={nextComponents}>
          {nextChildren}
        </RevbotMarkdown>
      )
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

describe("RevbotMarkdown memo", () => {
  test("identical props skip the custom component re-render", async () => {
    const components: Components = { p: CountingP }
    const { container, update, unmount } = await mountMarkdown(
      "hello",
      components
    )
    try {
      const baseline = pRenders
      expect(baseline > 0).toBe(true)
      await update("hello", components)
      expect(pRenders).toBe(baseline)
      expect((container.textContent ?? "").includes("hello")).toBe(true)
    } finally {
      await unmount()
    }
  })

  test("changed text still updates", async () => {
    const components: Components = { p: CountingP }
    const { container, update, unmount } = await mountMarkdown(
      "hello",
      components
    )
    try {
      const baseline = pRenders
      await update("hello world", components)
      expect(pRenders > baseline).toBe(true)
      expect((container.textContent ?? "").includes("hello world")).toBe(true)
    } finally {
      await unmount()
    }
  })

  test("a new components object still updates", async () => {
    const { container, update, unmount } = await mountMarkdown("hello", {
      p: CountingP,
    })
    try {
      const baseline = pRenders
      await update("hello", { p: CountingP })
      expect(pRenders > baseline).toBe(true)
      expect((container.textContent ?? "").includes("hello")).toBe(true)
    } finally {
      await unmount()
    }
  })
})
