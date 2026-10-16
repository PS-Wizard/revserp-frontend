import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

// Charts need canvas runtimes happy-dom lacks; the bucket cards and the issue
// explorer below them stay real, which is the wiring this test pins.
mock.module("~/components/bucket-score-history-chart", () => ({
  BucketScoreHistoryChart: () => null,
}))
mock.module("~/components/issue-treemap", () => ({
  IssueTreemap: () => null,
}))

const { PillarAuditView } = await import("~/components/pillar-audit-view")
const { ONBOARDING_BUCKET_DRILL_EVENT } = await import(
  "~/components/onboarding/onboarding-ui"
)

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type {
  CrawlResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  document.body.innerHTML = ""
})

function crawlBreakdown(bucket: { id: string; label: string; score: number }) {
  return {
    crawl: {
      id: "crawl-1",
      project_id: "proj-1",
      status: "completed",
    } as unknown as CrawlResponse,
    breakdown: {
      overall_score: 70,
      pillars: [{ id: "seo", label: "SEO", score: 70, buckets: [bucket] }],
    },
  }
}

function breakdownWithBuckets(
  buckets: ScoreBreakdownResponse["pillars"][number]["buckets"],
): ScoreBreakdownResponse {
  return {
    crawl_id: "crawl-1",
    scoring_version: "v1",
    coverage_scale: 100,
    total_scored_pages: 10,
    overall_score: 70,
    pillars: [
      {
        id: "seo",
        label: "SEO",
        score: 70,
        weight: 1,
        weighted_contribution: 70,
        total_penalty: 30,
        bucket_count: buckets.length,
        issue_type_count: buckets.length,
        issue_row_count: 1,
        affected_url_count: 2,
        buckets,
      },
    ],
  }
}

function bucketWithIssue() {
  return {
    id: "thin_content",
    label: "Thin content",
    score: 60,
    weight: 1,
    weighted_contribution: 60,
    total_penalty: 40,
    issue_type_count: 1,
    issue_row_count: 1,
    affected_url_count: 2,
    issues: [
      {
        id: "thin_pages",
        label: "Thin pages",
        severity: "high",
        base_penalty: 10,
        severity_multiplier: 2,
        coverage: 0.2,
        final_penalty: 20,
        issue_row_count: 1,
        affected_url_count: 2,
        message: "Pages with little content.",
        details_preview: "Add content.",
      },
    ],
  }
}

function emptyBucket() {
  return {
    ...bucketWithIssue(),
    id: "empty_bucket",
    label: "Empty bucket",
    score: 100,
    total_penalty: 0,
    issue_type_count: 0,
    issue_row_count: 0,
    affected_url_count: 0,
    issues: [],
  }
}

async function renderAudit(
  breakdown: ScoreBreakdownResponse,
  cardBucket: { id: string; label: string; score: number },
) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <PillarAuditView
          crawlBreakdowns={[crawlBreakdown(cardBucket) as never]}
          currentBreakdown={breakdown}
          currentCrawlId="crawl-1"
          pillarId="seo"
          title="SEO"
        />
      </QueryClientProvider>,
    )
  })
}

function bucketCard(label: string) {
  const cards = document.querySelectorAll(
    '[data-tour="onboarding-bucket-scores"] [role="button"]',
  )
  for (const card of cards) {
    if (card.textContent?.includes(label)) {
      return card as HTMLElement
    }
  }
  return null
}

describe("pillar audit onboarding wiring", () => {
  test("real bucket card click opens the matching bucket table", async () => {
    const seen: unknown[] = []
    const onDrill = (event: Event) => {
      seen.push((event as CustomEvent).detail)
    }
    window.addEventListener(ONBOARDING_BUCKET_DRILL_EVENT, onDrill)
    try {
      await renderAudit(breakdownWithBuckets([bucketWithIssue()]), {
        id: "thin_content",
        label: "Thin content",
        score: 60,
      })
      const card = bucketCard("Thin content")
      expect(!!card).toBe(true)
      await act(async () => {
        card?.click()
      })
      expect(seen).toEqual([{ bucketId: "thin_content", hasIssues: true }])
      const table = document.querySelector(
        '[data-tour="onboarding-issue-bucket"][data-tour-bucket="thin_content"]',
      )
      expect(!!table).toBe(true)
    } finally {
      window.removeEventListener(ONBOARDING_BUCKET_DRILL_EVENT, onDrill)
    }
  })

  test("zero-issue bucket click reports no findings and drills nowhere", async () => {
    const seen: unknown[] = []
    const onDrill = (event: Event) => {
      seen.push((event as CustomEvent).detail)
    }
    window.addEventListener(ONBOARDING_BUCKET_DRILL_EVENT, onDrill)
    try {
      await renderAudit(breakdownWithBuckets([emptyBucket()]), {
        id: "empty_bucket",
        label: "Empty bucket",
        score: 100,
      })
      const card = bucketCard("Empty bucket")
      expect(!!card).toBe(true)
      await act(async () => {
        card?.click()
      })
      expect(seen).toEqual([{ bucketId: "empty_bucket", hasIssues: false }])
      expect(
        document.querySelector('[data-tour-bucket="empty_bucket"]'),
      ).toBe(null)
    } finally {
      window.removeEventListener(ONBOARDING_BUCKET_DRILL_EVENT, onDrill)
    }
  })
})
