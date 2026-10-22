import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

// Same portal stand-in as the shell creation suite: Base UI caches the
// document at first suite-wide import, so the real portal cannot mount here.
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
import { DEFAULT_EXCLUDED_URL_PATTERNS } from "./crawl-exclusions"

const PROJECT = {
  id: "p-1",
  organization_id: "org-1",
  name: "Site",
  base_url: "https://example.com",
}

type PostedCrawl = { url: string; body: any }

function stubFetch(posts: PostedCrawl[]) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    if (method === "POST" && url.includes("/projects/p-1/crawls")) {
      posts.push({
        url,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      })
      return new Response(
        JSON.stringify({
          id: "c-1",
          project_id: "p-1",
          status: "queued",
          urls_discovered: 0,
          urls_crawled: 0,
          max_depth_reached: 0,
          created_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
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

function focusInput(input: HTMLInputElement) {
  // happy-dom only routes keyboard/input events to React listeners once the
  // target has seen focus; mirrors the shell creation suite.
  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
}

async function setInputValue(input: HTMLInputElement, value: string) {
  focusInput(input)
  await flushTestDom()
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set
  setter?.call(input, value)
  // A bare input event never reaches React under happy-dom; a keydown
  // after the native set trips React change detection instead (same trick
  // as the shell creation suite). The filler key is ignored by the dialog.
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
}

async function pressKey(input: HTMLInputElement, key: string) {
  focusInput(input)
  await flushTestDom()
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  )
}

function pasteText(input: HTMLInputElement, text: string) {
  const event = new Event("paste", {
    bubbles: true,
    cancelable: true,
  }) as Event & { clipboardData: { getData: (type: string) => string } }
  event.clipboardData = { getData: () => text }
  input.dispatchEvent(event)
}

function removeButtons() {
  return Array.from(
    document.querySelectorAll('button[aria-label^="Remove "]')
  ) as HTMLButtonElement[]
}

async function settle(rounds = 8) {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await flushTestDom()
  })
}

async function mountShell(
  root: Root,
  opts?: { projectId?: string | null; userId?: string }
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const projectId = opts?.projectId ?? "p-1"
  const router = createMemoryRouter(
    [
      {
        path: "/app",
        Component: () => (
          <QueryClientProvider client={client}>
            <WorkspaceShellPreview
              activeProjectId={projectId}
              auditTab="overview"
              compareLabel={null}
              crawlStatusLabel=""
              currentCrawl={null}
              isCrawlRunning={false}
              isExportingAudit={false}
              isPlatformAdmin={false}
              onAuditTabChange={() => undefined}
              onCompareCrawl={() => undefined}
              onCrawlStart={() => undefined}
              onExportAudit={() => undefined}
              onRevbotConversationChange={() => undefined}
              onViewChange={() => undefined}
              organizationId="org-1"
              organizations={[]}
              projectCrawls={{}}
              projects={projectId ? [PROJECT] : []}
              revbotConversationId={null}
              userEmail="owner@example.com"
              userId={opts?.userId ?? "user-1"}
              view="revserp-audit"
            >
              <div>child</div>
            </WorkspaceShellPreview>
          </QueryClientProvider>
        ),
      },
    ],
    { initialEntries: ["/app"] }
  )
  await act(async () => {
    root.render(<RouterProvider router={router} />)
    await flushTestDom()
    await flushTestDom()
  })
}

async function openRunCrawl() {
  const runButton = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Run crawl")
  ) as HTMLButtonElement | undefined
  expect(!!runButton).toBe(true)
  await act(async () => {
    runButton?.click()
    await flushTestDom()
  })
  const input = document.querySelector(
    "#excluded-url-patterns"
  ) as HTMLInputElement | null
  expect(!!input).toBe(true)
  return input!
}

async function waitForPost(posts: PostedCrawl[]) {
  const start = Date.now()
  while (
    !posts.some((post) => post.url.includes("/projects/p-1/crawls")) &&
    Date.now() - start < 5000
  ) {
    await settle()
  }
  return posts.find((post) => post.url.includes("/projects/p-1/crawls"))
}

