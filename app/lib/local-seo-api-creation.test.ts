import { afterEach, describe, expect, test } from "bun:test"

import {
  createBoundLocation,
  searchLocationListings,
  type LocalSeoLocation,
} from "~/lib/local-seo-api"

function makeLocation(
  overrides: Partial<LocalSeoLocation> = {}
): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: "proj-1",
    name: "Roastery",
    place_id: "ChIJ1",
    address: "Main Street 1",
    locality: "Downtown",
    localities: [],
    services: [],
    latitude: 27.7,
    longitude: 85.3,
    queries: [],
    ...overrides,
  }
}

describe("bound location creation API module", () => {
  const seen: Array<{ url: string; method: string; body: unknown }> = []
  let fetchBefore: typeof fetch | null = null

  function mockFetchOnce(status: number, payload: unknown) {
    fetchBefore = globalThis.fetch
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      let body: unknown = null
      const raw = (init as { body?: unknown } | undefined)?.body
      if (typeof raw === "string") body = JSON.parse(raw)
      seen.push({ url, method: init?.method ?? "GET", body })
      return new Response(JSON.stringify(payload), { status })
    }) as typeof fetch
  }

  afterEach(() => {
    if (fetchBefore) globalThis.fetch = fetchBefore
    fetchBefore = null
    seen.length = 0
  })

  test("searches listings with the user's exact query", async () => {
    mockFetchOnce(200, {
      id: "search-1",
      candidates: [],
      expected_credits: 0,
    })
    const result = await searchLocationListings("proj-1", "Main Street Cafe")
    expect(seen[0].method).toBe("POST")
    expect(seen[0].url).toContain("/projects/proj-1/location-listing-search")
    expect(seen[0].body).toEqual({ query: "Main Street Cafe" })
    expect(result.id).toBe("search-1")
  })

  test("creates a bound location from stored evidence with an initial scope", async () => {
    mockFetchOnce(201, makeLocation({}))
    const location = await createBoundLocation("proj-1", {
      search_id: "search-1",
      place_id: "ChIJ1",
      radius_m: 5000,
      website_scope: {
        match: "exact",
        url: "https://local-visibility.example/about",
      },
    })
    expect(seen[0].method).toBe("POST")
    expect(seen[0].url).toContain("/projects/proj-1/locations/bound")
    expect(seen[0].body).toEqual({
      search_id: "search-1",
      place_id: "ChIJ1",
      radius_m: 5000,
      website_scope: {
        match: "exact",
        url: "https://local-visibility.example/about",
      },
    })
    expect(location.place_id).toBe("ChIJ1")
  })
})
