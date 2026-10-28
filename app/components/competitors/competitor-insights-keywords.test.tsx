import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

// Charts need canvas runtimes happy-dom lacks; stub the score visuals so the
// keywords wiring below them stays real, which is what this test pins.
mock.module("~/components/overview-pillar-scores-section", () => ({
  PillarScoresCompare: () => null,
}))
mock.module("~/components/competitors/issue-bucket-pies", () => ({
  IssueBucketPies: () => null,
}))
mock.module("~/components/competitors/competitor-score-sankey", () => ({
  SliceScoreSankey: () => <div>Where the points go</div>,
}))
mock.module("~/components/compare/charts", () => ({
  HealthRidge: () => null,
}))

const { CompetitorInsightsView } = await import(
  "~/components/competitors/competitor-insights"
)
const { KeywordCoverageCard, KeywordsCoverage } = await import(
  "~/components/keywords/keywords-coverage"
)
const { AddNonBrandKeywordButton } = await import(
  "~/components/keywords/add-non-brand-keyword-button"
)
const { KeywordAnalysisCard } = await import(
  "~/components/keywords/keyword-analysis-card"
)
const { act } = await import("react")
import type { ReactElement } from "react"
const { createRoot } = await import("react-dom/client")
const { MemoryRouter } = await import("react-router")
import type { Root } from "react-dom/client"
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { flushTestDom } = await import("~/lib/dom-test-setup")
import type {
  CompetitorGapReport,
  KeywordCoverageSeed,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

const PROJECT = "Acme"
const COMPETITOR = "Rival"
const CRAWL = "crawl-1"
const PROJECT_ID = "proj-1"
const COMPETITOR_ID = "comp-1"

const realFetch = globalThis.fetch

function makeBreakdown(): ScoreBreakdownResponse {
  return {
    crawl_id: CRAWL,
    scoring_version: "v1",
    coverage_scale: 1,
    total_scored_pages: 0,
    overall_score: 80,
    pillars: [],
  }
}

function makeReport(
  coverage: CompetitorGapReport["keyword_coverage"],
): CompetitorGapReport {
  return {
    version: "v1",
    radius: 1,
    your_pages: 10,
    their_pages: 8,
    you_breakdown: makeBreakdown(),
    them_breakdown: makeBreakdown(),
    your_slice: [],
    their_slice: [],
    issues: [],
    spread: [],
    keyword_coverage: coverage,
    page_health: {
      you: { buckets: [], total_pages: 0 },
      them: { buckets: [], total_pages: 0 },
    },
    presence: [],
    psi: { you: null, them: null },
    homepage: {
      you: {
        url: "https://you.example/",
        title: true,
        meta: true,
        h1: true,
        canonical: true,
        og: true,
        json_ld: true,
        word_count: 1,
      },
      them: {
        url: "https://them.example/",
        title: true,
        meta: true,
        h1: true,
        canonical: true,
        og: true,
        json_ld: true,
        word_count: 1,
      },
    },
    content: {
      you: { median_word_count: null, pages_with_h1: 0, pages_with_meta: 0 },
      them: { median_word_count: null, pages_with_h1: 0, pages_with_meta: 0 },
    },
  }
}

const YOU_SEEDS: KeywordCoverageSeed[] = [
  { keyword: "alpha gap", state: "no_landing_page", matches: [] },
  {
    keyword: "beta targeted",
    state: "likely_targeted",
    matches: [{ url: "https://you.example/beta", field: "title" }],
  },
  {
    keyword: "gamma split",
    state: "cannibalized",
    matches: [
      { url: "https://you.example/g1", field: "title" },
      { url: "https://you.example/g2", field: "h1" },
    ],
  },
]

const THEM_SEEDS: KeywordCoverageSeed[] = [
  { keyword: "alpha gap", state: "no_landing_page", matches: [] },
  {
    keyword: "beta targeted",
    state: "likely_targeted",
    matches: [{ url: "https://them.example/beta", field: "title" }],
  },
  {
    keyword: "gamma split",
    state: "cannibalized",
    matches: [
      { url: "https://them.example/g1", field: "title" },
      { url: "https://them.example/g2", field: "h1" },
    ],
  },
]

const PROJECT_ANALYSIS = {
  keywords: [
    { keyword: "acme care", kind: "brand", rank: 3, traffic: 1200, volume: 5400, kd: 22, cpc: 1.5, results_count: 18000 },
    { keyword: "drain fix", kind: "non_brand", rank: null, traffic: null, volume: 8800, kd: null, cpc: null, results_count: null },
  ],
}

const COMPETITOR_ANALYSIS = {
  keywords: [
    { keyword: "rival care", kind: "brand", rank: 5, traffic: 900, volume: 4300, kd: 31, cpc: 2.25, results_count: 21000 },
    { keyword: "pipe fix", kind: "non_brand", rank: null, traffic: 400, volume: null, kd: 12, cpc: null, results_count: 9000 },
  ],
}

function installGapFetch(report: CompetitorGapReport) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes(`/crawls/${CRAWL}/competitor-gap`)) {
      return Response.json(report)
    }
    if (url.includes(`/projects/${PROJECT_ID}/keywords`)) {
      return Response.json({ project_id: PROJECT_ID, seeds: YOU_SEEDS })
    }
    if (url.includes("/keyword-lists")) {
      return Response.json({
        project_id: PROJECT_ID,
        can_manage_keywords: true,
        user_defined: [],
        revserp_suggested: [],
        combined: [],
      })
    }
    if (url.includes(`/competitors/${COMPETITOR_ID}/keyword-analysis`)) {
      return Response.json(COMPETITOR_ANALYSIS)
    }
    if (url.includes(`/projects/${PROJECT_ID}/keyword-analysis`)) {
      return Response.json(PROJECT_ANALYSIS)
    }
    throw new Error(`unexpected request ${url}`)
  }) as typeof fetch
}

