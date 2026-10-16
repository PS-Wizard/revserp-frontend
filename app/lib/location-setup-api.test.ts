import { describe, expect, test, afterEach } from "bun:test"

import {
  fetchLocationMapsQueriesStatus,
  fetchLocationSetup,
  isLocationSetupActive,
  locationMapsQueriesRefetchInterval,
  locationMapsQueriesStatusQueryKey,
  locationSetupQueryKey,
  locationSetupRefetchInterval,
  regenerateLocationMapsQueries,
  startLocationSetup,
} from "~/lib/location-setup-api"

const seen: Array<{ url: string; method: string; body: unknown }> = []
const realFetch = globalThis.fetch

function mockFetchOnce(status: number, payload: unknown) {
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
  globalThis.fetch = realFetch
  seen.length = 0
})

const SETUP = {
  status: "running",
  differences: "",
  steps: [],
}

describe("location setup api", () => {
  test("keys scope the location", () => {
    expect(locationSetupQueryKey("p-1", "l-1")).toEqual([
      "location-setup",
      "p-1",
      "l-1",
    ])
    expect(locationMapsQueriesStatusQueryKey("p-1", "l-1")).toEqual([
      "location-maps-queries-status",
      "p-1",
      "l-1",
    ])
  })

  test("missing setup row surfaces instead of masking as ready", async () => {
    mockFetchOnce(404, { error: "not found" })
    let failed = false
    try {
      await fetchLocationSetup("p-1", "l-1")
    } catch (error) {
      failed = error instanceof Error
    }
    expect(failed).toBe(true)
    expect(seen[0].url).toContain("/projects/p-1/locations/l-1/setup")
  })

  test("start posts trimmed differences, omits blanks", async () => {
    mockFetchOnce(200, SETUP)
    await startLocationSetup("p-1", "l-1", "  downtown branch  ")
    expect(seen[0].method).toBe("POST")
    expect(seen[0].body).toEqual({ differences: "downtown branch" })

    seen.length = 0
    mockFetchOnce(200, SETUP)
    await startLocationSetup("p-1", "l-1", "   ")
    expect(seen[0].body).toEqual({ differences: undefined })
  })

  test("bounded polling runs while running only", () => {
    expect(locationSetupRefetchInterval("running")).toBe(2000)
    expect(locationSetupRefetchInterval("ready")).toBe(false)
    expect(locationSetupRefetchInterval("completed")).toBe(false)
    expect(locationSetupRefetchInterval("failed")).toBe(false)
    expect(locationSetupRefetchInterval(null)).toBe(false)
    expect(isLocationSetupActive("running")).toBe(true)
    expect(isLocationSetupActive("completed")).toBe(false)
  })

  test("regenerate queues a job, status polls while active only", async () => {
    mockFetchOnce(202, { status: "pending" })
    const queued = await regenerateLocationMapsQueries("p-1", "l-1")
    expect(queued.status).toBe("pending")
    expect(seen[0].method).toBe("POST")
    expect(seen[0].url).toContain("/locations/l-1/maps-queries/regenerate")

    seen.length = 0
    mockFetchOnce(200, { status: "running" })
    expect(await fetchLocationMapsQueriesStatus("p-1", "l-1")).toEqual({
      status: "running",
    })
    expect(seen[0].method).toBe("GET")

    expect(locationMapsQueriesRefetchInterval("pending")).toBe(2000)
    expect(locationMapsQueriesRefetchInterval("running")).toBe(2000)
    expect(locationMapsQueriesRefetchInterval("completed")).toBe(false)
    expect(locationMapsQueriesRefetchInterval("failed")).toBe(false)
    expect(locationMapsQueriesRefetchInterval("idle")).toBe(false)
  })
})
