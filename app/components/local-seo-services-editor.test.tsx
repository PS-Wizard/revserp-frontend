import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import {
  LocalSeoServicesEditor,
  buildLocalSeoServicesOverrides,
  seedLocalSeoServicesDraft,
} from "~/components/local-seo-services-editor"
import { BusinessProfileServicesEditor } from "~/components/business-profile-services-editor"
import {
  localSeoLocationServicesQueryKey,
  localSeoProjectServicesQueryKey,
  type LocalSeoLocationServices,
  type LocalSeoProjectService,
} from "~/lib/local-seo-api"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

function makeServices(
  overrides: Partial<LocalSeoLocationServices> = {}
): LocalSeoLocationServices {
  return {
    effective: [],
    project: [],
    location_only: [],
    ...overrides,
  }
}

function renderEditor(
  projectId: string,
  locationId: string,
  seed: {
    location?: LocalSeoLocationServices
    project?: LocalSeoProjectService[]
  } = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  if (seed.location) {
    client.setQueryData(
      localSeoLocationServicesQueryKey(projectId, locationId),
      seed.location
    )
  }
  if (seed.project) {
    client.setQueryData(
      localSeoProjectServicesQueryKey(projectId),
      seed.project
    )
  }
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LocalSeoServicesEditor projectId={projectId} locationId={locationId} />
      </QueryClientProvider>
    )
  } finally {
    client.clear()
  }
}

async function renderEditorWithError(
  projectId: string,
  locationId: string,
  error: Error
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  })
  await client
    .fetchQuery({
      queryKey: localSeoLocationServicesQueryKey(projectId, locationId),
      queryFn: () => {
        throw error
      },
    })
    .catch(() => undefined)
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LocalSeoServicesEditor projectId={projectId} locationId={locationId} />
      </QueryClientProvider>
    )
  } finally {
    client.clear()
  }
}

describe("local seo services overrides", () => {
  test("drafts excluded ids and location-only labels from the server list", () => {
    const draft = seedLocalSeoServicesDraft(
      makeServices({
        project: [
          { id: "svc-1", label: "Coffee", excluded: false },
          { id: "svc-2", label: "Tea", excluded: true },
        ],
        location_only: ["Catering"],
      })
    )
    expect(draft).toEqual({ excludedIds: ["svc-2"], localOnly: ["Catering"] })
  })

  test("sends excluded project ids plus local-only includes, no redundant includes", () => {
    expect(
      buildLocalSeoServicesOverrides({
        excludedIds: ["svc-2"],
        localOnly: ["Catering"],
      })
    ).toEqual([
      { service_id: "svc-2", service_label: null, mode: "exclude" },
      { service_id: null, service_label: "Catering", mode: "include" },
    ])
  })

  test("an untouched draft is an empty full replace", () => {
    expect(
      buildLocalSeoServicesOverrides({ excludedIds: [], localOnly: [] })
    ).toEqual([])
  })
})

