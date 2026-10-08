import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { LocationGoogleSetupWizard } from "~/components/locations/location-google-setup-wizard"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import type {
  LocationGscBindingResponse,
  LocationGoogleBindingMode,
} from "~/lib/location-google-api"

installTestDom()

const PROJECT = "proj-1"
const LOCATION = "loc-1"

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch
const previousHref = window.location.href

function gscBinding(overrides: Record<string, unknown> = {}) {
  return {
    configured: false,
    mode: "inherit",
    effective: {
      source: "project",
      google_connection_id: "conn-1",
      google_account_email: "owner@example.com",
      site_url: "https://example.com/",
    },
    project: {
      google_connection_id: "conn-1",
      site_url: "https://example.com/",
    },
    google_connections: [
      {
        id: "conn-1",
        google_account_email: "owner@example.com",
        google_status: "active",
      },
    ],
    ...overrides,
  } as LocationGscBindingResponse
}

function installFetch() {
  ;(globalThis as Record<string, unknown>).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })
    if (method === "POST" && url.includes("/connect/start")) {
      return Response.json({
        auth_url: "https://accounts.google.com/o/oauth2/auth?x=1",
      })
    }
    if (url.includes("/google-accounts/conn-1/gsc-sites")) {
      return Response.json({
        google_connection_id: "conn-1",
        google_account_email: "owner@example.com",
        google_status: "active",
        available_sites: [
          { site_url: "https://example.com/shop", permission_level: "siteOwner" },
        ],
      })
    }
    if (method === "PUT" && url.includes("/binding")) {
      return Response.json({ ok: true, mode: (body as { mode: string }).mode })
    }
    if (method === "GET" && url.includes("/binding")) {
      return Response.json(gscBinding())
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }) as typeof fetch
}

let root: Root | null = null
let savedCount = 0
let closedCount = 0

function renderWizard(options: {
  binding?: LocationGscBindingResponse
  initialMode?: LocationGoogleBindingMode
  initialAccountId?: string
  initialPropertyId?: string
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <QueryClientProvider client={client}>
        <LocationGoogleSetupWizard
          projectId={PROJECT}
          locationId={LOCATION}
          service="gsc"
          binding={options.binding ?? gscBinding()}
          initialMode={options.initialMode ?? "inherit"}
          initialAccountId={options.initialAccountId ?? ""}
          initialPropertyId={options.initialPropertyId ?? ""}
          onClose={() => {
            closedCount += 1
          }}
          onSaved={() => {
            savedCount += 1
          }}
        />
      </QueryClientProvider>
    )
  })
  return { client, container }
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

function radioByTitle(scope: ParentNode, title: string) {
  const label = [...scope.querySelectorAll("label")].find((candidate) =>
    candidate.textContent?.includes(title)
  )
  const input = label?.querySelector('input[type="radio"]')
  if (!input) throw new Error(`radio "${title}" not found`)
  return input as HTMLInputElement
}

function buttonByText(scope: ParentNode, text: string) {
  const found = [...scope.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text)
  )
  if (!found) throw new Error(`button "${text}" not found`)
  return found as HTMLButtonElement
}

afterEach(() => {
  globalThis.fetch = originalFetch
  fetchCalls.length = 0
  savedCount = 0
  closedCount = 0
  if (root) {
    act(() => {
      root!.unmount()
    })
    root = null
  }
  document.body.innerHTML = ""
  window.location.href = previousHref
})

