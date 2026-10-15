import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { flushRevbot, installRevbotDom } from "./revbot-dom-test-setup"
import {
  RevbotAuditSuggestionStarters,
  selectRevbotAuditSuggestions,
} from "./revbot-audit-suggestion-starters"
import type { RevbotAuditSuggestion } from "./revbot-audit-suggestions"
import type {
  CrawlResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

installRevbotDom()

const T = "2024-01-01T00:00:00Z"

function completedCrawl(overrides?: Partial<CrawlResponse>): CrawlResponse {
  return {
    id: "crawl-1",
    project_id: "p-1",
    status: "completed",
    urls_discovered: 10,
    urls_crawled: 10,
    max_depth_reached: 2,
    created_at: T,
    ...overrides,
  }
}

function breakdown(crawlId: string): ScoreBreakdownResponse {
  return {
    crawl_id: crawlId,
    scoring_version: "v1",
    coverage_scale: 1,
    total_scored_pages: 10,
    overall_score: 60,
    pillars: [
      {
        id: "seo",
        label: "SEO",
        score: 50,
        weight: 1,
        weighted_contribution: 50,
        total_penalty: 50,
        bucket_count: 1,
        issue_type_count: 1,
        issue_row_count: 5,
        affected_url_count: 3,
        buckets: [
          {
            id: "meta-tags",
            label: "Meta Tags",
            score: 40,
            weight: 1,
            weighted_contribution: 40,
            total_penalty: 60,
            issue_type_count: 1,
            issue_row_count: 5,
            affected_url_count: 3,
            issues: [],
          },
        ],
      },
    ],
  }
}

function suggestion(overrides?: Partial<RevbotAuditSuggestion>): RevbotAuditSuggestion {
  return {
    id: "seo:meta-tags",
    crawlId: "crawl-1",
    pillarId: "seo",
    pillarLabel: "SEO",
    bucketId: "meta-tags",
    bucketLabel: "Meta Tags",
    affectedUrlCount: 3,
    message: "Help me fix the Meta Tags bucket under SEO.",
    ...overrides,
  }
}

describe("selectRevbotAuditSuggestions scope guard", () => {
  test("returns selector suggestions for the current completed crawl", () => {
    const suggestions = selectRevbotAuditSuggestions({
      breakdown: breakdown("crawl-1"),
      currentCrawl: completedCrawl(),
      activeProjectId: "p-1",
      isLocationScoped: false,
    })
    expect(suggestions.length).toBe(1)
    expect(suggestions[0]?.crawlId).toBe("crawl-1")
    expect(suggestions[0]?.bucketId).toBe("meta-tags")
  })

  test("omits root cards in a location scope even with matching evidence", () => {
    expect(
      selectRevbotAuditSuggestions({
        breakdown: breakdown("crawl-1"),
        currentCrawl: completedCrawl(),
        activeProjectId: "p-1",
        isLocationScoped: true,
      })
    ).toEqual([])
  })

  test("omits stale breakdowns from another crawl", () => {
    expect(
      selectRevbotAuditSuggestions({
        breakdown: breakdown("crawl-old"),
        currentCrawl: completedCrawl(),
        activeProjectId: "p-1",
        isLocationScoped: false,
      })
    ).toEqual([])
  })

  test("omits running crawls and project mismatches", () => {
    const running = selectRevbotAuditSuggestions({
      breakdown: breakdown("crawl-1"),
      currentCrawl: completedCrawl({ status: "running" }),
      activeProjectId: "p-1",
      isLocationScoped: false,
    })
    expect(running).toEqual([])
    const wrongProject = selectRevbotAuditSuggestions({
      breakdown: breakdown("crawl-1"),
      currentCrawl: completedCrawl({ project_id: "p-2" }),
      activeProjectId: "p-1",
      isLocationScoped: false,
    })
    expect(wrongProject).toEqual([])
  })

  test("omits empty or missing data without a fallback", () => {
    expect(
      selectRevbotAuditSuggestions({
        breakdown: null,
        currentCrawl: completedCrawl(),
        activeProjectId: "p-1",
        isLocationScoped: false,
      })
    ).toEqual([])
    expect(
      selectRevbotAuditSuggestions({
        breakdown: breakdown("crawl-1"),
        currentCrawl: null,
        activeProjectId: "p-1",
        isLocationScoped: false,
      })
    ).toEqual([])
  })
})

describe("RevbotAuditSuggestionStarters", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }
    root = null
    host?.remove()
    host = null
    document.body.innerHTML = ""
  })

  async function mountStarters(
    suggestions: RevbotAuditSuggestion[],
    onSelect: (suggestion: RevbotAuditSuggestion) => void,
    disabled = false
  ) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <RevbotAuditSuggestionStarters
          disabled={disabled}
          onSelect={onSelect}
          suggestions={suggestions}
        />
      )
      await flushRevbot()
    })
    return host
  }

  test("click sends the exact suggestion once", async () => {
    const seen: RevbotAuditSuggestion[] = []
    const first = suggestion()
    const second = suggestion({
      id: "aeo:headings",
      pillarId: "aeo",
      pillarLabel: "AEO",
      bucketId: "headings",
      bucketLabel: "Headings",
      affectedUrlCount: 1,
      message: "Help me fix the Headings bucket under AEO.",
    })
    const container = await mountStarters([first, second], (item) => {
      seen.push(item)
    })
    const buttons = container.querySelectorAll("button")
    expect(buttons.length).toBe(2)
    expect(container.textContent).toContain("Help me fix Meta Tags")
    expect(container.textContent).toContain("SEO")
    expect(container.textContent).toContain("3 pages")
    expect(container.textContent).toContain("Help me fix Headings")
    expect(container.textContent).toContain("1 page")

    await act(async () => {
      buttons[0]?.click()
      await flushRevbot()
    })
    expect(seen.length).toBe(1)
    expect(seen[0]).toEqual(first)
  })

  test("empty suggestions render nothing", async () => {
    const container = await mountStarters([], () => {
      throw new Error("must not select")
    })
    expect(container.querySelectorAll("button").length).toBe(0)
    expect(container.textContent).toBe("")
  })

  test("busy starters are disabled", async () => {
    const container = await mountStarters(
      [suggestion()],
      () => {},
      true
    )
    const button = container.querySelector("button")
    expect(button?.hasAttribute("disabled")).toBe(true)
  })
})
