import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import {
  LocalSeoRunControls,
  describeLocalSeoRunGate,
  describeLocalSeoRunProgress,
} from "~/components/local-seo-run-controls"
import { LOCAL_SEO_GENERIC_RUN_ERROR } from "~/components/local-seo-run-outcomes"
import {
  localSeoLatestRunQueryKey,
  localSeoMapsBudgetQueryKey,
  type LocalSeoCell,
  type LocalSeoLocation,
  type LocalSeoLocationQueryRecord,
  type LocalSeoMapsBudget,
  type LocalSeoRun,
} from "~/lib/local-seo-api"

installTestDom()

const PROJECT = "proj-1"

const CONFLICT_MESSAGE =
  "A run for this location is already in progress. No additional credits were charged."

function mapQuery(
  text: string,
  overrides: Partial<LocalSeoLocationQueryRecord> = {}
): LocalSeoLocationQueryRecord {
  return {
    id: `q-${text}`,
    text,
    ordinal: 0,
    enabled: true,
    kind: "map",
    source: "manual",
    origin: "service",
    landmark_id: null,
    ...overrides,
  }
}

function makeLocation(
  overrides: Partial<LocalSeoLocation> = {}
): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: PROJECT,
    name: "Roastery",
    place_id: "ChIJ1",
    address: "Main St",
    locality: "Downtown",
    localities: [],
    services: [],
    latitude: 27.7,
    longitude: 85.3,
    queries: [mapQuery("coffee")],
    ...overrides,
  }
}

function makeRun(overrides: Partial<LocalSeoRun> = {}): LocalSeoRun {
  return {
    id: "run-1",
    location_id: "loc-1",
    status: "completed",
    radius_m: 5000,
    expected_credits: 27,
    credits_used: 27,
    retry_credits: 0,
    queries: ["coffee"],
    cells: [],
    ...overrides,
  }
}

function makeBudget(
  overrides: Partial<LocalSeoMapsBudget> = {}
): LocalSeoMapsBudget {
  return {
    remaining_credits: 500,
    reserved_credits: 0,
    spent_credits: 0,
    available_credits: 365,
    ...overrides,
  }
}

function renderControls(
  options: {
    location?: LocalSeoLocation
    radiusM?: number
    isRemote?: boolean
    budget?: LocalSeoMapsBudget
    run?: LocalSeoRun | null
    seedRun?: boolean
  } = {}
) {
  const location = options.location ?? makeLocation()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  if (options.budget) {
    client.setQueryData(localSeoMapsBudgetQueryKey(PROJECT), options.budget)
  }
  if (options.seedRun !== false) {
    client.setQueryData(
      localSeoLatestRunQueryKey(PROJECT, location.id),
      options.run ?? null
    )
  }
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LocalSeoRunControls
          projectId={PROJECT}
          location={location}
          radiusM={options.radiusM ?? 5000}
          isRemote={options.isRemote}
        />
      </QueryClientProvider>
    )
  } finally {
    client.clear()
  }
}

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

function installRunFetch(
  options: {
    budget?: LocalSeoMapsBudget
    failCreate?: boolean
    createStatus?: number
    createMessage?: string
    createNetworkError?: boolean
    runError?: boolean
    budgetError?: boolean
  } = {}
) {
  ;(globalThis as Record<string, unknown>).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })
    if (url.includes("/runs/latest")) {
      if (options.runError) {
        return new Response(JSON.stringify({ error: "run read failed" }), {
          status: 500,
        })
      }
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })
    }
    if (url.endsWith("/runs") && method === "POST") {
      if (options.createNetworkError) {
        throw new TypeError("Failed to fetch")
      }
      if (options.createStatus) {
        return new Response(
          JSON.stringify({ error: options.createMessage ?? "create failed" }),
          { status: options.createStatus }
        )
      }
      if (options.failCreate) {
        return new Response(JSON.stringify({ error: "reservation failed" }), {
          status: 500,
        })
      }
      return Response.json({
        id: "run-9",
        status: "queued",
        expected_credits: 27,
      })
    }
    if (url.includes("/maps-budget")) {
      if (options.budgetError) {
        return new Response(JSON.stringify({ error: "budget read failed" }), {
          status: 500,
        })
      }
      return Response.json(options.budget ?? makeBudget())
    }
    if (url.includes("/locations")) {
      return Response.json([])
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = originalFetch
  fetchCalls.length = 0
  document.body.innerHTML = ""
})

