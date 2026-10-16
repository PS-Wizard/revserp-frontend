import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter } from "react-router"
import type { ScoreBreakdownResponse } from "~/lib/api.types"

import type {
  IssueTypeDiffBaselineResponse,
  IssueTypeDiffResponse,
} from "./use-issue-type-diff"

let mockedBaseline: IssueTypeDiffBaselineResponse | undefined
let mockedNewRows: IssueTypeDiffResponse | undefined
let mockedResolvedRows: IssueTypeDiffResponse | undefined
let rowCalls: { changeType?: string; issueTypeId?: string }[] = []

mock.module("./use-issue-type-diff", () => ({
  useIssueTypeDiffBaseline: (_crawlId: string | undefined, enabled: boolean) => ({
    data: enabled ? mockedBaseline : undefined,
    isPending: false,
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => Promise.resolve(),
  }),
  useIssueTypeDiffRows: (args: {
    baselineCrawlId?: string
    bucketId?: string
    changeType?: "new" | "resolved"
    currentCrawlId?: string
    issueTypeId?: string
    pillarId?: string
    enabled?: boolean
  }) => {
    rowCalls.push({
      changeType: args.changeType,
      issueTypeId: args.issueTypeId,
    })
    const data =
      args.enabled === false
        ? undefined
        : args.changeType === "new"
          ? mockedNewRows
          : mockedResolvedRows
    return {
      data,
      isPending: false,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve(),
    }
  },
})
)

const { IssueExplorer } = await import("~/components/issue-explorer")

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root)
    act(() => {
      root?.unmount()
    })
  root = null
  host?.remove()
  host = null
  document.body.innerHTML = ""
  mockedBaseline = undefined
  mockedNewRows = undefined
  mockedResolvedRows = undefined
  rowCalls = []
})

function issueType(id: string, label: string, count: number) {
  return {
    id,
    label,
    severity: "warning",
    base_penalty: 5,
    severity_multiplier: 1,
    coverage: 0.5,
    final_penalty: 5,
    issue_row_count: count,
    affected_url_count: count,
    message: `${label} message`,
    details_preview: "",
  }
}

function currentBreakdown(): ScoreBreakdownResponse {
  return {
    crawl_id: "crawl-current",
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
        bucket_count: 1,
        issue_type_count: 1,
        issue_row_count: 1,
        affected_url_count: 1,
        buckets: [
          {
            id: "serp_metadata",
            label: "SERP metadata",
            score: 70,
            weight: 1,
            weighted_contribution: 70,
            total_penalty: 30,
            issue_type_count: 1,
            issue_row_count: 1,
            affected_url_count: 1,
            issues: [issueType("missing_description", "Missing description", 1)],
          },
        ],
      },
    ],
  }
}

function baselineResponse(): IssueTypeDiffBaselineResponse {
  return {
    current_crawl_id: "crawl-current",
    baseline_crawl: {
      id: "crawl-baseline",
      project_id: "proj-1",
      status: "completed",
      started_at: "2026-10-01T00:00:00Z",
      completed_at: "2026-10-02T00:00:00Z",
    },
    baseline_breakdown: {
      ...currentBreakdown(),
      crawl_id: "crawl-baseline",
      pillars: [
        {
          ...currentBreakdown().pillars[0],
          buckets: [
            {
              ...currentBreakdown().pillars[0].buckets[0],
              issues: [
                issueType("missing_title", "Missing title", 2),
                issueType("missing_description", "Missing description", 1),
              ],
            },
          ],
        },
      ],
    },
  }
}

function changeRowsResponse(
  url: string,
  changeType: string,
  side: "baseline" | "current"
): IssueTypeDiffResponse {
  return {
    urls: [
      {
        url,
        change_type: changeType,
        baseline:
          side === "baseline"
            ? { severity: "warning", message: "before", details: "" }
            : null,
        current:
          side === "current"
            ? { severity: "error", message: "after", details: "" }
            : null,
      },
    ],
    pagination: { limit: 25, offset: 0, count: 1, total: 1 },
  }
}

async function renderExplorer(
  breakdown: ScoreBreakdownResponse,
  extra?: {
    scopedUrl?: string
    scopedIssueUrls?: {
      fetchPage: () => Promise<{ rows: []; total: number; workActionsEnabled: boolean }>
      scopeKey: string
    }
  }
) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <IssueExplorer
          breakdown={breakdown}
          initialPillarId="seo"
          scopedUrl={extra?.scopedUrl}
          scopedIssueUrls={extra?.scopedIssueUrls}
        />
      </MemoryRouter>
    )
  })
}

function doubleClick(label: string) {
  const cells = Array.from(host?.querySelectorAll("td") ?? [])
  const cell = cells.find((entry) =>
    entry.textContent?.includes(label)
  ) as HTMLElement | null
  expect(cell).toBeTruthy()
  act(() => {
    cell?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
  })
}

