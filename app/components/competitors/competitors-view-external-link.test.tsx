import { afterEach, describe, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { CompetitorsView } from "~/components/competitors/competitors-view"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const PROJECT_ID = "proj-1"

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

function installCompetitorsFetch(
  competitors: Array<{ id: string; seed_url: string; name: string }>
) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes(`/projects/${PROJECT_ID}/competitors`)) {
      return Response.json({
        max_competitors: 5,
        competitors: competitors.map((competitor) => ({
          ...competitor,
          created_at: new Date().toISOString(),
          crawl: null,
        })),
      })
    }
    throw new Error(`unexpected request ${url}`)
  }) as typeof fetch
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

describe("competitor card external link", () => {
  test("opens the competitor site in a new tab without opening insights", async () => {
    installCompetitorsFetch([
      { id: "comp-1", seed_url: "https://rival.example", name: "Rival" },
    ])
    const { host } = render(view())
    await flush()

    const link = host.querySelector('a[aria-label="Open Rival in new tab"]')
    if (!(link instanceof window.HTMLAnchorElement)) {
      throw new Error("external link not found")
    }
    expect(link.getAttribute("href")).toBe("https://rival.example")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(link.getAttribute("title")).toBe("Open Rival in new tab")

    await act(async () => {
      link.click()
      await flushTestDom()
    })
    await flush()

    expect(host.textContent).toContain("Rival")
    expect(host.textContent?.includes("Set up this competitor")).toBe(false)
  })

  test("hides the external link when seed_url is missing", async () => {
    installCompetitorsFetch([{ id: "comp-1", seed_url: "", name: "Rival" }])
    const { host } = render(view())
    await flush()

    expect(host.querySelector("a[target='_blank']")).toBeNull()
  })
})
