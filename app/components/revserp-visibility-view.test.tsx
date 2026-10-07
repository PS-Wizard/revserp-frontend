import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { RevserpVisibilityView } from "~/components/revserp-visibility-view"
import type { AIAuditResponse, AIAuditRunResponse } from "~/lib/api.types"

installTestDom()

const PROJECT = "proj-1"
const CRAWL = "crawl-1"
const LOCATION = "loc-1"

type ViewProps = {
  projectId: string | null
  crawlId: string | null
  locationId?: string
  locationName?: string
  initialAuditId?: string
}

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const realFetch = globalThis.fetch

type FetchHandlers = {
  list?: (url: string) => AIAuditResponse[]
  listStatus?: number
  detail?: (auditId: string) => AIAuditResponse | null
  create?: (body: unknown) => AIAuditResponse
}

function installFetch(handlers: FetchHandlers) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })

    if (method === "POST" && /\/ai-audits$/.test(url)) {
      return Response.json(
        handlers.create?.(body) ?? makeAudit({ id: "audit-new" })
      )
    }
    if (method === "GET" && url.includes("/ai-audits?")) {
      if (handlers.listStatus) {
        return new Response(JSON.stringify({ error: "list unavailable" }), {
          status: handlers.listStatus,
        })
      }
      const list = handlers.list?.(url) ?? []
      return Response.json({
        ai_audits: list,
        pagination: {
          limit: 1,
          offset: 0,
          count: list.length,
          total: list.length,
        },
      })
    }
    const detailMatch =
      method === "GET" ? url.match(/\/ai-audits\/([^/?]+)$/) : null
    if (detailMatch) {
      const detail = handlers.detail?.(detailMatch[1]) ?? null
      if (!detail) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        })
      }
      return Response.json(detail)
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }) as typeof fetch
}

function makeAudit(overrides: Partial<AIAuditResponse> = {}): AIAuditResponse {
  return {
    id: "audit-1",
    project_id: PROJECT,
    status: "completed",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeRun(
  overrides: Partial<AIAuditRunResponse> = {}
): AIAuditRunResponse {
  return {
    id: "run-1",
    audit_id: "audit-1",
    question_text: "best coffee shop",
    display_order: 1,
    model_name: "openai/gpt-4o",
    status: "success",
    mentioned_target: false,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  }
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let client: QueryClient

function wrap(props: ViewProps) {
  return (
    <QueryClientProvider client={client}>
      <RevserpVisibilityView {...props} />
    </QueryClientProvider>
  )
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
}

async function renderView(props: ViewProps) {
  client = newClient()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(wrap(props))
    await flushTestDom()
    await flushTestDom()
    await flushTestDom()
  })
}

async function rerenderView(props: ViewProps) {
  await act(async () => {
    root?.render(wrap(props))
    await flushTestDom()
    await flushTestDom()
  })
}

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  globalThis.fetch = realFetch
  fetchCalls.length = 0
  document.body.innerHTML = ""
})

function text() {
  return host?.textContent ?? ""
}

function posts() {
  return fetchCalls.filter((call) => call.method === "POST")
}

function press(el: Element | null | undefined) {
  if (!el) throw new Error("press target missing")
  const target = el as HTMLElement
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
  }
  target.dispatchEvent(new PointerEvent("pointerdown", init))
  target.dispatchEvent(new MouseEvent("mousedown", init))
  target.focus?.()
  target.dispatchEvent(new PointerEvent("pointerup", init))
  target.dispatchEvent(new MouseEvent("mouseup", init))
  target.dispatchEvent(new MouseEvent("click", init))
}

function buttonByText(scope: ParentNode, label: string) {
  const found = [...scope.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(label)
  )
  if (!found) throw new Error(`button "${label}" not found`)
  return found as HTMLButtonElement
}

async function flushUntil(check: () => boolean) {
  for (let i = 0; i < 40; i++) {
    if (check()) return
    await act(async () => {
      await flushTestDom()
    })
  }
  throw new Error("condition never became true")
}

