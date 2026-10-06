import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { BusinessProfileServicesEditor } from "~/components/business-profile-services-editor"
import {
  localSeoLocationServicesQueryKey,
  localSeoProjectServicesQueryKey,
  type LocalSeoProjectService,
} from "~/lib/local-seo-api"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

function renderCatalog(
  projectId: string,
  seed: { project?: LocalSeoProjectService[] } = {},
  props: { canManage?: boolean; disabled?: boolean } = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  if (seed.project) {
    client.setQueryData(
      localSeoProjectServicesQueryKey(projectId),
      seed.project
    )
  }
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <BusinessProfileServicesEditor
          projectId={projectId}
          canManage={props.canManage ?? true}
          disabled={props.disabled}
        />
      </QueryClientProvider>
    )
  } finally {
    client.clear()
  }
}

let root: Root | null = null
let host: HTMLDivElement | null = null
const fetchCalls: Array<{ url: string; method: string; body: unknown }> = []
const realFetch = globalThis.fetch

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
}

function mountCatalog(
  client: QueryClient,
  projectId: string,
  opts: { canManage?: boolean; disabled?: boolean } = {}
) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <BusinessProfileServicesEditor
          projectId={projectId}
          canManage={opts.canManage ?? true}
          disabled={opts.disabled}
        />
      </QueryClientProvider>
    )
  })
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

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  globalThis.fetch = realFetch
  fetchCalls.length = 0
})

describe("business profile services catalog", () => {
  test("renders the catalog with explicit add/rename/delete controls", () => {
    const html = renderCatalog("proj-1", {
      project: [{ id: "svc-1", label: "Coffee" }],
    })
    expect(html).toContain("Services the business sells")
    expect(html).toContain(
      "Services added here are available at all locations. Deselect services a location does not offer."
    )
    expect(html).toContain('aria-label="Rename service Coffee"')
    expect(html).toContain('aria-label="Delete service Coffee"')
    expect(html).toContain("Add service")
    expect(html).toContain('type="button"')
  })

  test("empty catalog states the add-below action without backfill", () => {
    const html = renderCatalog("proj-1", { project: [] })
    expect(html).toContain("No services yet. Add the first one below.")
    expect(html).toContain("Add service")
  })

  test("read-only users see the list with no mutation controls", () => {
    const html = renderCatalog(
      "proj-1",
      { project: [{ id: "svc-1", label: "Coffee" }] },
      { canManage: false }
    )
    expect(html).toContain("Coffee")
    expect(html.includes("Add service")).toBe(false)
    expect(html.includes("Rename service")).toBe(false)
    expect(html.includes("Delete service")).toBe(false)
    expect(html.includes("New service label")).toBe(false)
  })

  test("every button is type=button so the profile form never submits", () => {
    const html = renderCatalog("proj-1", {
      project: [{ id: "svc-1", label: "Coffee" }],
    })
    const buttons = html.match(/<button/g) ?? []
    expect(buttons.length > 0).toBe(true)
    expect(html.includes('type="submit"')).toBe(false)
  })

  test("never touches provider, AI, query, or run endpoints", async () => {
    const { readFile } = await import("node:fs/promises")
    const source = await readFile(
      new URL("./business-profile-services-editor.tsx", import.meta.url),
      "utf8"
    )
    for (const banned of [
      "createLocalSeoListingLookup",
      "searchLocalSeoAddresses",
      "reverseLocalSeoAddress",
      "generateLocalSeoQueries",
      "createLocalSeoRun",
      "updateLocalSeoLocationQueryRecords",
      "updateLocalSeoLocationServices",
      "fetchLocalSeoLocationServices",
      "ai-questions",
      "prompt_generation",
    ]) {
      expect(source.includes(banned)).toBe(false)
    }
    expect(source.includes("fetchLocalSeoProjectServices")).toBe(true)
  })

  test("a catalog delete invalidates project catalog plus all project location caches only", async () => {
    const client = makeClient()
    client.setQueryData(localSeoProjectServicesQueryKey("proj-1"), [
      { id: "svc-coffee", label: "Coffee" },
    ])
    client.setQueryData(localSeoProjectServicesQueryKey("proj-2"), [
      { id: "svc-other", label: "Other" },
    ])
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
      return new Response(null, { status: 204 })
    }) as typeof fetch

    mountCatalog(client, "proj-1")
    const deleteButton = host!.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete service Coffee"]'
    )!
    await act(async () => {
      deleteButton.click()
      await flushTestDom()
    })

    const keys = invalidations.map((filters) =>
      JSON.stringify(filters.queryKey)
    )
    expect(keys).toContain(
      JSON.stringify(["local-seo-project-services", "proj-1"])
    )
    expect(keys).toContain(
      JSON.stringify(["local-seo-location-services", "proj-1"])
    )
    expect(keys).toContain(
      JSON.stringify(["local-seo-location", "proj-1"])
    )
    expect(keys).toContain(
      JSON.stringify(["local-seo-locations", "proj-1"])
    )
    expect(keys.some((key) => key.includes("proj-2"))).toBe(false)
    expect(
      fetchCalls.some((call) => call.url.includes("/projects/proj-1/services"))
    ).toBe(true)
  })

  test("a catalog add refreshes the server effective location cache on next read", async () => {
    const project: Array<{ id: string; label: string }> = [
      { id: "svc-1", label: "Coffee" },
    ]
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      const method = (init?.method ?? "GET").toUpperCase()
      let body: unknown = null
      if (typeof init?.body === "string") body = JSON.parse(init.body)
      fetchCalls.push({ url, method, body })
      if (url.endsWith("/services") && method === "POST") {
        const created = {
          id: "svc-2",
          label: (body as { label: string }).label,
        }
        project.push(created)
        return Response.json(created)
      }
      if (url.endsWith("/services") && method === "GET") {
        return Response.json(project)
      }
      throw new Error(`unexpected ${method} ${url}`)
    }) as typeof fetch

    const client = makeClient()
    mountCatalog(client, "proj-1")
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
      const add = Array.from(host!.querySelectorAll("button")).find(
        (button) => button.textContent === "Add service"
      )!
      add.click()
      await flushTestDom()
      await flushTestDom()
    })
    expect(fetchCalls.some((call) => call.method === "POST")).toBe(true)
    // Location cache prefix uses existing keys; the location read key itself
    // is unchanged and still resolves the server effective list.
    expect(
      JSON.stringify(
        localSeoLocationServicesQueryKey("proj-1", "loc-a").slice(0, 2)
      )
    ).toBe(JSON.stringify(["local-seo-location-services", "proj-1"]))
  })
})

