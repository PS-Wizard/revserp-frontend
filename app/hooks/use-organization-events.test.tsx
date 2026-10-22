import { afterEach, beforeEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"
import { OrganizationEventsProvider } from "./use-organization-events"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { getAIAuditResultsPath } from "~/lib/ai-audit-results"
import type { AIAuditResponse } from "~/lib/api.types"

installTestDom()
const realFetch = globalThis.fetch
let root: Root | null = null
let host: HTMLDivElement | null = null
let client: QueryClient | null = null

type ToastKind = "success" | "error" | "warning" | "loading"
type ToastRecord = {
  kind: ToastKind
  message: unknown
  options: Record<string, unknown>
}
type ToastAction = { label: string; onClick: () => void | Promise<void> }

const toastCalls: ToastRecord[] = []
const dismissCalls: unknown[] = []
let restoreToast: () => void = () => {}
beforeEach(() => {
  toastCalls.length = 0
  dismissCalls.length = 0
  auditGate = null
  const originals = {
    success: toast.success,
    error: toast.error,
    warning: toast.warning,
    loading: toast.loading,
    dismiss: toast.dismiss,
  }
  const capture =
    (kind: ToastKind) => (message: unknown, options?: Record<string, unknown>) => {
      toastCalls.push({ kind, message, options: options ?? {} })
      return toastCalls.length
    }
  toast.success = capture("success") as typeof toast.success
  toast.error = capture("error") as typeof toast.error
  toast.warning = capture("warning") as typeof toast.warning
  toast.loading = capture("loading") as typeof toast.loading
  toast.dismiss = ((id?: string | number) => {
    dismissCalls.push(id)
  }) as typeof toast.dismiss
  restoreToast = () => {
    toast.success = originals.success
    toast.error = originals.error
    toast.warning = originals.warning
    toast.loading = originals.loading
    toast.dismiss = originals.dismiss
  }
})

afterEach(async () => {
  restoreToast()
  toast.dismiss()
  await act(async () => {
    root?.unmount()
    await flushTestDom()
  })
  host?.remove()
  client?.clear()
  root = null
  client = null
  host = null
  globalThis.fetch = realFetch
})

function findViewAction(): ToastAction | undefined {
  for (const call of toastCalls) {
    const action = call.options.action as ToastAction | undefined
    if (action && action.label === "View") return action
  }
  return undefined
}

async function mountEvent(
  type: string,
  payload: Record<string, unknown>,
  audit: AIAuditResponse,
  viewed: string[],
  auditFetchFails = false,
  repeat = 1,
  seedQueries?: (client: QueryClient) => void,
) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes("/organizations/org-1/events")) {
      const frame = `event: ${type}\nid: 1\ndata: ${JSON.stringify({
        organization_id: "org-1",
        project_id: audit.project_id,
        resource_id: audit.id,
        payload,
      })}\n\n`
      return new Response(frame.repeat(Math.max(1, repeat)), {
        headers: { "Content-Type": "text/event-stream" },
      })
    }
    if (url.endsWith(`/ai-audits/${audit.id}`)) {
      if (auditFetchFails) {
        return new Response('{"message":"boom"}', {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
      return Response.json(audit)
    }
    throw new Error(`unexpected request ${url}`)
  }) as typeof fetch
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seedQueries?.(client)
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client!}>
        <OrganizationEventsProvider
          orgId="org-1"
          onReady={() => {}}
          onCrawlEvent={() => {}}
          onViewVisibility={(result) => viewed.push(getAIAuditResultsPath(result))}
          revalidate={() => {}}
        >
          {null}
        </OrganizationEventsProvider>
      </QueryClientProvider>
    )
    await flushTestDom()
    for (let i = 0; i < 8; i++) await flushTestDom()
  })
}

function audit(locationId?: string, setupId?: string): AIAuditResponse {
  return {
    id: "audit-1",
    project_id: "project-1",
    crawl_id: "crawl-1",
    ...(setupId ? { project_setup_id: setupId } : {}),
    location_id: locationId,
    status: "completed",
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
  }
}

let auditGate: {
  resolve: (response: Response) => void
  reject: (reason: unknown) => void
} | null = null