describe("location google setup wizard", () => {
  test("radio selection writes nothing until Finalize", async () => {
    installFetch()
    const { container } = renderWizard({})
    const off = radioByTitle(container, "Off for this location")
    await act(async () => {
      off.click()
      await flushTestDom()
    })
    expect(fetchCalls).toHaveLength(0)
    expect(savedCount).toBe(0)
    const finalize = buttonByText(container, "Finalize")
    await act(async () => {
      finalize.click()
      await flushTestDom()
    })
    await flushUntil(() => savedCount === 1)
    const put = fetchCalls.find((call) => call.method === "PUT")
    expect(put?.url).toContain(`/locations/${LOCATION}/gsc/binding`)
    expect(put?.body).toEqual({ mode: "off" })
  })

  test("Cancel writes nothing and closes", async () => {
    installFetch()
    const { container } = renderWizard({})
    const custom = radioByTitle(container, "This location's own property")
    await act(async () => {
      custom.click()
      await flushTestDom()
    })
    const cancel = buttonByText(container, "Cancel")
    await act(async () => {
      cancel.click()
      await flushTestDom()
    })
    expect(closedCount).toBe(1)
    expect(savedCount).toBe(0)
    expect(fetchCalls).toHaveLength(0)
  })

  test("property list loads only through the explicit button", async () => {
    installFetch()
    const { container } = renderWizard({
      initialMode: "custom",
      initialAccountId: "conn-1",
    })
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await flushTestDom()
      })
    }
    expect(
      fetchCalls.some((call) => call.url.includes("/google-accounts/"))
    ).toBe(false)
    const load = buttonByText(container, "Load properties for this account")
    await act(async () => {
      load.click()
      await flushTestDom()
    })
    await flushUntil(() =>
      fetchCalls.some((call) =>
        call.url.includes("/google-accounts/conn-1/gsc-sites")
      )
    )
  })

  test("custom Finalize persists the chosen account and property", async () => {
    installFetch()
    const { container } = renderWizard({
      initialMode: "custom",
      initialAccountId: "conn-1",
      initialPropertyId: "https://example.com/shop",
    })
    const finalize = buttonByText(container, "Finalize")
    await act(async () => {
      finalize.click()
      await flushTestDom()
    })
    await flushUntil(() => savedCount === 1)
    const put = fetchCalls.find((call) => call.method === "PUT")
    expect(put?.body).toEqual({
      mode: "custom",
      google_connection_id: "conn-1",
      site_url: "https://example.com/shop",
    })
  })

  test("Finalize stays disabled for custom without an account and property", async () => {
    installFetch()
    const { container } = renderWizard({ initialMode: "custom" })
    const finalize = buttonByText(container, "Finalize")
    expect(finalize.disabled).toBe(true)
    expect(fetchCalls).toHaveLength(0)
  })

  test("legacy blank-email account gets a setup-only reconnect note", async () => {
    installFetch()
    const { container } = renderWizard({
      binding: gscBinding({
        google_connections: [
          { id: "conn-1", google_account_email: "", google_status: "active" },
        ],
      }),
      initialMode: "custom",
      initialAccountId: "conn-1",
    })
    await flushUntil(() => container.innerHTML.includes("Reconnect account"))
    expect(container.innerHTML).toContain("no verified identity")
    expect(container.innerHTML.includes("Unverified")).toBe(false)
  })

  test("zero accounts offers in-place connect with a location return path", async () => {
    installFetch()
    const { container } = renderWizard({
      binding: gscBinding({ google_connections: [] }),
      initialMode: "custom",
    })
    const connect = buttonByText(container, "Connect Google account")
    await act(async () => {
      connect.click()
      await flushTestDom()
    })
    await flushUntil(() =>
      fetchCalls.some(
        (call) => call.method === "POST" && call.url.includes("/connect/start")
      )
    )
    const start = fetchCalls.find((call) => call.url.includes("/connect/start"))
    expect(start?.body).toEqual({
      return_path:
        "/app?project=proj-1&location=loc-1&google_setup=custom&google_service=gsc&google_location=loc-1",
    })
    expect(window.location.href).toBe(
      "https://accounts.google.com/o/oauth2/auth?x=1"
    )
  })

  test("reconnect posts the targeted account and never touches the parent binding", async () => {
    installFetch()
    const { container } = renderWizard({
      binding: gscBinding({
        google_connections: [
          {
            id: "conn-1",
            google_account_email: "owner@example.com",
            google_status: "reauth_required",
          },
        ],
      }),
      initialMode: "custom",
      initialAccountId: "conn-1",
    })
    const reconnect = buttonByText(container, "Reconnect account")
    await act(async () => {
      reconnect.click()
      await flushTestDom()
    })
    await flushUntil(() =>
      fetchCalls.some(
        (call) => call.method === "POST" && call.url.includes("/connect/start")
      )
    )
    const start = fetchCalls.find((call) => call.url.includes("/connect/start"))
    expect(start?.body).toEqual({
      return_path:
        "/app?project=proj-1&location=loc-1&google_setup=custom&google_service=gsc&google_location=loc-1",
      mode: "reconnect_account",
      google_connection_id: "conn-1",
    })
    expect(
      fetchCalls.some(
        (call) =>
          call.url.includes("select-site") ||
          call.url.includes("select-property") ||
          call.url.includes("/disconnect")
      )
    ).toBe(false)
  })
})
