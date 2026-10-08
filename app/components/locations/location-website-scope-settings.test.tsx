import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { LocalSeoLocation } from "~/lib/local-seo-api"
import type {
  LocationWorkspace,
  LocationWebsiteScopeRevision,
} from "~/lib/location-workspace"
import { installTestDom } from "~/lib/dom-test-setup"
import { LocationWebsiteScopeFields } from "~/components/locations/location-website-scope-fields"

installTestDom()

let root: Root | null = null
let host: HTMLDivElement | null = null
const realFetch = globalThis.fetch
const fetchCalls: Array<{ url: string; method: string; body: unknown }> = []

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    let body: unknown = null
    const raw = init?.body
    if (typeof raw === "string") {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
    fetchCalls.push({ url, method: init?.method ?? "GET", body })
    return new Response(JSON.stringify(handler(url, init)), { status: 200 })
  }) as typeof fetch
}

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  globalThis.fetch = realFetch
  fetchCalls.length = 0
})

function makeWorkspace(): LocationWorkspace {
  const location: LocalSeoLocation = {
    id: "loc-1",
    project_id: "proj-1",
    name: "Roastery",
    place_id: null,
    address: "",
    locality: "",
    localities: [],
    services: [],
    latitude: 0,
    longitude: 0,
    queries: [],
  }
  const scope: LocationWebsiteScopeRevision = {
    id: "rev-1",
    revision: 1,
    url: "https://example.com/about",
    match: "exact",
    created_at: "2026-09-01T12:00:00.000Z",
  }
  return {
    projectId: "proj-1",
    location,
    canManage: true,
    websiteScope: scope,
    websiteScopeRevisions: [scope],
  }
}

describe("location website scope fields", () => {
  test("controlled value drives checked option and url with validation", () => {
    const seen: Array<{ match: string; url: string }> = []
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root?.render(
        <LocationWebsiteScopeFields
          value={{ match: "exact", url: "example.com/about" }}
          onChange={(next) => seen.push(next)}
          parentUrl="https://example.com/"
        />
      )
    })
    const exact = host.querySelector('input[value="exact"]') as HTMLInputElement
    expect(exact.checked).toBe(true)
    expect(host.innerHTML).toContain("absolute URL")
    const subtree = host.querySelector(
      'input[value="subtree"]'
    ) as HTMLInputElement
    act(() => {
      subtree.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(seen.at(-1)?.match).toBe("subtree")
  })

  test("foreign origin warns before the server rejects it", () => {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root?.render(
        <LocationWebsiteScopeFields
          value={{ match: "exact", url: "https://other.com/about" }}
          onChange={() => {}}
          parentUrl="https://example.com/"
        />
      )
    })
    expect(host.innerHTML).toContain("outside the parent website")
  })
})

describe("location website scope settings save", () => {
  test("PUT appends a revision without provider, crawl, or run calls", async () => {
    mockFetch(() => ({
      id: "rev-2",
      revision: 2,
      url: "https://example.com/about/",
      match: "exact",
      created_at: "2026-09-02T12:00:00.000Z",
    }))
    const { saveLocationWebsiteScope } = await import(
      "~/components/locations/location-website-scope"
    )
    const revision = await saveLocationWebsiteScope("proj-1", "loc-1", {
      url: "https://example.com/about/",
      match: "exact",
    })
    expect(revision.revision).toBe(2)
    expect(fetchCalls.length).toBe(1)
    expect(fetchCalls[0]?.method).toBe("PUT")
    expect(fetchCalls[0]?.url).toContain("/locations/loc-1/website-scope")
    expect(fetchCalls[0]?.body).toEqual({
      url: "https://example.com/about/",
      match: "exact",
    })
  })

  test("post-save refresh hits workspace refresh plus audit caches, no reload", async () => {
    const { refreshLocationWebsiteAuditAfterSave } = await import(
      "~/components/locations/location-website-scope-settings"
    )
    const workspace = makeWorkspace()
    const refreshCalls: number[] = []
    const invalidated: Array<readonly unknown[]> = []
    refreshLocationWebsiteAuditAfterSave(
      {
        ...workspace,
        refresh: () => refreshCalls.push(1),
      } as LocationWorkspace,
      (filters) => {
        invalidated.push(filters.queryKey)
      },
      "proj-1",
      "loc-1"
    )
    expect(refreshCalls.length).toBe(1)
    expect(
      invalidated.some((key) => key[0] === "location-website-audit")
    ).toBe(true)
    expect(
      invalidated.some((key) => key[0] === "location-website-audit-history")
    ).toBe(true)
    expect(
      invalidated.some((key) => key[0] === "location-website-audit-pages")
    ).toBe(true)
  })

  test("post-save refresh tolerates a workspace without refresh yet", async () => {
    const { refreshLocationWebsiteAuditAfterSave } = await import(
      "~/components/locations/location-website-scope-settings"
    )
    const invalidated: Array<readonly unknown[]> = []
    refreshLocationWebsiteAuditAfterSave(
      makeWorkspace(),
      (filters) => {
        invalidated.push(filters.queryKey)
      },
      "proj-1",
      "loc-1"
    )
    expect(invalidated.length).toBe(3)
  })

  test("scope UI never forces a browser reload", async () => {
    const { readFile } = await import("node:fs/promises")
    for (const file of [
      "./location-website-scope-settings.tsx",
      "./location-website-audit-view.tsx",
      "./location-website-audit-pages.tsx",
    ]) {
      const source = await readFile(new URL(file, import.meta.url), "utf8")
      expect(source.includes("window.location.reload")).toBe(false)
      expect(source.includes("location.reload")).toBe(false)
    }
  })
})
