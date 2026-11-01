import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { CompetitorPillarCompare } from "~/components/competitors/competitor-pillar-compare"
import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownPillarResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const mounted: Array<() => void> = []
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!()
  document.body.innerHTML = ""
})

function bucket(id: string, label: string, score: number): ScoreBreakdownBucketResponse {
  return {
    id,
    label,
    score,
    weight: 1,
    weighted_contribution: 0,
    total_penalty: 0,
    issue_type_count: 0,
    issue_row_count: 0,
    affected_url_count: 0,
    issues: [],
  }
}

function pillar(
  id: string,
  label: string,
  score: number,
  buckets: ScoreBreakdownBucketResponse[] = [],
): ScoreBreakdownPillarResponse {
  return {
    id,
    label,
    score,
    weight: 1,
    weighted_contribution: 0,
    total_penalty: 0,
    bucket_count: buckets.length,
    issue_type_count: 0,
    issue_row_count: 0,
    affected_url_count: 0,
    buckets,
  }
}

function breakdown(
  overall: number,
  scores: { seo: number; aeo: number; pagespeed: number },
  buckets?: Record<string, ScoreBreakdownBucketResponse[]>,
): ScoreBreakdownResponse {
  return {
    crawl_id: "crawl-1",
    scoring_version: "v1",
    coverage_scale: 1,
    total_scored_pages: 10,
    overall_score: overall,
    pillars: [
      pillar("seo", "SEO", scores.seo, buckets?.seo),
      pillar("aeo", "AEO", scores.aeo, buckets?.aeo),
      pillar("pagespeed", "PageSpeed", scores.pagespeed, buckets?.pagespeed),
    ],
  }
}

function render(
  you: ScoreBreakdownResponse,
  them: ScoreBreakdownResponse,
  labels = { you: "Acme", them: "Rival" },
) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(
      <CompetitorPillarCompare
        them={them}
        themLabel={labels.them}
        you={you}
        youLabel={labels.you}
      />,
    )
  })
  mounted.push(() => act(() => root.unmount()))
  return { host }
}

describe("competitor pillar compare", () => {
  test("renders the four cards with correct deltas", async () => {
    const you = breakdown(92, { seo: 90, aeo: 88, pagespeed: 76 })
    const them = breakdown(84, { seo: 80, aeo: 82, pagespeed: 94 })
    const { host } = render(you, them)
    await act(async () => {
      await flushTestDom()
    })
    const text = host.textContent ?? ""
    expect(text).toContain("Overall Score")
    expect(text).toContain("SEO Score")
    expect(text).toContain("AEO Score")
    expect(text).toContain("PageSpeed Score")
    expect(text).toContain("+8 pts")
    expect(text).toContain("-18 pts")
  })

  test("lists a competitor-only bucket with a dash for you", async () => {
    const you = breakdown(
      80,
      { seo: 80, aeo: 80, pagespeed: 80 },
      { seo: [bucket("shared", "Shared", 80)] },
    )
    const them = breakdown(
      70,
      { seo: 60, aeo: 80, pagespeed: 80 },
      { seo: [bucket("shared", "Shared", 60), bucket("rival_only", "Rival Only", 70)] },
    )
    const { host } = render(you, them)
    await act(async () => {
      await flushTestDom()
    })
    const rows = Array.from(host.querySelectorAll("tbody tr"))
    const extra = rows.find((row) => (row.textContent ?? "").includes("Rival Only"))
    expect(extra).toBeTruthy()
    expect(extra?.textContent).toContain("—")
    expect(extra?.textContent).toContain("70")
  })

  test("renders both site labels", async () => {
    const you = breakdown(92, { seo: 90, aeo: 88, pagespeed: 76 })
    const them = breakdown(84, { seo: 80, aeo: 82, pagespeed: 94 })
    const { host } = render(you, them, { you: "Acme", them: "Rival" })
    await act(async () => {
      await flushTestDom()
    })
    const text = host.textContent ?? ""
    expect(text).toContain("Acme")
    expect(text).toContain("Rival")
  })
})