const roots: Array<() => void> = []

function render(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>{element}</QueryClientProvider>
      </MemoryRouter>
    )
  })
  roots.push(() => {
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

function buttonsByText(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll("button")).filter((button) =>
    (button.textContent ?? "").includes(text),
  )
}

afterEach(() => {
  for (const unmount of roots.splice(0)) unmount()
  globalThis.fetch = realFetch
  document.body.innerHTML = ""
})

describe("competitor keywords coverage", () => {
  test("slice sankey sits below keywords with parent list on both sites", async () => {
    installGapFetch(makeReport({ you: YOU_SEEDS, them: THEM_SEEDS }))
    const { host } = render(
      <CompetitorInsightsView
        competitorCrawlId={CRAWL}
        competitorId={COMPETITOR_ID}
        competitorName={COMPETITOR}
        onClose={() => {}}
        projectId={PROJECT_ID}
        projectName={PROJECT}
      />,
    )
    await flush()

    const text = host.textContent ?? ""
    expect(text).toContain("Keywords")
    expect(text).toContain("Coverage measures your non-brand keywords on both sites")
    const sankey = text.indexOf("Where the points go")
    const keywords = text.indexOf("Keywords")
    const health = text.indexOf("Page health")
    expect(sankey >= 0).toBe(true)
    expect(sankey > keywords).toBe(true)
    expect(health > keywords).toBe(true)
    expect((text.match(/alpha gap/g) ?? []).length >= 2).toBe(true)
    expect(host.querySelector('a[href="https://you.example/beta"]')).toBeTruthy()
    expect(host.querySelector('a[href="https://them.example/beta"]')).toBeTruthy()
  })

  test("site filters stay isolated", async () => {
    installGapFetch(makeReport({ you: YOU_SEEDS, them: THEM_SEEDS }))
    const { host } = render(
      <CompetitorInsightsView
        competitorCrawlId={CRAWL}
        competitorId={COMPETITOR_ID}
        competitorName={COMPETITOR}
        onClose={() => {}}
        projectId={PROJECT_ID}
        projectName={PROJECT}
      />,
    )
    await flush()
    expect(host.querySelector('a[href="https://you.example/beta"]')).toBeTruthy()
    expect(host.querySelector('a[href="https://them.example/beta"]')).toBeTruthy()

    await act(async () => {
      buttonsByText(host, "Gaps")[0].click()
      await flushTestDom()
    })
    await flush()

    expect(host.querySelector('a[href="https://you.example/beta"]')).toBeNull()
    expect(host.querySelector('a[href="https://them.example/beta"]')).toBeTruthy()
  })

  test("empty non-brand list explains itself", async () => {
    installGapFetch(makeReport({ you: [], them: [] }))
    const { host } = render(
      <CompetitorInsightsView
        competitorCrawlId={CRAWL}
        competitorId={COMPETITOR_ID}
        competitorName={COMPETITOR}
        onClose={() => {}}
        projectId={PROJECT_ID}
        projectName={PROJECT}
      />,
    )
    await flush()
    expect(host.textContent).toContain(
      "No non-brand keywords to compare yet. Add non-brand keywords to the parent project.",
    )
    expect(host.textContent).toContain(PROJECT)
    expect(host.textContent).toContain(COMPETITOR)
    expect(host.textContent).toContain("measured on Acme")
    expect(host.textContent).toContain("measured on Rival")
  })

  test("project wrapper keeps headline, page links, and cannibalized expansion", async () => {
    installGapFetch(makeReport({ you: YOU_SEEDS, them: THEM_SEEDS }))
    const { host } = render(<KeywordsCoverage projectId={PROJECT_ID} />)
    await flush()

    expect(host.textContent).toContain("Keyword coverage")
    expect(host.textContent).toContain("All")
    expect(host.querySelector('a[href="https://you.example/beta"]')).toBeTruthy()
    await act(async () => {
      buttonsByText(host, "2 pages")[0].click()
      await flushTestDom()
    })
    expect(host.querySelector('a[href="https://you.example/g1"]')).toBeTruthy()
    expect(host.querySelector('a[href="https://you.example/g2"]')).toBeTruthy()
  })

  test("cards render the same seeds with independent filters", async () => {
    const { host } = render(
      <div className="grid lg:grid-cols-2">
        <KeywordCoverageCard seeds={YOU_SEEDS} title="You" />
        <KeywordCoverageCard seeds={YOU_SEEDS} title="Them" />
      </div>,
    )
    await flush()
    expect((host.textContent ?? "").match(/beta targeted/g)?.length).toBe(2)
    await act(async () => {
      buttonsByText(host, "Gaps")[0].click()
      await flushTestDom()
    })
    await flush()
    expect((host.textContent ?? "").match(/beta targeted/g)?.length).toBe(1)
  })
})

describe("competitor keyword estimates", () => {
  test("renders independent project and competitor estimate tables", async () => {
    installGapFetch(makeReport({ you: YOU_SEEDS, them: THEM_SEEDS }))
    const { host } = render(
      <CompetitorInsightsView
        competitorCrawlId={CRAWL}
        competitorId={COMPETITOR_ID}
        competitorName={COMPETITOR}
        onClose={() => {}}
        projectId={PROJECT_ID}
        projectName={PROJECT}
      />,
    )
    await flush()

    const text = host.textContent ?? ""
    expect(host.querySelectorAll("table")).toHaveLength(2)
    const tables = Array.from(host.querySelectorAll("table"))
    for (const table of tables) {
      expect(table.closest('[data-slot="card"]')?.classList.contains("h-[32rem]")).toBe(true)
      expect(table.closest('[role="region"]')?.classList.contains("overflow-auto")).toBe(true)
      expect(Array.from(table.querySelectorAll("th"), (cell) => cell.textContent).includes("Results")).toBe(false)
    }
    expect(text).toContain("acme care")
    expect(text).toContain("drain fix")
    expect(text).toContain("rival care")
    expect(text).toContain("pipe fix")
    expect(text).toContain("AI-generated estimates. Values may be inaccurate and are not verified search data.")
    expect(text).toContain("1,200")
    expect(text).toContain("22%")
    expect(text).toContain("$1.50")
    expect(text).toContain("900")
    expect(text).toContain("—")
  })

  test("estimate tables show both kinds together with no kind tabs", async () => {
    installGapFetch(makeReport({ you: YOU_SEEDS, them: THEM_SEEDS }))
    const { host } = render(
      <CompetitorInsightsView
        competitorCrawlId={CRAWL}
        competitorId={COMPETITOR_ID}
        competitorName={COMPETITOR}
        onClose={() => {}}
        projectId={PROJECT_ID}
        projectName={PROJECT}
      />,
    )
    await flush()
    const text = host.textContent ?? ""
    expect(text).toContain("acme care")
    expect(text).toContain("drain fix")
    expect(text).toContain("rival care")
    expect(text).toContain("pipe fix")
    expect((text.match(/1 brand · 1 non-brand/g) ?? []).length).toBe(2)
    const estimateCards = Array.from(host.querySelectorAll("table"))
    expect(estimateCards).toHaveLength(2)
    for (const table of estimateCards) {
      expect(table.querySelector('[role="tab"]')).toBeNull()
    }
  })

  test("estimates sit below coverage grid and above page health", async () => {
    installGapFetch(makeReport({ you: YOU_SEEDS, them: THEM_SEEDS }))
    const { host } = render(
      <CompetitorInsightsView
        competitorCrawlId={CRAWL}
        competitorId={COMPETITOR_ID}
        competitorName={COMPETITOR}
        onClose={() => {}}
        projectId={PROJECT_ID}
        projectName={PROJECT}
      />,
    )
    await flush()
    const text = host.textContent ?? ""
    expect(text).toContain("rival care")
    expect(text.indexOf("rival care") > text.indexOf("Coverage measures the parent non-brand list")).toBe(true)
    expect(text.indexOf("Page health") > text.indexOf("rival care")).toBe(true)
  })

  test("analysis card renders non-brand rows with dash nulls", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.includes("/keyword-lists")) {
        return Response.json({
          project_id: PROJECT_ID,
          can_manage_keywords: true,
          user_defined: [],
          revserp_suggested: [],
          combined: [],
        })
      }
      if (url.includes(`/projects/${PROJECT_ID}/keyword-analysis`)) {
        return Response.json(PROJECT_ANALYSIS)
      }
      throw new Error(`unexpected request ${url}`)
    }) as typeof fetch
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
    )
    await flush()
    const text = host.textContent ?? ""
    expect(text).toContain("acme care")
    expect(text).toContain("drain fix")
    expect(text).toContain("—")
    expect(text).toContain("AI-generated estimates")
  })
})

