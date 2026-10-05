import { describe, expect, test, afterEach } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Route, Routes, StaticRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import {
  buildWorkspaceNavGroups,
  findActiveTabKey,
  isWorkspaceTabActive,
} from "~/components/workspace-sidebar-nav"
import {
  bindLocalSeoListing,
  canRunLocalSeoGrid,
  createLocalSeoListingLookup,
  createLocalSeoLocation,
  deleteLocalSeoLocation,
  fetchLocalSeoLatestListingLookup,
  fetchLocalSeoLocations,
  generateLocalSeoQueries,
  isLocalSeoLocationBound,
  reverseLocalSeoAddress,
  searchLocalSeoAddresses,
  validateEditableLocalSeoQueries,
  validateLocalSeoCoordinates,
  type LocalSeoListingLookup,
  type LocalSeoLocation,
} from "~/lib/local-seo-api"
import ProjectLocationsRoute, {
  ListingLookupEvidence,
} from "~/routes/app/project-locations"

function makeLocation(overrides: Partial<LocalSeoLocation>): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: "proj-1",
    name: "Roastery",
    place_id: null,
    address: "Main Street 1",
    locality: "Downtown",
    query_service: "coffee roastery",
    latitude: 27.7,
    longitude: 85.3,
    queries: [],
    ...overrides,
  }
}

function makeLookup(
  overrides: Partial<LocalSeoListingLookup>,
): LocalSeoListingLookup {
  return {
    id: "lookup-1",
    status: "completed",
    expected_credits: 1,
    credits_used: 1,
    reserved_credits: 0,
    credit_known: true,
    error: null,
    candidates: [],
    ...overrides,
  }
}

describe("validateEditableLocalSeoQueries", () => {
  test("empty stays zero", () => {
    expect(validateEditableLocalSeoQueries([])).toBeNull()
  })

  test("accepts one to five distinct queries", () => {
    expect(validateEditableLocalSeoQueries(["a"])).toBeNull()
    expect(validateEditableLocalSeoQueries(["a", "b", "c", "d", "e"])).toBeNull()
  })

  test("rejects more than five without padding", () => {
    expect(
      validateEditableLocalSeoQueries(["a", "b", "c", "d", "e", "f"]),
    ).toBe("At most 5 queries are allowed.")
  })

  test("rejects blank rows instead of keeping them", () => {
    expect(validateEditableLocalSeoQueries(["a", "  "])).toBe(
      "Queries must all be non-empty; remove the empty row instead.",
    )
  })

  test("rejects duplicates and oversized queries like the run validator", () => {
    expect(validateEditableLocalSeoQueries(["Coffee", " coffee "])).toBe(
      "Queries must all be distinct, ignoring case and surrounding spaces.",
    )
    expect(validateEditableLocalSeoQueries(["a".repeat(501)])).toBe(
      "Queries must each fit within 500 bytes.",
    )
  })
})

describe("validateLocalSeoCoordinates", () => {
  test("accepts finite physical coordinates", () => {
    expect(validateLocalSeoCoordinates(27.7, 85.3)).toBeNull()
  })

  test("rejects non-finite and out-of-range values", () => {
    expect(validateLocalSeoCoordinates(Number.NaN, 0)).toBe(
      "Coordinates must be finite numbers.",
    )
    expect(validateLocalSeoCoordinates(91, 0)).toBe(
      "Latitude must be between -90 and 90.",
    )
    expect(validateLocalSeoCoordinates(0, 181)).toBe(
      "Longitude must be between -180 and 180.",
    )
  })
})

