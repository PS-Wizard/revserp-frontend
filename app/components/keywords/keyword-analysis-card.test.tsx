import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const analysisListeners: Array<(event: unknown) => void> = []
mock.module("~/hooks/use-organization-events", () => ({
  useOrganizationEventsListener: (listener: (event: unknown) => void) => {
    analysisListeners.push(listener)
  },
}))

const { KeywordAnalysisCard } =
  await import("~/components/keywords/keyword-analysis-card")
const {
  formatAnalysisCount,
  formatAnalysisRank,
  formatAnalysisKd,
  formatAnalysisCpc,
} = await import("~/components/keywords/keyword-analysis-card")
const { KEYWORD_ESTIMATES_TOOLTIP } = await import("~/lib/keyword-analysis-api")
const { RevbotStartPromptContext } = await import(
  "~/components/revbot/revbot-start-prompt-context"
)
const { act } = await import("react")
import type { ReactElement } from "react"
const { createRoot } = await import("react-dom/client")
import type { Root } from "react-dom/client"
const { QueryClient, QueryClientProvider } =
  await import("@tanstack/react-query")
const { flushTestDom } = await import("~/lib/dom-test-setup")
import type { OrganizationEventFrame } from "~/lib/api.types"

const PROJECT_ID = "proj-1"
const COMPETITOR_ID = "comp-9"

let analysisResponse: unknown = { keywords: [] }
let analysisStatus = 200
let analysisFetches = 0
let listsManage = true

function installFetch() {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("/keyword-lists")) {
      return Response.json({
        project_id: PROJECT_ID,
        can_manage_keywords: listsManage,
        user_defined: [],
        revserp_suggested: [],
        combined: [],
      })
    }
    if (
      url.includes(`/projects/${PROJECT_ID}/keyword-analysis`) ||
      url.includes(
        `/projects/${PROJECT_ID}/competitors/${COMPETITOR_ID}/keyword-analysis`
      )
    ) {
      analysisFetches += 1
      return new Response(JSON.stringify(analysisResponse), {
        status: analysisStatus,
      })
    }
    throw new Error(`unexpected request ${url}`)
  }) as typeof fetch
}

const realFetch = globalThis.fetch

const roots: Array<() => void> = []