describe("add to non-brand keywords", () => {
  function listsFetch(manage: boolean, combined: Array<{ keyword: string; kind: string; sources: string[] }>) {
    globalThis.fetch = (async () =>
      Response.json({
        project_id: PROJECT_ID,
        can_manage_keywords: manage,
        user_defined: [],
        revserp_suggested: [],
        combined,
      })) as typeof fetch
  }
  const withButtons = () => (
    <>
      {YOU_SEEDS.map((seed) => (
        <AddNonBrandKeywordButton
          key={seed.keyword}
          keyword={seed.keyword}
          projectId={PROJECT_ID}
        />
      ))}
    </>
  )

  test("shows + for new keywords and a check for ones already saved", async () => {
    listsFetch(true, [{ keyword: "Beta Targeted", kind: "brand", sources: ["user"] }])
    const { host } = render(withButtons())
    await flush()
    expect(host.querySelector('button[aria-label="Already in your keywords"]')).toBeTruthy()
    expect(host.querySelectorAll('button[aria-label^="Add "]').length).toBe(YOU_SEEDS.length - 1)
  })

  test("hides the button without manage rights", async () => {
    listsFetch(false, [])
    const { host } = render(withButtons())
    await flush()
    expect(host.querySelector('button[aria-label^="Add "]')).toBeNull()
  })
})