function press(el: Element | null | undefined) {
  if (!el) throw new Error("press target missing")
  const target = el as HTMLElement
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
  }
  target.dispatchEvent(new PointerEvent("pointerdown", init))
  target.dispatchEvent(new MouseEvent("mousedown", init))
  target.focus?.()
  target.dispatchEvent(new PointerEvent("pointerup", init))
  target.dispatchEvent(new MouseEvent("mouseup", init))
  target.dispatchEvent(new MouseEvent("click", init))
}

function buttonByText(scope: ParentNode, text: string) {
  const found = [...scope.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text)
  )
  if (!found) throw new Error(`button "${text}" not found`)
  return found as HTMLButtonElement
}

async function flushUntil(check: () => boolean) {
  for (let i = 0; i < 30; i++) {
    if (check()) return
    await act(async () => {
      await flushTestDom()
    })
  }
  throw new Error("condition never became true")
}

async function waitForEnabledStart(container: ParentNode) {
  await flushUntil(() => !buttonByText(container, "Start run").disabled)
  return buttonByText(container, "Start run")
}

async function mountControls(props: {
  location?: LocalSeoLocation
  radiusM?: number
  isRemote?: boolean
  onRunStarted?: (runId: string) => void
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <LocalSeoRunControls
          projectId={PROJECT}
          location={props.location ?? makeLocation()}
          radiusM={props.radiusM ?? 5000}
          isRemote={props.isRemote}
          onRunStarted={props.onRunStarted}
        />
      </QueryClientProvider>
    )
    await flushTestDom()
    await flushTestDom()
    await flushTestDom()
  })
  return { root, container }
}