describe("local seo services editor rendering", () => {
  test("renders the server's effective list verbatim, plus toggles and local-only drafts", () => {
    const html = renderEditor("proj-1", "loc-1", {
      location: makeServices({
        effective: ["Coffee", "Espresso Bar"],
        project: [
          { id: "svc-1", label: "Coffee", excluded: false },
          { id: "svc-2", label: "Tea", excluded: true },
        ],
        location_only: ["Catering"],
      }),
      project: [
        { id: "svc-1", label: "Coffee" },
        { id: "svc-2", label: "Tea" },
      ],
    })
    expect(html).toContain("Saved services")
    expect(html).toContain("Espresso Bar")
    expect(html).toContain('aria-label="Saved services for this location"')
    expect(html).toContain('aria-label="Include Coffee for this location"')
    expect(html).toContain('aria-label="Include Tea for this location"')
    expect(html).toContain('aria-label="Remove local-only service Catering"')
    expect(html).toContain("Local only")
    expect(html).toContain("Save location services")
    expect(html).toContain("Enter a label to add a local-only service.")
  })

  test("the selector carries no project catalog CRUD", () => {
    const html = renderEditor("proj-1", "loc-1", {
      location: makeServices({
        effective: ["Coffee"],
        project: [{ id: "svc-1", label: "Coffee", excluded: false }],
      }),
      project: [{ id: "svc-1", label: "Coffee" }],
    })
    expect(html.includes("Project services")).toBe(false)
    expect(html.includes("Add project service")).toBe(false)
    expect(html.includes("Rename project service")).toBe(false)
    expect(html.includes("Delete project service")).toBe(false)
    expect(html.includes("New project service label")).toBe(false)
    expect(html.includes("Applies to all project locations")).toBe(false)
  })

  test("loading shows placeholders and never invents a saved service list", () => {
    const html = renderEditor("proj-1", "loc-1")
    expect(html).toContain('data-slot="skeleton"')
    expect(html).toContain("Saved services")
    expect(html.includes("No services saved for this location yet.")).toBe(
      false
    )
  })

  test("a blank catalog points at Business profile, local-only stays available", () => {
    const html = renderEditor("proj-1", "loc-1", {
      location: makeServices(),
      project: [],
    })
    expect(html).toContain("No services saved for this location yet.")
    expect(html).toContain(
      "Add services in Business profile, then select them here."
    )
    expect(html).toContain("Add local-only service")
  })

  test("a failed services read surfaces the error, not a fallback list", async () => {
    const html = await renderEditorWithError(
      "proj-1",
      "loc-1",
      new Error("services unavailable")
    )
    expect(html).toContain("services unavailable")
    expect(html.includes("No services saved for this location yet.")).toBe(
      false
    )
  })

  test("never touches paid, query-generation, run, or catalog endpoints", async () => {
    const { readFile } = await import("node:fs/promises")
    const source = await readFile(
      new URL("./local-seo-services-editor.tsx", import.meta.url),
      "utf8"
    )
    for (const banned of [
      "createLocalSeoListingLookup",
      "searchLocalSeoAddresses",
      "reverseLocalSeoAddress",
      "generateLocalSeoQueries",
      "createLocalSeoRun",
      "updateLocalSeoLocationQueryRecords",
      "fetchLocalSeoLocationQueryRecords",
      "createLocalSeoProjectService",
      "renameLocalSeoProjectService",
      "deleteLocalSeoProjectService",
      "fetchLocalSeoProjectServices",
    ]) {
      expect(source.includes(banned)).toBe(false)
    }
    expect(source.includes("updateLocalSeoLocationServices")).toBe(true)
  })
})

let root: Root | null = null
let host: HTMLDivElement | null = null
const fetchCalls: Array<{ url: string; method: string; body: unknown }> = []
const realFetch = globalThis.fetch

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
}

function mountEditor(
  client: QueryClient,
  projectId: string,
  locationId: string
) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  renderEditorRoot(client, projectId, locationId)
}

function renderEditorRoot(
  client: QueryClient,
  projectId: string,
  locationId: string
) {
  act(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <LocalSeoServicesEditor projectId={projectId} locationId={locationId} />
      </QueryClientProvider>
    )
  })
}

function includeCheckbox(label: string) {
  return host!.querySelector<HTMLButtonElement>(
    `button[aria-label="Include ${label} for this location"]`
  )!
}

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  globalThis.fetch = realFetch
  fetchCalls.length = 0
})

