import { afterEach, beforeEach, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import {
  useIssueTypeDiffBaseline,
  useIssueTypeDiffRows,
} from "./use-issue-type-diff"

installTestDom()

const realFetch = globalThis.fetch
let root: Root | null = null
let host: HTMLDivElement | null = null
let client: QueryClient | null = null

type FetchCall = { url: string; signal: AbortSignal | null }
let fetchCalls: FetchCall[] = []
let fetchImpl: (url: string) => Promise<Response> = () =>
  Promise.reject(new Error("unexpected request"))

type BaselineArgs = { crawlId: string | undefined; enabled: boolean }
const baselineArgs: BaselineArgs = { crawlId: undefined, enabled: false }
let baselineSeen: ReturnType<typeof useIssueTypeDiffBaseline> | null = null

function BaselineProbe() {
  baselineSeen = useIssueTypeDiffBaseline(baselineArgs.crawlId, baselineArgs.enabled)
  return null
}

type RowsArgs = {
  baselineCrawlId?: string
  currentCrawlId?: string
  pillarId?: string
  bucketId?: string
  issueTypeId?: string
  pageIndex: number
  pageSize: number
  enabled: boolean
  changeType?: "new" | "resolved"
  includeExcluded?: boolean
}
const rowsArgs: RowsArgs = { pageIndex: 0, pageSize: 25, enabled: false }
let rowsSeen: ReturnType<typeof useIssueTypeDiffRows> | null = null

function RowsProbe() {
  rowsSeen = useIssueTypeDiffRows({ ...rowsArgs })
  return null
}

let newSeen: ReturnType<typeof useIssueTypeDiffRows> | null = null
let resolvedSeen: ReturnType<typeof useIssueTypeDiffRows> | null = null

function FilterPairProbe() {
  const scope = {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageSize: 10,
    enabled: true,
  }
  newSeen = useIssueTypeDiffRows({ ...scope, pageIndex: 0, changeType: "new" })
  resolvedSeen = useIssueTypeDiffRows({ ...scope, pageIndex: 1, changeType: "resolved" })
  return null
}

beforeEach(() => {
  fetchCalls = []
  baselineSeen = null
  rowsSeen = null
  newSeen = null
  resolvedSeen = null
  baselineArgs.crawlId = undefined
  baselineArgs.enabled = false
  rowsArgs.baselineCrawlId = undefined
  rowsArgs.currentCrawlId = undefined
  rowsArgs.pillarId = undefined
  rowsArgs.bucketId = undefined
  rowsArgs.issueTypeId = undefined
  rowsArgs.pageIndex = 0
  rowsArgs.pageSize = 25
  rowsArgs.enabled = false
  rowsArgs.changeType = undefined
  rowsArgs.includeExcluded = undefined
  fetchImpl = () => Promise.reject(new Error("unexpected request"))
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    fetchCalls.push({ url, signal: (init?.signal as AbortSignal | null) ?? null })
    return fetchImpl(url)
  }) as typeof fetch
})

afterEach(async () => {
  await act(async () => {
    root?.unmount()
    await flushTestDom()
  })
  host?.remove()
  client?.clear()
  root = null
  host = null
  client = null
  globalThis.fetch = realFetch
})

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await flushTestDom()
  })
}

async function mount(element: ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client!}>{element}</QueryClientProvider>,
    )
    await flushTestDom()
  })
  await settle()
}

async function rerender(element: ReactElement) {
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client!}>{element}</QueryClientProvider>,
    )
    await flushTestDom()
  })
  await settle()
}

const baselinePayload = {
  current_crawl_id: "crawl-new",
  baseline_crawl: {
    id: "crawl-old",
    project_id: "proj-1",
    status: "completed",
    started_at: "2026-10-01T00:00:00Z",
    completed_at: "2026-10-01T01:00:00Z",
  },
  baseline_breakdown: null,
}

function rowsPayload(urls: string[], changeType = "unchanged") {
  return {
    urls: urls.map((url) => ({
      url,
      change_type: changeType,
      baseline: null,
      current: null,
    })),
    pagination: { limit: 25, offset: 0, count: urls.length, total: urls.length },
  }
}

