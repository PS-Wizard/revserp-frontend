import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter, useLocation } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { mockAlertDialog } from "~/lib/alert-dialog-test-mock"
import { LocationCreateWizard } from "~/components/locations/location-create-dialog"
import type {
  LocalSeoListingCandidate,
  LocalSeoLocation,
} from "~/lib/local-seo-api"

installTestDom()

// base-ui detects `document` at module load, so the DOM must exist before the
// component (and its alert-dialog dependency) is imported.
mockAlertDialog()

const { LocationListView } = await import(
  "~/components/locations/location-list-view"
)

const PROJECT = "proj-1"

type FetchCall = { url: string; method: string; body: unknown }
const calls: FetchCall[] = []
/** Locations a successful DELETE removed; the list read reflects them. */
const deletedIds = new Set<string>()
let fetchBefore: typeof fetch | null = null

type Handlers = {
  list?: () => LocalSeoLocation[]
  listStatus?: number
  delStatus?: number
  delError?: string
  search?: () => { candidates: LocalSeoListingCandidate[]; id: string }
  searchStatus?: number
  bound?: () => LocalSeoLocation
  boundStatus?: number
}

function installFetch(handlers: Handlers) {
  fetchBefore = globalThis.fetch
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    calls.push({ url, method, body })

    if (method === "GET" && url.endsWith(`/projects/${PROJECT}/locations`)) {
      if (handlers.listStatus) {
        return new Response(JSON.stringify({ error: "list unavailable" }), {
          status: handlers.listStatus,
        })
      }
      return Response.json(
        (handlers.list?.() ?? []).filter(
          (location) => !deletedIds.has(location.id)
        )
      )
    }
    if (method === "POST" && url.includes("/location-listing-search")) {
      if (handlers.searchStatus) {
        return new Response(JSON.stringify({ error: "search failed" }), {
          status: handlers.searchStatus,
        })
      }
      const result = handlers.search?.() ?? { id: "search-1", candidates: [] }
      return Response.json({ ...result, expected_credits: 0 })
    }
    if (
      method === "POST" &&
      url.endsWith(`/projects/${PROJECT}/locations/bound`)
    ) {
      if (handlers.boundStatus) {
        return new Response(JSON.stringify({ error: "create failed" }), {
          status: handlers.boundStatus,
        })
      }
      return Response.json(handlers.bound?.() ?? makeLocation())
    }
    if (method === "DELETE" && url.includes(`/projects/${PROJECT}/locations/`)) {
      if (handlers.delStatus) {
        return new Response(
          JSON.stringify({ error: handlers.delError ?? "delete failed" }),
          {
            status: handlers.delStatus,
          }
        )
      }
      deletedIds.add(url.split("/").pop() ?? "")
      return new Response(null, { status: 204 })
    }
    throw new Error(`unexpected ${method} ${url}`)
  }) as typeof fetch
}

function makeLocation(
  overrides: Partial<LocalSeoLocation> = {}
): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: PROJECT,
    name: "Main Street Cafe",
    place_id: "ChIJ1",
    address: "Main Street 1",
    locality: "Downtown",
    localities: [],
    services: [],
    latitude: 27.71,
    longitude: 85.33,
    queries: [],
    ...overrides,
  }
}

function makeCandidate(
  overrides: Partial<LocalSeoListingCandidate> = {}
): LocalSeoListingCandidate {
  return {
    place_id: "ChIJ-1",
    title: "Cafe One",
    address: "1 Cafe Road",
    latitude: 27.71,
    longitude: 85.33,
    ...overrides,
  }
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let client: QueryClient

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
}

async function flushQuietTicks() {
  for (let index = 0; index < 3; index++) {
    await act(async () => {
      await flushTestDom()
    })
  }
}

async function mount(node: React.ReactNode) {
  client = newClient()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    )
  })
  await flushQuietTicks()
}

const seenPaths: string[] = []

function NavProbe() {
  const location = useLocation()
  seenPaths.push(`${location.pathname}${location.search}${location.hash}`)
  return null
}

