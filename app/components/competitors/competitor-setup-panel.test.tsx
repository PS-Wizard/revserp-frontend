import { describe, expect, test, afterEach } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { CompetitorSetupPanel } from "~/components/competitors/competitor-setup-panel"
import type { CompetitorInitializationResponse } from "~/lib/api.types"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const mounted: Array<() => void> = []
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!()
  document.body.innerHTML = ""
})

function render(
  props: Partial<Parameters<typeof CompetitorSetupPanel>[0]> = {}
) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  const calls: string[] = []
  act(() => {
    root.render(
      <CompetitorSetupPanel
        canStart
        setup={null}
        isLoading={false}
        isStarting={false}
        startError=""
        onStart={() => calls.push("start")}
        onRetry={() => calls.push("retry")}
        {...props}
      />
    )
  })
  mounted.push(() => act(() => root.unmount()))
  return { host, calls }
}

function running(): CompetitorInitializationResponse {
  return {
    status: "running",
    steps: [
      { id: "crawl", status: "completed" },
      { id: "keyword_generation", status: "running" },
      { id: "keyword_analysis", status: "pending" },
    ],
  }
}

describe("competitor setup panel", () => {
  test("ready shows initialize without inventing progress", async () => {
    const { host } = render({ setup: null })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("Set up this competitor")
    expect(host.innerHTML).toContain("Initialize Competitor")
    expect(host.innerHTML.includes("Running")).toBe(false)
  })

  test("running steps render with reasons and percent", async () => {
    const { host } = render({
      setup: {
        ...running(),
        steps: [
          { id: "crawl", status: "completed" },
          {
            id: "keyword_generation",
            status: "running",
            reason: "reading pages",
          },
          { id: "keyword_analysis", status: "pending" },
        ],
      },
    })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("Crawl site")
    expect(host.innerHTML).toContain("Keyword generation")
    expect(host.innerHTML).toContain("Keyword analysis")
    expect(host.innerHTML).toContain("reading pages")
    expect(host.innerHTML).toContain("33%")
    expect(host.querySelector("button")).toBeNull()
  })

  test("failed keeps finished work and retries instead of restarting", async () => {
    const { host, calls } = render({
      setup: {
        ...running(),
        status: "failed",
        error: "crawl timed out",
        steps: running().steps.map((step) =>
          step.id === "keyword_generation"
            ? { ...step, status: "failed" as const }
            : step
        ),
      },
    })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("crawl timed out")
    expect(host.innerHTML).toContain("Try again")
    const button = [...host.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("Try again")
    )
    expect(button instanceof window.HTMLButtonElement).toBe(true)
    await act(async () => {
      button?.click()
      await flushTestDom()
    })
    expect(calls).toEqual(["retry"])
  })

  test("start calls onStart, not retry", async () => {
    const { host, calls } = render({ setup: null })
    await act(async () => {
      await flushTestDom()
    })
    const button = [...host.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("Initialize Competitor")
    )
    await act(async () => {
      button?.click()
      await flushTestDom()
    })
    expect(calls).toEqual(["start"])
  })

  test("completed shows every step done and no action", async () => {
    const { host } = render({
      setup: {
        status: "completed",
        steps: [
          { id: "crawl", status: "completed" },
          { id: "keyword_generation", status: "completed" },
          { id: "keyword_analysis", status: "completed" },
        ],
      },
    })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("Competitor ready")
    expect(host.innerHTML).toContain("Setup complete")
    expect(host.innerHTML).toContain("100%")
    expect(host.querySelector("button")).toBeNull()
  })

  test("non-managers see the permission note instead of start", async () => {
    const { host } = render({ setup: null, canStart: false })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("Only a workspace manager")
    expect(host.innerHTML.includes("Initialize Competitor")).toBe(false)
  })

  test("failed load shows the error with reload instead of initialize", async () => {
    const { host, calls } = render({
      setup: null,
      loadError: "Access denied.",
      onRetryLoad: () => calls.push("reload"),
    })
    await act(async () => {
      await flushTestDom()
    })
    expect(host.innerHTML).toContain("Access denied.")
    expect(host.innerHTML.includes("Initialize Competitor")).toBe(false)
    const button = [...host.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("Try again")
    )
    expect(button instanceof window.HTMLButtonElement).toBe(true)
    await act(async () => {
      button?.click()
      await flushTestDom()
    })
    expect(calls).toEqual(["reload"])
  })
})