test("baseline hook stays idle when disabled", async () => {
  baselineArgs.crawlId = "crawl-1"
  baselineArgs.enabled = false
  await mount(<BaselineProbe />)
  expect(fetchCalls).toEqual([])
})

test("baseline hook stays idle without a crawl id", async () => {
  baselineArgs.crawlId = undefined
  baselineArgs.enabled = true
  await mount(<BaselineProbe />)
  expect(fetchCalls).toEqual([])
})

test("baseline hook fetches the selected crawl comparison baseline", async () => {
  fetchImpl = () => Promise.resolve(Response.json(baselinePayload))
  baselineArgs.crawlId = "crawl-new"
  baselineArgs.enabled = true
  await mount(<BaselineProbe />)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].url.endsWith("/crawls/crawl-new/comparison-baseline")).toBe(true)
  expect(baselineSeen?.isSuccess).toBe(true)
  expect(baselineSeen?.data).toEqual(baselinePayload)
})

test("baseline hook passes a missing baseline through without inventing one", async () => {
  const payload = {
    current_crawl_id: "crawl-first",
    baseline_crawl: null,
    baseline_breakdown: null,
  }
  fetchImpl = () => Promise.resolve(Response.json(payload))
  baselineArgs.crawlId = "crawl-first"
  baselineArgs.enabled = true
  await mount(<BaselineProbe />)
  expect(baselineSeen?.isSuccess).toBe(true)
  expect(baselineSeen?.data?.baseline_crawl).toBeNull()
  expect(baselineSeen?.data?.baseline_breakdown).toBeNull()
})

test("rows hook stays idle when disabled or when scope ids are incomplete", async () => {
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    enabled: false,
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toEqual([])

  rowsArgs.enabled = true
  rowsArgs.issueTypeId = undefined
  await rerender(<RowsProbe />)
  expect(fetchCalls).toEqual([])
})

test("rows hook requests one server page with encoded scope segments", async () => {
  fetchImpl = () =>
    Promise.resolve(Response.json(rowsPayload(["https://example.com/a"])))
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp metadata",
    issueTypeId: "missing title",
    pageIndex: 2,
    pageSize: 25,
    enabled: true,
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toHaveLength(1)
  const url = fetchCalls[0].url
  expect(
    url.includes(
      "/crawls/crawl-old/compare/crawl-new/score-breakdown/seo/serp%20metadata/missing%20title/urls",
    ),
  ).toBe(true)
  expect(url.includes("limit=25")).toBe(true)
  expect(url.includes("offset=50")).toBe(true)
  expect(rowsSeen?.isSuccess).toBe(true)
  expect(rowsSeen?.data?.urls).toHaveLength(1)
  expect(rowsSeen?.data?.pagination.total).toBe(1)
})

test("rows hook keeps baseline before current for a historical selection", async () => {
  fetchImpl = () => Promise.resolve(Response.json(rowsPayload([])))
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-prior",
    currentCrawlId: "crawl-selected",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageIndex: 0,
    pageSize: 10,
    enabled: true,
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toHaveLength(1)
  expect(
    fetchCalls[0].url.includes("/crawls/crawl-prior/compare/crawl-selected/"),
  ).toBe(true)
})

test("scope change fetches the new scope without showing stale rows", async () => {
  let holdRows = false
  const heldRows: { release: (() => void) | null } = { release: null }
  fetchImpl = () => {
    if (!holdRows)
      return Promise.resolve(
        Response.json(rowsPayload(["https://example.com/a"])),
      )
    return new Promise<Response>((resolve) => {
      heldRows.release = () =>
        resolve(Response.json(rowsPayload(["https://example.com/b"])) )
    })
  }
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    enabled: true,
  })
  await mount(<RowsProbe />)
  expect(rowsSeen?.data?.urls.map((row) => row.url)).toEqual([
    "https://example.com/a",
  ])

  holdRows = true
  rowsArgs.issueTypeId = "missing_description"
  await rerender(<RowsProbe />)
  expect(fetchCalls).toHaveLength(2)
  expect(fetchCalls[1].url.includes("/missing_description/urls")).toBe(true)
  expect(rowsSeen?.data).toBeUndefined()
  expect(rowsSeen?.isPending).toBe(true)

  heldRows.release?.()
  await settle()
  expect(rowsSeen?.data?.urls.map((row) => row.url)).toEqual([
    "https://example.com/b",
  ])
})