describe("run gate guards", () => {
  const base = {
    bound: true,
    isRemote: false,
    queryError: null,
    radiusError: null,
    runReadState: "ready" as const,
    runStatus: null,
    reservedCredits: null,
    unconfirmedCalls: null,
    budgetState: "ready" as const,
    availableCredits: 365,
    cost: 27,
  }

  test("allows a bound, priced run with a ready allowance", () => {
    expect(describeLocalSeoRunGate(base)).toEqual({
      canStart: true,
      reason: null,
    })
  })

  test("blocks remote, unbound, invalid inputs, and blocked reads", () => {
    expect(
      describeLocalSeoRunGate({ ...base, isRemote: true }).reason
    ).toContain("remote")
    expect(describeLocalSeoRunGate({ ...base, bound: false }).reason).toContain(
      "Bind a Google listing"
    )
    expect(
      describeLocalSeoRunGate({ ...base, queryError: "no queries" }).reason
    ).toBe("no queries")
    expect(
      describeLocalSeoRunGate({ ...base, radiusError: "bad radius" }).reason
    ).toBe("bad radius")
    expect(
      describeLocalSeoRunGate({ ...base, runReadState: "error" }).reason
    ).toContain("could not be read")
    expect(
      describeLocalSeoRunGate({ ...base, runReadState: "pending" }).reason
    ).toContain("Checking the latest run")
  })

  test("blocks active runs and unsettled spend", () => {
    expect(
      describeLocalSeoRunGate({ ...base, runStatus: "running" }).reason
    ).toContain("already queued or running")
    expect(
      describeLocalSeoRunGate({ ...base, runStatus: "queued" }).canStart
    ).toBe(false)
    expect(
      describeLocalSeoRunGate({ ...base, reservedCredits: 3 }).reason
    ).toContain("reserved credits")
    expect(
      describeLocalSeoRunGate({ ...base, unconfirmedCalls: 2 }).canStart
    ).toBe(false)
  })

  test("an active run blocks the button and cannot charge another run", () => {
    for (const runStatus of ["queued", "running"] as const) {
      const gate = describeLocalSeoRunGate({ ...base, runStatus })
      expect(gate.canStart).toBe(false)
      expect(gate.reason).toContain("Starting another run is blocked")
      expect(gate.reason).toContain("cannot charge another run")
    }
  })

  test("unknown allowance blocks and never becomes a default balance", () => {
    expect(
      describeLocalSeoRunGate({ ...base, budgetState: "loading" }).reason
    ).toContain("Checking the Maps allowance")
    const errored = describeLocalSeoRunGate({
      ...base,
      budgetState: "error",
      availableCredits: null,
    })
    expect(errored.canStart).toBe(false)
    expect(errored.reason).toContain("could not be read")
    const insufficient = describeLocalSeoRunGate({
      ...base,
      availableCredits: 20,
    })
    expect(insufficient.reason).toContain("Not enough Maps allowance")
    expect(insufficient.reason).toContain("20 credits available")
    expect(insufficient.reason).toContain("27 required")
  })

  test("a just-created run blocks until the latest read confirms it", () => {
    const confirming = describeLocalSeoRunGate({
      ...base,
      confirmingCreatedRun: true,
    })
    expect(confirming.canStart).toBe(false)
    expect(confirming.reason).toContain("just started")
    const refreshing = describeLocalSeoRunGate({
      ...base,
      refreshingAfterError: true,
    })
    expect(refreshing.canStart).toBe(false)
    expect(refreshing.reason).toContain("start failed")
  })

  test("a non-finite, negative, or fractional allowance is unusable and blocks", () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      12.5,
    ]) {
      const result = describeLocalSeoRunGate({
        ...base,
        availableCredits: value,
      })
      expect(result.canStart).toBe(false)
      expect(result.reason).toContain("allowance")
    }
  })
})

describe("run progress reporting", () => {
  test("absent backend progress stays unavailable, never a fake zero", () => {
    expect(describeLocalSeoRunProgress(makeRun())).toBe("Progress unavailable")
    expect(
      describeLocalSeoRunProgress(
        makeRun({ completed_cells: null, total_cells: null })
      )
    ).toBe("Progress unavailable")
    expect(
      describeLocalSeoRunProgress(
        makeRun({ completed_cells: 12, total_cells: 45 })
      )
    ).toBe("12/45 cells settled")
  })
})

describe("next run pricing", () => {
  test("one saved query prices at twenty-seven credits", () => {
    const html = renderControls({
      location: makeLocation({ queries: [mapQuery("coffee")] }),
      budget: makeBudget(),
    })
    expect(html).toContain("Start run · 27 credits")
    expect(html).toContain("1 query × 9 points × 3 credits = 27 credits")
    expect(html).toContain("Saved queries: coffee")
    expect(html).toContain("Radius freezes at: 5000 m")
  })

  test("two saved queries price at fifty-four credits", () => {
    const html = renderControls({
      location: makeLocation({ queries: [mapQuery("coffee"), mapQuery("tea")] }),
      budget: makeBudget(),
    })
    expect(html).toContain("Start run · 54 credits")
    expect(html).toContain("2 queries × 9 points × 3 credits = 54 credits")
    expect(html).toContain("Saved queries: coffee · tea")
  })

  test("five saved queries price at one hundred thirty-five credits", () => {
    const html = renderControls({
      location: makeLocation({
        queries: ["a", "b", "c", "d", "e"].map((text) => mapQuery(text)),
      }),
      budget: makeBudget(),
    })
    expect(html).toContain("Start run · 135 credits")
    expect(html).toContain("5 queries × 9 points × 3 credits = 135 credits")
  })

  test("zero or six saved queries stay blocked with the validator reason", () => {
    const none = renderControls({
      location: makeLocation({ queries: [] }),
      budget: makeBudget(),
    })
    expect(none).toContain("Between 1 and 5 queries are required, got 0.")
    expect(/disabled[^>]*>Start run/.test(none)).toBe(true)

    const many = renderControls({
      location: makeLocation({
        queries: ["a", "b", "c", "d", "e", "f"].map((text) => mapQuery(text)),
      }),
      budget: makeBudget(),
    })
    expect(many).toContain("Between 1 and 5 queries are required, got 6.")
    expect(/disabled[^>]*>Start run/.test(many)).toBe(true)
  })
})

