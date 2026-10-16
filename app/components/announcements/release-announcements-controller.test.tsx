import { afterEach, describe, expect, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()
delete (Element.prototype as Partial<Element>).animate

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { flushTestDom } from "~/lib/dom-test-setup"

const { ReleaseAnnouncementsController } = await import(
  "~/components/announcements/release-announcements-controller"
)
const { RELEASE_ANNOUNCEMENTS } = await import("~/lib/release-announcements")
const { requestAnnouncementReplay } = await import(
  "~/lib/announcement-events"
)

const RELEASE = RELEASE_ANNOUNCEMENTS[0]
const SEEN_PAYLOAD = (seen: string[]) => ({
  seen_announcements: seen.map((id) => ({
    announcement_id: id,
    seen_at: "2026-10-17T00:00:00Z",
  })),
  user_created_at: "2026-01-10T00:00:00Z",
})

describe("ReleaseAnnouncementsController", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null
  let blocker: HTMLDivElement | null = null
  let seenForTest: string[] = []
  const realFetch = globalThis.fetch

  function stubFetch() {
    globalThis.fetch = (async (url: unknown) => {
      const text = String(url)
      if (text.includes("/me/announcements/seen")) {
        return new Response(
          JSON.stringify(SEEN_PAYLOAD(seenForTest)),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch
  }

  async function renderController(userId: string) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/app?project=project-1&crawl=crawl-9"]}>
          <QueryClientProvider client={client}>
            <ReleaseAnnouncementsController
              userId={userId}
              onboardingStatus="completed"
              setupPanelVisible={false}
              setupRunning={false}
            />
          </QueryClientProvider>
        </MemoryRouter>,
      )
      await flushTestDom()
    })
    for (let index = 0; index < 4; index++) {
      await act(async () => {
        await flushTestDom()
      })
    }
  }

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    blocker?.remove()
    blocker = null
    seenForTest = []
    document.body.innerHTML = ""
    globalThis.fetch = realFetch
  })

  test("auto stays blocked behind a real dialog then opens when removed", async () => {
    stubFetch()
    blocker = document.createElement("div")
    blocker.setAttribute("role", "dialog")
    document.body.appendChild(blocker)
    await renderController("user-blocked")
    expect(document.body.textContent?.includes("What's new")).toBe(false)
    await act(async () => {
      blocker?.remove()
      await flushTestDom()
    })
    for (let index = 0; index < 3; index++) {
      await act(async () => {
        await flushTestDom()
      })
    }
    expect(document.body.textContent?.includes("What's new")).toBe(true)
  })

  test("manual replay still opens a seen release auto skips", async () => {
    seenForTest = [RELEASE.id]
    stubFetch()
    await renderController("user-seen")
    expect(document.body.textContent?.includes("What's new")).toBe(false)
    await act(async () => {
      requestAnnouncementReplay(RELEASE.id)
      await flushTestDom()
    })
    for (let index = 0; index < 3; index++) {
      await act(async () => {
        await flushTestDom()
      })
    }
    expect(document.body.textContent?.includes("What's new")).toBe(true)
  })

  test("the persistent revbot island never blocks the carousel", async () => {
    stubFetch()
    const island = document.createElement("div")
    island.setAttribute("role", "dialog")
    island.setAttribute("aria-label", "Revbot")
    document.body.appendChild(island)
    await renderController("user-island")
    await act(async () => {
      requestAnnouncementReplay(RELEASE.id)
      await flushTestDom()
    })
    expect(document.body.textContent?.includes("What's new")).toBe(true)
    island.remove()
  })
})