function stubDeferredAuditStream(framedOrg: string) {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input)
    if (url.includes("/events")) {
      if (url.includes(`/organizations/${framedOrg}/events`)) {
        return Promise.resolve(
          new Response(
            `event: ai_audit.completed\nid: 1\ndata: ${JSON.stringify({
              organization_id: framedOrg,
              project_id: "project-1",
              resource_id: "audit-1",
              payload: {},
            })}\n\n`,
            { headers: { "Content-Type": "text/event-stream" } },
          )
        )
      }
      return Promise.resolve(new Response("", { headers: { "Content-Type": "text/event-stream" } }))
    }
    if (url.endsWith("/ai-audits/audit-1")) {
      return new Promise<Response>((resolve, reject) => {
        auditGate = { resolve, reject }
      })
    }
    return Promise.reject(new Error(`unexpected request ${url}`))
  }) as typeof fetch
}

async function renderStreamProvider(orgId: string) {
  if (!client) client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (!host) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  }
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client!}>
        <OrganizationEventsProvider
          orgId={orgId}
          onReady={() => {}}
          onCrawlEvent={() => {}}
          onViewVisibility={() => {}}
          revalidate={() => {}}
        >
          {null}
        </OrganizationEventsProvider>
      </QueryClientProvider>,
    )
    for (let i = 0; i < 8; i++) await flushTestDom()
  })
}

test("location completion toast resolves audit scope before opening results", async () => {
  const viewed: string[] = []
  await mountEvent("ai_audit.completed", {}, audit("branch-2"), viewed)
  const action = findViewAction()
  expect(action).toBeTruthy()
  await act(async () => {
    await action!.onClick()
    await flushTestDom()
  })
  expect(viewed).toEqual([
    "/app?audit=audit-1&project=project-1&location=branch-2",
  ])
})

test("project completion toast stays on project visibility", async () => {
  const viewed: string[] = []
  await mountEvent("ai_audit.completed", {}, audit(), viewed)
  const action = findViewAction()
  expect(action).toBeTruthy()
  await act(async () => {
    await action!.onClick()
    await flushTestDom()
  })
  expect(viewed).toEqual(["/app?audit=audit-1&project=project-1&crawl=crawl-1"])
})

test("missing profile terminal event shows a friendly failure toast", async () => {
  await mountEvent(
    "ai_audit.failed",
    { error: "no business profile for project hidden-id" },
    audit("branch-2"),
    []
  )
  const failure = toastCalls.find((call) => call.kind === "error")
  expect(failure).toBeTruthy()
  expect(failure!.options.description).toBe(
    "Add a business profile for this project, then try the visibility test again."
  )
  expect(
    String(failure!.options.description).includes("hidden-id")
  ).toBe(false)
  expect(JSON.stringify(failure!.message).includes("hidden-id")).toBe(false)
})

test("metadata fetch failure keeps visibility on a safe scope", async () => {
  const viewed: string[] = []
  await mountEvent(
    "ai_audit.completed",
    {},
    audit("branch-2"),
    viewed,
    true
  )
  const action = findViewAction()
  expect(action).toBeTruthy()
  await act(async () => {
    await action!.onClick()
    await flushTestDom()
  })
  expect(viewed.length).toBe(0)
  const error = toastCalls.find(
    (call) => call.message === "Could not open visibility results"
  )
  expect(error).toBeTruthy()
})

test("setup visibility success from the event marker is dismissed", async () => {
  await mountEvent("ai_audit.completed", { project_setup_id: "setup-1" }, audit(), [])
  expect(toastCalls.filter((call) => call.kind === "success")).toEqual([])
  expect(dismissCalls).toContain("ai-audit-audit-1")
})

test("old payload without the marker falls back to the fetched audit", async () => {
  await mountEvent("ai_audit.completed", {}, audit(undefined, "setup-1"), [])
  expect(toastCalls.filter((call) => call.kind === "success")).toEqual([])
  expect(dismissCalls).toContain("ai-audit-audit-1")
})

test("standalone audit on the same crawl keeps its success", async () => {
  await mountEvent("ai_audit.completed", {}, audit(), [])
  const done = toastCalls.filter(
    (call) => call.kind === "success" && call.message === "Visibility test complete"
  )
  expect(done.length).toBe(1)
  expect(dismissCalls).toEqual([])
})