describe("allowance display", () => {
  test("shows the authoritative available allowance and the after-run balance", () => {
    const html = renderControls({
      location: makeLocation({ queries: [mapQuery("coffee")] }),
      budget: makeBudget({ available_credits: 365 }),
    })
    expect(html).toContain("365 credits available")
    expect(html).toContain("338 after this run")
  })

  test("an insufficient allowance blocks without defaulting the balance", () => {
    const html = renderControls({
      location: makeLocation({ queries: [mapQuery("coffee")] }),
      budget: makeBudget({ available_credits: 20 }),
    })
    expect(html).toContain("20 credits available")
    expect(html).toContain("Not enough Maps allowance")
    expect(/disabled[^>]*>Start run/.test(html)).toBe(true)
  })

  test("an insufficient allowance never renders a negative after-run balance", () => {
    const html = renderControls({
      location: makeLocation({ queries: [mapQuery("coffee")] }),
      budget: makeBudget({ available_credits: 20 }),
    })
    expect(html).toContain("20 credits available")
    expect(html).toContain("27 required")
    expect(html.includes("after this run")).toBe(false)
  })

  test("an unloaded allowance reads as unknown and blocks", () => {
    const html = renderControls({
      location: makeLocation({ queries: [mapQuery("coffee")] }),
    })
    expect(html).toContain("Maps allowance: unknown")
    expect(html).toContain("Checking the Maps allowance")
    expect(/disabled[^>]*>Start run/.test(html)).toBe(true)
  })

  test("a failed allowance read stays unknown and blocks", async () => {
    installRunFetch({ budgetError: true })
    const { container } = await mountControls({
      location: makeLocation({ queries: [mapQuery("coffee")] }),
    })
    await flushUntil(() =>
      (container.textContent ?? "").includes("allowance could not be read")
    )
    expect(container.textContent).toContain("Maps allowance: unknown")
    expect(container.textContent).toContain("allowance could not be read")
    expect(container.textContent?.includes("500 credits available")).toBe(false)
    expect(/disabled[^>]*>Start run/.test(container.innerHTML)).toBe(true)
  })
})

describe("identity and capability guards", () => {
  test("unbound locations cannot start a run", () => {
    const html = renderControls({
      location: makeLocation({ place_id: null }),
      budget: makeBudget(),
    })
    expect(html).toContain("Bind a Google listing before starting a run.")
    expect(/disabled[^>]*>Start run/.test(html)).toBe(true)
  })

  test("remote locations cannot start a run", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      isRemote: true,
    })
    expect(html).toContain("This location is remote")
    expect(/disabled[^>]*>Start run/.test(html)).toBe(true)
  })

  test("an active run blocks a second paid start", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({ status: "running" }),
    })
    expect(html).toContain("A run is already queued or running")
    expect(/disabled[^>]*>Start run/.test(html)).toBe(true)
  })

  test("reserved credits from the last run block a new paid start", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({ status: "completed", reserved_credits: 3 }),
    })
    expect(html).toContain("reserved credits or unconfirmed charges")
    expect(/disabled[^>]*>Start run/.test(html)).toBe(true)
  })
})

