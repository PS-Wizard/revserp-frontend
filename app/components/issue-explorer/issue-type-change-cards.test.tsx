import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import type {
  IssueTypeDiffBaselineResponse,
  IssueTypeDiffResponse,
  IssueTypeDiffURL,
} from "./use-issue-type-diff"

type RowsResult = {
  data: IssueTypeDiffResponse | undefined
  isPending: boolean
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
}

type RowsCall = {
  baselineCrawlId?: string
  bucketId?: string
  changeType?: "new" | "resolved"
  includeExcluded?: boolean
  issueTypeId?: string
  pillarId?: string
  pageIndex: number
  pageSize: number
}

let baselineData: IssueTypeDiffBaselineResponse | undefined
let baselinePending = true
let baselineError = false
let baselineRefetchCalls = 0
let rowsCalls: RowsCall[] = []
let rowsRefetchCalls = 0
let rowsHandler: (changeType?: string, pageIndex?: number) => RowsResult =
  () => pendingRows()

function pendingRows(): RowsResult {
  return {
    data: undefined,
    isPending: true,
    isLoading: true,
    isError: false,
    refetch: () => Promise.resolve(),
  }
}

mock.module("./use-issue-type-diff", () => ({
  useIssueTypeDiffBaseline: () => ({
    data: baselineData,
    isPending: baselinePending,
    isLoading: baselinePending,
    isError: baselineError,
    error: baselineError ? new Error("baseline failed") : null,
    refetch: () => {
      baselineRefetchCalls += 1
      return Promise.resolve()
    },
  }),
  useIssueTypeDiffRows: (args: RowsCall) => {
    rowsCalls.push({ ...args })
    return rowsHandler(args.changeType, args.pageIndex)
  },
})
)

const { IssueTypeChangeCards } = await import("./issue-type-change-cards")

let root: Root | null = null
let host: HTMLDivElement | null = null

async function renderCards() {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <IssueTypeChangeCards
        bucketId="serp_metadata"
        crawlId="crawl-new"
        issueTypeId="missing_title"
        issueTypeLabel="Missing title"
        pillarId="seo"
      />
    )
  })
}

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  host?.remove()
  host = null
  document.body.innerHTML = ""
  baselineData = undefined
  baselinePending = true
  baselineError = false
  baselineRefetchCalls = 0
  rowsCalls = []
  rowsRefetchCalls = 0
  rowsHandler = () => pendingRows()
})

function baselineOk(): IssueTypeDiffBaselineResponse {
  return {
    current_crawl_id: "crawl-new",
    baseline_crawl: {
      id: "crawl-old",
      project_id: "proj-1",
      status: "completed",
      started_at: "2026-10-01T00:00:00Z",
      completed_at: "2026-10-02T00:00:00Z",
    },
    baseline_breakdown: null,
  }
}

function rowsPayload(urls: IssueTypeDiffURL[], total: number) {
  return {
    urls,
    pagination: { limit: 25, offset: 0, count: urls.length, total },
  }
}

function okRows(data: IssueTypeDiffResponse): RowsResult {
  return {
    data,
    isPending: false,
    isLoading: false,
    isError: false,
    refetch: () => {
      rowsRefetchCalls += 1
      return Promise.resolve()
    },
  }
}

function failedRows(): RowsResult {
  return {
    data: undefined,
    isPending: false,
    isLoading: false,
    isError: true,
    refetch: () => {
      rowsRefetchCalls += 1
      return Promise.resolve()
    },
  }
}

function diffRow(
  url: string,
  changeType: string,
  side: "baseline" | "current"
): IssueTypeDiffURL {
  const evidence = {
    severity: "high",
    message: "Missing title",
    details: "The <title> tag is absent.",
  }
  return {
    url,
    change_type: changeType,
    baseline: side === "baseline" ? evidence : null,
    current: side === "current" ? evidence : null,
  }
}

function urlSpan(url: string): HTMLSpanElement | null {
  const found = Array.from(host?.querySelectorAll("span") ?? []).find(
    (entry) => entry.textContent === url
  )
  return (found as HTMLSpanElement | undefined) ?? null
}

function cardBadge(cardTitle: string): string | null {
  const heading = Array.from(host?.querySelectorAll("h3") ?? []).find(
    (entry) => entry.textContent === cardTitle
  )
  return (
    heading?.parentElement?.querySelector("span.rounded-full")?.textContent ??
    null
  )
}

function buttonsByLabel(label: string): HTMLButtonElement[] {
  return Array.from(host?.querySelectorAll("button") ?? []).filter(
    (entry) => entry.textContent === label
  ) as HTMLButtonElement[]
}

function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

const FIXED_URL = "https://example.com/fixed"
const NEW_URL = "https://example.com/new"