async function renderList(
  handlers: Handlers,
  options: { canManage?: boolean } = {}
) {
  installFetch(handlers)
  await mount(
    <MemoryRouter initialEntries={[`/app/projects/${PROJECT}/locations`]}>
      <NavProbe />
      <LocationListView canManage={options.canManage} projectId={PROJECT} />
    </MemoryRouter>
  )
}

async function renderWizard(
  handlers: Handlers,
  sink: { created: LocalSeoLocation[]; cancelled: number },
  parentWebsiteUrl?: string | null
) {
  installFetch(handlers)
  await mount(
    <LocationCreateWizard
      parentWebsiteUrl={parentWebsiteUrl}
      projectId={PROJECT}
      onCancel={() => {
        sink.cancelled += 1
      }}
      onCreated={(location) => sink.created.push(location)}
    />
  )
}

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  if (fetchBefore) globalThis.fetch = fetchBefore
  fetchBefore = null
  calls.length = 0
  deletedIds.clear()
  seenPaths.length = 0
  document.body.innerHTML = ""
})

function text() {
  return host?.textContent ?? ""
}

function posts(path: string) {
  return calls.filter(
    (call) => call.method === "POST" && call.url.includes(path)
  )
}

/** The legacy unbound-create endpoint; a mount or search must never hit it. */
function draftCreates() {
  return calls.filter(
    (call) =>
      call.method === "POST" &&
      call.url.endsWith(`/projects/${PROJECT}/locations`)
  )
}

function buttonByText(label: string) {
  const found = [...(host?.querySelectorAll("button") ?? [])].find((button) =>
    button.textContent?.includes(label)
  )
  if (!found) throw new Error(`button "${label}" not found`)
  return found as HTMLButtonElement
}

function setInputValue(input: HTMLInputElement, value: string) {
  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
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

async function searchFor(term: string) {
  const input = host!.querySelector<HTMLInputElement>("#location-search-query")!
  await act(async () => {
    setInputValue(input, term)
    await flushTestDom()
  })
  await act(async () => {
    buttonByText("Search Google Maps").click()
    await flushTestDom()
    await flushTestDom()
  })
}

/** Search, pick the only candidate, then land on the radius step. */
async function advanceToListingSelection() {
  await searchFor("Main Street Cafe")
  await flushUntil(() => text().includes("Cafe One"))
  await act(async () => {
    host!
      .querySelector<HTMLInputElement>('input[name="location-listing"]')!
      .click()
    await flushTestDom()
  })
  await act(async () => {
    buttonByText("Next").click()
    await flushTestDom()
  })
  await flushUntil(
    () => host!.querySelector("#location-create-radius") !== null
  )
}

describe("location list view", () => {
  test("mounts with one listing GET and links each card to the scoped shell", async () => {
    await renderList({ list: () => [makeLocation()] })

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("GET")
    expect(draftCreates()).toHaveLength(0)
    expect(text()).toContain("Main Street Cafe")
    expect(text()).toContain("Listing verified")
    expect(posts("/locations/bound")).toHaveLength(0)

    const link = host!.querySelector<HTMLAnchorElement>(
      'a[aria-label="Open Main Street Cafe"]'
    )
    expect(link?.getAttribute("href")).toBe(
      `/app?project=${PROJECT}&location=loc-1`
    )
  })

  test("an unbound location is labelled as needing a listing", async () => {
    await renderList({ list: () => [makeLocation({ place_id: null })] })

    expect(text()).toContain("Listing needed")
    expect(text().includes("Listing verified")).toBe(false)
  })

  test("empty project shows an invitation instead of inventing locations", async () => {
    await renderList({ list: () => [] })

    expect(text()).toContain("No locations")
    expect(posts("/locations/bound")).toHaveLength(0)
  })

  test("a listing read failure is reported without creating anything", async () => {
    await renderList({ listStatus: 500 })

    await flushUntil(() => text().includes("Locations unavailable"))
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0)
  })
})