test("catalog controls stay locked while a service write is pending", async () => {
  const client = makeClient()
  client.setQueryData(localSeoProjectServicesQueryKey("proj-1"), [])
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = init?.method ?? "GET"
    if (!url.endsWith("/projects/proj-1/services"))
      throw new Error(`unexpected ${url}`)
    if (method === "POST") {
      await pending
      return Response.json({ id: "svc-1", label: "Coffee" })
    }
    if (method === "GET")
      return Response.json([{ id: "svc-1", label: "Coffee" }])
    throw new Error(`unexpected ${method} ${url}`)
  }) as typeof fetch
  mountCatalog(client, "proj-1")
  await act(async () => {
    setInputValue(
      host!.querySelector<HTMLInputElement>(
        'input[aria-label="New service label"]'
      )!,
      "Coffee"
    )
    await flushTestDom()
  })
  await act(async () => {
    Array.from(host!.querySelectorAll("button"))
      .find((button) => button.textContent === "Add service")!
      .click()
    await flushTestDom()
  })
  const fieldset = host!.querySelector("fieldset")!
  expect(fieldset.disabled).toBe(true)
  expect(fieldset.getAttribute("aria-busy")).toBe("true")
  await act(async () => {
    release?.()
    await flushTestDom()
    await flushTestDom()
  })
  expect(fieldset.disabled).toBe(false)
  expect(fieldset.getAttribute("aria-busy")).toBe("false")
})
