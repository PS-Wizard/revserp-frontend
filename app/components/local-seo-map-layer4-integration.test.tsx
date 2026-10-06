import { afterEach, describe, expect, mock, test } from "bun:test"

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import type {
  LocalSeoLocation,
  LocalSeoLocationQueryRecord,
  LocalSeoLocationServices,
  LocalSeoMapsBudget,
} from "~/lib/local-seo-api"

installTestDom()

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// The page and its map import maplibre-gl; a stub keeps the DOM map inert while
// the tab, services, and generation wiring under test stays real.
mock.module("maplibre-gl", () => ({
  Map: class {},
  Marker: class {
    setLngLat() {
      return this
    }
    addTo() {
      return this
    }
    remove() {}
  },
  AttributionControl: class {},
  NavigationControl: class {},
  ScaleControl: class {},
}))
mock.module("maplibre-gl/dist/maplibre-gl.css", () => ({}))

const { LocalSeoMapPage } = await import("~/components/local-seo-map-page")

const PROJECT = "proj-1"

function makeLocation(
  overrides: Partial<LocalSeoLocation> = {}
): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: PROJECT,
    name: "Roastery",
    place_id: "ChIJ1",
    address: "Main St",
    locality: "Downtown",
    localities: [],
    services: [],
    latitude: 27.7,
    longitude: 85.3,
    queries: [mapQuery("saved-a"), mapQuery("saved-b")],
    ...overrides,
  }
}

function mapQuery(
  text: string,
  overrides: Partial<LocalSeoLocationQueryRecord> = {}
): LocalSeoLocationQueryRecord {
  return {
    id: `q-${text}`,
    text,
    ordinal: 0,
    enabled: true,
    kind: "map",
    source: "manual",
    origin: "service",
    landmark_id: null,
    ...overrides,
  }
}

function makeServices(
  overrides: Partial<LocalSeoLocationServices> = {}
): LocalSeoLocationServices {
  return {
    effective: ["Saved A", "Saved B"],
    project: [],
    location_only: [],
    ...overrides,
  }
}

const BUDGET: LocalSeoMapsBudget = {
  remaining_credits: 500,
  reserved_credits: 0,
  spent_credits: 0,
  available_credits: 365,
}

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const realFetch = globalThis.fetch

async function installFetch(options: {
  location?: LocalSeoLocation
  services?: LocalSeoLocationServices
  servicesStatus?: number
}) {
  const location = options.location ?? makeLocation()
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })

    if (url.includes("/locations/queries/generate") && method === "POST") {
      return Response.json({ queries: ["generated-1"] })
    }
    if (url.includes("/runs/latest")) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })
    }
    if (url.includes("/listing-lookups/latest")) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })
    }
    if (url.includes("/maps-budget")) {
      return Response.json(BUDGET)
    }
    if (url.endsWith("/services")) {
      if (/\/locations\/[^/]+\/services$/.test(url)) {
        if (options.servicesStatus) {
          return new Response(
            JSON.stringify({ error: "services unavailable" }),
            { status: options.servicesStatus }
          )
        }
        return Response.json(options.services ?? makeServices())
      }
      return Response.json([])
    }
    if (url.endsWith("/locations")) {
      return Response.json([location])
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }) as typeof fetch
}

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  globalThis.fetch = realFetch
  fetchCalls.length = 0
  document.body.innerHTML = ""
})

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

function buttonByText(scope: ParentNode, text: string) {
  const found = [...scope.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text)
  )
  if (!found) throw new Error(`button "${text}" not found`)
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

async function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <LocalSeoMapPage projectId={PROJECT} />
      </QueryClientProvider>
    )
    await flushTestDom()
    await flushTestDom()
    await flushTestDom()
  })
  return client
}

// Selection and the active tab are page-internal state, so the tabs can only be
// reached by driving the real sidebar and Tabs triggers.
async function selectLocation() {
  await flushUntil(() => host?.textContent?.includes("Roastery") ?? false)
  await act(async () => {
    press(buttonByText(host!, "Roastery"))
    await flushTestDom()
    await flushTestDom()
  })
}