describe("location create wizard", () => {
  test("search, choose, radius, then one atomic bound create", async () => {
    const sink = { created: [] as LocalSeoLocation[], cancelled: 0 }
    await renderWizard(
      {
        search: () => ({ id: "search-1", candidates: [makeCandidate()] }),
        bound: () => makeLocation({ id: "loc-2", name: "Cafe One" }),
      },
      sink
    )

    await searchFor("  Main Street Cafe  ")

    // The user's term is trimmed and there is still no location row.
    expect(posts("/location-listing-search")).toHaveLength(1)
    expect(posts("/location-listing-search")[0].body).toEqual({
      query: "Main Street Cafe",
    })
    expect(posts("/locations/bound")).toHaveLength(0)
    expect(draftCreates()).toHaveLength(0)

    await flushUntil(() => text().includes("Cafe One"))
    await act(async () => {
      host!
        .querySelector<HTMLInputElement>('input[name="location-listing"]')!
        .click()
      await flushTestDom()
    })
    await act(async () => {
      buttonByText("Next").click()
      await flushTestDom()
    })

    await flushUntil(
      () => host!.querySelector("#location-create-radius") !== null
    )
    await act(async () => {
      setInputValue(
        host!.querySelector<HTMLInputElement>("#location-create-radius")!,
        "3000"
      )
      await flushTestDom()
    })
    await act(async () => {
      buttonByText("Next").click()
      await flushTestDom()
    })
    await flushUntil(() => text().includes("Website scope"))
    // The wizard always submits a scope; the default is an explicit none.
    expect(host!.querySelector("#location-create-scope-url")).toBeNull()
    await act(async () => {
      buttonByText("Create location").click()
      await flushTestDom()
      await flushTestDom()
    })

    await flushUntil(() => sink.created.length === 1)
    const bound = posts("/locations/bound")
    expect(bound).toHaveLength(1)
    expect(bound[0].body).toEqual({
      search_id: "search-1",
      place_id: "ChIJ-1",
      radius_m: 3000,
      website_scope: { match: "none", url: null },
    })
    expect(sink.created[0].id).toBe("loc-2")
    expect(sink.cancelled).toBe(0)
  })

  test("a search with no candidates stays on the search step", async () => {
    const sink = { created: [] as LocalSeoLocation[], cancelled: 0 }
    await renderWizard(
      { search: () => ({ id: "search-1", candidates: [] }) },
      sink
    )

    await searchFor("Nowhere Cafe")
    await flushUntil(() => text().includes("No Google Maps listing matched"))

    expect(host!.querySelector("#location-search-query") !== null).toBe(true)
    expect(posts("/locations/bound")).toHaveLength(0)
  })

  test("a listing-search failure is reported without creating anything", async () => {
    const sink = { created: [] as LocalSeoLocation[], cancelled: 0 }
    await renderWizard({ searchStatus: 502 }, sink)

    await searchFor("Main Street Cafe")
    await flushUntil(() => text().includes("search failed"))

    expect(posts("/locations/bound")).toHaveLength(0)
  })

  test("cancelling never saves a draft location", async () => {
    const sink = { created: [] as LocalSeoLocation[], cancelled: 0 }
    await renderWizard(
      { search: () => ({ id: "search-1", candidates: [makeCandidate()] }) },
      sink
    )

    await searchFor("Main Street Cafe")
    await flushUntil(() => text().includes("Choose listing"))
    await act(async () => {
      buttonByText("Cancel").click()
      await flushTestDom()
    })

    expect(sink.cancelled).toBe(1)
    expect(posts("/locations/bound")).toHaveLength(0)
    expect(sink.created).toHaveLength(0)
  })

  test("a failed save shows the error and keeps the wizard open", async () => {
    const sink = { created: [] as LocalSeoLocation[], cancelled: 0 }
    await renderWizard(
      {
        search: () => ({ id: "search-1", candidates: [makeCandidate()] }),
        boundStatus: 409,
      },
      sink
    )

    await searchFor("Main Street Cafe")
    await flushUntil(() => text().includes("Cafe One"))
    await act(async () => {
      host!
        .querySelector<HTMLInputElement>('input[name="location-listing"]')!
        .click()
      await flushTestDom()
    })
    await act(async () => {
      buttonByText("Next").click()
      await flushTestDom()
    })
    await act(async () => {
      buttonByText("Next").click()
      await flushTestDom()
    })
    await act(async () => {
      buttonByText("Create location").click()
      await flushTestDom()
      await flushTestDom()
    })

    await flushUntil(() => text().includes("create failed"))
    expect(host!.querySelector('[aria-label="Scope type"]') !== null).toBe(true)
    expect(sink.created).toHaveLength(0)
    expect(posts("/locations/bound")).toHaveLength(1)
  })
})

