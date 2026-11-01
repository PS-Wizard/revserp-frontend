import { afterEach, describe, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ProjectCompetitorKeywordsCard } from "~/components/keyword-management/project-competitor-keywords-card"
import { CombinedKeywordCloudCard } from "~/components/keyword-management/project-keyword-cards"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import {
  mergeCompetitorSelectionsIntoCombined,
  mergeCompetitorSelectionsIntoSeeds,
} from "~/lib/competitor-keyword-selections"

installTestDom()

const PROJECT = "proj-1"
const realFetch = globalThis.fetch
const fetchCalls: Array<{ url: string; method: string }> = []

type AnalysisRow = {
  keyword: string
  kind: "brand" | "non_brand"
}

function competitorCrawl(status: string) {
  return {
    id: "cc-1",
    project_id: PROJECT,
    status,
    urls_discovered: 4,
    urls_crawled: 4,
    max_depth_reached: 2,
    created_at: "2026-01-01T00:00:00Z",
  }
}

function installFetch(options: {
  competitors?: Array<{
    id: string
    name: string
    seed_url: string
    crawlStatus: string | null
  }>
  analyses?: Record<string, AnalysisRow[]>
}) {
  const competitors = options.competitors ?? [
    {
      id: "c-1",
      name: "Rival",
      seed_url: "https://rival.example",
      crawlStatus: "completed",
    },
  ]
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    fetchCalls.push({ url, method: "GET" })
    if (url.includes(`/projects/${PROJECT}/crawls`)) {
      return Response.json({
        crawls: [
          {
            id: "crawl-1",
            project_id: PROJECT,
            status: "completed",
            urls_discovered: 9,
            urls_crawled: 9,
            max_depth_reached: 3,
            completed_at: "2026-02-01T00:00:00Z",
            created_at: "2026-01-02T00:00:00Z",
          },
        ],
        pagination: { limit: 50, offset: 0, count: 1, total: 1 },
      })
    }
    if (/\/projects\/[^/]+\/competitors(\?|$)/.test(url)) {
      return Response.json({
        max_competitors: 3,
        competitors: competitors.map((competitor) => ({
          id: competitor.id,
          seed_url: competitor.seed_url,
          name: competitor.name,
          created_at: "2026-01-01T00:00:00Z",
          crawl:
            competitor.crawlStatus === null
              ? null
              : competitorCrawl(competitor.crawlStatus),
        })),
      })
    }
    const analysisMatch = url.match(/\/competitors\/([^/]+)\/keyword-analysis/)
    if (analysisMatch) {
      const rows = options.analyses?.[analysisMatch[1]] ?? [
        { keyword: "emergency plumber", kind: "non_brand" },
        { keyword: "drain cleaning", kind: "non_brand" },
        { keyword: "Acme", kind: "brand" },
      ]
      return Response.json({
        keywords: rows.map((row) => ({
          ...row,
          rank: null,
          traffic: null,
          volume: null,
          kd: null,
          cpc: null,
          results_count: null,
        })),
      })
    }
    if (url.includes(`/projects/${PROJECT}/keyword-lists`)) {
      return Response.json({
        can_manage_keywords: true,
        user_defined: [],
        revserp_suggested: [],
        combined: [],
      })
    }
    return new Response(JSON.stringify({ error: "unexpected" }), {
      status: 400,
    })
  }) as typeof fetch
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
}

const mountedRoots: Array<() => void> = []

function render(element: ReactElement, client = makeClient()) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    )
  })
  const unmount = () => {
    act(() => root.unmount())
    host.remove()
  }
  mountedRoots.push(unmount)
  return { host, unmount, client }
}

async function flush(times = 6) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await flushTestDom()
    }
  })
}

function selectionCheckbox(host: HTMLElement, keyword: string) {
  const checkbox = Array.from(host.querySelectorAll("button")).find(
    (candidate) =>
      candidate.getAttribute("aria-label") === `Select keyword ${keyword}`
  )
  if (!(checkbox instanceof window.HTMLButtonElement)) {
    throw new Error(`checkbox for "${keyword}" not found`)
  }
  return checkbox
}

afterEach(() => {
  for (const unmount of mountedRoots.splice(0)) unmount()
  globalThis.fetch = realFetch
  fetchCalls.length = 0
  localStorage.clear()
  document.body.innerHTML = ""
})

