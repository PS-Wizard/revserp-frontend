import { afterEach, describe, expect, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

import { act } from "react"
import { driver } from "driver.js"

async function settle(rounds = 8) {
  await act(async () => {
    for (let i = 0; i < rounds; i++) {
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
  })
}

afterEach(() => {
  document.body.innerHTML = ""
})

function overlayCount() {
  return document.querySelectorAll(".driver-overlay").length
}

function popoverCount() {
  return document.querySelectorAll(".driver-popover").length
}

async function runFixture(path: string) {
  const { spawnSync } = await import("node:child_process")
  const proc = spawnSync(process.execPath, [path], {
    encoding: "utf-8",
    timeout: 90_000,
  })
  const output = typeof proc.stdout === "string" ? proc.stdout : ""
  const line = output
    .split("\n")
    .find((entry: string) => entry.startsWith("ONBOARDING_FIXTURE_RESULT "))
  expect(proc.status).toBe(0)
  expect(!!line).toBe(true)
  const result = JSON.parse(line!.slice("ONBOARDING_FIXTURE_RESULT ".length)) as {
    failures: string[]
  }
  expect(result.failures).toEqual([])
}

describe("onboarding driver initial focus", () => {
  test("showing and advancing never moves focus", async () => {
    document.body.innerHTML =
      `<button id="before">Before</button><button id="step-a">A</button><button id="step-b">B</button>`
    const before = document.querySelector("#before") as HTMLButtonElement
    before.focus()
    expect(document.activeElement).toBe(before)
    const tour = driver({
      animate: false,
      allowClose: true,
      overlayClickBehavior: "none",
      popoverClass: "onboarding-tour-popover",
      showButtons: ["next", "close"],
      steps: [
        { element: "#step-a", popover: { title: "A", description: "First" } },
        { element: "#step-b", popover: { title: "B", description: "Second" } },
      ],
    })
    tour.drive(0)
    await settle(3)
    expect(document.activeElement).toBe(before)
    tour.drive(1)
    await settle(3)
    expect(document.activeElement).toBe(before)
    tour.destroy()
    await settle(2)
    expect(document.activeElement).toBe(before)
    document.body.innerHTML = ""
  })

  test("tab cycles popover controls without leaving the tour", async () => {
    document.body.innerHTML = `<button id="step-a">A</button>`
    const tour = driver({
      animate: false,
      allowClose: true,
      overlayClickBehavior: "none",
      popoverClass: "onboarding-tour-popover",
      showButtons: ["next", "close"],
      steps: [{ element: "#step-a", popover: { title: "A", description: "First" } }],
    })
    tour.drive(0)
    await settle(3)
    const next = document.querySelector(".driver-popover-next-btn") as HTMLButtonElement
    const close = document.querySelector(".driver-popover-close-btn") as HTMLButtonElement
    const step = document.querySelector("#step-a") as HTMLButtonElement
    next.focus()
    expect(document.activeElement).toBe(next)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }))
    await settle(2)
    expect(document.activeElement).toBe(step)
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, shiftKey: true }),
    )
    await settle(2)
    expect(document.activeElement).toBe(next)
    close.focus()
    expect(document.activeElement).toBe(close)
    tour.destroy()
    await settle(2)
    document.body.innerHTML = ""
  })

  test("escape still reaches the dismiss hook", async () => {
    document.body.innerHTML = `<button id="step-a">A</button>`
    let dismissed = 0
    const tour = driver({
      animate: false,
      allowClose: true,
      overlayClickBehavior: "none",
      popoverClass: "onboarding-tour-popover",
      showButtons: ["next", "close"],
      onDestroyStarted: () => {
        dismissed += 1
        tour.destroy()
      },
      steps: [{ element: "#step-a", popover: { title: "A", description: "First" } }],
    })
    tour.drive(0)
    await settle(3)
    expect(overlayCount()).toBe(1)
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true, cancelable: true }))
    await settle(3)
    expect(dismissed).toBe(1)
    expect(overlayCount()).toBe(0)
    document.body.innerHTML = ""
  })
})

describe("onboarding tour popover states", () => {
  test("close and footer states stay white on blue", async () => {
    const { readFile } = await import("node:fs/promises")
    const css = await readFile(new URL("./onboarding-tour.css", import.meta.url), "utf8")
    for (const pseudo of ["hover", "focus", "focus-visible", "active"]) {
      expect(css.includes(`.driver-popover-close-btn:${pseudo}`)).toBe(true)
      expect(css.includes(`.driver-popover-next-btn:${pseudo}`)).toBe(true)
      expect(css.includes(`.driver-popover-prev-btn:${pseudo}`)).toBe(true)
    }
    const closeBlock = css.slice(css.indexOf(".driver-popover-close-btn:hover"))
    expect(/color:\s*#fff/.test(closeBlock.slice(0, closeBlock.indexOf("}")))).toBe(true)
    expect(css.includes("#2d2d2d")).toBe(false)
  })
})

describe("onboarding driver overlay lifecycle", () => {
  test("drive transitions keep a single overlay and destroy removes everything", async () => {
    document.body.innerHTML = `<button id="step-a">A</button><button id="step-b">B</button>`
    const tour = driver({
      animate: false,
      overlayClickBehavior: "none",
      popoverClass: "onboarding-tour-popover",
      steps: [
        { element: "#step-a", popover: { title: "A", description: "First" } },
        { element: "#step-b", popover: { title: "B", description: "Second" } },
      ],
    })
    tour.drive(0)
    await settle(3)
    expect(overlayCount()).toBe(1)
    expect(popoverCount()).toBe(1)

    // The tour pattern: fixed step list, drive(index) alone, never setSteps.
    tour.drive(1)
    await settle(3)
    expect(overlayCount()).toBe(1)
    expect(popoverCount()).toBe(1)

    tour.destroy()
    await settle(2)
    expect(overlayCount()).toBe(0)
    expect(popoverCount()).toBe(0)
    document.body.innerHTML = ""
  })
})

describe("onboarding creation dialog acceptance", () => {
  test("real dialog and driver accept in an isolated subprocess", async () => {
    // Base UI caches the document at first suite-wide import, so the real
    // portal only mounts in a fresh process. The fixture below runs the
    // real CreateProjectDialog with the real Driver and reports JSON.
    await runFixture("app/components/onboarding/dialog-acceptance.fixture.tsx")
  })
})

describe("onboarding business drawer acceptance", () => {
  test("real drawer and driver accept in an isolated subprocess", async () => {
    // Vaul loads before any DOM exists in shared-registry suite runs, after
    // which its portal never mounts in-process. The fixture below runs the
    // real BusinessProfileDrawer with the real Driver and reports JSON.
    await runFixture("app/components/onboarding/drawer-acceptance.fixture.tsx")
  })
})