describe("location scope", () => {
  test("mounting and switching location scope never starts a paid run", async () => {
    installFetch({ list: () => [] })
    await renderView({ projectId: PROJECT, crawlId: null, locationId: "loc-a" })
    expect(posts()).toHaveLength(0)

    await rerenderView({
      projectId: PROJECT,
      crawlId: null,
      locationId: "loc-b",
    })
    expect(posts()).toHaveLength(0)
  })

  test("a location run reads and creates the exact location audit", async () => {
    installFetch({ list: () => [] })
    await renderView({
      projectId: PROJECT,
      crawlId: null,
      locationId: LOCATION,
    })
    await flushUntil(() => text().includes("Run Visibility Test"))

    await act(async () => {
      press(buttonByText(host!, "Run Visibility Test"))
      await flushTestDom()
    })

    const listGet = fetchCalls.find(
      (call) => call.method === "GET" && call.url.includes("/ai-audits?")
    )
    expect(listGet?.url).toContain("location_id=loc-1")
    expect((listGet?.url ?? "").includes("crawl_id")).toBe(false)
    expect(posts()).toHaveLength(1)
    expect(posts()[0].body).toEqual({ location_id: "loc-1" })
  })

  test("a project audit is never shown as a location result", async () => {
    const projectAudit = makeAudit({ id: "audit-project", crawl_id: CRAWL })
    installFetch({
      list: () => [projectAudit],
      detail: () =>
        makeAudit({
          id: "audit-project",
          crawl_id: CRAWL,
          runs: [makeRun({ question_text: "project question" })],
        }),
    })
    await renderView({
      projectId: PROJECT,
      crawlId: null,
      locationId: LOCATION,
    })
    await flushUntil(() => text().includes("No visibility data yet"))

    expect(
      fetchCalls.some((call) => call.url.includes("/ai-audits/audit-project"))
    ).toBe(false)
    expect(text().includes("project question")).toBe(false)
    expect(posts()).toHaveLength(0)
  })

  test("switching location scope drops the previous audit synchronously", async () => {
    const audits: Record<string, AIAuditResponse> = {
      "loc-a": makeAudit({ id: "audit-a", location_id: "loc-a" }),
      "loc-b": makeAudit({ id: "audit-b", location_id: "loc-b" }),
    }
    installFetch({
      list: (url) => {
        const id = new URL(url).searchParams.get("location_id") ?? ""
        const audit = audits[id]
        return audit ? [audit] : []
      },
      detail: (auditId) =>
        auditId === "audit-a"
          ? makeAudit({
              id: "audit-a",
              location_id: "loc-a",
              runs: [
                makeRun({
                  audit_id: "audit-a",
                  question_text: "alpha question",
                }),
              ],
            })
          : makeAudit({
              id: "audit-b",
              location_id: "loc-b",
              runs: [
                makeRun({
                  audit_id: "audit-b",
                  question_text: "beta question",
                }),
              ],
            }),
    })
    await renderView({ projectId: PROJECT, crawlId: null, locationId: "loc-a" })
    await flushUntil(() => text().includes("alpha question"))

    await rerenderView({
      projectId: PROJECT,
      crawlId: null,
      locationId: "loc-b",
    })
    await flushUntil(() => text().includes("beta question"))
    expect(text().includes("alpha question")).toBe(false)
  })

  test("a failed location list read does not claim there is no data", async () => {
    installFetch({ listStatus: 500 })
    await renderView({
      projectId: PROJECT,
      crawlId: null,
      locationId: LOCATION,
    })
    await flushUntil(() => text().includes("Could not load visibility data"))
    expect(text().includes("No visibility data yet")).toBe(false)
  })
})

describe("project scope is unchanged", () => {
  test("a crawl run stays scoped to crawl_id and never sends location_id", async () => {
    installFetch({ list: () => [] })
    await renderView({ projectId: PROJECT, crawlId: CRAWL })
    await flushUntil(() => text().includes("Run Visibility Test"))

    await act(async () => {
      press(buttonByText(host!, "Run Visibility Test"))
      await flushTestDom()
    })

    const listGet = fetchCalls.find(
      (call) => call.method === "GET" && call.url.includes("/ai-audits?")
    )
    expect(listGet?.url).toContain("crawl_id=crawl-1")
    expect((listGet?.url ?? "").includes("location_id")).toBe(false)
    expect(posts()).toHaveLength(1)
    expect(posts()[0].body).toEqual({ crawl_id: "crawl-1" })
  })

  test("a failed project list read keeps the old empty state", async () => {
    installFetch({ listStatus: 500 })
    await renderView({ projectId: PROJECT, crawlId: CRAWL })
    await flushUntil(() => text().includes("No visibility data yet"))
  })
})

describe("branch vs brand mention", () => {
  test("branch and brand are labelled separately and unknown is not claimed", async () => {
    const audit = makeAudit({
      id: "audit-loc",
      location_id: LOCATION,
      runs: [
        makeRun({
          id: "r1",
          audit_id: "audit-loc",
          display_order: 1,
          question_text: "q1",
          mentioned_target: true,
          mentioned_branch: true,
          target_rank: 1,
        }),
        makeRun({
          id: "r2",
          audit_id: "audit-loc",
          display_order: 2,
          question_text: "q2",
          mentioned_target: true,
          mentioned_branch: false,
          target_rank: 2,
        }),
        makeRun({
          id: "r3",
          audit_id: "audit-loc",
          display_order: 3,
          question_text: "q3",
          mentioned_target: true,
          target_rank: 3,
        }),
      ],
    })
    installFetch({ list: () => [audit], detail: () => audit })
    await renderView({
      projectId: PROJECT,
      crawlId: null,
      locationId: LOCATION,
    })
    await flushUntil(() => text().includes("q3"))

    const count = (re: RegExp) => (text().match(re) ?? []).length
    expect(count(/Branch mention/g)).toBe(2)
    expect(count(/Brand mention/g)).toBe(2)
  })
})

test("toast deep link opens the requested audit instead of the latest location run", async () => {
  installFetch({
    list: () => [makeAudit({ id: "new-audit", location_id: LOCATION })],
    detail: (id) =>
      makeAudit({
        id,
        location_id: LOCATION,
        runs: [
          makeRun({
            question_text:
              id === "old-audit" ? "Stored older question" : "Latest question",
          }),
        ],
      }),
  })
  await renderView({
    projectId: PROJECT,
    crawlId: null,
    locationId: LOCATION,
    initialAuditId: "old-audit",
  })
  await flushUntil(() => text().includes("Stored older question"))
  expect(text().includes("Latest question")).toBe(false)
  expect(posts()).toHaveLength(0)
})

test("a deep-linked audit from another location is not shown", async () => {
  installFetch({
    detail: () =>
      makeAudit({
        id: "wrong-audit",
        location_id: "other-location",
        runs: [makeRun({ question_text: "Foreign location question" })],
      }),
  })
  await renderView({
    projectId: PROJECT,
    crawlId: null,
    locationId: LOCATION,
    initialAuditId: "wrong-audit",
  })
  expect(text().includes("Foreign location question")).toBe(false)
  expect(posts()).toHaveLength(0)
})