describe("run crawl controls", () => {
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

  test("speed presets fill timing fields, allow custom edits, and preserve the request", async () => {
    const posts: PostedCrawl[] = []
    restoreFetch = stubFetch(posts)
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await mountShell(root)
    await openRunCrawl()

    const delay = document.querySelector("#delay-ms") as HTMLInputElement
    const jitter = document.querySelector("#jitter-ms") as HTMLInputElement
    const presetButton = (label: string) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("#crawl-speed-presets button"))
        .find((button) => button.textContent === label)!
    const choosePreset = async (label: string) => {
      await act(async () => {
        presetButton(label).click()
        await flushTestDom()
      })
    }

    expect(presetButton("Fast").getAttribute("aria-pressed")).toBe("true")
    for (const [label, delayValue, jitterValue] of [
      ["Safe", "1000", "500"],
      ["Balanced", "500", "250"],
    ]) {
      await choosePreset(label)
      expect(delay.value).toBe(delayValue)
      expect(jitter.value).toBe(jitterValue)
      expect(presetButton(label).getAttribute("aria-pressed")).toBe("true")
      expect(posts).toHaveLength(0)
    }

    await act(async () => {
      await setInputValue(delay, "1200")
      await flushTestDom()
    })
    expect(document.querySelector('#crawl-speed-presets [aria-pressed="true"]')).toBeNull()
    expect(document.querySelector("#crawl-speed-preset-label")?.textContent).toContain("Custom")

    await choosePreset("Fast")
    expect(delay.value).toBe("")
    expect(jitter.value).toBe("")
    expect(posts).toHaveLength(0)

    await choosePreset("Balanced")
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
      await flushTestDom()
    })
    const post = await waitForPost(posts)
    expect(post?.body.config_snapshot.request_delay_ms).toBe(500)
    expect(post?.body.config_snapshot.request_jitter_ms).toBe(250)
    expect(post?.body.config_snapshot.max_depth).toBe(5)
    expect(post?.body.config_snapshot.excluded_url_patterns).toEqual(DEFAULT_EXCLUDED_URL_PATTERNS)
  })


  test("token editing feeds the submitted payload, pending draft included", async () => {
    const posts: PostedCrawl[] = []
    restoreFetch = stubFetch(posts)
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await mountShell(root)

    const input = await openRunCrawl()
    expect(removeButtons()).toHaveLength(DEFAULT_EXCLUDED_URL_PATTERNS.length)

    // Enter adds a token but never submits the form.
    await act(async () => {
      await setInputValue(input, "/new/*")
      await flushTestDom()
    })
    expect(input.value).toBe("/new/*")
    await act(async () => {
      await pressKey(input, "Enter")
      await flushTestDom()
    })
    expect(removeButtons()).toHaveLength(DEFAULT_EXCLUDED_URL_PATTERNS.length + 1)
    expect(posts).toHaveLength(0)

    // Duplicates are dropped.
    await act(async () => {
      await setInputValue(input, "/new/*")
      await flushTestDom()
    })
    await act(async () => {
      await pressKey(input, "Enter")
      await flushTestDom()
    })
    expect(removeButtons()).toHaveLength(DEFAULT_EXCLUDED_URL_PATTERNS.length + 1)

    // Pasted whitespace/newline text becomes tokens.
    await act(async () => {
      pasteText(input, "/p1/*\n/p2/* https://example.com/exact")
      await flushTestDom()
    })
    expect(removeButtons()).toHaveLength(DEFAULT_EXCLUDED_URL_PATTERNS.length + 4)

    // A typed but unsplit URL still ships with the request.
    await act(async () => {
      await setInputValue(input, "https://example.com/last")
      await flushTestDom()
    })
    const submit = Array.from(document.querySelectorAll("button")).find(
      (button) => button.getAttribute("type") === "submit"
    ) as HTMLButtonElement | undefined
    expect(!!submit).toBe(true)
    await act(async () => {
      submit?.click()
      await flushTestDom()
    })
    const post = await waitForPost(posts)
    expect(!!post).toBe(true)
    expect(post?.body.config_snapshot.excluded_url_patterns).toEqual([
      ...DEFAULT_EXCLUDED_URL_PATTERNS,
      "/new/*",
      "/p1/*",
      "/p2/*",
      "https://example.com/exact",
      "https://example.com/last",
    ])
    // Other snapshot options are preserved.
    expect(post?.body.config_snapshot.max_depth).toBe(5)
  })

  test("remove-all persists []; reopen and other scopes stay isolated", async () => {
    const posts: PostedCrawl[] = []
    restoreFetch = stubFetch(posts)
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await mountShell(root)

    let input = await openRunCrawl()
    for (const button of removeButtons()) {
      await act(async () => {
        button.click()
        await flushTestDom()
      })
    }
    expect(removeButtons()).toHaveLength(0)
    const submit = Array.from(document.querySelectorAll("button")).find(
      (button) => button.getAttribute("type") === "submit"
    ) as HTMLButtonElement | undefined
    await act(async () => {
      submit?.click()
      await flushTestDom()
    })
    const post = await waitForPost(posts)
    expect(post?.body.config_snapshot.excluded_url_patterns).toEqual([])
    expect(
      localStorage.getItem("revserp:crawl-excluded-url-patterns:user-1:p-1")
    ).toBe("[]")

    // Reopen reads the saved empty list, not the defaults.
    await openRunCrawl()
    expect(removeButtons()).toHaveLength(0)
    expect(
      document.body.textContent?.includes("No exclusions")
    ).toBe(true)
    input = document.querySelector(
      "#excluded-url-patterns"
    ) as HTMLInputElement
    expect(!!input).toBe(true)

    // Another project and another user both start from defaults.
    if (root) act(() => root?.unmount())
    host.innerHTML = ""
    root = createRoot(host)
    await mountShell(root, { projectId: "p-2" })
    await openRunCrawl()
    expect(removeButtons()).toHaveLength(DEFAULT_EXCLUDED_URL_PATTERNS.length)

    if (root) act(() => root?.unmount())
    host.innerHTML = ""
    root = createRoot(host)
    await mountShell(root, { userId: "user-2" })
    await openRunCrawl()
    expect(removeButtons()).toHaveLength(DEFAULT_EXCLUDED_URL_PATTERNS.length)
  })
})
