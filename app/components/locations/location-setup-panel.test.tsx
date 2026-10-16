import { describe, expect, test, afterEach } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { LocationSetupPanel } from "~/components/locations/location-setup-panel"
import type { LocationSetupResponse } from "~/lib/location-setup-api"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const mounted: Array<() => void> = []
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!()
  document.body.innerHTML = ""
})

function render(
  props: Partial<Parameters<typeof LocationSetupPanel>[0]> = {}
) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  const calls: string[] = []
  act(() => {
    root.render(
      <LocationSetupPanel
        canStart
        setup={null}
        isLoading={false}
        isStarting={false}
        startError=""
        onStart={(differences) => calls.push(differences)}
        {...props}
      />
    )
  })
  mounted.push(() => act(() => root.unmount()))
  return { host, calls }
}

function running(): LocationSetupResponse {
  return {
    status: "running",
    differences: "downtown branch",
    steps: [
      { id: "prepare", status: "completed" },
      { id: "profile", status: "running" },
      { id: "questions", status: "running" },
      { id: "map_queries", status: "pending" },
      { id: "ai_visibility", status: "pending" },
      { id: "maps_visibility", status: "pending" },
    ],
  }
}

describe("location setup panel", () => {
  test("ready shows the differences field and initialize, no invented estimate", async () => {
    const { host } = render({ setup: null })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("What is different at this location?")
    expect(host.innerHTML).toContain("Initialize Location")
    expect(host.innerHTML).toContain("no fixed price is quoted here")
    expect(host.innerHTML.includes("Maps credits")).toBe(false)
  })

  test("ready shows the backend estimate only when provided", async () => {
    const { host } = render({
      setup: { status: "ready", differences: "", steps: [], estimated_maps_credits: 135 },
      gridSummary: "4 map queries · 5.0 km radius",
    })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("up to 135 Maps credits")
    expect(host.innerHTML).toContain("final charge may differ")
  })

  test("initialize passes the typed differences", async () => {
    const { host, calls } = render({ setup: null })
    await act(async () => {
      await flushTestDom()
    })
    const textarea = host.querySelector("textarea")
    expect(textarea instanceof window.HTMLTextAreaElement).toBe(true)
    await act(async () => {
      textarea?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set
      nativeSetter?.call(textarea, "no weekend hours")
      textarea?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
      await flushTestDom()
    })
    const button = [...host.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("Initialize Location")
    )
    expect(button instanceof window.HTMLButtonElement).toBe(true)
    await act(async () => {
      button?.click()
      await flushTestDom()
    })
    expect(calls.length).toBe(1)
    expect(calls[0]).toBe("no weekend hours")
  })

  test("parallel active branches render side by side", async () => {
    const { host } = render({ setup: running() })
    await act(async () => {
      await flushTestDom()
    })
    const runningRows = (host.innerHTML.match(/Running/g) ?? []).length
    expect(runningRows).toBe(2)
    expect(host.innerHTML).toContain("What makes this location different")
    expect(host.querySelector("textarea")).toBeNull()
  })

  test("skipped steps keep their reasons", async () => {
    const { host } = render({
      setup: {
        status: "completed",
        differences: "",
        steps: [
          { id: "prepare", status: "completed" },
          { id: "profile", status: "completed" },
          { id: "questions", status: "completed" },
          { id: "map_queries", status: "completed" },
          { id: "ai_visibility", status: "completed" },
          {
            id: "maps_visibility",
            status: "skipped",
            reason: "Insufficient Maps credits",
          },
        ],
      },
    })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("Skipped")
    expect(host.innerHTML).toContain("Insufficient Maps credits")
  })

  test("failed keeps finished work and offers retry", async () => {
    const { host, calls } = render({
      setup: {
        ...running(),
        status: "failed",
        error: "quota exhausted",
        steps: running().steps.map((step) =>
          step.id === "profile" ? { ...step, status: "failed" as const } : step
        ),
      },
    })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("quota exhausted")
    expect(host.innerHTML).toContain("Try again")
    const button = [...host.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("Try again")
    )
    await act(async () => {
      button?.click()
      await flushTestDom()
    })
    expect(calls.length).toBe(1)
  })

  test("non-managers see the permission note instead of start", async () => {
    const { host } = render({ setup: null, canStart: false })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("Only a workspace manager")
    expect(host.innerHTML.includes("Initialize Location")).toBe(false)
  })
})
