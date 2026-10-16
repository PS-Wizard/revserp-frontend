import { describe, expect, test, afterEach } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { LocationMapsCompetitorsPage } from "~/components/locations/location-maps-competitors-page"
import { LocationWorkspaceProvider } from "~/lib/location-workspace"
import type { LocalSeoLocation } from "~/lib/local-seo-api"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  fetchCalls.length = 0
  document.body.innerHTML = ""
})

const PROJECT = "p-1"
const LOCATION = "l-1"

const RECORDS = [
  {
    id: "q-1",
    text: "coffee",
    ordinal: 0,
    enabled: true,
    kind: "map",
    source: "generated",
    origin: "service",
    landmark_id: null,
  },
]

function installFetch() {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })
    if (url.endsWith("/maps-queries/status")) {
      return Response.json({ status: "idle" })
    }
    if (url.endsWith(`/locations/${LOCATION}/queries`)) {
      if (method === "PUT") {
        const drafts = body as Array<Record<string, unknown>>
        return Response.json(
          drafts.map((draft, index) => ({
            id: draft.id ?? `q-new-${index}`,
            text: draft.text,
            ordinal: index,
            enabled: draft.enabled,
            kind: draft.kind,
            source: draft.source,
            origin: "service",
            landmark_id: null,
          }))
        )
      }
      return Response.json(RECORDS)
    }
    if (url.endsWith(`/locations/${LOCATION}`)) {
      return Response.json({
        id: LOCATION,
        project_id: PROJECT,
        name: "Roastery",
        place_id: "ChIJ1",
        address: "Main St",
        locality: "Downtown",
        localities: [],
        services: [],
        latitude: 27.7,
        longitude: 85.3,
        radius_m: 5000,
        queries: [
          {
            id: "q-1",
            text: "coffee",
            ordinal: 0,
            enabled: true,
            kind: "map",
            source: "generated",
            origin: "service",
            landmark_id: null,
          },
        ],
      })
    }
    if (url.includes("/runs/latest")) {
      return Response.json({
        id: "run-1",
        location_id: LOCATION,
        status: "completed",
        radius_m: 5000,
        expected_credits: 27,
        credits_used: 27,
        retry_credits: 0,
        queries: ["coffee"],
        cells: [],
      })
    }
    if (url.includes("/runs?")) {
      return Response.json({ total: 0, runs: [] })
    }
    if (url.includes("/maps-budget")) {
      return Response.json({
        remaining_credits: 500,
        reserved_credits: 0,
        spent_credits: 0,
        available_credits: 365,
      })
    }
    if (url.includes("/competitors")) {
      return Response.json({
        run_id: "run-1",
        target_place_id: "ChIJ1",
        queries: ["coffee"],
        point_index: null,
        total_query_points: 0,
        contributing_query_points: 0,
        failed_query_points: 0,
        pending_query_points: 0,
        unreadable_query_points: 0,
        idless_entries: 0,
        competitors: [],
      })
    }
    throw new Error(`unexpected ${method} ${url}`)
  }) as typeof fetch
}

function setInputValue(input: HTMLInputElement, value: string) {
  // Repo happy-dom convention: React onChange fires via the keydown path.
  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
}

async function waitFor(predicate: (host: HTMLElement) => boolean) {
  for (let attempt = 0; attempt < 60; attempt++) {
    let done = false
    await act(async () => {
      await flushTestDom()
      done = predicate(document.body as unknown as HTMLElement)
    })
    if (done) return
  }
  throw new Error("timed out waiting for maps page content")
}

function startButton(host: HTMLElement) {
  return [...host.querySelectorAll("button")].find((entry) =>
    entry.textContent?.includes("Start run")
  ) as HTMLButtonElement | undefined
}

describe("maps page query run gate", () => {
  test("editing queries blocks Start until saved", async () => {
    installFetch()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <LocationWorkspaceProvider
              workspace={{
                projectId: PROJECT,
                location: { id: LOCATION } as LocalSeoLocation,
                canManage: true,
                websiteScope: null,
                websiteScopeRevisions: [],
              }}
            >
              <LocationMapsCompetitorsPage
                projectId={PROJECT}
                locationId={LOCATION}
              />
            </LocationWorkspaceProvider>
          </QueryClientProvider>
        )
        await flushTestDom()
      })
      // Query preparation initially blocks the paid run; the panel clears
      // it once the saved records load.
      await waitFor(
        () => startButton(host) !== undefined && !startButton(host)!.disabled
      )
      const inputs = [
        ...host.querySelectorAll('input[aria-label="Map query text"]'),
      ] as HTMLInputElement[]
      expect(inputs.length).toBe(1)
      await act(async () => {
        setInputValue(inputs[0]!, "coffee roastery")
        await flushTestDom()
      })
      await waitFor(
        () =>
          startButton(host) !== undefined && startButton(host)!.disabled
      )
      expect(host.innerHTML).toContain("Save query changes")
      await act(async () => {
        const save = [...host.querySelectorAll("button")].find((entry) =>
          entry.textContent?.includes("Save queries")
        )
        save?.click()
        await flushTestDom()
      })
      await waitFor(
        () => startButton(host) !== undefined && !startButton(host)!.disabled
      )
      const put = fetchCalls.find(
        (call) => call.method === "PUT" && call.url.endsWith("/queries")
      )
      const drafts = put?.body as Array<Record<string, unknown>>
      expect(drafts.length).toBe(1)
      expect(drafts[0]?.id).toBe("q-1")
      expect(drafts[0]?.text).toBe("coffee roastery")
      expect(host.innerHTML.includes("Save query changes")).toBe(false)
    } finally {
      await act(async () => {
        root.unmount()
      })
      client.clear()
    }
  })
})
