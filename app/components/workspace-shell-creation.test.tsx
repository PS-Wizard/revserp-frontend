import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

// Same portal stand-in as the locations suite: Base UI caches the document
// at first suite-wide import, so the real portal cannot mount reliably here.
// The create form itself stays real and submits through the shell handler.
mock.module("~/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <>{children}</> : null),
  DialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { createMemoryRouter, RouterProvider } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const { WorkspaceShellPreview } = await import(
  "~/components/workspace-shell-preview"
)
import { flushTestDom } from "~/lib/dom-test-setup"

type PostedProject = { url: string; body: unknown }

function stubFetch(posts: PostedProject[]) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    if (method === "POST" && url.includes("/organizations/org-1/projects")) {
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : init?.body
      posts.push({ url, body })
      return new Response(
        JSON.stringify({
          id: "p-2",
          organization_id: "org-1",
          name: "New site",
          base_url: "https://new.example",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }
    if (url.includes("ai/conversations")) {
      return new Response(JSON.stringify({ conversations: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

function fillInput(input: HTMLInputElement, value: string) {
  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
}

async function settle(rounds = 6) {
  await act(async () => {
    for (let i = 0; i < rounds; i++) {
      await flushTestDom()
    }
  })
}

describe("shell creation routing", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null
  let restoreFetch: (() => void) | null = null

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    document.body.innerHTML = ""
    restoreFetch?.()
    restoreFetch = null
    localStorage.clear()
  })

  test("creating a project navigates directly to its workspace without old tab state", async () => {
    const posts: PostedProject[] = []
    restoreFetch = stubFetch(posts)
    const seenViews: string[] = []
    const seenTabs: string[] = []
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const router = createMemoryRouter(
      [
        {
          path: "/app",
          Component: () => (
            <QueryClientProvider client={client}>
              <WorkspaceShellPreview
                activeProjectId={null}
                auditTab="seo"
                compareLabel={null}
                crawlStatusLabel=""
                currentCrawl={null}
                isCrawlRunning={false}
                isExportingAudit={false}
                isPlatformAdmin={false}
                onAuditTabChange={(tab) => seenTabs.push(tab)}
                onCompareCrawl={() => undefined}
                onCrawlStart={() => undefined}
                onExportAudit={() => undefined}
                onRevbotConversationChange={() => undefined}
                onViewChange={(view) => seenViews.push(view)}
                organizationId="org-1"
                organizations={[]}
                projectCrawls={{}}
                projects={[]}
                revbotConversationId={null}
                userEmail="owner@example.com"
                view="revserp-visibility"
              >
                <div>child</div>
              </WorkspaceShellPreview>
            </QueryClientProvider>
          ),
        },
      ],
      { initialEntries: ["/app?project=p-1&view=revserp-visibility&crawl=old&revbotConversation=old#seo-tab"] },
    )
    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushTestDom()
      await flushTestDom()
    })

    const createButton = document.querySelector(
      '[data-tour="onboarding-new-project"]',
    ) as HTMLButtonElement | null
    expect(!!createButton).toBe(true)
    await act(async () => {
      createButton?.click()
      await flushTestDom()
    })

    const nameInput = document.querySelector(
      "#project-name",
    ) as HTMLInputElement | null
    const urlInput = document.querySelector(
      "#project-base-url",
    ) as HTMLInputElement | null
    expect(!!nameInput).toBe(true)
    expect(!!urlInput).toBe(true)
    await act(async () => {
      if (nameInput) fillInput(nameInput, "New site")
      if (urlInput) fillInput(urlInput, "https://new.example")
      await flushTestDom()
    })

    const submit = Array.from(document.querySelectorAll("button")).find(
      (button) => button.getAttribute("type") === "submit",
    ) as HTMLButtonElement | undefined
    expect(!!submit).toBe(true)
    await act(async () => {
      submit?.click()
      await flushTestDom()
    })

    const start = Date.now()
    while (
      !posts.some((post) => post.url.includes("/organizations/org-1/projects")) &&
      Date.now() - start < 5000
    ) {
      await settle()
    }
    const post = posts.find((entry) =>
      entry.url.includes("/organizations/org-1/projects"),
    )
    expect(!!post).toBe(true)
    expect(post?.body).toEqual({
      name: "New site",
      base_url: "https://new.example",
    })
    await settle()
    expect(router.state.location.pathname).toBe("/app")
    expect(router.state.location.search).toBe("?project=p-2")
    expect(router.state.location.hash).toBe("")
    expect(seenViews).toEqual([])
    expect(seenTabs).toEqual([])
  })
})