describe("latest recorded run", () => {
  test("uses the run's own frozen queries and radius", () => {
    const html = renderControls({
      location: makeLocation({ queries: [mapQuery("live-edit")] }),
      budget: makeBudget(),
      run: makeRun({ queries: ["frozen-a", "frozen-b"], radius_m: 8000 }),
    })
    expect(html).toContain("Frozen queries: frozen-a · frozen-b")
    expect(html).toContain("Frozen radius: 8000 m")
    expect(html.includes("Frozen queries: live-edit")).toBe(false)
  })

  test("progress absent stays honest and present progress reads n/m", () => {
    const absent = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({ status: "running" }),
    })
    expect(absent).toContain("Progress unavailable")
    expect(absent.includes("0/45")).toBe(false)
    expect(absent.includes("0 cells settled")).toBe(false)

    const present = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({
        status: "running",
        completed_cells: 12,
        total_cells: 45,
        credits_used: 36,
      }),
    })
    expect(present).toContain("12/45 cells settled")
    expect(present).toContain("36 credits used")
  })

  test("queued runs say the worker is pending", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({ status: "queued", completed_cells: 0, total_cells: 45 }),
    })
    expect(html).toContain("Waiting for a worker.")
  })

  test("a queued run with a normal reservation is not called an unclean settle", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({
        status: "queued",
        reserved_credits: 27,
        credits_used: 0,
        completed_cells: 0,
        total_cells: 45,
      }),
    })
    expect(html).toContain("27 still held")
    expect(html.includes("did not settle cleanly")).toBe(false)
  })

  test("a terminal run with a lingering hold warns and shows the amount", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({ status: "completed", reserved_credits: 3 }),
    })
    expect(html).toContain("3 still held")
    expect(html).toContain("did not settle cleanly")
  })

  test("failed runs show the error and never claim a clean settle", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({
        status: "failed",
        error: "Worker crashed",
        credits_used: 12,
        reserved_credits: 3,
        unconfirmed_calls: 1,
      }),
    })
    expect(html).toContain("Worker crashed")
    expect(html).toContain("12 credits used")
    expect(html).toContain("3 still held")
    expect(html).toContain("1 unresolved charge")
    expect(html).toContain("did not settle cleanly")
  })

  test("a failed latest-run read is named and blocks a retrigger", async () => {
    installRunFetch({ runError: true })
    const { container } = await mountControls({
      location: makeLocation(),
    })
    await flushUntil(() =>
      (container.textContent ?? "").includes("latest run could not be read")
    )
    expect(container.textContent).toContain("run read failed")
    expect(container.textContent).toContain("latest run could not be read")
    expect(/disabled[^>]*>Start run/.test(container.innerHTML)).toBe(true)
  })

  test("no recorded run reads plainly without inventing one", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
    })
    expect(html).toContain("No runs recorded yet.")
  })
})

