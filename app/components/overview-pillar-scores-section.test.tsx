import { describe, expect, test } from "bun:test"
import { Window, type Element } from "happy-dom"
import { renderToStaticMarkup } from "react-dom/server"
import { OverviewPillarScoresSection } from "./overview-pillar-scores-section"
import { ScoreRadialChart } from "./score-radial-chart"
import type { CrawlBreakdown } from "./pillar-audit-view"

function crawlScores(
  id: string,
  scores: [number, number, number, number],
  buckets: Array<{ id: string; label: string; score: number }>
): CrawlBreakdown {
  return {
    crawl: { id, status: "completed" } as CrawlBreakdown["crawl"],
    breakdown: {
      overall_score: scores[0],
      pillars: [
        { id: "seo", label: "SEO", score: scores[1], buckets },
        { id: "aeo", label: "AEO", score: scores[2], buckets: [] },
        { id: "pagespeed", label: "PageSpeed", score: scores[3], buckets: [] },
      ],
    },
  }
}

const current = crawlScores("current", [88, 94, 84, 68], [
  { id: "content_quality", label: "Content Quality", score: 83 },
  { id: "indexability", label: "Indexability", score: 100 },
])
const previous = crawlScores("previous", [80, 90, 85, 68], [
  { id: "indexability", label: "Indexability", score: 100 },
  { id: "content_quality", label: "Content Quality", score: 80 },
])

function renderScores(crawls: CrawlBreakdown[], selected?: string) {
  const document = new Window().document
  document.body.innerHTML = renderToStaticMarkup(
    <OverviewPillarScoresSection
      crawlBreakdowns={crawls}
      currentCrawlId={selected}
    />
  )
  return document
}

function badgeLabels(element?: Element | null) {
  return Array.from(element?.querySelectorAll('[data-slot="badge"]') ?? []).map(
    (badge) => badge.textContent
  )
}

describe("overview score trend badges", () => {
  test("cards and inline score rows reuse growth, regression, and flat badges", () => {
    const document = renderScores([current, previous], "current")
    const headers = document.querySelectorAll('[data-slot="card-header"]')
    expect(Array.from(headers).flatMap(badgeLabels)).toEqual([
      "+8 pts", "+4 pts", "-1 pts", "No change",
    ])
    const contents = document.querySelectorAll('[data-slot="card-content"]')
    expect(badgeLabels(contents[0])).toEqual([
      "+4 pts", "-1 pts", "No change",
    ])
    expect(badgeLabels(contents[1])).toEqual([
      "+3 pts", "No change",
    ])
  })

  test("an older selected crawl compares with its predecessor, not the newest crawl", () => {
    const older = crawlScores("older", [70, 95, 85, 68], [
      { id: "content_quality", label: "Content Quality", score: 85 },
      { id: "indexability", label: "Indexability", score: 99 },
    ])
    const document = renderScores([current, previous, older], "previous")
    const headers = document.querySelectorAll('[data-slot="card-header"]')
    expect(Array.from(headers).flatMap(badgeLabels)).toEqual([
      "+10 pts", "-5 pts", "No change", "No change",
    ])
    const contents = document.querySelectorAll('[data-slot="card-content"]')
    expect(badgeLabels(contents[1])).toEqual([
      "+1 pts", "-5 pts",
    ])
  })

  test("the first crawl has no false no-change badges", () => {
    expect(badgeLabels(renderScores([current], "current").body)).toEqual([])
  })

  test("missing previous buckets do not get a trend badge", () => {
    const withoutBuckets = crawlScores("previous", [80, 90, 85, 68], [])
    const document = renderScores([current, withoutBuckets])
    const contents = document.querySelectorAll('[data-slot="card-content"]')
    expect(badgeLabels(contents[1])).toEqual([])
  })

  test("missing or non-finite previous readings do not show misleading changes", () => {
    const document = new Window().document
    document.body.innerHTML = renderToStaticMarkup(
      <ScoreRadialChart
        centerValue={80}
        previousCenterValue={Number.NaN}
        segments={[
          { key: "missing", label: "Missing", value: 80, previousValue: null },
          { key: "invalid", label: "Invalid", value: 80, previousValue: Infinity },
        ]}
        title="SEO Score"
      />
    )
    expect(badgeLabels(document.body)).toEqual([])
  })
})