test("a superseded row request is cancelled", async () => {
  let calls = 0
  fetchImpl = () => {
    calls += 1
    if (calls === 1) return new Promise<Response>(() => {})
    return Promise.resolve(Response.json(rowsPayload([])))
  }
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    enabled: true,
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toHaveLength(1)
  const firstSignal = fetchCalls[0].signal
  expect(firstSignal === null).toBe(false)

  rowsArgs.issueTypeId = "missing_description"
  await rerender(<RowsProbe />)
  expect(fetchCalls).toHaveLength(2)
  expect(firstSignal?.aborted).toBe(true)
})

test("rows hook omits change_type when no filter is given (legacy path)", async () => {
  fetchImpl = () =>
    Promise.resolve(Response.json(rowsPayload(["https://example.com/a"])))
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageIndex: 1,
    pageSize: 25,
    enabled: true,
    changeType: undefined,
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].url.includes("change_type")).toBe(false)
  expect(fetchCalls[0].url.includes("limit=25")).toBe(true)
  expect(fetchCalls[0].url.includes("offset=25")).toBe(true)
  expect(rowsSeen?.isSuccess).toBe(true)
  expect(rowsSeen?.data?.urls).toHaveLength(1)
})

test("rows hook appends change_type=new with its own paging", async () => {
  fetchImpl = () =>
    Promise.resolve(Response.json(rowsPayload(["https://example.com/new"], "new")))
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageIndex: 0,
    pageSize: 10,
    enabled: true,
    changeType: "new",
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].url.includes("change_type=new")).toBe(true)
  expect(fetchCalls[0].url.includes("limit=10")).toBe(true)
  expect(fetchCalls[0].url.includes("offset=0")).toBe(true)
  expect(rowsSeen?.data?.urls.map((row) => row.url)).toEqual([
    "https://example.com/new",
  ])
})

test("rows hook appends change_type=resolved with its own paging", async () => {
  fetchImpl = () =>
    Promise.resolve(
      Response.json(rowsPayload(["https://example.com/fixed"], "resolved")),
    )
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageIndex: 2,
    pageSize: 10,
    enabled: true,
    changeType: "resolved",
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].url.includes("change_type=resolved")).toBe(true)
  expect(fetchCalls[0].url.includes("limit=10")).toBe(true)
  expect(fetchCalls[0].url.includes("offset=20")).toBe(true)
  expect(rowsSeen?.data?.urls.map((row) => row.url)).toEqual([
    "https://example.com/fixed",
  ])
})

test("switching the change filter fetches the new filter without showing stale rows", async () => {
  let holdResolved = false
  const held: { release: (() => void) | null } = { release: null }
  fetchImpl = (url: string) => {
    if (url.includes("change_type=resolved") && holdResolved)
      return new Promise<Response>((resolve) => {
        held.release = () =>
          resolve(Response.json(rowsPayload(["https://example.com/fixed"], "resolved")))
      })
    return Promise.resolve(Response.json(rowsPayload(["https://example.com/new"], "new")))
  }
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageIndex: 0,
    pageSize: 10,
    enabled: true,
    changeType: "new",
  })
  await mount(<RowsProbe />)
  expect(rowsSeen?.data?.urls.map((row) => row.url)).toEqual(["https://example.com/new"])

  holdResolved = true
  rowsArgs.changeType = "resolved"
  await rerender(<RowsProbe />)
  expect(fetchCalls).toHaveLength(2)
  expect(fetchCalls[0].url.includes("change_type=new")).toBe(true)
  expect(fetchCalls[1].url.includes("change_type=resolved")).toBe(true)
  expect(rowsSeen?.data).toBeUndefined()
  expect(rowsSeen?.isPending).toBe(true)

  held.release?.()
  await settle()
  expect(rowsSeen?.data?.urls.map((row) => row.url)).toEqual(["https://example.com/fixed"])
})