test("an exact website scope is submitted with the bound create", async () => {
  const sink = { created: [] as LocalSeoLocation[], cancelled: 0 }
  await renderWizard(
    {
      search: () => ({ id: "search-1", candidates: [makeCandidate()] }),
      bound: () => makeLocation({ id: "loc-2" }),
    },
    sink
  )

  await advanceToListingSelection()
  await act(async () => {
    buttonByText("Next").click()
    await flushTestDom()
  })
  await act(async () => {
    host!.querySelector<HTMLInputElement>('input[value="exact"]')!.click()
    await flushTestDom()
  })
  await flushUntil(
    () => host!.querySelector("#location-create-scope-url") !== null
  )
  await act(async () => {
    setInputValue(
      host!.querySelector<HTMLInputElement>("#location-create-scope-url")!,
      "https://local-visibility.example/about/"
    )
    await flushTestDom()
  })
  await act(async () => {
    buttonByText("Create location").click()
    await flushTestDom()
    await flushTestDom()
  })

  await flushUntil(() => sink.created.length === 1)
  expect(posts("/locations/bound")[0].body).toEqual({
    search_id: "search-1",
    place_id: "ChIJ-1",
    radius_m: 5000,
    website_scope: {
      match: "exact",
      url: "https://local-visibility.example/about/",
    },
  })
})

test("an invalid scope url blocks Create and never posts", async () => {
  const sink = { created: [] as LocalSeoLocation[], cancelled: 0 }
  await renderWizard(
    { search: () => ({ id: "search-1", candidates: [makeCandidate()] }) },
    sink
  )

  await advanceToListingSelection()
  await act(async () => {
    buttonByText("Next").click()
    await flushTestDom()
  })
  await act(async () => {
    host!.querySelector<HTMLInputElement>('input[value="subtree"]')!.click()
    await flushTestDom()
  })
  await flushUntil(
    () => host!.querySelector("#location-create-scope-url") !== null
  )
  await act(async () => {
    setInputValue(
      host!.querySelector<HTMLInputElement>("#location-create-scope-url")!,
      "example.com/about"
    )
    await flushTestDom()
  })

  expect(buttonByText("Create location").disabled).toBe(true)
  expect(text()).toContain("absolute URL")
  expect(posts("/locations/bound")).toHaveLength(0)
  expect(sink.created).toHaveLength(0)
})

test("long English and Nepali titles wrap instead of overflowing", async () => {
  const longTitle =
    "अत्यन्त लामो नाम भएको स्थानीय व्यवसाय शाखा The Extremely Long Local Business Branch Name"
  const sink = { created: [] as LocalSeoLocation[], cancelled: 0 }
  await renderWizard(
    {
      search: () => ({
        id: "search-1",
        candidates: [makeCandidate({ title: longTitle })],
      }),
    },
    sink
  )

  await searchFor("Long name")
  await flushUntil(() => text().includes(longTitle))
  const titleSpan = [...host!.querySelectorAll("span")].find(
    (span) => span.textContent === longTitle
  )
  expect(titleSpan !== undefined).toBe(true)
  expect(titleSpan?.className).toContain("break-words")
})

