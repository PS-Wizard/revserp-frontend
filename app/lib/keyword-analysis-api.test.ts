import { afterEach, describe, expect, test } from "bun:test"

import {
  competitorInitializationQueryKey,
  competitorInitializationRefetchInterval,
  fetchCompetitorInitialization,
  isCompetitorInitializationActive,
  projectKeywordAnalysisQueryKey,
  retryCompetitorInitialization,
  startCompetitorInitialization,
} from "./keyword-analysis-api"

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function installFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url, init })
    return Response.json(handler(url, init))
  }) as typeof fetch
  return calls
}

describe("keyword analysis api", () => {
  test("query keys scope project and competitor caches separately", () => {
    expect(projectKeywordAnalysisQueryKey("p1")).toEqual([
      "project-keyword-analysis",
      "p1",
    ])
    expect(competitorInitializationQueryKey("p1", "c1")).toEqual([
      "competitor-initialization",
      "p1",
      "c1",
    ])
  })

  test("polling only runs while initializing", () => {
    expect(isCompetitorInitializationActive("running")).toBe(true)
    expect(isCompetitorInitializationActive("completed")).toBe(false)
    expect(isCompetitorInitializationActive(null)).toBe(false)
    expect(competitorInitializationRefetchInterval("running")).toBe(2000)
    expect(competitorInitializationRefetchInterval("failed")).toBe(false)
  })

  test("missing initialization reads as null instead of throwing", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })) as typeof fetch
    expect(await fetchCompetitorInitialization("p1", "c1")).toBeNull()
  })

  test("start and retry hit their own endpoints", async () => {
    const calls = installFetch(() => ({
      status: "running",
      steps: [],
    }))
    await startCompetitorInitialization("p1", "c1")
    await retryCompetitorInitialization("p1", "c1")
    expect(calls).toHaveLength(2)
    expect(
      calls[0].url.includes("/projects/p1/competitors/c1/initialization")
    ).toBe(true)
    expect(
      calls[1].url.includes("/projects/p1/competitors/c1/initialization/retry")
    ).toBe(true)
    expect(calls[0].init?.method).toBe("POST")
  })

  test("start and retry scope to the selected parent crawl", async () => {
    const calls = installFetch(() => ({
      status: "running",
      steps: [],
    }))
    await startCompetitorInitialization("p1", "c1", "crawl-hist")
    await retryCompetitorInitialization("p1", "c1", "crawl-hist")
    expect(calls).toHaveLength(2)
    expect(calls[0].url.endsWith("/initialization?crawl=crawl-hist")).toBe(true)
    expect(
      calls[1].url.endsWith("/initialization/retry?crawl=crawl-hist")
    ).toBe(true)
    expect(calls[0].url.includes("/projects/p1/competitors/c1/")).toBe(true)
  })

  test("start without a selected crawl posts to the bare endpoint", async () => {
    const calls = installFetch(() => ({
      status: "running",
      steps: [],
    }))
    await startCompetitorInitialization("p1", "c1", null)
    expect(calls).toHaveLength(1)
    expect(calls[0].url.includes("?crawl=")).toBe(false)
  })
})
