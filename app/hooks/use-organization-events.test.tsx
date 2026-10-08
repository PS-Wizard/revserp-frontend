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
let restoreToast: () => void = () => {}

beforeEach(() => {
  toastCalls.length = 0
  const originals = {
    success: toast.success,
    error: toast.error,
    warning: toast.warning,
    loading: toast.loading,
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
  restoreToast = () => {
    toast.success = originals.success
    toast.error = originals.error
    toast.warning = originals.warning
    toast.loading = originals.loading
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
  auditFetchFails = false
) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes("/organizations/org-1/events")) {
      return new Response(
        `event: ${type}\nid: 1\ndata: ${JSON.stringify({
          organization_id: "org-1",
          project_id: audit.project_id,
          resource_id: audit.id,
          payload,
        })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } }
      )
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
    await flushTestDom()
  })
}

function audit(locationId?: string): AIAuditResponse {
  return {
    id: "audit-1",
    project_id: "project-1",
    crawl_id: "crawl-1",
    location_id: locationId,
    status: "completed",
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
  }
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