describe("ProjectCompetitorKeywordsCard", () => {
  test("tabs list completed competitors and rows show non-brand keywords only", async () => {
    installFetch({})
    const { host, unmount } = render(
      <ProjectCompetitorKeywordsCard projectId={PROJECT} />
    )
    await flush()

    expect(host.textContent).toContain("Competitor keywords")
    expect(host.textContent).toContain("Rival")
    expect(host.textContent).toContain("emergency plumber")
    expect(host.textContent).toContain("drain cleaning")
    expect(host.textContent?.includes("Acme")).toBe(false)
    expect(
      host.querySelector('button[aria-label="Remove emergency plumber"]')
    ).toBeNull()

    unmount()
  })

  test("checking a keyword persists it for the next mount", async () => {
    installFetch({})
    const first = render(<ProjectCompetitorKeywordsCard projectId={PROJECT} />)
    await flush()

    await act(async () => {
      selectionCheckbox(first.host, "emergency plumber").click()
      await flushTestDom()
    })
    expect(
      JSON.parse(
        localStorage.getItem(`competitor-keyword-selections:${PROJECT}`)!
      )
    ).toEqual(["emergency plumber"])
    expect(first.host.textContent).toContain("1 selected")
    first.unmount()

    const second = render(<ProjectCompetitorKeywordsCard projectId={PROJECT} />)
    await flush()
    expect(
      selectionCheckbox(second.host, "emergency plumber").getAttribute(
        "aria-checked"
      )
    ).toBe("true")
    second.unmount()
  })

  test("no crawled competitors shows the empty state with a Competitors link", async () => {
    installFetch({
      competitors: [
        {
          id: "c-9",
          name: "Uncrawled",
          seed_url: "https://new.example",
          crawlStatus: null,
        },
      ],
    })
    const { host, unmount } = render(
      <ProjectCompetitorKeywordsCard projectId={PROJECT} />
    )
    await flush()

    expect(host.textContent).toContain("No crawled competitors")
    const link = host.querySelector('a[href="#competitors"]')
    expect(link?.textContent).toContain("Open Competitors")

    unmount()
  })

  test("a competitor without non-brand keywords shows the empty state", async () => {
    installFetch({
      analyses: { "c-1": [{ keyword: "Acme", kind: "brand" }] },
    })
    const { host, unmount } = render(
      <ProjectCompetitorKeywordsCard projectId={PROJECT} />
    )
    await flush()

    expect(host.textContent).toContain("No competitor keywords")
    expect(host.querySelector('a[href="#competitors"]')).toBeTruthy()

    unmount()
  })
})

describe("competitor selection merging", () => {
  test("checked keywords attach a Competitor source or join as non-brand", () => {
    const merged = mergeCompetitorSelectionsIntoCombined(
      [
        { keyword: "acme plumbing", kind: "brand", sources: ["user"] },
        {
          keyword: "drain cleaning",
          kind: "non_brand",
          sources: ["revserp"],
        },
      ],
      ["Drain Cleaning", "emergency plumber"]
    )
    expect(
      merged.find((row) => row.keyword === "drain cleaning")?.sources
    ).toEqual(["revserp", "competitor"])
    expect(merged.find((row) => row.keyword === "emergency plumber")).toEqual({
      keyword: "emergency plumber",
      kind: "non_brand",
      sources: ["competitor"],
    })
  })

  test("checked keywords surface as coverage gaps when unmeasured", () => {
    const seeds = mergeCompetitorSelectionsIntoSeeds(
      [{ keyword: "drain cleaning", state: "likely_targeted", matches: [] }],
      ["Drain Cleaning", "emergency plumber"]
    )
    expect(seeds.map((seed) => seed.keyword)).toEqual([
      "drain cleaning",
      "emergency plumber",
    ])
    expect(
      seeds.find((seed) => seed.keyword === "emergency plumber")?.state
    ).toBe("no_landing_page")
  })

  test("the keyword cloud includes checked competitor keywords", async () => {
    localStorage.setItem(
      `competitor-keyword-selections:${PROJECT}`,
      JSON.stringify(["emergency plumber"])
    )
    installFetch({})
    const { host, unmount } = render(
      <CombinedKeywordCloudCard projectId={PROJECT} />
    )
    await flush()

    expect(host.textContent).toContain("emergency plumber")

    unmount()
  })
})