describe("issue type change cards integration", () => {
  test("resolved-only issue types stay discoverable and mount both scoped cards", async () => {
    mockedBaseline = baselineResponse()
    mockedResolvedRows = changeRowsResponse(
      "https://example.com/gone",
      "no_longer_detected",
      "baseline"
    )
    mockedNewRows = changeRowsResponse(
      "https://example.com/fresh",
      "new",
      "current"
    )
    await renderExplorer(currentBreakdown())

    doubleClick("SERP metadata")

    // Missing title is gone from the current crawl but stays listed.
    expect(host?.textContent).toContain("Missing title")
    expect(host?.textContent).toContain("Previously detected")
    // Current counts are not inflated by baseline evidence.
    expect(host?.textContent).toContain("Missing description")
    // No replacement diff UI: the normal table stays in charge.
    expect((host?.textContent ?? "").includes("View diff")).toBe(false)
    // Cards only appear at the final issue type tier.
    expect((host?.textContent ?? "").includes("Fixed From Last Crawl")).toBe(
      false
    )

    doubleClick("Missing title")

    expect(host?.textContent).toContain("Fixed From Last Crawl")
    expect(host?.textContent).toContain("New In This Crawl")
    expect(host?.textContent).toContain("https://example.com/gone")
    expect(host?.textContent).toContain("https://example.com/fresh")
    expect((host?.textContent ?? "").includes("View diff")).toBe(false)
    // Each card queries the final selected issue type with its own filter.
    expect(
      rowCalls.filter(
        (call) =>
          call.issueTypeId === "missing_title" &&
          call.changeType === "resolved"
      ).length > 0
    ).toBe(true)
    expect(
      rowCalls.filter(
        (call) =>
          call.issueTypeId === "missing_title" && call.changeType === "new"
      ).length > 0
    ).toBe(true)
  })

  test("normal work selection is unaffected when cards are above the fold", async () => {
    mockedBaseline = baselineResponse()
    await renderExplorer(currentBreakdown())

    doubleClick("SERP metadata")

    const boxes = () =>
      Array.from(host?.querySelectorAll('[role="checkbox"]') ?? [])
    expect(boxes().length > 0).toBe(true)
    // Toggling a current row checks it for work.
    const currentBox = boxes().find((entry) =>
      entry.getAttribute("aria-label")?.includes("Missing description")
    ) as HTMLElement
    expect(currentBox).toBeTruthy()
    await act(async () => {
      currentBox?.click()
    })
    expect(currentBox?.getAttribute("aria-checked")).toBe("true")
    // Select-all skips resolved-only rows: they stay unselected and disabled.
    const selectAll = boxes()[0] as HTMLElement
    await act(async () => {
      selectAll?.click()
    })
    const resolvedBox = boxes().find((entry) =>
      entry.getAttribute("aria-label")?.includes("Missing title")
    )
    expect(resolvedBox?.getAttribute("aria-checked")).toBe("false")
    expect(resolvedBox?.hasAttribute("disabled") ?? false).toBe(true)
    expect((host?.textContent ?? "").includes("View diff")).toBe(false)
  })

  test("first crawl shows the honest unavailable message instead of all-new cards", async () => {
    mockedBaseline = {
      current_crawl_id: "crawl-current",
      baseline_crawl: null,
      baseline_breakdown: null,
    }
    await renderExplorer(currentBreakdown())

    doubleClick("SERP metadata")
    doubleClick("Missing description")

    expect(host?.textContent).toContain("unavailable")
    expect((host?.textContent ?? "").includes("View diff")).toBe(false)
  })

  test("location scope never mounts change cards or root comparison", async () => {
    mockedBaseline = baselineResponse()
    await renderExplorer(currentBreakdown(), {
      scopedIssueUrls: {
        fetchPage: () =>
          Promise.resolve({ rows: [], total: 0, workActionsEnabled: false }),
        scopeKey: "location-1",
      },
    })

    doubleClick("SERP metadata")
    doubleClick("Missing description")
    await act(async () => {
      await Promise.resolve()
    })

    expect((host?.textContent ?? "").includes("Fixed From Last Crawl")).toBe(
      false
    )
    expect((host?.textContent ?? "").includes("New In This Crawl")).toBe(false)
    expect((host?.textContent ?? "").includes("View diff")).toBe(false)
    expect(rowCalls.length).toBe(0)
  })

  test("single-url scope hides historical categories and change cards", async () => {
    mockedBaseline = baselineResponse()
    await renderExplorer(currentBreakdown(), {
      scopedUrl: "https://example.com/page",
    })

    doubleClick("SERP metadata")

    // Whole-site history stays out of the single-page audit.
    expect((host?.textContent ?? "").includes("Missing title")).toBe(false)
    expect((host?.textContent ?? "").includes("Previously detected")).toBe(
      false
    )

    doubleClick("Missing description")

    expect((host?.textContent ?? "").includes("Fixed From Last Crawl")).toBe(
      false
    )
    expect((host?.textContent ?? "").includes("New In This Crawl")).toBe(false)
    expect((host?.textContent ?? "").includes("View diff")).toBe(false)
  })
})
