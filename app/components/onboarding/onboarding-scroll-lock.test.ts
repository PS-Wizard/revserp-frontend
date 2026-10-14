import { afterEach, describe, expect, test } from "bun:test"

import { installTestDom } from "~/lib/dom-test-setup"
import { lockOnboardingScroll } from "./onboarding-scroll-lock"

installTestDom()

afterEach(() => {
  document.body.innerHTML = ""
})

function keyOn(target: Element, key: string) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe("onboarding scroll lock", () => {
  test("page scroll keys are blocked on background, pass on controls", async () => {
    const button = document.createElement("button")
    button.textContent = "Next"
    document.body.appendChild(button)
    const input = document.createElement("input")
    document.body.appendChild(input)

    const unlock = lockOnboardingScroll()
    try {
      expect(keyOn(document.body, " ")).toBe(true)
      expect(keyOn(document.body, "ArrowDown")).toBe(true)
      expect(keyOn(document.body, "PageDown")).toBe(true)
      expect(keyOn(document.body, "Home")).toBe(true)
      expect(keyOn(button, " ")).toBe(false)
      expect(keyOn(input, "ArrowDown")).toBe(false)
      expect(keyOn(document.body, "Enter")).toBe(false)
      expect(keyOn(document.body, "Tab")).toBe(false)
      expect(keyOn(document.body, "Escape")).toBe(false)

      const popover = document.createElement("div")
      popover.className = "driver-popover"
      document.body.appendChild(popover)
      expect(keyOn(popover, " ")).toBe(false)
    } finally {
      unlock()
    }
    expect(keyOn(document.body, " ")).toBe(false)
  })
})
