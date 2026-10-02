import { describe, expect, test } from "bun:test"

import { crawlProgressSteps } from "./overview-crawl-progress"
import type { CrawlResponse } from "~/lib/api.types"

function crawl(
  id: string,
  overall_score: number | null,
  at: string,
  status = "completed"
): CrawlResponse {
  return {
    id,
    status,
    overall_score,
    completed_at: at,
  } as unknown as CrawlResponse
}

describe("crawlProgressSteps", () => {
  test("scores each crawl against the one before it", () => {
    const steps = crawlProgressSteps([
      crawl("a", 60, "2026-01-01T00:00:00Z"),
      crawl("b", 66, "2026-01-08T00:00:00Z"),
      crawl("c", 62, "2026-01-15T00:00:00Z"),
    ])

    expect(steps.map((step) => step.score)).toEqual([60, 66, 62])
    expect(steps.map((step) => step.delta)).toEqual([null, 6, -4])
    expect(steps.map((step) => step.direction)).toEqual(["flat", "up", "down"])
  })

  test("orders by date, not by the order it was given", () => {
    const steps = crawlProgressSteps([
      crawl("c", 62, "2026-01-15T00:00:00Z"),
      crawl("a", 60, "2026-01-01T00:00:00Z"),
      crawl("b", 66, "2026-01-08T00:00:00Z"),
    ])

    expect(steps.map((step) => step.crawlId)).toEqual(["a", "b", "c"])
    expect(steps.map((step) => step.delta)).toEqual([null, 6, -4])
  })

  test("treats an unchanged score as flat", () => {
    const steps = crawlProgressSteps([
      crawl("a", 70, "2026-01-01T00:00:00Z"),
      crawl("b", 70, "2026-01-08T00:00:00Z"),
    ])

    expect(steps[1].delta).toBe(0)
    expect(steps[1].direction).toBe("flat")
  })

  test("skips an unscored crawl so it cannot hide a real change", () => {
    const steps = crawlProgressSteps([
      crawl("a", 60, "2026-01-01T00:00:00Z"),
      crawl("pending", null, "2026-01-08T00:00:00Z"),
      crawl("c", 70, "2026-01-15T00:00:00Z"),
    ])

    expect(steps.map((step) => step.crawlId)).toEqual(["a", "c"])
    expect(steps[1].delta).toBe(10)
  })

  test("ignores a crawl that never finished", () => {
    const steps = crawlProgressSteps([
      crawl("a", 60, "2026-01-01T00:00:00Z"),
      crawl("cancelled", 90, "2026-01-08T00:00:00Z", "cancelled"),
      crawl("c", 70, "2026-01-15T00:00:00Z"),
    ])

    expect(steps.map((step) => step.crawlId)).toEqual(["a", "c"])
  })

  test("returns nothing when no crawl has a score", () => {
    expect(crawlProgressSteps([])).toEqual([])
    expect(
      crawlProgressSteps([crawl("a", null, "2026-01-01T00:00:00Z")])
    ).toEqual([])
  })

  test("the first step is the baseline and has no delta", () => {
    const steps = crawlProgressSteps([crawl("a", 60, "2026-01-01T00:00:00Z")])

    expect(steps).toHaveLength(1)
    expect(steps[0].delta).toBeNull()
    expect(steps[0].direction).toBe("flat")
  })
})