describe("local seo services editor drafts", () => {
  test("draft toggles reset when the location scope changes", () => {
    const client = makeClient()
    client.setQueryData(
      localSeoLocationServicesQueryKey("proj-1", "loc-a"),
      makeServices({
        effective: ["Coffee"],
        project: [{ id: "svc-coffee", label: "Coffee", excluded: false }],
      })
    )
    client.setQueryData(
      localSeoLocationServicesQueryKey("proj-1", "loc-b"),
      makeServices({
        effective: ["Coffee"],
        project: [{ id: "svc-coffee", label: "Coffee", excluded: false }],
      })
    )

    mountEditor(client, "proj-1", "loc-a")
    expect(includeCheckbox("Coffee").getAttribute("aria-checked")).toBe("true")
    act(() => {
      includeCheckbox("Coffee").click()
    })
    expect(includeCheckbox("Coffee").getAttribute("aria-checked")).toBe("false")
    expect(host!.textContent).toContain("Unsaved changes")

    renderEditorRoot(client, "proj-1", "loc-b")
    expect(includeCheckbox("Coffee").getAttribute("aria-checked")).toBe("true")
    expect(host!.textContent?.includes("Unsaved changes")).toBe(false)
  })

  test("save sends a full replace of excluded ids and preserves local-only", async () => {
    const client = makeClient()
    client.setQueryData(
      localSeoLocationServicesQueryKey("proj-1", "loc-a"),
      makeServices({
        effective: ["Coffee", "Catering"],
        project: [{ id: "svc-coffee", label: "Coffee", excluded: false }],
        location_only: ["Catering"],
      })
    )
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      let body: unknown = null
      if (typeof init?.body === "string") body = JSON.parse(init.body)
      fetchCalls.push({ url, method: init?.method ?? "GET", body })
      return new Response(JSON.stringify(makeServices({ effective: [] })), {
        status: 200,
      })
    }) as typeof fetch

    mountEditor(client, "proj-1", "loc-a")
    act(() => {
      includeCheckbox("Coffee").click()
    })

    const saveButton = Array.from(host!.querySelectorAll("button")).find(
      (button) => button.textContent === "Save location services"
    )!
    await act(async () => {
      saveButton.click()
      await flushTestDom()
    })

    const put = fetchCalls.find((call) => call.method === "PUT")
    expect(put?.body).toEqual({
      overrides: [
        { service_id: "svc-coffee", service_label: null, mode: "exclude" },
        { service_id: null, service_label: "Catering", mode: "include" },
      ],
    })
  })

  test("a successful override save invalidates the Location DTO caches", async () => {
    const client = makeClient()
    client.setQueryData(
      localSeoLocationServicesQueryKey("proj-1", "loc-a"),
      makeServices({
        effective: ["Coffee"],
        project: [{ id: "svc-coffee", label: "Coffee", excluded: false }],
      })
    )
    const invalidations: Array<{ queryKey?: readonly unknown[] }> = []
    client.invalidateQueries = ((filters?: {
      queryKey?: readonly unknown[]
    }) => {
      invalidations.push(filters ?? {})
      return Promise.resolve()
    }) as typeof client.invalidateQueries
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      fetchCalls.push({ url, method: init?.method ?? "GET", body: null })
      return new Response(JSON.stringify(makeServices({ effective: ["Coffee"] })), {
        status: 200,
      })
    }) as typeof fetch

    mountEditor(client, "proj-1", "loc-a")
    act(() => {
      includeCheckbox("Coffee").click()
    })
    const saveButton = Array.from(host!.querySelectorAll("button")).find(
      (button) => button.textContent === "Save location services"
    )!
    await act(async () => {
      saveButton.click()
      await flushTestDom()
    })

    const keys = invalidations.map((filters) => JSON.stringify(filters.queryKey))
    expect(keys).toContain(JSON.stringify(["local-seo-location", "proj-1", "loc-a"]))
    expect(keys).toContain(JSON.stringify(["local-seo-locations", "proj-1"]))
  })

  test("save disables the location services fieldset while pending", async () => {
    const client = makeClient()
    client.setQueryData(
      localSeoLocationServicesQueryKey("proj-1", "loc-a"),
      makeServices({
        effective: ["Coffee"],
        project: [{ id: "svc-coffee", label: "Coffee", excluded: false }],
      })
    )

    let resolvePut: (() => void) | null = null
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      fetchCalls.push({ url, method: init?.method ?? "GET", body: null })
      if (init?.method === "PUT") {
        await new Promise<void>((resolve) => {
          resolvePut = resolve
        })
      }
      return new Response(JSON.stringify(makeServices({ effective: [] })), {
        status: 200,
      })
    }) as typeof fetch

    mountEditor(client, "proj-1", "loc-a")
    act(() => {
      includeCheckbox("Coffee").click()
    })

    const locationFieldSet = host!.querySelectorAll("fieldset")[0]!
    const saveButton = Array.from(host!.querySelectorAll("button")).find(
      (button) => button.textContent === "Save location services"
    )!

    await act(async () => {
      saveButton.click()
      await flushTestDom()
    })

    expect(locationFieldSet.disabled).toBe(true)
    expect(locationFieldSet.getAttribute("aria-busy")).toBe("true")

    await act(async () => {
      resolvePut?.()
      await flushTestDom()
    })

    expect(locationFieldSet.disabled).toBe(false)
    expect(locationFieldSet.getAttribute("aria-busy")).toBe("false")
  })
})

type StatefulServices = {
  project: Array<{ id: string; label: string }>
  excluded: Set<string>
  localOnly: string[]
}

function effectiveServicesOf(state: StatefulServices): string[] {
  return [
    ...state.project
      .filter((service) => !state.excluded.has(service.id))
      .map((service) => service.label),
    ...state.localOnly,
  ]
}

function servicesPayload(state: StatefulServices): LocalSeoLocationServices {
  return {
    effective: effectiveServicesOf(state),
    project: state.project.map((service) => ({
      id: service.id,
      label: service.label,
      excluded: state.excluded.has(service.id),
    })),
    location_only: [...state.localOnly],
  }
}

