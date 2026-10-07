import { afterEach, describe, expect, test } from "bun:test"

import {
  createLocalSeoProjectService,
  deleteLocalSeoProjectService,
  fetchLocalSeoLandmarks,
  fetchLocalSeoLocationQueryRecords,
  fetchLocalSeoLocationServices,
  fetchLocalSeoMapsBudget,
  fetchLocalSeoPointDetails,
  fetchLocalSeoProjectServices,
  fetchLocalSeoRunCompetitors,
  fetchLocalSeoRunPointCompetitors,
  localSeoLandmarksQueryKey,
  localSeoLocationQueryRecordsQueryKey,
  localSeoLocationServicesQueryKey,
  localSeoMapsBudgetQueryKey,
  localSeoPointDetailsQueryKey,
  localSeoProjectServicesQueryKey,
  localSeoRunCompetitorsQueryKey,
  localSeoRunPointCompetitorsQueryKey,
  localSeoRunRefetchInterval,
  refreshLocalSeoLandmarks,
  renameLocalSeoProjectService,
  updateLocalSeoLandmarkSelection,
  updateLocalSeoLocationServices,
  type LocalSeoLandmark,
  type LocalSeoLocationQueryRecord,
  type LocalSeoMapsBudget,
  type LocalSeoPointDetails,
  type LocalSeoRunCompetitors,
  type LocalSeoRunStatus,
} from "~/lib/local-seo-api"

import { ApiError } from "~/lib/api"

const calls: Array<{ url: string; method: string; body: unknown }> = []
const realFetch = globalThis.fetch

function mockFetch(status: number, payload: unknown = null) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    let body: unknown = null
    const raw = init?.body
    if (typeof raw === "string") body = JSON.parse(raw)
    calls.push({ url, method: init?.method ?? "GET", body })
    return new Response(status === 204 ? null : JSON.stringify(payload), {
      status,
    })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  calls.length = 0
})

function makeLandmark(overrides: Partial<LocalSeoLandmark>): LocalSeoLandmark {
  return {
    id: "lm-1",
    name: "City Hall",
    latitude: 27.7,
    longitude: 85.3,
    straight_line_m: 400,
    provider: "google_places",
    provider_ref: "places/lm-1",
    categories: ["townhall"],
    fetched_at: "2025-01-01T00:00:00Z",
    selected: false,
    ...overrides,
  }
}

describe("project services contract", () => {
  test("lists bare id/label records for the project", async () => {
    mockFetch(200, [{ id: "svc-1", label: "Coffee" }])
    const records = await fetchLocalSeoProjectServices("proj-1")
    expect(records).toEqual([{ id: "svc-1", label: "Coffee" }])
    expect(calls[0].method).toBe("GET")
    expect(calls[0].url).toContain("/projects/proj-1/services")
  })

  test("creates a service from a label only", async () => {
    mockFetch(201, { id: "svc-2", label: "Roastery" })
    await createLocalSeoProjectService("proj-1", "Roastery")
    expect(calls[0].method).toBe("POST")
    expect(calls[0].url).toContain("/projects/proj-1/services")
    expect(calls[0].body).toEqual({ label: "Roastery" })
  })

  test("renames a service with a JSON PATCH", async () => {
    mockFetch(200, { id: "svc-1", label: "New" })
    await renameLocalSeoProjectService("proj-1", "svc-1", "New")
    expect(calls[0].method).toBe("PATCH")
    expect(calls[0].url).toContain("/projects/proj-1/services/svc-1")
    expect(calls[0].body).toEqual({ label: "New" })
  })

  test("deletes a service against a 204", async () => {
    mockFetch(204)
    await deleteLocalSeoProjectService("proj-1", "svc-1")
    expect(calls[0].method).toBe("DELETE")
    expect(calls[0].url).toContain("/projects/proj-1/services/svc-1")
  })
})