describe("explicit paid start", () => {
  test("nothing is posted on render; one click enqueues one run", async () => {
    installRunFetch()
    const started: string[] = []
    const { container } = await mountControls({
      onRunStarted: (runId) => started.push(runId),
    })
    expect(fetchCalls.filter((call) => call.method === "POST")).toEqual([])

    const button = await waitForEnabledStart(container)
    await act(async () => {
      press(button)
      await flushTestDom()
      await flushTestDom()
      await flushTestDom()
    })

    const posts = fetchCalls.filter((call) => call.method === "POST")
    expect(posts.length).toBe(1)
    expect(posts[0].url.endsWith("/runs")).toBe(true)
    expect(posts[0].body).toEqual({ radius_m: 5000, expected_credits: 27 })
    expect(started).toEqual(["run-9"])
  })

  test("a failed create is never retried automatically", async () => {
    installRunFetch({ failCreate: true })
    const started: string[] = []
    const { container } = await mountControls({
      onRunStarted: (runId) => started.push(runId),
    })

    const button = await waitForEnabledStart(container)
    await act(async () => {
      press(button)
      await flushTestDom()
      await flushTestDom()
      await flushTestDom()
    })

    expect(fetchCalls.filter((call) => call.method === "POST").length).toBe(1)
    expect(started).toEqual([])
    expect(container.textContent).toContain("reservation failed")
    expect(
      container.textContent?.includes("No additional credits were charged")
    ).toBe(false)
  })

  test("a delayed latest read after a successful start blocks a second paid click", async () => {
    const pendingReadResolvers: Array<() => void> = []
    let latestReads = 0
    ;(globalThis as Record<string, unknown>).fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      const method = (init?.method ?? "GET").toUpperCase()
      fetchCalls.push({ url, method, body: null })
      if (url.includes("/runs/latest")) {
        latestReads += 1
        if (latestReads === 1) {
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
          })
        }
        await new Promise<void>((resolve) => pendingReadResolvers.push(resolve))
        return Response.json(makeRun({ id: "run-9", status: "queued" }))
      }
      if (url.endsWith("/runs") && method === "POST") {
        return Response.json({
          id: "run-9",
          status: "queued",
          expected_credits: 27,
        })
      }
      if (url.includes("/maps-budget")) return Response.json(makeBudget())
      if (url.includes("/locations")) return Response.json([])
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })
    }) as typeof fetch

    const started: string[] = []
    const { container } = await mountControls({
      location: makeLocation(),
      onRunStarted: (runId) => started.push(runId),
    })

    const startButton = await waitForEnabledStart(container)
    await act(async () => {
      press(startButton)
      await flushTestDom()
      await flushTestDom()
    })

    expect(fetchCalls.filter((call) => call.method === "POST").length).toBe(1)
    await flushUntil(() => buttonByText(container, "Start run").disabled)

    // A second click in the refetch gap must not post again.
    press(buttonByText(container, "Start run"))
    await act(async () => {
      await flushTestDom()
    })
    expect(fetchCalls.filter((call) => call.method === "POST").length).toBe(1)

    await act(async () => {
      pendingReadResolvers.forEach((resolve) => resolve())
      await flushTestDom()
      await flushTestDom()
    })
    expect(fetchCalls.filter((call) => call.method === "POST").length).toBe(1)
    expect(started).toEqual(["run-9"])
    expect(container.textContent).toContain(
      "A run is already queued or running"
    )
  })

  test("a start that resolves after navigation never reports the stale location", async () => {
    let resolveCreate: (() => void) | null = null
    ;(globalThis as Record<string, unknown>).fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString()
      const method = (init?.method ?? "GET").toUpperCase()
      fetchCalls.push({ url, method, body: null })
      if (url.includes("/runs/latest")) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        })
      }
      if (url.endsWith("/runs") && method === "POST") {
        await new Promise<void>((resolve) => {
          resolveCreate = resolve
        })
        return Response.json({
          id: "run-9",
          status: "queued",
          expected_credits: 27,
        })
      }
      if (url.includes("/maps-budget")) return Response.json(makeBudget())
      if (url.includes("/locations")) return Response.json([])
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
      })
    }) as typeof fetch

    const started: string[] = []
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    const renderFor = (location: LocalSeoLocation) => (
      <QueryClientProvider client={client}>
        <LocalSeoRunControls
          projectId={PROJECT}
          location={location}
          radiusM={5000}
          onRunStarted={(runId) => started.push(runId)}
        />
      </QueryClientProvider>
    )

    await act(async () => {
      root.render(renderFor(makeLocation({ id: "loc-a" })))
      await flushTestDom()
      await flushTestDom()
      await flushTestDom()
    })

    const startButton = await waitForEnabledStart(container)
    await act(async () => {
      press(startButton)
      await flushTestDom()
    })

    await act(async () => {
      root.render(renderFor(makeLocation({ id: "loc-b" })))
      await flushTestDom()
      await flushTestDom()
    })

    await act(async () => {
      resolveCreate?.()
      await flushTestDom()
      await flushTestDom()
    })

    expect(started).toEqual([])
    expect(container.textContent?.includes("A run was just started")).toBe(
      false
    )
    client.clear()
  })

  test("an in-progress conflict surfaces the backend message and never auto-posts", async () => {
    installRunFetch({ createStatus: 409, createMessage: CONFLICT_MESSAGE })
    const { container } = await mountControls({ location: makeLocation() })

    const startButton = await waitForEnabledStart(container)
    await act(async () => {
      press(startButton)
      await flushTestDom()
      await flushTestDom()
      await flushTestDom()
    })

    expect(container.textContent).toContain(CONFLICT_MESSAGE)
    expect(container.textContent?.includes("Could not start the run")).toBe(
      false
    )
    expect(fetchCalls.filter((call) => call.method === "POST").length).toBe(1)
  })

  test("a network failure is surfaced plainly and never auto-posts", async () => {
    installRunFetch({ createNetworkError: true })
    const { container } = await mountControls({ location: makeLocation() })

    const startButton = await waitForEnabledStart(container)
    await act(async () => {
      press(startButton)
      await flushTestDom()
      await flushTestDom()
      await flushTestDom()
    })

    expect(container.textContent).toContain("Failed to fetch")
    expect(container.textContent?.includes(CONFLICT_MESSAGE)).toBe(false)
    expect(fetchCalls.filter((call) => call.method === "POST").length).toBe(1)
  })

  test("a failed start re-reads the run and allowance without another post", async () => {
    installRunFetch({ failCreate: true })
    const { container } = await mountControls({ location: makeLocation() })

    const startButton = await waitForEnabledStart(container)
    await act(async () => {
      press(startButton)
      await flushTestDom()
      await flushTestDom()
      await flushTestDom()
    })

    expect(container.textContent).toContain("reservation failed")
    const posts = fetchCalls.filter((call) => call.method === "POST")
    expect(posts.length).toBe(1)
    const afterPost = fetchCalls.slice(fetchCalls.indexOf(posts[0]) + 1)
    expect(afterPost.every((call) => call.method === "GET")).toBe(true)
    expect(afterPost.some((call) => call.url.includes("/runs/latest"))).toBe(
      true
    )
    expect(afterPost.some((call) => call.url.includes("/maps-budget"))).toBe(
      true
    )
  })
})