function installStatefulServicesFetch(state: StatefulServices) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })

    if (/\/locations\/[^/]+\/services$/.test(url)) {
      if (method === "GET") return Response.json(servicesPayload(state))
      if (method === "PUT") {
        const overrides = (
          body as {
            overrides: Array<{
              service_id: string | null
              service_label: string | null
              mode: "include" | "exclude"
            }>
          }
        ).overrides
        state.excluded = new Set(
          overrides
            .filter((override) => override.mode === "exclude")
            .map((override) => override.service_id!)
        )
        state.localOnly = overrides
          .filter((override) => override.mode === "include")
          .map((override) => override.service_label!)
        return Response.json(servicesPayload(state))
      }
    }
    if (url.endsWith("/services") && method === "GET") {
      return Response.json(
        state.project.map((service) => ({
          id: service.id,
          label: service.label,
        }))
      )
    }
    if (url.endsWith("/services") && method === "POST") {
      const label = (body as { label: string }).label
      const created = { id: `svc-${state.project.length + 1}`, label }
      state.project.push(created)
      return Response.json(created)
    }
    // An unmodelled request must fail loudly instead of defaulting.
    throw new Error(`unexpected ${method} ${url}`)
  }) as typeof fetch
}

function setInputValue(input: HTMLInputElement, value: string) {
  // React treats this happy-dom build as lacking input support, so onChange
  // only fires through its keydown polyfill path: focus first, then change value.
  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
}

function clickButtonByText(text: string) {
  const button = Array.from(host!.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text
  )!
  button.click()
}

function savedServiceLabels() {
  return Array.from(
    host!.querySelectorAll(
      'ul[aria-label="Saved services for this location"] li'
    )
  ).map((li) => li.textContent)
}

function mountCatalogEditor(client: QueryClient, projectId: string) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <BusinessProfileServicesEditor projectId={projectId} canManage />
      </QueryClientProvider>
    )
  })
}

async function unmountEditor() {
  await act(async () => root?.unmount())
  root = null
  host?.remove()
  host = null
}

describe("local seo services catalog round trip", () => {
  test("a profile catalog add, a location exclusion, and a local-only service survive reload in order", async () => {
    const state: StatefulServices = {
      project: [
        { id: "svc-1", label: "Coffee" },
        { id: "svc-2", label: "Tea" },
      ],
      excluded: new Set(),
      localOnly: [],
    }
    installStatefulServicesFetch(state)

    // Catalog creation now belongs to the BusinessProfile editor.
    const catalogClient = makeClient()
    mountCatalogEditor(catalogClient, "proj-1")
    await act(async () => {
      await flushTestDom()
      await flushTestDom()
    })
    await act(async () => {
      setInputValue(
        host!.querySelector<HTMLInputElement>(
          'input[aria-label="New service label"]'
        )!,
        "Latte"
      )
      await flushTestDom()
    })
    await act(async () => {
      clickButtonByText("Add service")
      await flushTestDom()
      await flushTestDom()
    })
    expect(state.project.map((service) => service.label)).toEqual([
      "Coffee",
      "Tea",
      "Latte",
    ])
    await unmountEditor()

    // Location selection then deselects and adds local-only, then saves.
    const client = makeClient()
    mountEditor(client, "proj-1", "loc-a")
    await act(async () => {
      await flushTestDom()
      await flushTestDom()
    })
    expect(savedServiceLabels()).toEqual(["Coffee", "Tea", "Latte"])

    // Exclude one existing catalog service.
    await act(async () => {
      includeCheckbox("Coffee").click()
      await flushTestDom()
    })
    expect(includeCheckbox("Coffee").getAttribute("aria-checked")).toBe("false")

    // Add one location-only service and save explicitly.
    await act(async () => {
      setInputValue(
        host!.querySelector<HTMLInputElement>(
          'input[aria-label="New local-only service label"]'
        )!,
        "Catering"
      )
      await flushTestDom()
    })
    await act(async () => {
      clickButtonByText("Add local-only service")
      await flushTestDom()
    })
    await act(async () => {
      clickButtonByText("Save location services")
      await flushTestDom()
      await flushTestDom()
    })

    const saved = client.getQueryData<LocalSeoLocationServices>(
      localSeoLocationServicesQueryKey("proj-1", "loc-a")
    )
    expect(saved?.effective).toEqual(["Tea", "Latte", "Catering"])
    expect(saved?.location_only).toEqual(["Catering"])
    expect(
      saved?.project.find((service) => service.id === "svc-1")?.excluded
    ).toBe(true)
    expect(savedServiceLabels()).toEqual(["Tea", "Latte", "Catering"])

    // Reload with a fresh client against the same stored fake state.
    await unmountEditor()
    const reloadedClient = makeClient()
    mountEditor(reloadedClient, "proj-1", "loc-a")
    await act(async () => {
      await flushTestDom()
      await flushTestDom()
    })

    const reloaded = reloadedClient.getQueryData<LocalSeoLocationServices>(
      localSeoLocationServicesQueryKey("proj-1", "loc-a")
    )
    expect(reloaded?.effective).toEqual(["Tea", "Latte", "Catering"])
    expect(reloaded?.location_only).toEqual(["Catering"])
    expect(
      reloaded?.project.find((service) => service.id === "svc-1")?.excluded
    ).toBe(true)
    expect(savedServiceLabels()).toEqual(["Tea", "Latte", "Catering"])
    expect(includeCheckbox("Coffee").getAttribute("aria-checked")).toBe("false")
    expect(
      host!.querySelector(
        'button[aria-label="Remove local-only service Catering"]'
      ) !== null
    ).toBe(true)

    // None of this may save queries, generate, or enqueue a run.
    expect(
      fetchCalls.some(
        (call) => call.method === "PUT" && call.url.includes("/queries")
      )
    ).toBe(false)
    expect(
      fetchCalls.some(
        (call) =>
          call.method === "POST" && call.url.includes("/queries/generate")
      )
    ).toBe(false)
    expect(
      fetchCalls.some(
        (call) => call.method === "POST" && call.url.endsWith("/runs")
      )
    ).toBe(false)
  })
})