describe("location services contract", () => {
  test("returns effective, project editor rows and location-only labels", async () => {
    mockFetch(200, {
      effective: ["Coffee"],
      project: [{ id: "svc-1", label: "Coffee", excluded: false }],
      location_only: ["Parking"],
    })
    const services = await fetchLocalSeoLocationServices("proj-1", "loc-1")
    expect(services.effective).toEqual(["Coffee"])
    expect(services.project).toEqual([
      { id: "svc-1", label: "Coffee", excluded: false },
    ])
    expect(services.location_only).toEqual(["Parking"])
    expect(calls[0].url).toContain("/projects/proj-1/locations/loc-1/services")
  })

  test("puts overrides and echoes the server's effective list", async () => {
    mockFetch(200, { effective: [], project: [], location_only: [] })
    await updateLocalSeoLocationServices("proj-1", "loc-1", [
      { service_id: "svc-1", service_label: null, mode: "exclude" },
      { service_id: null, service_label: "Parking", mode: "include" },
    ])
    expect(calls[0].method).toBe("PUT")
    expect(calls[0].body).toEqual({
      overrides: [
        { service_id: "svc-1", service_label: null, mode: "exclude" },
        { service_id: null, service_label: "Parking", mode: "include" },
      ],
    })
  })
})

describe("location query records contract", () => {
  test("reads the record shape from the queries endpoint", async () => {
    const record: LocalSeoLocationQueryRecord = {
      id: "q-1",
      text: "coffee near me",
      ordinal: 0,
      enabled: true,
      kind: "map",
      source: "generated",
      origin: "service",
      landmark_id: null,
    }
    mockFetch(200, [record])
    const records = await fetchLocalSeoLocationQueryRecords("proj-1", "loc-1")
    expect(records).toEqual([record])
    expect(calls[0].url).toContain("/projects/proj-1/locations/loc-1/queries")
  })
})

describe("landmarks contract", () => {
  test("lists cached landmarks", async () => {
    mockFetch(200, [makeLandmark({})])
    const landmarks = await fetchLocalSeoLandmarks("proj-1", "loc-1")
    expect(landmarks[0].provider_ref).toBe("places/lm-1")
    expect(calls[0].url).toContain("/projects/proj-1/locations/loc-1/landmarks")
  })

  test("refreshes through POST", async () => {
    mockFetch(200, [makeLandmark({})])
    await refreshLocalSeoLandmarks("proj-1", "loc-1")
    expect(calls[0].method).toBe("POST")
    expect(calls[0].url).toContain("/landmarks/refresh")
  })

  test("puts the selection as selected_ids", async () => {
    mockFetch(200, [makeLandmark({ selected: true })])
    await updateLocalSeoLandmarkSelection("proj-1", "loc-1", ["lm-1"])
    expect(calls[0].method).toBe("PUT")
    expect(calls[0].url).toContain("/landmarks/selection")
    expect(calls[0].body).toEqual({ selected_ids: ["lm-1"] })
  })
})

describe("query keys stay scoped", () => {
  test("project keys stay project scoped", () => {
    expect(localSeoProjectServicesQueryKey("proj-2")).toEqual([
      "local-seo-project-services",
      "proj-2",
    ])
  })

  test("location keys include both project and location", () => {
    expect(localSeoLocationServicesQueryKey("proj-1", "loc-1")).toEqual([
      "local-seo-location-services",
      "proj-1",
      "loc-1",
    ])
    expect(localSeoLocationServicesQueryKey("proj-1", "loc-2")).toEqual([
      "local-seo-location-services",
      "proj-1",
      "loc-2",
    ])
    expect(localSeoLocationQueryRecordsQueryKey("proj-1", "loc-1")).toEqual([
      "local-seo-location-query-records",
      "proj-1",
      "loc-1",
    ])
    expect(localSeoLandmarksQueryKey("proj-1", "loc-1")).toEqual([
      "local-seo-landmarks",
      "proj-1",
      "loc-1",
    ])
  })
})

describe("localSeoRunRefetchInterval", () => {
  test("polls only queued and running", () => {
    const statuses: LocalSeoRunStatus[] = ["queued", "running"]
    for (const status of statuses) {
      expect(localSeoRunRefetchInterval(status)).toBe(1000)
    }
  })

  test("stops at terminal or unknown", () => {
    const terminal: LocalSeoRunStatus[] = ["completed", "partial", "failed"]
    for (const status of terminal) {
      expect(localSeoRunRefetchInterval(status)).toBe(false)
    }
    expect(localSeoRunRefetchInterval(null)).toBe(false)
    expect(localSeoRunRefetchInterval(undefined)).toBe(false)
  })
})

