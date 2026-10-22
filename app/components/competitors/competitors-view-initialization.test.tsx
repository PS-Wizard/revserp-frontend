import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement } from "react"

import { CompetitorsView } from "~/components/competitors/competitors-view"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const PROJECT_ID = "proj-1"
const COMPETITOR_ID = "comp-1"

const realFetch = globalThis.fetch

const mounted: Array<() => void> = []
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!()
  globalThis.fetch = realFetch
  document.body.innerHTML = ""
})

function render(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  const renderElement = (next: ReactElement) => {
    act(() => {
      root.render(
        <QueryClientProvider client={client}>{next}</QueryClientProvider>
      )
    })
  }
  renderElement(element)
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
    client.clear()
  })
  return { host, update: renderElement }
}

async function flush() {
  await act(async () => {
    await flushTestDom()
    await flushTestDom()
    await flushTestDom()
  })
}

function installCompetitorFetch(
  getInit: { status: string; steps: unknown[] },
  postInit: { status: string; steps: unknown[] } = getInit,
  initErrorStatus?: number
) {
  const posts: string[] = []
  globalThis.fetch = (async (
    input: string | URL | Request,
    fetchInit?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes(`/projects/${PROJECT_ID}/competitors/crawls`)) {
      return Response.json({ crawls: [] })
    }
    if (
      url.includes(
        `/projects/${PROJECT_ID}/competitors/${COMPETITOR_ID}/initialization`
      )
    ) {
      if (fetchInit?.method === "POST") {
        posts.push(url)
        return Response.json(postInit)
      }
      if (initErrorStatus) {
        return new Response(JSON.stringify({ error: "denied" }), {
          status: initErrorStatus,
        })
      }
      return Response.json(getInit)
    }
    if (url.includes(`/projects/${PROJECT_ID}/competitors`)) {
      return Response.json({
        max_competitors: 5,
        competitors: [
          {
            id: COMPETITOR_ID,
            seed_url: "https://rival.example",
            name: "Rival",
            created_at: new Date().toISOString(),
            crawl: null,
          },
        ],
      })
    }
    if (/\/projects\/[^/]+\/competitors(\?|$)/.test(url)) {
      return Response.json({ max_competitors: 5, competitors: [] })
    }
    throw new Error(`unexpected request ${url}`)
  }) as typeof fetch
  return posts
}

const project = {
  id: PROJECT_ID,
  organization_id: "org-1",
  name: "Acme",
  base_url: "https://acme.example",
}

describe("competitor initialization gating", () => {
  test("selecting a competitor opens setup until initialization completes", async () => {
    installCompetitorFetch({ status: "ready", steps: [] })
    const { host } = render(
      <CompetitorsView
        activeProject={project}
        currentCrawl={null}
        maxCompetitors={5}
        trackCrawl={() => {}}
      />
    )
    await flush()
    expect(host.textContent).toContain("Rival")

    const card = host.querySelector('[role="button"]')
    if (!(card instanceof window.HTMLElement)) throw new Error("card not found")
    await act(async () => {
      card.click()
      await flushTestDom()
    })
    await flush()

    expect(host.textContent).toContain("Set up this competitor")
    expect(host.textContent).toContain("Initialize Competitor")
  })

  test("starting setup posts to initialization and shows progress", async () => {
    const posts = installCompetitorFetch(
      { status: "ready", steps: [] },
      {
        status: "running",
        steps: [
          { id: "crawl", status: "completed" },
          { id: "keyword_generation", status: "running" },
          { id: "keyword_analysis", status: "pending" },
        ],
      }
    )
    const { host } = render(
      <CompetitorsView
        activeProject={project}
        currentCrawl={null}
        maxCompetitors={5}
        trackCrawl={() => {}}
      />
    )
    await flush()
    await act(async () => {
      const card = host.querySelector('[role="button"]')
      if (!(card instanceof window.HTMLElement))
        throw new Error("card not found")
      card.click()
      await flushTestDom()
    })
    await flush()

    const start = [...host.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("Initialize Competitor")
    )
    expect(start instanceof window.HTMLButtonElement).toBe(true)
    await act(async () => {
      start?.click()
      await flushTestDom()
    })
    await flush()

    expect(posts).toHaveLength(1)
    expect(host.textContent).toContain("Keyword generation")
    expect(host.textContent).toContain("Running")
  })

  test("failed initialization load shows the error with reload", async () => {
    installCompetitorFetch({ status: "ready", steps: [] }, undefined, 403)
    const { host } = render(
      <CompetitorsView
        activeProject={project}
        currentCrawl={null}
        maxCompetitors={5}
        trackCrawl={() => {}}
      />
    )
    await flush()
    await act(async () => {
      const card = host.querySelector('[role="button"]')
      if (!(card instanceof window.HTMLElement))
        throw new Error("card not found")
      card.click()
      await flushTestDom()
    })
    await flush()

    expect(host.textContent).toContain("denied")
    expect(host.textContent?.includes("Initialize Competitor")).toBe(false)
    expect(
      [...host.querySelectorAll("button")].some((entry) =>
        entry.textContent?.includes("Try again")
      )
    ).toBe(true)
  })

  test("start posts to the selected parent crawl", async () => {
    const posts = installCompetitorFetch({ status: "ready", steps: [] })
    const { host } = render(
      <CompetitorsView
        activeProject={project}
        currentCrawl={{
          id: "crawl-hist",
          project_id: PROJECT_ID,
          status: "completed",
          urls_discovered: 0,
          urls_crawled: 0,
          max_depth_reached: 0,
          created_at: new Date().toISOString(),
        }}
        maxCompetitors={5}
        trackCrawl={() => {}}
      />
    )
    await flush()
    await act(async () => {
      const card = host.querySelector('[role="button"]')
      if (!(card instanceof window.HTMLElement))
        throw new Error("card not found")
      card.click()
      await flushTestDom()
    })
    await flush()
    const start = [...host.querySelectorAll("button")].find((entry) =>
      entry.textContent?.includes("Initialize Competitor")
    )
    await act(async () => {
      start?.click()
      await flushTestDom()
    })
    await flush()
    expect(posts).toHaveLength(1)
    expect(posts[0].endsWith("/initialization?crawl=crawl-hist")).toBe(true)
  })

  test("switching projects clears the open detail", async () => {
    installCompetitorFetch({ status: "ready", steps: [] })
    const { host, update } = render(
      <CompetitorsView
        activeProject={project}
        currentCrawl={null}
        maxCompetitors={5}
        trackCrawl={() => {}}
      />
    )
    await flush()
    await act(async () => {
      const card = host.querySelector('[role="button"]')
      if (!(card instanceof window.HTMLElement))
        throw new Error("card not found")
      card.click()
      await flushTestDom()
    })
    await flush()
    expect(host.textContent).toContain("Set up this competitor")

    update(
      <CompetitorsView
        activeProject={{ ...project, id: "proj-2", name: "Beta" }}
        currentCrawl={null}
        maxCompetitors={5}
        trackCrawl={() => {}}
      />
    )
    await flush()
    expect(host.textContent?.includes("Set up this competitor")).toBe(false)
    expect(host.textContent).toContain("Competitors")
  })
})
