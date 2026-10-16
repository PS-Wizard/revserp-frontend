import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { CrawlResponse } from "~/lib/api.types"
import { formatCrawlDuration } from "~/lib/crawl"
import { CrawlContextRow } from "./crawl-context-row"
import { formatCrawlDateTime } from "./utils"

const crawl: CrawlResponse = {
  id: "crawl-1",
  project_id: "project-1",
  status: "completed",
  urls_discovered: 18,
  urls_crawled: 18,
  max_depth_reached: 2,
  created_at: "2026-10-14T10:00:00Z",
  started_at: "2026-10-14T10:10:00Z",
  completed_at: "2026-10-14T10:12:14Z",
}

function renderRow(value: CrawlResponse) {
  return renderToStaticMarkup(
    <CrawlContextRow
      crawl={value}
      disabled={false}
      exportFormat="xlsx"
      isActive={false}
      isCancelling={false}
      isDeleting={false}
      isExporting={false}
      onCancel={() => {}}
      onDelete={() => {}}
      onExport={() => {}}
      onFormatChange={() => {}}
      onSelect={() => {}}
    />
  )
}

describe("crawl duration", () => {
  test("uses runtime timestamps, not time waiting in the queue", () => {
    expect(formatCrawlDuration(crawl)).toBe("2m 14s")
  })

  test("formats seconds, minutes, hours, and subsecond durations", () => {
    for (const [elapsedMs, label] of [
      [0, "0s"],
      [500, "<1s"],
      [1_000, "1s"],
      [59_999, "59s"],
      [60_000, "1m"],
      [3_600_000, "1h"],
      [3_601_000, "1h 1s"],
      [3_734_000, "1h 2m 14s"],
    ] as const) {
      expect(formatCrawlDuration({
        ...crawl,
        completed_at: new Date(Date.parse(crawl.started_at!) + elapsedMs).toISOString(),
      })).toBe(label)
    }
  })

  test("hides unavailable, invalid, and unfinished durations", () => {
    const unavailable: Partial<CrawlResponse>[] = [
      { started_at: undefined },
      { completed_at: undefined },
      { started_at: "invalid" },
      { completed_at: "invalid" },
      { completed_at: "2026-10-14T10:09:59Z" },
      { status: "queued" },
      { status: "running" },
      { status: "failed" },
      { status: "cancelled" },
    ]
    for (const overrides of unavailable) {
      expect(formatCrawlDuration({ ...crawl, ...overrides })).toBeNull()
    }
  })

  test("compares timestamps across time zones", () => {
    expect(formatCrawlDuration({
      ...crawl,
      started_at: "2026-10-14T15:40:00+05:30",
    })).toBe("2m 14s")
  })

  test("shows duration beside the date in the shared crawl row", () => {
    const html = renderRow(crawl)
    expect(html).toContain(formatCrawlDateTime(crawl))
    expect(html).toContain("· 2m 14s")
    expect(html.indexOf("· 2m 14s") > html.indexOf(formatCrawlDateTime(crawl))).toBe(true)
    expect(html).toContain("shrink-0 text-xs font-normal text-muted-foreground")
  })

  test("keeps legacy rows without timestamps free of a duration placeholder", () => {
    const html = renderRow({ ...crawl, started_at: undefined })
    expect(html).toContain(formatCrawlDateTime(crawl))
    expect(html.includes("· 2m 14s")).toBe(false)
    expect(html.includes("shrink-0 text-xs font-normal text-muted-foreground")).toBe(false)
  })
})
