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
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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

  test("navbar shows the location name with marker, scope action, no parent crawl action", async () => {
    const seenViews: string[] = []
    const { host: mounted } = await mountShell(seenViews)
    const html = mounted.innerHTML
    expect(html).toContain("Roastery")
    expect(html).toContain("Location")
    expect(html).toContain("Website scope")
    expect(html.includes("Run crawl")).toBe(false)
    expect(html).toContain("scoped child")
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

  test("location dock merges competitors into the Maps test with no compare entry", async () => {
    const seenViews: string[] = []
    const { host: mounted } = await mountShell(seenViews)
    const triggers = Array.from(mounted.querySelectorAll("button")).map(
      (button) => button.textContent ?? ""
    )
    expect(triggers.some((text) => text.includes("Compare"))).toBe(false)
    expect(triggers.some((text) => text.includes("Visibility"))).toBe(true)
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
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
