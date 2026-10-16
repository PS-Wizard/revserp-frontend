import { afterEach, describe, expect, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()
delete (Element.prototype as Partial<Element>).animate

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router"
import { flushTestDom } from "~/lib/dom-test-setup"

const { default: UpdatesPage } = await import("~/routes/app/updates")
const { RELEASE_ANNOUNCEMENTS } = await import("~/lib/release-announcements")
const { ANNOUNCEMENT_REPLAY_EVENT } = await import(
  "~/lib/announcement-events"
)

const RELEASE = RELEASE_ANNOUNCEMENTS[0]

function text() {
  return document.body.textContent ?? ""
}

describe("UpdatesPage", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  async function renderPage(initialEntry: string) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <UpdatesPage />
        </MemoryRouter>,
      )
      await flushTestDom()
    })
  }

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    document.body.innerHTML = ""
  })

  test("lists the release with summary, sections, and full bullet notes", async () => {
    await renderPage("/app/updates")
    expect(text().includes(RELEASE.title)).toBe(true)
    expect(text().includes(RELEASE.summary)).toBe(true)
    for (const section of RELEASE.sections) {
      expect(text().includes(section.title)).toBe(true)
      for (const item of section.items) {
        expect(text().includes(item)).toBe(true)
      }
    }
  })

  test("view highlights requests a replay of the same release", async () => {
    await renderPage("/app/updates")
    const received: Array<{ announcementId?: string }> = []
    const onReplay = (event: Event) => {
      received.push((event as CustomEvent).detail)
    }
    window.addEventListener(ANNOUNCEMENT_REPLAY_EVENT, onReplay)
    try {
      const buttons = Array.from(document.body.querySelectorAll("button"))
      const highlights = buttons.find((button) =>
        (button.textContent ?? "").includes("View highlights"),
      )
      if (!highlights) throw new Error("expected View highlights button")
      act(() => {
        highlights.click()
      })
      expect(received.some((detail) => detail.announcementId === RELEASE.id)).toBe(true)
    } finally {
      window.removeEventListener(ANNOUNCEMENT_REPLAY_EVENT, onReplay)
    }
  })

  test("back to workspace preserves the query string", async () => {
    await renderPage("/app/updates?project=project-1&crawl=crawl-9")
    const back = Array.from(document.body.querySelectorAll("a")).find((link) =>
      (link.textContent ?? "").includes("Back to workspace"),
    )
    if (!back) throw new Error("expected back to workspace link")
    expect(back.getAttribute("href")).toBe("/app?project=project-1&crawl=crawl-9")
  })
})