function makeCell(overrides: Partial<LocalSeoCell> = {}): LocalSeoCell {
  return {
    query_index: 0,
    point_index: 0,
    latitude: 27.7,
    longitude: 85.3,
    distance_m: 0,
    ring: "centre",
    sector: "centre",
    call_status: "success_nonempty",
    match_status: "absent",
    rank: null,
    credits: 3,
    credit_known: true,
    error: null,
    ...overrides,
  }
}

const PARTIAL_QUERIES = [
  "coffee roasters",
  "plumbers",
  "Health Insurance Near Me",
  "dentists",
]

// Mirrors the observed run: 4 queries x 9 points = 36 calls, one call at
// query index 2 / point index 2 returned a viewport that could not be
// validated while still charging 3 confirmed credits.
function makePartialRunCells(): LocalSeoCell[] {
  const cells: LocalSeoCell[] = []
  for (let queryIndex = 0; queryIndex < PARTIAL_QUERIES.length; queryIndex++) {
    for (let pointIndex = 0; pointIndex < 9; pointIndex++) {
      if (queryIndex === 2 && pointIndex === 2) {
        cells.push(
          makeCell({
            query_index: queryIndex,
            point_index: pointIndex,
            sector: "NE",
            call_status: "request_failed",
            match_status: "unknown",
            rank: null,
            credits: 3,
            credit_known: true,
            error:
              "serper maps viewport format viewport '@27.7415903,85.354556,13.1655z'",
          })
        )
      } else {
        cells.push(
          makeCell({ query_index: queryIndex, point_index: pointIndex })
        )
      }
    }
  }
  return cells
}