describe("local seo local-only draft entry", () => {
  function mountWithServices() {
    const client = makeClient()
    client.setQueryData(
      localSeoLocationServicesQueryKey("proj-1", "loc-entry"),
      makeServices({
        effective: ["Coffee"],
        project: [{ id: "svc-coffee", label: "Coffee", excluded: false }],
      })
    )
    mountEditor(client, "proj-1", "loc-entry")
    return host!.querySelector<HTMLInputElement>(
      'input[aria-label="New local-only service label"]'
    )!
  }

  function pressEnter(input: HTMLInputElement, composing = false) {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", isComposing: composing, bubbles: true })
    )
  }

  test("Enter adds a draft, clears the field, and drops the pending message", async () => {
    const input = mountWithServices()
    await act(async () => {
      setInputValue(input, "Latte")
      await flushTestDom()
    })
    expect(host!.textContent).toContain("“Latte” is not added yet")
    expect(host!.querySelector('button[aria-label="Remove local-only service Latte"]')).toBeNull()

    await act(async () => {
      pressEnter(input)
      await flushTestDom()
    })
    expect(host!.querySelector('button[aria-label="Remove local-only service Latte"]') !== null).toBe(true)
    expect(input.value).toBe("")
    expect(host!.textContent?.includes("is not added yet")).toBe(false)
  })

  test("Enter during IME composition never adds a draft", async () => {
    const input = mountWithServices()
    await act(async () => {
      setInputValue(input, "Latte")
      await flushTestDom()
    })
    await act(async () => {
      pressEnter(input, true)
      await flushTestDom()
    })
    expect(host!.querySelector('button[aria-label="Remove local-only service Latte"]')).toBeNull()
    expect(input.value).toBe("Latte")
    expect(host!.textContent).toContain("“Latte” is not added yet")
  })

  test("Enter on a blank label adds nothing and shows no pending message", async () => {
    const input = mountWithServices()
    await act(async () => {
      setInputValue(input, "   ")
      await flushTestDom()
    })
    expect(host!.textContent?.includes("is not added yet")).toBe(false)
    expect(host!.textContent).toContain("Enter a label to add a local-only service.")
    await act(async () => {
      pressEnter(input)
      await flushTestDom()
    })
    expect(host!.querySelector('button[aria-label^="Remove local-only service"]')).toBeNull()
  })

  test("unadded typed text is separate from saved-list draft changes", async () => {
    const input = mountWithServices()
    await act(async () => {
      setInputValue(input, "Latte")
      await flushTestDom()
    })
    expect(host!.textContent).toContain("“Latte” is not added yet")
    expect(host!.textContent?.includes("Unsaved changes to this location's services.")).toBe(false)

    await act(async () => {
      includeCheckbox("Coffee").click()
      await flushTestDom()
    })
    expect(host!.textContent).toContain("Unsaved changes to this location's services.")
    expect(host!.textContent).toContain("“Latte” is not added yet")
    expect(input.value).toBe("Latte")
    expect(host!.querySelector('button[aria-label="Remove local-only service Latte"]')).toBeNull()
  })
})
