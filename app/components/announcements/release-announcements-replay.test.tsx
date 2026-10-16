import { describe, expect, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()
delete (Element.prototype as Partial<Element>).animate

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom } from "~/lib/dom-test-setup"

const { ProfileMenu } = await import("~/components/app-navbar/profile-menu")
const { ReleaseAnnouncementsController } = await import(
  "~/components/announcements/release-announcements-controller"
)
const { RELEASE_ANNOUNCEMENTS } = await import("~/lib/release-announcements")
const { default: UpdatesPage } = await import("~/routes/app/updates")

const RELEASE = RELEASE_ANNOUNCEMENTS[0]
const realFetch = globalThis.fetch

function stubFetch() {
  globalThis.fetch = (async (url: unknown) => {
    const text = String(url)
    if (text.includes("/me/announcements/seen")) {
      return new Response(
        JSON.stringify({
          seen_announcements: [],
          user_created_at: "2026-01-10T00:00:00Z",
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }) as typeof fetch
}

describe("profile whats new replay", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  async function renderShell() {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/app?project=project-1"]}>
          <QueryClientProvider client={client}>
            <ProfileMenu
              initials="SP"
              workspaceState="idle"
              profileActionError=""
              userName="Preview User"
              isPlatformAdmin={false}
              onLogout={() => {}}
              onTakeTour={() => {}}
            />
            <div role="dialog" aria-label="Revbot">
              persistent revbot island
            </div>
            <div aria-hidden="true" inert>
              <section role="dialog" aria-label="Extracted page" aria-modal="true" />
            </div>
            <UpdatesPage />
            <ReleaseAnnouncementsController
              userId="replay-user"
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

  test("clicking whats new opens the carousel beside a persistent island", async () => {
    stubFetch()
    await renderShell()
    const trigger = document.querySelector(
      'button[aria-label="Open profile and workspace menu"]',
    ) as HTMLElement | null
    expect(Boolean(trigger)).toBe(true)
    await act(async () => {
      trigger?.click()
      await flushTestDom()
    })
    const menuItem = Array.from(
      document.querySelectorAll('[role="menuitem"], [data-slot="dropdown-menu-item"]'),
    ).find((entry) => entry.textContent?.includes("What")) as HTMLElement | null
    expect(Boolean(menuItem)).toBe(true)
    await act(async () => {
      menuItem?.click()
      await flushTestDom()
      await flushTestDom()
    })
    expect(document.body.textContent?.includes(RELEASE.title)).toBe(true)
    const carousel = Array.from(document.querySelectorAll('[role="dialog"]')).find((entry) =>
      entry.textContent?.includes("What's new") ?? false,
    )
    expect(Boolean(carousel)).toBe(true)
    await act(async () => {
      const close = document.querySelector('[data-slot="dialog-close"]') as HTMLElement | null
      close?.click()
      await flushTestDom()
    })
    const viewHighlights = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("View highlights") ?? false,
    ) as HTMLElement | null
    expect(Boolean(viewHighlights)).toBe(true)
    await act(async () => {
      viewHighlights?.click()
      await flushTestDom()
      await flushTestDom()
    })
    const reopened = Array.from(document.querySelectorAll('[role="dialog"]')).find((entry) =>
      entry.textContent?.includes("What's new") ?? false,
    )
    expect(Boolean(reopened)).toBe(true)
    globalThis.fetch = realFetch
    if (root) act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    document.body.innerHTML = ""
  })
})
