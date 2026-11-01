import { afterEach, describe, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { CompetitorsView } from "~/components/competitors/competitors-view"
import {
  requestCompetitorInsights,
  takePendingCompetitorInsights,
} from "~/lib/competitor-insights-request"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const PROJECT_ID = "proj-1"

const realFetch = globalThis.fetch

const mounted: Array<() => void> = []
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!()
  globalThis.fetch = realFetch
  takePendingCompetitorInsights()
  document.body.innerHTML = ""
})

function render(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    )
  })
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
    client.clear()
  })
  return { host }
}

async function flush() {
  await act(async () => {
    await flushTestDom()
    await flushTestDom()
    await flushTestDom()
  })
}

function installFetch() {
  const initializationFor: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    const initMatch = url.match(
      new RegExp(`/projects/${PROJECT_ID}/competitors/([^/?]+)/initialization`)
    )
    const requestedCompetitor = initMatch?.[1]
    if (requestedCompetitor) {
      initializationFor.push(requestedCompetitor)
      return Response.json({ status: "ready", steps: [] })
    }
    if (url.includes(`/projects/${PROJECT_ID}/competitors`)) {
      return Response.json({
        max_competitors: 5,
        competitors: [
          {
            id: "comp-1",
            seed_url: "https://alpha.example",
            name: "Alpha",
            created_at: new Date().toISOString(),
            crawl: null,
          },
          {
            id: "comp-2",
            seed_url: "https://rival.example",
            name: "Rival",
            created_at: new Date().toISOString(),
            crawl: null,
          },
        ],
      })
    }
    throw new Error(`unexpected request ${url}`)
  }) as typeof fetch
  return { initializationFor }
}

const project = {
  id: PROJECT_ID,
  organization_id: "org-1",
  name: "Acme",
  base_url: "https://acme.example",
}

function view() {
  return (
    <CompetitorsView
      activeProject={project}
      currentCrawl={null}
      maxCompetitors={5}
      trackCrawl={() => {}}
    />
  )
}

function closeButton(host: HTMLElement) {
  return [...host.querySelectorAll("button")].find((entry) =>
    entry.textContent?.includes("Close")
  )
}

describe("competitor insights request", () => {
  test("request made before mount opens that competitor's insights", async () => {
    const { initializationFor } = installFetch()
    requestCompetitorInsights("comp-2")
    const { host } = render(view())
    await flush()

    expect(host.textContent).toContain("Set up this competitor")
    expect(closeButton(host) instanceof window.HTMLButtonElement).toBe(true)
    expect(initializationFor).toContain("comp-2")
    expect(initializationFor.includes("comp-1")).toBe(false)
  })

  test("request made after mount opens that competitor's insights", async () => {
    const { initializationFor } = installFetch()
    const { host } = render(view())
    await flush()
    expect(host.textContent).toContain("Competitors")

    await act(async () => {
      requestCompetitorInsights("comp-2")
      await flushTestDom()
    })
    await flush()

    expect(host.textContent).toContain("Set up this competitor")
    expect(closeButton(host) instanceof window.HTMLButtonElement).toBe(true)
    expect(initializationFor).toContain("comp-2")
    expect(initializationFor.includes("comp-1")).toBe(false)
  })

  test("unknown competitor id opens nothing", async () => {
    const { initializationFor } = installFetch()
    const { host } = render(view())
    await flush()

    await act(async () => {
      requestCompetitorInsights("unknown-id")
      await flushTestDom()
    })
    await flush()

    expect(host.textContent).toContain("Competitors")
    expect(host.textContent?.includes("Set up this competitor")).toBe(false)
    expect(initializationFor).toHaveLength(0)
  })
})