describe("maps budget contract", () => {
  test("reads the organization allowance shape for a project", async () => {
    const budget: LocalSeoMapsBudget = {
      remaining_credits: 500,
      reserved_credits: 135,
      spent_credits: 12,
      available_credits: 365,
    }
    mockFetch(200, budget)
    const result = await fetchLocalSeoMapsBudget("proj-1")
    expect(result).toEqual(budget)
    expect(calls[0].method).toBe("GET")
    expect(calls[0].url).toContain("/projects/proj-1/maps-budget")
  })

  test("keeps a 404 as an ApiError rather than a null budget", async () => {
    mockFetch(404, { error: "project not found" })
    let thrown: unknown
    try {
      await fetchLocalSeoMapsBudget("proj-1")
    } catch (error) {
      thrown = error
    }
    expect(thrown instanceof ApiError && thrown.status === 404).toBe(true)
  })

  test("keeps an unknown failure as an ApiError rather than a default", async () => {
    mockFetch(500, { error: "internal server error" })
    let thrown: unknown
    try {
      await fetchLocalSeoMapsBudget("proj-1")
    } catch (error) {
      thrown = error
    }
    expect(thrown instanceof ApiError && thrown.status === 500).toBe(true)
  })

  test("scopes the query key to the project", () => {
    expect(localSeoMapsBudgetQueryKey("proj-1")).toEqual([
      "local-seo-maps-budget",
      "proj-1",
    ])
  })
})