describe("IssueTypeChangeCards", () => {
  test("fixed rows render struck and muted while new rows carry a New marker", async () => {
    baselineData = baselineOk()
    baselinePending = false
    rowsHandler = (changeType) =>
      okRows(
        changeType === "resolved"
          ? rowsPayload([diffRow(FIXED_URL, "no_longer_detected", "baseline")], 1)
          : rowsPayload([diffRow(NEW_URL, "new", "current")], 1)
      )
    await renderCards()

    expect(host?.textContent).toContain("Fixed From Last Crawl")
    expect(host?.textContent).toContain("New In This Crawl")
    expect(host?.textContent).toContain(FIXED_URL)
    expect(host?.textContent).toContain(NEW_URL)

    const fixed = urlSpan(FIXED_URL)
    expect(fixed).toBeTruthy()
    expect(fixed?.className.includes("line-through")).toBe(true)
    expect(fixed?.getAttribute("title")).toBe(FIXED_URL)
    expect(fixed?.getAttribute("tabindex")).toBe("0")

    const fresh = urlSpan(NEW_URL)
    expect(fresh).toBeTruthy()
    expect(fresh?.className.includes("line-through")).toBe(false)
    expect(host?.textContent).toContain("New")

    const resolvedCall = rowsCalls.find(
      (call) => call.changeType === "resolved"
    )
    expect(resolvedCall).toBeTruthy()
    expect(resolvedCall?.pillarId).toBe("seo")
    expect(resolvedCall?.bucketId).toBe("serp_metadata")
    expect(resolvedCall?.issueTypeId).toBe("missing_title")
    const newCall = rowsCalls.find((call) => call.changeType === "new")
    expect(newCall).toBeTruthy()
    expect(newCall?.pillarId).toBe("seo")

    expect(cardBadge("Fixed From Last Crawl")).toBe("1")
    expect(cardBadge("New In This Crawl")).toBe("1")
    expect(host?.querySelectorAll("button").length).toBe(0)
  })

  test("unchanged and not_verified rows never appear in either card", async () => {
    baselineData = baselineOk()
    baselinePending = false
    const staleFixed = "https://example.com/stale-fixed"
    const unverifiedFixed = "https://example.com/unverified-fixed"
    const leakedNew = "https://example.com/leaked-new"
    const staleNew = "https://example.com/stale-new"
    rowsHandler = (changeType) =>
      okRows(
        changeType === "resolved"
          ? rowsPayload(
              [
                diffRow(FIXED_URL, "resolved", "baseline"),
                diffRow(staleFixed, "unchanged", "baseline"),
                diffRow(unverifiedFixed, "not_verified", "baseline"),
                diffRow(leakedNew, "new", "current"),
              ],
              4
            )
          : rowsPayload(
              [
                diffRow(NEW_URL, "new", "current"),
                diffRow(staleNew, "unchanged", "current"),
              ],
              2
            )
      )
    await renderCards()

    expect(host?.textContent).toContain(FIXED_URL)
    expect(host?.textContent).toContain(NEW_URL)
    expect(host?.textContent?.includes(staleFixed) ?? false).toBe(false)
    expect(host?.textContent?.includes(unverifiedFixed) ?? false).toBe(false)
    expect(host?.textContent?.includes(leakedNew) ?? false).toBe(false)
    expect(host?.textContent?.includes(staleNew) ?? false).toBe(false)
  })

  test("zero totals render honest empty states with zero counts", async () => {
    baselineData = baselineOk()
    baselinePending = false
    rowsHandler = () => okRows(rowsPayload([], 0))
    await renderCards()

    expect(host?.textContent).toContain(
      "No fixed URLs for Missing title in this crawl."
    )
    expect(host?.textContent).toContain(
      "No new URLs for Missing title in this crawl."
    )
    expect(cardBadge("Fixed From Last Crawl")).toBe("0")
    expect(cardBadge("New In This Crawl")).toBe("0")
  })

  test("a first crawl shows an unavailable message and fetches no rows", async () => {
    baselineData = {
      current_crawl_id: "crawl-new",
      baseline_crawl: null,
      baseline_breakdown: null,
    }
    baselinePending = false
    await renderCards()

    expect(host?.textContent).toContain("No previous completed crawl")
    expect(host?.textContent).toContain("unavailable")
    expect(host?.textContent?.includes("Fixed From Last Crawl") ?? false).toBe(
      false
    )
    expect(rowsCalls).toEqual([])
  })

  test("baseline loading shows neutral counts until data arrives", async () => {
    baselineData = undefined
    baselinePending = true
    await renderCards()

    expect(host?.textContent).toContain("Fixed From Last Crawl")
    expect(host?.textContent).toContain("New In This Crawl")
    expect(host?.textContent).toContain("…")
    expect(rowsCalls).toEqual([])
  })

  test("baseline errors stay honest with a retry", async () => {
    baselineData = undefined
    baselinePending = false
    baselineError = true
    await renderCards()

    expect(host?.textContent).toContain("Could not load crawl changes.")
    expect(buttonsByLabel("Retry")).toHaveLength(1)
    click(buttonsByLabel("Retry")[0])
    expect(baselineRefetchCalls).toBe(1)
    expect(rowsCalls).toEqual([])
  })

  test("row errors stay honest per card with a retry", async () => {
    baselineData = baselineOk()
    baselinePending = false
    rowsHandler = () => failedRows()
    await renderCards()

    expect(host?.textContent).toContain("Fixed From Last Crawl")
    expect(host?.textContent).toContain("Could not load this section.")
    expect(cardBadge("Fixed From Last Crawl")).toBe("—")
    expect(buttonsByLabel("Retry")).toHaveLength(2)
    click(buttonsByLabel("Retry")[0])
    expect(rowsRefetchCalls).toBe(1)
  })

  test("each card pages its own server-filtered query", async () => {
    baselineData = baselineOk()
    baselinePending = false
    const pageOne = "https://example.com/alpha"
    const pageTwo = "https://example.com/beta"
    rowsHandler = (changeType, pageIndex) =>
      okRows(
        changeType === "resolved"
          ? rowsPayload(
              [diffRow(pageIndex === 1 ? pageTwo : pageOne, "resolved", "baseline")],
              30
            )
          : rowsPayload([diffRow(NEW_URL, "new", "current")], 1)
      )
    await renderCards()

    expect(cardBadge("Fixed From Last Crawl")).toBe("30")
    expect(host?.textContent).toContain("Page 1 of 2")
    expect(host?.textContent).toContain(pageOne)
    expect(buttonsByLabel("Previous")).toHaveLength(1)
    expect(buttonsByLabel("Previous")[0].disabled).toBe(true)
    expect(buttonsByLabel("Next")).toHaveLength(1)
    const newCallsBefore = rowsCalls.filter(
      (call) => call.changeType === "new"
    ).length

    click(buttonsByLabel("Next")[0])

    expect(host?.textContent).toContain("Page 2 of 2")
    expect(host?.textContent).toContain(pageTwo)
    expect(host?.textContent?.includes(pageOne) ?? false).toBe(false)
    expect(host?.textContent).toContain(NEW_URL)
    const resolvedCalls = rowsCalls.filter(
      (call) => call.changeType === "resolved"
    )
    const lastResolved = resolvedCalls[resolvedCalls.length - 1]
    expect(lastResolved.pageIndex).toBe(1)
    expect(lastResolved.pageSize).toBe(25)
    expect(
      rowsCalls.filter((call) => call.changeType === "new").length
    ).toBe(newCallsBefore)
  })

  test("excluded rows appear in the fixed card with a per-row badge", async () => {
    baselineData = baselineOk()
    baselinePending = false
    const firstExcluded = "https://example.com/excluded-one"
    const secondExcluded = "https://example.com/excluded-two"
    rowsHandler = (changeType) =>
      okRows(
        changeType === "resolved"
          ? rowsPayload(
              [
                diffRow(firstExcluded, "excluded", "baseline"),
                diffRow(secondExcluded, "excluded", "baseline"),
              ],
              2
            )
          : rowsPayload([], 0)
      )
    await renderCards()

    expect(host?.textContent).toContain(firstExcluded)
    expect(host?.textContent).toContain(secondExcluded)
    expect(host?.textContent?.split("Excluded").length ?? 0).toBe(3)
    expect(host?.textContent).toContain("high")
    expect(cardBadge("Fixed From Last Crawl")).toBe("2")
    expect(host?.textContent?.includes("not counted as fixed") ?? false).toBe(
      false
    )
  })

  test("mixed fixed and excluded rows confirm only the excluded row stays neutral", async () => {
    baselineData = baselineOk()
    baselinePending = false
    const excludedUrl = "https://example.com/excluded-mixed"
    rowsHandler = (changeType) =>
      okRows(
        changeType === "resolved"
          ? rowsPayload(
              [
                diffRow(FIXED_URL, "resolved", "baseline"),
                diffRow(excludedUrl, "excluded", "baseline"),
              ],
              2
            )
          : rowsPayload([], 0)
      )
    await renderCards()

    expect(host?.textContent).toContain(FIXED_URL)
    expect(host?.textContent).toContain(excludedUrl)
    expect(host?.textContent?.split("Excluded").length ?? 0).toBe(2)
    expect(cardBadge("Fixed From Last Crawl")).toBe("2")
    const unconfirmed = host?.querySelectorAll('[aria-label="Not confirmed"]')
    expect(unconfirmed?.length).toBe(1)
    const verified = host?.querySelectorAll('[aria-label="Verified fixed"]')
    expect(verified?.length).toBe(1)
    expect(host?.textContent?.includes("not counted as fixed") ?? false).toBe(
      false
    )
  })

  test("only the fixed card unions excluded rows on the server", async () => {
    baselineData = baselineOk()
    baselinePending = false
    rowsHandler = () => okRows(rowsPayload([], 0))
    await renderCards()

    const resolvedCall = rowsCalls.find(
      (call) => call.changeType === "resolved"
    )
    expect(resolvedCall?.includeExcluded).toBe(true)
    const newCall = rowsCalls.find((call) => call.changeType === "new")
    expect(newCall?.includeExcluded).toBeUndefined()
  })
})