describe("partial and failed run outcomes", () => {
  test("a fully charged partial run names the unranked call, not a false reservation", () => {
    const html = renderControls({
      location: makeLocation({ queries: PARTIAL_QUERIES.map((text) => mapQuery(text)) }),
      budget: makeBudget(),
      run: makeRun({
        id: "135fefe9-9298-466b-bee3-06a4b9232e65",
        status: "partial",
        radius_m: 5000,
        queries: PARTIAL_QUERIES,
        expected_credits: 108,
        credits_used: 108,
        retry_credits: 0,
        reserved_credits: 0,
        unconfirmed_calls: 0,
        completed_cells: 36,
        total_cells: 36,
        error: LOCAL_SEO_GENERIC_RUN_ERROR,
        cells: makePartialRunCells(),
      }),
    })

    expect(html).toContain("108 credits used")
    expect(html).toContain("No credits are held")
    expect(html).toContain("Health Insurance Near Me")
    expect(html).toContain("point C (NE)")
    expect(html).toContain("viewport that could not be validated")
    expect(html).toContain("3 credits charged")
    expect(html).toContain("All 36 calls have recorded outcomes")
    expect(html).toContain("35 succeeded and 1 failed")
    expect(html.includes("were ranked")).toBe(false)
    expect(html).toContain("Charges are fully settled")
    expect(html).toContain("no auto-retry will run")

    // The stored generic message is false here and must not be shown.
    expect(html.includes(LOCAL_SEO_GENERIC_RUN_ERROR)).toBe(false)
    expect(html.includes("did not settle cleanly")).toBe(false)
    expect(html.includes("Confirmed spend may still rise")).toBe(false)
    expect(html.includes("held credits unknown")).toBe(false)
    expect(html.includes("unresolved charges unknown")).toBe(false)
  })

  test("a positive hold and an unknown charge stay explicitly unresolved", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({
        status: "failed",
        credits_used: 6,
        reserved_credits: 3,
        unconfirmed_calls: 1,
        cells: [],
        error: "Worker crashed",
      }),
    })

    expect(html).toContain("6 credits used")
    expect(html).toContain("3 still held")
    expect(html).toContain("1 unresolved charge")
    expect(html).toContain("Worker crashed")
    expect(html).toContain("did not settle cleanly")
    expect(html).toContain("Confirmed spend may still rise")
  })

  test("absent hold and unconfirmed fields are unknown, never zero", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({ status: "completed", credits_used: 27 }),
    })

    expect(html).toContain("held credits unknown")
    expect(html).toContain("unresolved charges unknown")
    expect(html.includes("No credits are held")).toBe(false)
    expect(html.includes("3 still held")).toBe(false)
  })

  test("terminal pending calls read as unfinished, never as unstarted", () => {
    const html = renderControls({
      location: makeLocation({ queries: [mapQuery("coffee roasters")] }),
      budget: makeBudget(),
      run: makeRun({
        status: "partial",
        expected_credits: 6,
        credits_used: 3,
        reserved_credits: 0,
        unconfirmed_calls: 0,
        completed_cells: 1,
        total_cells: 2,
        cells: [
          makeCell({
            query_index: 0,
            point_index: 0,
            call_status: "success_empty",
            match_status: "absent",
            credits: 3,
            credit_known: true,
          }),
          makeCell({
            query_index: 0,
            point_index: 1,
            sector: "N",
            call_status: "pending",
            match_status: "unknown",
            credits: 0,
            credit_known: false,
            error: null,
          }),
        ],
      }),
    })

    expect(html).toContain("no result recorded")
    expect(html).toContain("unfinished")
    expect(html.includes("unstarted")).toBe(false)
    expect(html.includes("did not start")).toBe(false)
  })

  test("an active run's normal hold is not called an unclean settle", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({
        status: "running",
        reserved_credits: 27,
        credits_used: 0,
      }),
    })

    expect(html).toContain("27 still held")
    expect(html.includes("did not settle cleanly")).toBe(false)
    expect(html.includes("Charges are fully settled")).toBe(false)
  })

  test("a non-generic backend error is preserved for unexplained failures", () => {
    const html = renderControls({
      location: makeLocation(),
      budget: makeBudget(),
      run: makeRun({
        status: "failed",
        credits_used: 0,
        reserved_credits: 0,
        unconfirmed_calls: 0,
        error: "The worker stopped before recording any result",
        cells: [],
      }),
    })

    expect(html).toContain("The worker stopped before recording any result")
  })
})