describe("bound identity run gate", () => {
  test("unbound locations never run, even with five queries", () => {
    expect(isLocalSeoLocationBound(makeLocation({}))).toBe(false)
    expect(
      canRunLocalSeoGrid(
        makeLocation({ queries: ["a", "b", "c", "d", "e"] }),
      ),
    ).toBe(false)
  })

  test("empty placeId counts as unbound", () => {
    expect(isLocalSeoLocationBound(makeLocation({ place_id: "" }))).toBe(false)
  })

  test("bound locations run with between one and five saved queries", () => {
    expect(
      canRunLocalSeoGrid(makeLocation({ place_id: "ChIJ1", queries: [] })),
    ).toBe(false)
    expect(
      canRunLocalSeoGrid(makeLocation({ place_id: "ChIJ1", queries: ["a"] })),
    ).toBe(true)
    expect(
      canRunLocalSeoGrid(
        makeLocation({ place_id: "ChIJ1", queries: ["a", "b", "c", "d", "e"] }),
      ),
    ).toBe(true)
    expect(
      canRunLocalSeoGrid(
        makeLocation({
          place_id: "ChIJ1",
          queries: ["a", "b", "c", "d", "e", "f"],
        }),
      ),
    ).toBe(false)
  })
})

describe("location setup API module", () => {
  const seen: Array<{ url: string; method: string; body: unknown }> = []
  const realFetch = globalThis.fetch

  function mockFetchOnce(status: number, payload: unknown) {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString()
      let body: unknown = null
      const raw = (init as { body?: unknown } | undefined)?.body
      if (typeof raw === "string") body = JSON.parse(raw)
      seen.push({ url, method: init?.method ?? "GET", body })
      return new Response(JSON.stringify(payload), { status })
    }) as typeof fetch
  }

  afterEach(() => {
    globalThis.fetch = realFetch
    seen.length = 0
  })

  test("lists locations for the project", async () => {
    mockFetchOnce(200, [makeLocation({})])
    const locations = await fetchLocalSeoLocations("proj-1")
    expect(locations).toHaveLength(1)
    expect(seen[0].url).toContain("/projects/proj-1/locations")
    expect(seen[0].method).toBe("GET")
  })

  test("creates an unbound location without a place_id", async () => {
    mockFetchOnce(201, makeLocation({ id: "loc-2" }))
    await createLocalSeoLocation("proj-1", {
      name: "Roastery",
      address: "Main Street 1",
      locality: "Downtown",
      query_service: "coffee roastery",
      latitude: 27.7,
      longitude: 85.3,
      queries: ["a", "b"],
    })
    expect(seen[0].method).toBe("POST")
    expect(seen[0].url).toContain("/projects/proj-1/locations")
    const created = seen[0].body as Record<string, unknown>
    expect("place_id" in created).toBe(false)
    expect(created["locality"]).toBe("Downtown")
    expect(created["latitude"]).toBe(27.7)
  })

  test("deletes a location", async () => {
    mockFetchOnce(200, null)
    await deleteLocalSeoLocation("proj-1", "loc-1")
    expect(seen[0].method).toBe("DELETE")
    expect(seen[0].url).toContain("/projects/proj-1/locations/loc-1")
  })

  test("generates queries from service and locality", async () => {
    mockFetchOnce(200, { queries: ["a", "b", "c", "d", "e"] })
    const data = await generateLocalSeoQueries("proj-1", {
      service: "coffee roastery",
      locality: "Downtown",
    })
    expect(data.queries).toHaveLength(5)
    expect(seen[0].url).toContain("/locations/queries/generate")
    expect((seen[0].body as Record<string, unknown>)["service"]).toBe(
      "coffee roastery",
    )
  })

  test("searches addresses explicitly with an optional refresh flag", async () => {
    mockFetchOnce(200, { results: [], cached: true })
    await searchLocalSeoAddresses("proj-1", {
      address: "Main Street 1",
      refresh: true,
    })
    expect(seen[0].url).toContain("/locations/address-search")
    const searched = seen[0].body as Record<string, unknown>
    expect(searched["address"]).toBe("Main Street 1")
    expect(searched["refresh"]).toBe(true)
  })

  test("reverse lookup confirms locality for coordinates", async () => {
    mockFetchOnce(200, { results: [], cached: false })
    await reverseLocalSeoAddress("proj-1", {
      latitude: 27.7,
      longitude: 85.3,
    })
    expect(seen[0].url).toContain("/locations/reverse-address")
    const reversed = seen[0].body as Record<string, unknown>
    expect(reversed["latitude"]).toBe(27.7)
    expect(reversed["longitude"]).toBe(85.3)
  })

  test("paid lookup posts an empty body and binds from a stored lookup", async () => {
    mockFetchOnce(200, makeLookup({}))
    await createLocalSeoListingLookup("proj-1", "loc-1")
    expect(seen[0].url).toContain("/locations/loc-1/listing-lookups")
    expect(seen[0].body).toEqual({})

    mockFetchOnce(200, makeLocation({ place_id: "ChIJ1" }))
    const bound = await bindLocalSeoListing("proj-1", "loc-1", {
      lookup_id: "lookup-1",
      place_id: "ChIJ1",
    })
    expect(bound.place_id).toBe("ChIJ1")
    expect(seen[1].url).toContain("/locations/loc-1/listing")
    const boundBody = seen[1].body as Record<string, unknown>
    expect(boundBody["lookup_id"]).toBe("lookup-1")
    expect(boundBody["place_id"]).toBe("ChIJ1")
  })

  test("missing latest lookup resolves to null", async () => {
    mockFetchOnce(404, { error: "not found" })
    const latest = await fetchLocalSeoLatestListingLookup("proj-1", "loc-1")
    expect(latest).toBeNull()
  })
})