describe("point details contract", () => {
  const details: LocalSeoPointDetails = {
    run_id: "run-1",
    point_index: 3,
    target_place_id: "ChIJ-target",
    queries: [
      {
        query_index: 0,
        query: "coffee",
        call_status: "success_nonempty",
        match_status: "found",
        rank: 2,
        error: null,
        places: [
          {
            position: 1,
            title: "Blue Bottle",
            address: "1 Main St",
            place_id: "ChIJ-a",
            rating: 4.6,
            rating_count: 88,
            is_target: false,
          },
        ],
      },
    ],
  }

  test("reads the frozen point evidence without a provider call", async () => {
    mockFetch(200, details)
    const result = await fetchLocalSeoPointDetails("proj-1", "loc-1", "run-1", 3)
    expect(result).toEqual(details)
    expect(calls[0].method).toBe("GET")
    expect(calls[0].url).toContain(
      "/projects/proj-1/locations/loc-1/runs/run-1/points/3"
    )
  })

  test("keeps a failure as an ApiError instead of empty evidence", async () => {
    mockFetch(500, { error: "internal server error" })
    let thrown: unknown
    try {
      await fetchLocalSeoPointDetails("proj-1", "loc-1", "run-1", 3)
    } catch (error) {
      thrown = error
    }
    expect(thrown instanceof ApiError && thrown.status === 500).toBe(true)
  })

  test("scopes the query key to project, location, run, point, and status", () => {
    const base = localSeoPointDetailsQueryKey(
      "proj-1",
      "loc-1",
      "run-1",
      0,
      "running"
    )
    expect(base).toEqual([
      "local-seo-point-details",
      "proj-1",
      "loc-1",
      "run-1",
      0,
      "running",
    ])
    const signature = (key: readonly unknown[]) => key.join("/")
    expect(
      signature(
        localSeoPointDetailsQueryKey("proj-1", "loc-1", "run-1", 4, "running")
      ) === signature(base)
    ).toBe(false)
    expect(
      signature(
        localSeoPointDetailsQueryKey("proj-1", "loc-1", "run-2", 0, "running")
      ) === signature(base)
    ).toBe(false)
    expect(
      signature(
        localSeoPointDetailsQueryKey("proj-1", "loc-2", "run-1", 0, "running")
      ) === signature(base)
    ).toBe(false)
    expect(
      signature(
        localSeoPointDetailsQueryKey("proj-1", "loc-1", "run-1", 0, "completed")
      ) === signature(base)
    ).toBe(false)
  })
})
describe("run competitors contract", () => {
  test("reads the frozen rollup without a provider call", async () => {
    const payload: LocalSeoRunCompetitors = {
      run_id: "run-1",
      target_place_id: "ChIJ-target",
      queries: ["coffee", "tea"],
      point_index: null,
      total_query_points: 20,
      contributing_query_points: 18,
      failed_query_points: 1,
      pending_query_points: 1,
      unreadable_query_points: 0,
      idless_entries: 2,
      competitors: [
        {
          place_id: "ChIJ-a",
          title: "Rival Roasters",
          address: "1 Main St",
          query_points_seen: 5,
          best_rank: 2,
          same_brand_domain: true,
          query_indexes: [0, 1],
        },
      ],
    }
    mockFetch(200, payload)
    const result = await fetchLocalSeoRunCompetitors("proj-1", "loc-1", "run-1")
    expect(result).toEqual(payload)
    expect(calls[0].method).toBe("GET")
    expect(calls[0].url).toContain(
      "/projects/proj-1/locations/loc-1/runs/run-1/competitors",
    )
  })

  test("scopes the query key to run, status, and progress", () => {
    const active = localSeoRunCompetitorsQueryKey(
      "proj-1",
      "loc-1",
      "run-1",
      "running",
      12,
    )
    expect(active[0]).toBe("local-seo-run-competitors")
    expect(active.slice(1, 4)).toEqual(["proj-1", "loc-1", "run-1"])
    const same = (key: readonly unknown[]) => key.join('/')
    expect(
      same(
        localSeoRunCompetitorsQueryKey("proj-1", "loc-1", "run-1", "completed", 45),
      ) === same(active),
    ).toBe(false)
    expect(
      same(
        localSeoRunCompetitorsQueryKey("proj-1", "loc-1", "run-1", "running", 13),
      ) === same(active),
    ).toBe(false)
    expect(
      same(
        localSeoRunCompetitorsQueryKey("proj-1", "loc-1", "run-2", "running", 12),
      ) === same(active),
    ).toBe(false)
  })

  test("reads the frozen point rollup from the point route", async () => {
    const payload: LocalSeoRunCompetitors = {
      run_id: "run-1",
      target_place_id: "ChIJ-target",
      queries: ["coffee", "tea"],
      point_index: 5,
      total_query_points: 2,
      contributing_query_points: 2,
      failed_query_points: 0,
      pending_query_points: 0,
      unreadable_query_points: 0,
      idless_entries: 0,
      competitors: [
        {
          place_id: "ChIJ-f",
          title: "Point Rival",
          address: "1 Main St",
          query_points_seen: 2,
          best_rank: 1,
          same_brand_domain: false,
          query_indexes: [0, 1],
        },
      ],
    }
    mockFetch(200, payload)
    const result = await fetchLocalSeoRunPointCompetitors("proj-1", "loc-1", "run-1", 5)
    expect(result).toEqual(payload)
    expect(result.point_index).toBe(5)
    expect(calls[0].method).toBe("GET")
    expect(calls[0].url).toContain(
      "/projects/proj-1/locations/loc-1/runs/run-1/points/5/competitors",
    )
  })

  test("point keys stay scoped by point and never collide with the whole run", () => {
    const pointF = localSeoRunPointCompetitorsQueryKey("proj-1", "loc-1", "run-1", 5, "completed", 45)
    expect(pointF[0]).toBe("local-seo-run-point-competitors")
    expect(pointF.slice(1, 5)).toEqual(["proj-1", "loc-1", "run-1", 5])
    const same = (key: readonly unknown[]) => key.join("/")
    expect(same(localSeoRunPointCompetitorsQueryKey("proj-1", "loc-1", "run-1", 0, "completed", 45)) === same(pointF)).toBe(false)
    expect(same(localSeoRunPointCompetitorsQueryKey("proj-1", "loc-1", "run-2", 5, "completed", 45)) === same(pointF)).toBe(false)
    expect(same(localSeoRunCompetitorsQueryKey("proj-1", "loc-1", "run-1", "completed", 45)) === same(pointF)).toBe(false)
    expect(same(localSeoRunPointCompetitorsQueryKey("proj-1", "loc-1", "run-1", 5, "running", 12)) === same(pointF)).toBe(false)
  })
})