test("unmarked audit with a failed metadata fetch fails open to success", async () => {
  await mountEvent("ai_audit.completed", {}, audit(), [], true)
  expect(
    toastCalls.filter((call) => call.kind === "success" && call.message === "Visibility test complete").length
  ).toBe(1)
})

test("setup visibility warnings and failures stay visible", async () => {
  await mountEvent("ai_audit.completed_with_failures", { project_setup_id: "setup-1" }, audit(), [])
  expect(
    toastCalls.filter((call) => call.kind === "warning").length
  ).toBe(1)
  await mountEvent("ai_audit.failed", { project_setup_id: "setup-1", error: "x" }, audit(), [])
  expect(toastCalls.filter((call) => call.kind === "error").length).toBe(1)
  expect(dismissCalls).toEqual([])
})

test("replayed setup completion stays dismissed", async () => {
  await mountEvent("ai_audit.completed", { project_setup_id: "setup-1" }, audit(), [], false, 2)
  expect(toastCalls.filter((call) => call.kind === "success")).toEqual([])
  expect(dismissCalls.filter((id) => id === "ai-audit-audit-1").length).toBe(2)
})

test("visibility progress toasts are unchanged for setup audits", async () => {
  await mountEvent("ai_audit.started", { project_setup_id: "setup-1" }, audit(), [])
  expect(toastCalls.filter((call) => call.kind === "loading").length).toBe(1)
})

test("unmounted visibility lookup resolves silently", async () => {
  stubDeferredAuditStream("org-1")
  await renderStreamProvider("org-1")
  expect(auditGate === null).toBe(false)
  await act(async () => {
    root?.unmount()
    root = null
    await flushTestDom()
  })
  await act(async () => {
    auditGate!.resolve(Response.json(audit(undefined, "setup-1")))
    for (let i = 0; i < 8; i++) await flushTestDom()
  })
  expect(toastCalls.filter((call) => call.kind === "success")).toEqual([])
  expect(dismissCalls).toEqual([])
})

test("stale visibility resolve across org switches stays silent", async () => {
  stubDeferredAuditStream("org-1")
  await renderStreamProvider("org-1")
  expect(auditGate === null).toBe(false)
  await renderStreamProvider("org-2")
  await act(async () => {
    auditGate!.resolve(Response.json(audit(undefined, "setup-1")))
    for (let i = 0; i < 8; i++) await flushTestDom()
  })
  expect(toastCalls.filter((call) => call.kind === "success")).toEqual([])
  expect(dismissCalls).toEqual([])
  await renderStreamProvider("org-1")
  expect(auditGate === null).toBe(false)
  await act(async () => {
    auditGate!.resolve(Response.json(audit()))
    for (let i = 0; i < 8; i++) await flushTestDom()
  })
  expect(
    toastCalls.filter((call) => call.kind === "success" && call.message === "Visibility test complete")
      .length
  ).toBe(1)
  expect(dismissCalls).toEqual([])
})

test("keyword analysis saves invalidate estimates for the saved project only", async () => {
  const projectKey = ["project-keyword-analysis", "project-1"]
  const competitorKey = ["competitor-keyword-analysis", "project-1", "competitor-1"]
  const otherProjectKey = ["project-keyword-analysis", "project-2"]
  const otherCompetitorKey = ["competitor-keyword-analysis", "project-2", "competitor-2"]
  await mountEvent(
    "keyword_analysis.updated",
    { competitor_id: "competitor-1" },
    audit(),
    [],
    false,
    1,
    (queryClient) => {
      for (const key of [projectKey, competitorKey, otherProjectKey, otherCompetitorKey]) {
        queryClient.setQueryData(key, { keywords: [] })
      }
    }
  )
  expect(client!.getQueryState(projectKey)?.isInvalidated).toBe(true)
  expect(client!.getQueryState(competitorKey)?.isInvalidated).toBe(true)
  expect(client!.getQueryState(otherProjectKey)?.isInvalidated).toBe(false)
  expect(client!.getQueryState(otherCompetitorKey)?.isInvalidated).toBe(false)
})
