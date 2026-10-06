import { afterEach, describe, expect, test } from "bun:test"

import {
  createLocalSeoProjectService,
  deleteLocalSeoProjectService,
  fetchLocalSeoLandmarks,
  fetchLocalSeoLocationQueryRecords,
  fetchLocalSeoLocationServices,
  fetchLocalSeoMapsBudget,
  fetchLocalSeoProjectServices,
  localSeoLandmarksQueryKey,
  localSeoLocationQueryRecordsQueryKey,
  localSeoLocationServicesQueryKey,
  localSeoMapsBudgetQueryKey,
  localSeoProjectServicesQueryKey,
  localSeoRunRefetchInterval,
  refreshLocalSeoLandmarks,
  renameLocalSeoProjectService,
  updateLocalSeoLandmarkSelection,
  updateLocalSeoLocationServices,
  type LocalSeoLandmark,
  type LocalSeoLocationQueryRecord,
  type LocalSeoMapsBudget,
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