test("a foreign scope warns and blocks Create when the parent origin is known", async () => {
  const sink = { created: [] as LocalSeoLocation[], cancelled: 0 }
  await renderWizard(
    { search: () => ({ id: "search-1", candidates: [makeCandidate()] }) },
    sink,
    "https://local-visibility.example/"
  )

  await advanceToListingSelection()
  await act(async () => {
    buttonByText("Next").click()
    await flushTestDom()
  })
  await act(async () => {
    host!.querySelector<HTMLInputElement>('input[value="exact"]')!.click()
    await flushTestDom()
  })
  await flushUntil(
    () => host!.querySelector("#location-create-scope-url") !== null
  )
  await act(async () => {
    setInputValue(
      host!.querySelector<HTMLInputElement>("#location-create-scope-url")!,
      "https://foreign.example/about"
    )
    await flushTestDom()
  })

  expect(text()).toContain("outside the parent website")
  expect(buttonByText("Create location").disabled).toBe(true)
  expect(posts("/locations/bound")).toHaveLength(0)
  expect(sink.created).toHaveLength(0)
})
describe("location delete", () => {
  const DELETE_PATH = `/projects/${PROJECT}/locations/loc-1`

  function trashButton() {
    const found = host?.querySelector(
      'button[aria-label="Delete location Main Street Cafe"]'
    )
    if (!found) throw new Error("delete button not found")
    return found as HTMLButtonElement
  }

  function dialogButton(label: string) {
    const found = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === label
    )
    if (!found) throw new Error(`dialog button "${label}" not found`)
    return found as HTMLButtonElement
  }

  function deletes() {
    return calls.filter(
      (call) => call.method === "DELETE" && call.url.includes(DELETE_PATH)
    )
  }

  async function openDeleteDialog() {
    await act(async () => {
      trashButton().click()
      await flushTestDom()
    })
    await flushUntil(
      () =>
        document.body.textContent?.includes("Delete Main Street Cafe?") ??
        false
    )
  }

  test("members never see the trash affordance", async () => {
    await renderList({ list: () => [makeLocation()] })

    expect(
      host?.querySelector('button[aria-label^="Delete location"]')
    ).toBeNull()
    const link = host!.querySelector<HTMLAnchorElement>(
      'a[aria-label="Open Main Street Cafe"]'
    )
    expect(link?.getAttribute("href")).toBe(
      `/app?project=${PROJECT}&location=loc-1`
    )
  })

  test("managers see trash beside the open link, never nested inside one", async () => {
    await renderList({ list: () => [makeLocation()] }, { canManage: true })

    const trash = trashButton()
    expect(trash.closest("a")).toBeNull()
    expect(trash.nextElementSibling?.tagName.toLowerCase()).toBe("a")
  })

  test("requesting delete confirms without a request or navigation", async () => {
    await renderList({ list: () => [makeLocation()] }, { canManage: true })
    const before = seenPaths.at(-1)

    await openDeleteDialog()

    expect(deletes()).toHaveLength(0)
    expect(seenPaths.at(-1)).toBe(before)
    expect(document.body.textContent).toContain("saved Maps results")
    expect(document.body.textContent).toContain("AI chat history")
  })

  test("cancel closes without a request", async () => {
    await renderList({ list: () => [makeLocation()] }, { canManage: true })

    await openDeleteDialog()
    await act(async () => {
      dialogButton("Keep location").click()
      await flushTestDom()
    })
    await flushUntil(
      () =>
        !(document.body.textContent?.includes("Delete Main Street Cafe?") ??
        false)
    )

    expect(deletes()).toHaveLength(0)
    expect(text()).toContain("Main Street Cafe")
  })

  test("confirm deletes once, drops the card, and stays put", async () => {
    await renderList({ list: () => [makeLocation()] }, { canManage: true })
    const before = seenPaths.at(-1)

    await openDeleteDialog()
    await act(async () => {
      dialogButton("Delete location").click()
      dialogButton("Delete location").click()
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(() => !text().includes("Main Street Cafe"))

    expect(deletes()).toHaveLength(1)
    expect(seenPaths.at(-1)).toBe(before)
  })

  test("a 409 surfaces the message and retains the card", async () => {
    await renderList(
      {
        list: () => [makeLocation()],
        delStatus: 409,
        delError: "this location has AI audit history and cannot be deleted",
      },
      { canManage: true }
    )

    await openDeleteDialog()
    await act(async () => {
      dialogButton("Delete location").click()
      await flushTestDom()
      await flushTestDom()
    })
    await flushUntil(
      () =>
        document.body.textContent?.includes("AI audit history") ?? false
    )

    expect(deletes()).toHaveLength(1)
    expect(text()).toContain("Main Street Cafe")
    expect(document.body.textContent).toContain("Delete Main Street Cafe?")
  })
})