function render(element: ReactElement, revbot?: { onPrompt: (content: string) => void } | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  const body =
    revbot === null ? (
      element
    ) : (
      <RevbotStartPromptContext.Provider
        value={
          revbot
            ? {
                startPrompt: (content: string) => revbot.onPrompt(content),
                isActive: true,
              }
            : { startPrompt: () => {}, isActive: true }
        }
      >
        {element}
      </RevbotStartPromptContext.Provider>
    )
  act(() => {
    root.render(<QueryClientProvider client={client}>{body}</QueryClientProvider>)
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
    (button.textContent ?? "").includes(text)
  )
}

function rowFor(host: HTMLElement, keyword: string) {
  return (
    Array.from(host.querySelectorAll("tr")).find((row) =>
      (row.textContent ?? "").includes(keyword)
    ) ?? null
  )
}

function emitAnalysisEvent(payload: Record<string, unknown>, projectId: string | null = PROJECT_ID) {
  const event = {
    type: "keyword_analysis.updated",
    organization_id: "org-1",
    project_id: projectId,
    resource_id: null,
    payload,
    created_at: "",
  } as unknown as OrganizationEventFrame
  for (const listener of [...analysisListeners]) listener(event)
}

afterEach(() => {
  for (const unmount of roots.splice(0)) unmount()
  analysisListeners.splice(0)
  globalThis.fetch = realFetch
  document.body.innerHTML = ""
  analysisResponse = { keywords: [] }
  analysisStatus = 200
  analysisFetches = 0
  listsManage = true
})

const ANALYSIS = {
  keywords: [
    {
      keyword: "acme care",
      kind: "brand",
      rank: 3,
      traffic: 1200,
      volume: 5400,
      kd: 22,
      cpc: 1.5,
      results_count: 18000,
    },
    {
      keyword: "drain fix",
      kind: "non_brand",
      rank: null,
      traffic: null,
      volume: 8800,
      kd: null,
      cpc: null,
      results_count: null,
    },
  ],
}

const FULL_ANALYSIS = {
  keywords: [
    {
      keyword: "acme care",
      kind: "brand",
      rank: 3,
      traffic: 1200,
      volume: 5400,
      kd: 22,
      cpc: 1.5,
      results_count: 18000,
    },
    {
      keyword: "drain fix",
      kind: "non_brand",
      rank: 9,
      traffic: 400,
      volume: 8800,
      kd: 12,
      cpc: 0.75,
      results_count: 9000,
    },
  ],
}

describe("keyword analysis formatters", () => {
  test("null renders as a dash, values are formatted", () => {
    expect(formatAnalysisCount(null)).toBe("—")
    expect(formatAnalysisCount(1200)).toBe("1,200")
    expect(formatAnalysisRank(null)).toBe("—")
    expect(formatAnalysisRank(3)).toBe("3")
    expect(formatAnalysisKd(null)).toBe("—")
    expect(formatAnalysisKd(22)).toBe("22%")
    expect(formatAnalysisCpc(null)).toBe("—")
    expect(formatAnalysisCpc(1.5)).toBe("$1.50")
  })

  test("tooltip copy is the approved estimates disclaimer", () => {
    expect(KEYWORD_ESTIMATES_TOOLTIP).toBe(
      "AI-generated estimates. Values may be inaccurate and are not verified search data."
    )
  })
})

describe("keyword analysis card", () => {
  test("brand and non-brand rows share one table with exact GSC tints", async () => {
    installFetch()
    analysisResponse = ANALYSIS
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      null
    )
    await flush()
    expect(host.querySelectorAll("table")).toHaveLength(1)
    expect(host.querySelector('[role="tab"]')).toBeNull()
    const text = host.textContent ?? ""
    expect(text).toContain("acme care")
    expect(text).toContain("drain fix")
    expect(text).toContain("1 brand · 1 non-brand")
    expect(text).toContain("Brand")
    expect(text).toContain("Non-brand")
    expect(
      rowFor(host, "acme care")?.classList.contains("bg-yellow-400/[0.08]")
    ).toBe(true)
    expect(
      rowFor(host, "drain fix")?.classList.contains("bg-blue-400/[0.08]")
    ).toBe(true)
    expect(text).toContain("1,200")
    expect(text).toContain("22%")
    expect(text).toContain("$1.50")
    expect(text.includes("18,000")).toBe(false)
    expect(Array.from(host.querySelectorAll("th"), (cell) => cell.textContent)).toEqual([
      "Keyword", "Type", "Rank", "Traffic", "Volume", "KD", "CPC",
    ])
    expect(host.querySelector('[data-slot="card"]')?.classList.contains("h-[32rem]")).toBe(true)
    const scrollArea = host.querySelector('[role="region"]')
    expect(scrollArea?.classList.contains("overflow-auto")).toBe(true)
    expect(scrollArea?.getAttribute("tabindex")).toBe("0")
    expect(host.querySelector("thead")?.classList.contains("sticky")).toBe(true)
    expect(scrollArea?.textContent?.includes(KEYWORD_ESTIMATES_TOOLTIP)).toBe(false)
    expect(text).toContain(KEYWORD_ESTIMATES_TOOLTIP)
  })

  test("null metrics render as dashes in the shared table", async () => {
    installFetch()
    analysisResponse = ANALYSIS
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      null
    )
    await flush()
    const row = rowFor(host, "drain fix")
    expect(row?.textContent).toContain("—")
    expect(row?.textContent).toContain("8,800")
  })

  test("sortable headers flip direction with nulls last and aria-sort", async () => {
    installFetch()
    analysisResponse = ANALYSIS
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      null
    )
    await flush()
    const headButton = (label: string) =>
      Array.from(host.querySelectorAll<HTMLButtonElement>("th button")).find(
        (button) => (button.textContent ?? "") === label,
      ) ?? null
    const keywordOrder = () =>
      Array.from(
        host.querySelectorAll("tbody tr"),
        (row) => row.querySelector("td")?.textContent ?? "",
      )
    const ariaSortFor = (label: string) =>
      headButton(label)?.closest("th")?.getAttribute("aria-sort")

    // Numeric columns sort descending first.
    await act(async () => {
      headButton("Volume")?.click()
      await flushTestDom()
    })
    expect(keywordOrder()).toEqual(["drain fix", "acme care"])
    expect(ariaSortFor("Volume")).toBe("descending")

    // Second click flips to ascending.
    await act(async () => {
      headButton("Volume")?.click()
      await flushTestDom()
    })
    expect(keywordOrder()).toEqual(["acme care", "drain fix"])
    expect(ariaSortFor("Volume")).toBe("ascending")

    // Text columns sort ascending first.
    await act(async () => {
      headButton("Keyword")?.click()
      await flushTestDom()
    })
    expect(keywordOrder()).toEqual(["acme care", "drain fix"])
    expect(ariaSortFor("Keyword")).toBe("ascending")
    await act(async () => {
      headButton("Keyword")?.click()
      await flushTestDom()
    })
    expect(keywordOrder()).toEqual(["drain fix", "acme care"])

    // Null metrics stay last in both directions.
    await act(async () => {
      headButton("Traffic")?.click()
      await flushTestDom()
    })
    expect(keywordOrder()).toEqual(["acme care", "drain fix"])
    await act(async () => {
      headButton("Traffic")?.click()
      await flushTestDom()
    })
    expect(keywordOrder()).toEqual(["acme care", "drain fix"])
  })

  test("empty estimates offer Analyze Keywords with the project prompt", async () => {
    installFetch()
    analysisResponse = { keywords: [] }
    const prompts: string[] = []
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      { onPrompt: (content) => prompts.push(content) }
    )
    await flush()
    expect(host.textContent).toContain("No estimates yet")
    const before = analysisFetches
    await act(async () => {
      buttonsByText(host, "Analyze Keywords")[0].click()
      await flushTestDom()
    })
    await flush()
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain("get_project_keywords")
    expect(prompts[0]).toContain("set_keyword_analysis")
    expect(prompts[0]).toContain("omitting competitor_id")
    expect(prompts[0]).toContain("never null")
    expect(prompts[0]).toContain("ALL five metrics")
    expect(prompts[0].includes("results_count")).toBe(false)
    expect(host.textContent).toContain("Generating…")
    analysisResponse = ANALYSIS
    await act(async () => {
      buttonsByText(host, "Check again")[0].click()
      await flushTestDom()
    })
    await flush()
    expect(analysisFetches > before).toBe(true)
    expect(host.textContent).toContain("acme care")
    expect(host.textContent).toContain("drain fix")
    expect(host.textContent.includes("Generating…")).toBe(false)
  })

  test("competitor empty state targets only that competitor", async () => {
    installFetch()
    analysisResponse = { keywords: [] }
    const prompts: string[] = []
    const { host } = render(
      <KeywordAnalysisCard
        competitorId={COMPETITOR_ID}
        projectId={PROJECT_ID}
        title="Rival"
      />,
      { onPrompt: (content) => prompts.push(content) }
    )
    await flush()
    await act(async () => {
      buttonsByText(host, "Analyze Keywords")[0].click()
      await flushTestDom()
    })
    await flush()
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain(COMPETITOR_ID)
    expect(prompts[0]).toContain(`competitor_id "${COMPETITOR_ID}"`)
    expect(prompts[0]).toContain("never write project estimates")
    expect(prompts[0]).toContain("reads the parent project only")
    expect(prompts[0].includes("omitting competitor_id")).toBe(false)
  })

  test("estimates offer a refresh action", async () => {
    installFetch()
    analysisResponse = ANALYSIS
    const prompts: string[] = []
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      { onPrompt: (content) => prompts.push(content) }
    )
    await flush()
    await act(async () => {
      buttonsByText(host, "Refresh estimates")[0].click()
      await flushTestDom()
    })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain("set_keyword_analysis")
  })

  test("complete estimates still offer a refresh action", async () => {
    installFetch()
    analysisResponse = {
      keywords: FULL_ANALYSIS.keywords.map((row) => ({ ...row, results_count: null })),
    }
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      { onPrompt: () => {} }
    )
    await flush()
    expect(host.textContent).toContain("acme care")
    expect(buttonsByText(host, "Refresh estimates")).toHaveLength(1)
  })

  test("no Revbot context hides the Analyze button", async () => {
    installFetch()
    analysisResponse = { keywords: [] }
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      null
    )
    await flush()
    expect(host.textContent).toContain("No estimates yet")
    expect(buttonsByText(host, "Analyze Keywords")).toHaveLength(0)
  })

  test("viewers without manage permission get no Analyze button", async () => {
    installFetch()
    listsManage = false
    analysisResponse = { keywords: [] }
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      { onPrompt: () => {} }
    )
    await flush()
    expect(buttonsByText(host, "Analyze Keywords")).toHaveLength(0)
  })

  test("keyword analysis events refresh mounted rows without the CTA", async () => {
    installFetch()
    analysisResponse = ANALYSIS
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      null
    )
    await flush()
    expect(host.textContent).toContain("acme care")
    const before = analysisFetches
    analysisResponse = FULL_ANALYSIS
    await act(async () => {
      emitAnalysisEvent({})
      await flushTestDom()
    })
    await flush()
    expect(analysisFetches > before).toBe(true)
    expect(host.textContent).toContain("drain fix")
  })

  test("events for other scopes do not refresh the card", async () => {
    installFetch()
    analysisResponse = ANALYSIS
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      null
    )
    await flush()
    const before = analysisFetches
    await act(async () => {
      emitAnalysisEvent({}, "other-project")
      emitAnalysisEvent({ competitor_id: COMPETITOR_ID })
      await flushTestDom()
    })
    await flush()
    expect(analysisFetches).toBe(before)
    expect(host.textContent).toContain("acme care")
  })

  test("competitor card refreshes only on its own competitor event", async () => {
    installFetch()
    analysisResponse = { keywords: [] }
    const { host } = render(
      <KeywordAnalysisCard
        competitorId={COMPETITOR_ID}
        projectId={PROJECT_ID}
        title="Rival"
      />,
      null
    )
    await flush()
    expect(host.textContent).toContain("No estimates yet")
    const before = analysisFetches
    await act(async () => {
      emitAnalysisEvent({})
      await flushTestDom()
    })
    await flush()
    expect(analysisFetches).toBe(before)
    analysisResponse = ANALYSIS
    await act(async () => {
      emitAnalysisEvent({ competitor_id: COMPETITOR_ID })
      await flushTestDom()
    })
    await flush()
    expect(analysisFetches > before).toBe(true)
    expect(host.textContent).toContain("acme care")
  })

  test("404 renders the not-ready state with retry", async () => {
    installFetch()
    analysisResponse = { error: "not found" }
    analysisStatus = 404
    const { host } = render(
      <KeywordAnalysisCard projectId={PROJECT_ID} title="Keyword estimates" />,
      null
    )
    await flush()
    expect(host.textContent).toContain("Estimates not ready yet")
  })

  test("null project renders the empty state without fetching", async () => {
    let fetched = 0
    globalThis.fetch = (async () => {
      fetched += 1
      return Response.json({ keywords: [] })
    }) as typeof fetch
    const { host } = render(
      <KeywordAnalysisCard projectId={null} title="Keyword estimates" />,
      null
    )
    await flush()
    expect(host.textContent).toContain("No project selected")
    expect(fetched).toBe(0)
  })
})
