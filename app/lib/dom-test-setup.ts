import { Window } from "happy-dom"

/** Bun's built-in event classes shadow happy-dom's, so synthetic events fail
 * instanceof checks inside React. These always resolve to happy-dom's. */
const DOM_EVENT_GLOBALS = new Set([
  "Event",
  "CustomEvent",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "FocusEvent",
  "InputEvent",
  "SubmitEvent",
  "WheelEvent",
  "TouchEvent",
  "UIEvent",
])

/** happy-dom globals for mounted integration tests. Bun ships no DOM. */
export function installTestDom() {
  const existing = (globalThis as Record<string, unknown>).window
  if (existing && typeof existing === "object" && "happyDOM" in existing) return
  const window = new Window({ url: "http://localhost/" })
  const target = globalThis as Record<string, unknown>
  const source = window as unknown as Record<string, unknown>
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key === "undefined" || key === "NaN" || key === "Infinity") continue
    if (key in target && !DOM_EVENT_GLOBALS.has(key)) continue
    try {
      target[key] = source[key]
    } catch {
      continue
    }
  }
  target.window = window
  target.document = window.document
  target.navigator = window.navigator
  target.IS_REACT_ACT_ENVIRONMENT = true
}

export function flushTestDom() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}