test("the hook passes server change types through without reclassifying", async () => {
  fetchImpl = () =>
    Promise.resolve(Response.json(rowsPayload(["https://example.com/q"], "not_verified")))
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageIndex: 0,
    pageSize: 25,
    enabled: true,
    changeType: undefined,
  })
  await mount(<RowsProbe />)
  expect(rowsSeen?.data?.urls).toHaveLength(1)
  expect(rowsSeen?.data?.urls[0]?.change_type).toBe("not_verified")
})

test("new and resolved filters page independently with server totals", async () => {
  fetchImpl = (url: string) => {
    if (url.includes("change_type=new"))
      return Promise.resolve(
        Response.json({
          urls: [
            { url: "https://example.com/new-1", change_type: "new", baseline: null, current: null },
            { url: "https://example.com/new-2", change_type: "new", baseline: null, current: null },
          ],
          pagination: { limit: 10, offset: 0, count: 2, total: 2 },
        }),
      )
    return Promise.resolve(
      Response.json({
        urls: [
          { url: "https://example.com/fixed-1", change_type: "resolved", baseline: null, current: null },
        ],
        pagination: { limit: 10, offset: 10, count: 1, total: 1 },
      }),
    )
  }
  await mount(<FilterPairProbe />)
  expect(fetchCalls).toHaveLength(2)
  const newCall = fetchCalls.find((call) => call.url.includes("change_type=new"))
  const resolvedCall = fetchCalls.find((call) => call.url.includes("change_type=resolved"))
  expect(newCall === undefined).toBe(false)
  expect(resolvedCall === undefined).toBe(false)
  expect(newCall?.url.includes("limit=10")).toBe(true)
  expect(newCall?.url.includes("offset=0")).toBe(true)
  expect(resolvedCall?.url.includes("limit=10")).toBe(true)
  expect(resolvedCall?.url.includes("offset=10")).toBe(true)
  expect(newSeen?.data?.pagination.total).toBe(2)
  expect(resolvedSeen?.data?.pagination.total).toBe(1)
  expect(newSeen?.data?.urls).toHaveLength(2)
  expect(resolvedSeen?.data?.urls).toHaveLength(1)
})

test("resolved rows omit include_excluded by default (legacy path)", async () => {
  fetchImpl = () =>
    Promise.resolve(Response.json(rowsPayload(["https://example.com/fixed"], "resolved")))
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageIndex: 0,
    pageSize: 25,
    enabled: true,
    changeType: "resolved",
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].url.includes("change_type=resolved")).toBe(true)
  expect(fetchCalls[0].url.includes("include_excluded")).toBe(false)
  expect(rowsSeen?.isSuccess).toBe(true)
})

test("resolved rows union excluded rows only when includeExcluded is true", async () => {
  fetchImpl = () =>
    Promise.resolve(Response.json(rowsPayload(["https://example.com/fixed"], "resolved")))
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageIndex: 0,
    pageSize: 25,
    enabled: true,
    changeType: "resolved",
    includeExcluded: true,
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].url.includes("change_type=resolved")).toBe(true)
  expect(fetchCalls[0].url.includes("include_excluded=true")).toBe(true)
  expect(rowsSeen?.isSuccess).toBe(true)
})

test("an explicit false flag never sends include_excluded", async () => {
  fetchImpl = () =>
    Promise.resolve(Response.json(rowsPayload(["https://example.com/new"], "new")))
  Object.assign(rowsArgs, {
    baselineCrawlId: "crawl-old",
    currentCrawlId: "crawl-new",
    pillarId: "seo",
    bucketId: "serp_metadata",
    issueTypeId: "missing_title",
    pageIndex: 0,
    pageSize: 25,
    enabled: true,
    changeType: "new",
    includeExcluded: false,
  })
  await mount(<RowsProbe />)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0].url.includes("change_type=new")).toBe(true)
  expect(fetchCalls[0].url.includes("include_excluded")).toBe(false)
  expect(rowsSeen?.isSuccess).toBe(true)
})
