import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { createMemoryRouter, RouterProvider } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { WorkspaceShellPreview } from "~/components/workspace-shell-preview"
import { LocationWorkspaceProvider } from "~/lib/location-workspace"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const PROJECT = {
  id: "p-1",
  organization_id: "org-1",
  name: "Revketer",
  base_url: "https://revketer.ai",
}

function makeWorkspace(refresh?: () => void) {
  return {
    projectId: "p-1",
    location: {
      id: "l-9",
      project_id: "p-1",
      name: "Roastery",
      place_id: "ChIJ1",
      address: "Main Street 1",
      locality: "Downtown",
      localities: [],
      services: [],
      latitude: 27.7,
      longitude: 85.3,
      queries: [],
    },
    canManage: true,
    websiteScope: null,
    websiteScopeRevisions: [],
    ...(refresh ? { refresh } : {}),
  }
}

function stubFetch(calls: string[]) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    calls.push(url)
    const body = url.includes("ai/conversations")
      ? { conversations: [] }
      : { enabled: false }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

describe("real shell location scope", () => {
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

  async function mountShell(seenViews: string[]) {
    const calls: string[] = []
    restoreFetch = stubFetch(calls)
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const router = createMemoryRouter(
      [
        {
          path: "/app",
          Component: () => (
            <QueryClientProvider client={client}>
              <LocationWorkspaceProvider workspace={makeWorkspace()}>
                <WorkspaceShellPreview
                  activeProjectId="p-1"
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
                  onViewChange={(view) => seenViews.push(view)}
                  organizationId="org-1"
                  organizations={[]}
                  projectCrawls={{}}
                  projects={[PROJECT]}
                  revbotConversationId={null}
                  userEmail="owner@example.com"
                  view="revserp-audit"
                >
                  <div>scoped child</div>
                </WorkspaceShellPreview>
              </LocationWorkspaceProvider>
            </QueryClientProvider>
          ),
        },
      ],
      { initialEntries: ["/app?project=p-1&location=l-9"] }
    )
    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushTestDom()
      await flushTestDom()
    })
    return { calls, host: host as HTMLDivElement }
  }

  test("project navbar stays unchanged above a separate location navigation", async () => {
    const { host: mounted } = await mountShell([])
    expect(mounted.innerHTML).toContain("Revketer")
    expect(mounted.innerHTML).toContain("Run crawl")
    const localNav = mounted.querySelector(
      'section[aria-label="Location workspace"]'
    )
    expect(localNav?.textContent).toContain("Roastery")
    expect(localNav?.textContent).toContain("Location profile")
    expect(Boolean(localNav?.textContent?.includes("Website pages"))).toBe(false)
    const tabs = Array.from(
      localNav?.querySelectorAll('nav[aria-label="Location navigation"] a') ?? []
    ).map((link) => link.textContent)
    expect(tabs.includes("Overview")).toBe(false)
    expect(localNav?.className).toContain("px-4")
    expect(localNav?.className).toContain("md:px-8")
    const content = mounted.querySelector(".tour-scroll-lock")
    expect(content?.className).toContain("px-4")
    expect(content?.className).toContain("md:px-8")
    expect(
      Boolean(localNav?.querySelector('nav[aria-label="Location navigation"]'))
    ).toBe(true)
    expect(mounted.innerHTML).toContain("scoped child")
  })

  test("chat lists only location scoped conversations", async () => {
    const seenViews: string[] = []
    const { calls } = await mountShell(seenViews)
    const chatCalls = calls.filter((url) => url.includes("ai/conversations"))
    expect(chatCalls.length > 0).toBe(true)
    for (const url of chatCalls) {
      expect(url).toContain("location_id=l-9")
    }
  })

  test("Maps and AI visibility links stay in the location navigation", async () => {
    const { host: mounted } = await mountShell([])
    const nav = mounted.querySelector('nav[aria-label="Location navigation"]')
    const maps = Array.from(nav?.querySelectorAll("a") ?? []).find(
      (link) => link.textContent === "Maps"
    )
    const ai = Array.from(nav?.querySelectorAll("a") ?? []).find(
      (link) => link.textContent === "AI visibility"
    )
    expect(maps?.getAttribute("href")).toContain("location=l-9")
    expect(maps?.getAttribute("href")).toContain("visibility=maps")
    expect(ai?.getAttribute("href")).toContain("visibility=ai")
  })
})

describe("real shell visibility mode", () => {
  test("ai mode highlights the AI option in the outer nav", async () => {
    const calls: string[] = []
    const restore = stubFetch(calls)
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const router = createMemoryRouter(
      [
        {
          path: "/app",
          Component: () => (
            <QueryClientProvider client={client}>
              <LocationWorkspaceProvider workspace={makeWorkspace()}>
                <WorkspaceShellPreview
                  activeProjectId="p-1"
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
                  projects={[PROJECT]}
                  revbotConversationId={null}
                  userEmail="owner@example.com"
                  view="revserp-visibility"
                  visibilityMode="ai"
                >
                  <div>scoped child</div>
                </WorkspaceShellPreview>
              </LocationWorkspaceProvider>
            </QueryClientProvider>
          ),
        },
      ],
      { initialEntries: ["/app?project=p-1&location=l-9&visibility=ai"] }
    )
    try {
      await act(async () => {
        root.render(<RouterProvider router={router} />)
        await flushTestDom()
        await flushTestDom()
      })
      expect(host.innerHTML).toContain("AI visibility")
    } finally {
      act(() => root.unmount())
      host.remove()
      document.body.innerHTML = ""
      restore()
      localStorage.clear()
    }
  })
})