describe("listing lookup evidence", () => {
  test("completed empty lookup reads as no-match, not failure", () => {
    const html = renderToStaticMarkup(
      <ListingLookupEvidence lookup={makeLookup({})} />,
    )
    expect(html).toContain("Completed")
    expect(html).toContain("1 credit")
    expect(html.includes("unconfirmed")).toBe(false)
  })

  test("failed and uncertain states show cost evidence distinctly", () => {
    const failed = renderToStaticMarkup(
      <ListingLookupEvidence
        lookup={makeLookup({
          status: "failed",
          credits_used: 0,
          reserved_credits: 1,
          error: "provider timeout",
        })}
      />,
    )
    expect(failed).toContain("Failed")
    expect(failed).toContain("provider timeout")

    const uncertain = renderToStaticMarkup(
      <ListingLookupEvidence
        lookup={makeLookup({ status: "uncertain", credit_known: false })}
      />,
    )
    expect(uncertain).toContain("Uncertain charge")
    expect(uncertain).toContain("unconfirmed")
  })
})

describe("locations nav group", () => {
  const base = { gscConnector: false, integrations: false, maxCompetitors: 0 }

  test("locations tab exists only with a project, as a route href", () => {
    const withProject = buildWorkspaceNavGroups({ ...base, projectId: "proj-1" })
    const group = withProject.find((entry) => entry.key === "locations")
    expect(group?.tabs).toHaveLength(1)
    expect(group?.tabs[0].href).toBe("/app/projects/proj-1/locations")

    const withoutProject = buildWorkspaceNavGroups(base)
    expect(
      withoutProject.some((entry) => entry.key === "locations")
    ).toBe(false)
  })

  test("locations pathname never marks an audit tab active", () => {
    const groups = buildWorkspaceNavGroups({ ...base, projectId: "proj-1" })
    const locations = groups
      .flatMap((entry) => entry.tabs)
      .find((tab) => tab.key === "locations")!
    expect(
      isWorkspaceTabActive(locations, "revserp-audit", "overview")
    ).toBe(false)
    expect(
      isWorkspaceTabActive(
        locations,
        "revserp-audit",
        "overview",
        "/app/projects/proj-1/locations"
      )
    ).toBe(true)
    expect(
      findActiveTabKey(
        groups,
        "revserp-audit",
        "overview",
        "/app/projects/proj-1/locations"
      )
    ).toBe("locations")
  })
})

describe("create location query editor", () => {
  test("manual editor renders before generation with an add affordance", () => {
    const client = new QueryClient()
    try {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <StaticRouter location="/app/projects/proj-1/locations?view=list">
            <Routes>
              <Route
                path="/app/projects/:projectID/locations"
                element={<ProjectLocationsRoute />}
              />
            </Routes>
          </StaticRouter>
        </QueryClientProvider>,
      )
      expect(html).toContain("Add query")
      expect(html).toContain("Create unbound location")
    } finally {
      client.clear()
    }
  })
})