async function switchTab(label: string) {
  const detail = host!.querySelector("#local-seo-map-detail")!
  const tab = [...detail.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label
  )
  await act(async () => {
    press(tab)
    await flushTestDom()
    await flushTestDom()
  })
  return host!.querySelector("#local-seo-map-detail") as HTMLElement
}

async function openTab(label: string) {
  await selectLocation()
  return switchTab(label)
}

describe("map detail tabs reach the staged components", () => {
  test("queries tab renders the services editor above the legacy setup", async () => {
    await installFetch({
      services: makeServices({ effective: ["Saved A", "Saved B"] }),
    })
    await mountPage()
    const detail = await openTab("Queries")

    await flushUntil(() =>
      (detail.textContent ?? "").includes("Saved services")
    )
    const savedList = detail.querySelector(
      'ul[aria-label="Saved services for this location"]'
    )!
    expect(
      [...savedList.querySelectorAll("li")].map((li) => li.textContent)
    ).toEqual(["Saved A", "Saved B"])
    expect(detail.textContent).toContain("Save location services")
    expect(detail.textContent).toContain("Generate queries · Free")
  })

  test("run tab renders the run controls, not the frozen report placeholder", async () => {
    await installFetch({})
    await mountPage()
    const detail = await openTab("Run")

    expect(
      detail.querySelector('section[aria-label="Local SEO run controls"]') !==
        null
    ).toBe(true)
    expect(detail.textContent).toContain("Next run")
    expect(detail.textContent).toContain("Start run · 54 credits")
  })
})

describe("generation payload", () => {
  async function generateFromQueriesTab() {
    const detail = await openTab("Queries")
    await flushUntil(() =>
      (detail.textContent ?? "").includes("Generate queries")
    )
    const button = buttonByText(detail, "Generate queries")
    await act(async () => {
      press(button)
      await flushTestDom()
      await flushTestDom()
    })
    return fetchCalls.find(
      (call) => call.method === "POST" && call.url.includes("/queries/generate")
    )
  }

  test("uses the location's saved effective services, not the manual field", async () => {
    await installFetch({
      location: makeLocation({ services: ["Saved B", "Saved A"] }),
      services: makeServices({
        effective: ["Saved B", "Saved A"],
        project: [],
      }),
    })
    await mountPage()
    const post = await generateFromQueriesTab()
    expect(post?.body).toEqual({
      service: "",
      services: ["Saved B", "Saved A"],
      locality: "Downtown",
      localities: [],
    })
  })

  test("an empty saved-services list blocks generation with Business profile guidance", async () => {
    await installFetch({ location: makeLocation({ services: [] }) })
    await mountPage()
    const detail = await openTab("Queries")
    await flushUntil(() =>
      (detail.textContent ?? "").includes("Generate queries")
    )
    const button = buttonByText(detail, "Generate queries")
    expect(button.disabled).toBe(true)
    expect(detail.textContent).toContain("No saved services for this location yet")
    await act(async () => {
      press(button)
      await flushTestDom()
    })
    expect(
      fetchCalls.some(
        (call) =>
          call.method === "POST" && call.url.includes("/queries/generate")
      )
    ).toBe(false)
  })
})

describe("run pricing reads saved queries, not the drafts", () => {
  test("an unsaved draft edit does not change the 9*N*3 cost", async () => {
    await installFetch({ services: makeServices({ effective: [] }) })
    await mountPage()
    const queriesDetail = await openTab("Queries")
    await flushUntil(
      () =>
        queriesDetail.querySelector('button[aria-label="Remove query 1"]') !==
        null
    )
    const remove = queriesDetail.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove query 1"]'
    )!
    await act(async () => {
      press(remove)
      await flushTestDom()
    })
    const runDetail = await switchTab("Run")
    expect(runDetail.textContent).toContain("Saved queries: saved-a · saved-b")
    expect(runDetail.textContent).toContain("Start run · 54 credits")
  })
})
