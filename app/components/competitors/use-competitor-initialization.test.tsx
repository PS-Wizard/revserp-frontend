import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { useCompetitorInitialization } from "~/components/competitors/use-competitor-initialization"
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

type HookResult = ReturnType<typeof useCompetitorInitialization>

function renderProbe(
  client: QueryClient,
  props: {
    projectId: string | null
    competitorId: string | null
    parentCrawlId?: string | null
  }
) {
  let latest: HookResult | null = null
  function Probe() {
    latest = useCompetitorInitialization({ enabled: true, ...props })
    return null
  }
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    )
  })
  mounted.push(() => act(() => root.unmount()))
  return { get: () => latest as HookResult }
}

async function flush() {
  await act(async () => {
    await flushTestDom()
    await flushTestDom()
    await flushTestDom()
  })
}

function installInitFetch(
  handler: (url: string, init?: RequestInit) => Response
) {
  const posts: string[] = []
  globalThis.fetch = (async (
    input: string | URL | Request,
    fetchInit?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    if (fetchInit?.method === "POST") posts.push(url)
    return handler(url, fetchInit)
  }) as typeof fetch
  return posts
}

function completedInit() {
  return {
    status: "completed",
    steps: [
      { id: "crawl", status: "completed" },
      { id: "keyword_generation", status: "completed" },
      { id: "keyword_analysis", status: "completed" },
    ],
  }
}

describe("competitor initialization hook", () => {
  test("failed load exposes the error instead of the ready screen", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
      })) as typeof fetch
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const probe = renderProbe(client, {
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
    })
    await flush()
    expect(probe.get().setup).toBeNull()
    expect(probe.get().isLoading).toBe(false)
    expect(probe.get().loadError !== "").toBe(true)
  })

  test("reload after a failed load recovers the setup", async () => {
    let mode: "denied" | "ready" = "denied"
    globalThis.fetch = (async () => {
      if (mode === "denied") {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 })
      }
      return Response.json({ status: "ready", steps: [] })
    }) as typeof fetch
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const probe = renderProbe(client, {
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
    })
    await flush()
    expect(probe.get().setup).toBeNull()
    expect(probe.get().loadError !== "").toBe(true)

    mode = "ready"
    await act(async () => {
      await probe.get().refetch()
    })
    await flush()
    expect(probe.get().loadError).toBe("")
    expect(probe.get().setup?.status).toBe("ready")
  })

  test("completion refreshes the competitors list and keyword analyses", async () => {
    globalThis.fetch = (async () =>
      Response.json(completedInit())) as typeof fetch
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const invalidated: unknown[] = []
    const original = client.invalidateQueries.bind(client)
    client.invalidateQueries = (async (filters?: unknown) => {
      invalidated.push(
        (filters as { queryKey?: unknown } | undefined)?.queryKey
      )
      return original(filters as never)
    }) as typeof client.invalidateQueries
    const probe = renderProbe(client, {
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
    })
    await flush()
    expect(probe.get().setup?.status).toBe("completed")
    const keys = invalidated.map((key) => JSON.stringify(key))
    expect(
      keys.includes(JSON.stringify(["project-competitors", PROJECT_ID]))
    ).toBe(true)
    expect(
      keys.includes(JSON.stringify(["project-keyword-analysis", PROJECT_ID]))
    ).toBe(true)
    expect(
      keys.includes(
        JSON.stringify([
          "competitor-keyword-analysis",
          PROJECT_ID,
          COMPETITOR_ID,
        ])
      )
    ).toBe(true)
  })

  test("start and retry post to the selected parent crawl", async () => {
    const posts = installInitFetch(() =>
      Response.json({ status: "running", steps: [] })
    )
    globalThis.fetch = (async (
      input: string | URL | Request,
      fetchInit?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      if (fetchInit?.method === "POST") {
        posts.push(url)
        return Response.json({ status: "running", steps: [] })
      }
      return Response.json({ status: "ready", steps: [] })
    }) as typeof fetch
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const probe = renderProbe(client, {
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
      parentCrawlId: "crawl-hist",
    })
    await flush()
    await act(async () => {
      await probe.get().start()
    })
    await act(async () => {
      await probe.get().retry()
    })
    expect(posts).toHaveLength(2)
    expect(posts[0].endsWith("/initialization?crawl=crawl-hist")).toBe(true)
    expect(posts[1].endsWith("/initialization/retry?crawl=crawl-hist")).toBe(
      true
    )
  })
})
