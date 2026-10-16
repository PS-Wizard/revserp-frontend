import { afterEach, describe, expect, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()
delete (Element.prototype as Partial<Element>).animate

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushTestDom } from "~/lib/dom-test-setup"

const { ReleaseAnnouncementDialog } = await import(
  "~/components/announcements/release-announcement-dialog"
)
const { RELEASE_ANNOUNCEMENTS } = await import("~/lib/release-announcements")

const RELEASE = RELEASE_ANNOUNCEMENTS[0]
const FIRST_SLIDE = RELEASE.slides[0]
const SECOND_SLIDE = RELEASE.slides[1]

function text() {
  return document.body.textContent ?? ""
}

describe("ReleaseAnnouncementDialog", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null
  const controller: { setOpen: (open: boolean) => void } = {
    setOpen: () => undefined,
  }
  let seen: boolean[]
  let viewAllCalls = 0

  async function renderDialog() {
    seen = []
    viewAllCalls = 0
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    function Harness() {
      const [open, setOpen] = useState(true)
      controller.setOpen = setOpen
      return (
        <ReleaseAnnouncementDialog
          release={RELEASE}
          open={open}
          onOpenChange={(next) => {
            seen.push(next)
            setOpen(next)
          }}
          onViewAll={() => {
            viewAllCalls += 1
          }}
        />
      )
    }
    await act(async () => {
      root?.render(<Harness />)
      await flushTestDom()
    })
  }

  function click(element: Element | null) {
    if (!element) throw new Error("expected element to exist")
    act(() => {
      ;(element as HTMLElement).click()
    })
  }

  function findButton(name: string) {
    const buttons = Array.from(document.body.querySelectorAll("button"))
    const found = buttons.find((button) =>
      (button.textContent ?? "").includes(name),
    )
    if (!found) throw new Error(`expected button "${name}"`)
    return found
  }

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    document.body.innerHTML = ""
  })

  test("shows the first highlight with step count and labeled dots", async () => {
    await renderDialog()
    expect(text().includes(FIRST_SLIDE.title)).toBe(true)
    expect(text().includes(`1 of ${RELEASE.slides.length}`)).toBe(true)
    const dots = document.body.querySelectorAll(
      'button[aria-label^="Go to slide"]',
    )
    expect(dots.length).toBe(RELEASE.slides.length)
  })

  test("next and back change the visible slide", async () => {
    await renderDialog()
    click(findButton("Next"))
    expect(text().includes(SECOND_SLIDE.title)).toBe(true)
    expect(text().includes(`2 of ${RELEASE.slides.length}`)).toBe(true)
    click(findButton("Back"))
    expect(text().includes(FIRST_SLIDE.title)).toBe(true)
  })

  test("a dot jumps directly to its slide", async () => {
    await renderDialog()
    const dot = document.body.querySelector(
      `button[aria-label="Go to slide 3: ${RELEASE.slides[2].title}"]`,
    )
    click(dot)
    expect(text().includes(RELEASE.slides[2].title)).toBe(true)
    expect(text().includes(`3 of ${RELEASE.slides.length}`)).toBe(true)
  })

  test("done on the last slide closes the dialog", async () => {
    await renderDialog()
    for (let i = 1; i < RELEASE.slides.length; i += 1) {
      click(findButton("Next"))
    }
    expect(text().includes(`6 of ${RELEASE.slides.length}`)).toBe(true)
    click(findButton("Done"))
    expect(seen.includes(false)).toBe(true)
  })

  test("step resets when the dialog reopens", async () => {
    await renderDialog()
    click(findButton("Next"))
    expect(text().includes(SECOND_SLIDE.title)).toBe(true)
    await act(async () => {
      controller.setOpen(false)
      await flushTestDom()
    })
    await act(async () => {
      controller.setOpen(true)
      await flushTestDom()
    })
    expect(text().includes(FIRST_SLIDE.title)).toBe(true)
    expect(text().includes(`1 of ${RELEASE.slides.length}`)).toBe(true)
  })

  test("view all updates calls back without closing", async () => {
    await renderDialog()
    click(findButton("View all updates"))
    expect(viewAllCalls).toBe(1)
    expect(seen.length).toBe(0)
    expect(text().includes(FIRST_SLIDE.title)).toBe(true)
  })
})
