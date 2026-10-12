import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import { RevbotComposer } from "./revbot-composer"

installRevbotDom()

async function mountComposer(waitingForQuestion: boolean) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <RevbotComposer
        active={false}
        allowedEfforts={["none"]}
        disabled={false}
        effort="none"
        onEffortChange={() => {}}
        onSend={() => {}}
        onStop={() => {}}
        showMic={false}
        stopping={false}
        variant="default"
        waitingForQuestion={waitingForQuestion}
      />
    )
    await flushRevbot()
  })
  return { root, container }
}

function pasteImage(textarea: Element) {
  const file = new File(["x"], "a.png", { type: "image/png" })
  const event = new Event("paste", { bubbles: true })
  Object.defineProperty(event, "clipboardData", {
    value: { items: [{ type: "image/png", getAsFile: () => file }] },
  })
  return act(async () => {
    textarea.dispatchEvent(event)
    await flushRevbot()
  })
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("RevbotComposer question guards", () => {
  test("pasted images are accepted normally", async () => {
    const { root, container } = await mountComposer(false)
    try {
      await pasteImage(container.querySelector("textarea")!)
      expect(container.querySelectorAll("img")).toHaveLength(1)
    } finally {
      await act(async () => {
        root.unmount()
      })
      document.body.innerHTML = ""
    }
  })

  test("pasted images are rejected while answering, prompt untouched", async () => {
    const { root, container } = await mountComposer(true)
    try {
      const attach = [...container.querySelectorAll("button")].find(
        (b) => b.getAttribute("aria-label") === "Attach images"
      )
      expect(attach?.hasAttribute("disabled")).toBe(true)
      await pasteImage(container.querySelector("textarea")!)
      expect(container.querySelectorAll("img")).toHaveLength(0)
      expect((container.querySelector("textarea") as HTMLTextAreaElement)?.value).toBe("")
    } finally {
      await act(async () => {
        root.unmount()
      })
      document.body.innerHTML = ""
    }
  })
})
