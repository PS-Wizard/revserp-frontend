import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import {
  fetchProjectProfileCompetitors,
  ProjectProfileCompetitorRoster,
  projectProfileCompetitorsQueryKey,
} from "~/components/app-navbar/project-profile-competitor-roster"
import { OrganizationEventsProvider } from "~/hooks/use-organization-events"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import type { ProjectCompetitorsResponse } from "~/lib/api.types"

installTestDom()

const realFetch = globalThis.fetch
let root: Root | null = null
let host: HTMLDivElement | null = null
const fetchCalls: Array<{ url: string; method: string }> = []

function makeRoster(overrides: Partial<ProjectCompetitorsResponse> = {}) {
  return {
    max_competitors: 5,
    competitors: [],
    ...overrides,
  } satisfies ProjectCompetitorsResponse
}

function mountRoster(
  client: QueryClient,
  projectId = "proj-1",
  seed?: ProjectCompetitorsResponse
) {
  if (seed) client.setQueryData(projectProfileCompetitorsQueryKey(projectId), seed)
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <ProjectProfileCompetitorRoster
          projectId={projectId}
          onManageInCompetitors={() => undefined}
        />
      </QueryClientProvider>
    )
  })
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
}

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  host?.remove()
  host = null
  document.body.innerHTML = ""
  globalThis.fetch = realFetch
  fetchCalls.length = 0
})

describe("project profile competitor roster", () => {
  test("renders canonical name and seed_url rows with Not crawled for crawl:null", async () => {
    const client = makeClient()
    mountRoster(
      client,
      "proj-1",
      makeRoster({
        competitors: [
          { id: "c-1", name: "Ahrefs", seed_url: "https://ahrefs.com", created_at: "2026-01-01T00:00:00Z", crawl: null },
          { id: "c-2", name: "", seed_url: "https://www.semrush.com/blog", created_at: "2026-01-01T00:00:00Z" },
        ],
      })
    )
    await act(async () => {
      await flushTestDom()
    })
    const html = document.body.innerHTML
    expect(html).toContain("Ahrefs")
    expect(html).toContain("https://ahrefs.com")
    expect(html).toContain("https://www.semrush.com/blog")
    expect(html).toContain("semrush.com")
    const notCrawled = html.match(/Not crawled/g) ?? []
    expect(notCrawled.length).toBe(2)
    expect(html).toContain("Manage in Competitors")
    expect(html).toContain('href="#competitors"')
    client.clear()
  })

  test("profile read fetches the project roster GET and never the enqueue crawl endpoint", async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), method: init?.method ?? "GET" })
      return Response.json(makeRoster())
    }) as typeof fetch
    const client = makeClient()
    mountRoster(client, "proj-1")
    await act(async () => {
      for (let i = 0; i < 5; i++) await flushTestDom()
    })
    const rosterGets = fetchCalls.filter((call) =>
      call.url.endsWith("/projects/proj-1/competitors")
    )
    expect(rosterGets.length).toBe(1)
    expect(rosterGets[0]?.method).toBe("GET")
    expect(
      fetchCalls.some((call) => call.url.includes("/competitors/crawls"))
    ).toBe(false)
    expect(
      fetchCalls.some((call) => (call.method ?? "GET") !== "GET")
    ).toBe(false)
    client.clear()
  })

  test("query key is scoped per project", () => {
    expect(projectProfileCompetitorsQueryKey("proj-1")).toEqual([
      "project-competitors",
      "proj-1",
    ])
    expect(
      projectProfileCompetitorsQueryKey("proj-1").join() ===
        projectProfileCompetitorsQueryKey("proj-2").join()
    ).toBe(false)
  })

  test("empty roster states the research/Revbot source without a second list", async () => {
    const client = makeClient()
    mountRoster(client, "proj-1", makeRoster({ competitors: [] }))
    await act(async () => {
      await flushTestDom()
    })
    const html = document.body.innerHTML
    expect(html).toContain("No competitors yet")
    expect(html).toContain("0 of 5")
    expect(html.includes('id="business-competitors"')).toBe(false)
    client.clear()
  })

  test("full roster states the limit", async () => {
    const client = makeClient()
    mountRoster(
      client,
      "proj-1",
      makeRoster({
        max_competitors: 1,
        competitors: [
          { id: "c-1", name: "Ahrefs", seed_url: "https://ahrefs.com", created_at: "2026-01-01T00:00:00Z", crawl: null },
        ],
      })
    )
    await act(async () => {
      await flushTestDom()
    })
    expect(document.body.innerHTML).toContain("Competitor limit reached")
    client.clear()
  })

  async function refreshRosterOnEvent(eventType: string) {
    let rosterCalls = 0
    // Gate the one-shot event stream until the initial roster load settles,
    // so the completion frame cannot win the mount race and get missed.
    const eventsGateHolder: { release: (() => void) | null } = { release: null }
    const eventsGate = new Promise<Response>((resolve) => {
      eventsGateHolder.release = () =>
        resolve(
          new Response(
            `event: ${eventType}\nid: 1\ndata: ${JSON.stringify({
              organization_id: "org-1",
              project_id: "proj-1",
              resource_id: "setup-1",
              payload: {},
            })}\n\n`,
            { headers: { "Content-Type": "text/event-stream" } }
          )
        )
    })
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("/organizations/org-1/events")) return eventsGate
      if (url.endsWith("/projects/proj-1/competitors")) {
        rosterCalls += 1
        return Promise.resolve(Response.json(
          makeRoster(
            rosterCalls === 1
              ? { competitors: [] }
              : {
                  competitors: [
                    { id: "c-9", name: "Researched Rival", seed_url: "https://rival.example", created_at: "2026-01-02T00:00:00Z", crawl: null },
                  ],
                }
          )
        ))
      }
      return Promise.reject(new Error(`unexpected request ${url}`))
    }) as typeof fetch
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <QueryClientProvider client={client}>
          <OrganizationEventsProvider
            orgId="org-1"
            onReady={() => undefined}
            onCrawlEvent={() => undefined}
            onViewVisibility={() => undefined}
            revalidate={() => undefined}
          >
            <ProjectProfileCompetitorRoster
              projectId="proj-1"
              onManageInCompetitors={() => undefined}
            />
          </OrganizationEventsProvider>
        </QueryClientProvider>
      )
      await flushTestDom()
    })
    for (let i = 0; i < 40; i++) {
      if (document.body.innerHTML.includes("0 of 5")) break
      await act(async () => {
        await flushTestDom()
      })
    }
    expect(document.body.innerHTML).toContain("0 of 5")
    eventsGateHolder.release?.()
    for (let i = 0; i < 40; i++) {
      if (document.body.innerHTML.includes("Researched Rival")) break
      await act(async () => {
        await flushTestDom()
      })
    }
    expect(rosterCalls >= 2).toBe(true)
    expect(document.body.innerHTML).toContain("Researched Rival")
    expect(document.body.innerHTML).toContain("https://rival.example")
    client.clear()
  }

  test("project_setup.completed refreshes the roster through existing org events", async () => {
    await refreshRosterOnEvent("project_setup.completed")
  })

  test("project_competitor.created refreshes the roster for Revbot/tool adds", async () => {
    await refreshRosterOnEvent("project_competitor.created")
  })

  test("fetch helper hits the existing project competitors endpoint", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      fetchCalls.push({ url: String(input), method: "GET" })
      return Response.json(makeRoster())
    }) as typeof fetch
    await fetchProjectProfileCompetitors("proj-7")
    expect(fetchCalls[0]?.url.endsWith("/projects/proj-7/competitors")).toBe(true)
  })
})
