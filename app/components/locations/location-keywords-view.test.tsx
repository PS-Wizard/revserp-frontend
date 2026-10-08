import { afterEach, describe, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { LocationKeywordsView } from "~/components/locations/location-keywords-view"
import { RevbotStartPromptContext } from "~/components/revbot/revbot-start-prompt-context"
import {
  locationKeywordCoverageQueryKey,
  locationKeywordListsQueryKey,
} from "~/lib/location-keywords-api"
import { LocationWorkspaceProvider } from "~/lib/location-workspace"
import type { LocalSeoLocation } from "~/lib/local-seo-api"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

type Group = { branded: string[]; non_branded: string[] }
type Lists = {
  can_manage_keywords: boolean
  user_defined: Group
  revserp_suggested: Group
  selected: Group
  suggested_origins?: Record<string, string[]>
}
type FetchCall = { url: string; method: string; body: unknown }

const PROJECT = "proj-1"
const LOCATION_A = "loc-a"
const LOCATION_B = "loc-b"

const fetchCalls: FetchCall[] = []
const realFetch = globalThis.fetch

function emptyLists(partial: Partial<Lists> = {}): Lists {
  return {
    can_manage_keywords: true,
    user_defined: { branded: [], non_branded: [] },
    revserp_suggested: { branded: [], non_branded: [] },
    selected: { branded: [], non_branded: [] },
    suggested_origins: {},
    ...partial,
  }
}

/** In-memory location keyword-lists store keyed by location id. */
function installFetch(store: Record<string, Lists>) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })

    const listsMatch = url.match(/\/locations\/([^/]+)\/keyword-lists$/)
    if (listsMatch) {
      const lists = store[listsMatch[1]]
      if (!lists) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
        })
      }
      if (method === "GET") return Response.json(lists)
      if (method === "PUT") {
        const write = body as { user_defined: Group; selected: Group }
        lists.user_defined = write.user_defined
        lists.selected = write.selected
        return Response.json(lists)
      }
    }

    if (/\/locations\/[^/]+\/keywords$/.test(url) && method === "GET") {
      const locationMatch = url.match(/\/locations\/([^/]+)\/keywords$/)
      return Response.json({
        project_id: PROJECT,
        location_id: locationMatch?.[1] ?? "",
        crawl_id: null,
        seeds: [],
      })
    }

    const refreshMatch = url.match(/\/locations\/([^/]+)\/landmarks\/refresh$/)
    if (refreshMatch && method === "POST") {
      const lists = store[refreshMatch[1]]
      if (lists) {
        lists.revserp_suggested = {
          branded: ["nearby landmark"],
          non_branded: [],
        }
      }
      return Response.json([])
    }

    throw new Error(`unexpected ${method} ${url}`)
  }) as typeof fetch
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
}

function tree(
  client: QueryClient,
  projectId: string,
  locationId: string,
  opts: {
    canManage?: boolean
    startPrompt?: (content: string) => void
  } = {}
): ReactElement {
  let view: ReactElement = (
    <LocationKeywordsView locationId={locationId} projectId={projectId} />
  )
  if (opts.startPrompt) {
    view = (
      <RevbotStartPromptContext.Provider
        value={{ startPrompt: opts.startPrompt, isActive: false }}
      >
        {view}
      </RevbotStartPromptContext.Provider>
    )
  }
  if (opts.canManage === undefined) {
    return <QueryClientProvider client={client}>{view}</QueryClientProvider>
  }
  return (
    <QueryClientProvider client={client}>
      <LocationWorkspaceProvider
        workspace={{
          projectId,
          location: { id: locationId } as LocalSeoLocation,
          canManage: opts.canManage,
          websiteScope: null,
          websiteScopeRevisions: [],
        }}
      >
        {view}
      </LocationWorkspaceProvider>
    </QueryClientProvider>
  )
}

const mountedRoots: Array<() => void> = []

function renderView(element: ReactElement) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(element)
  })
  let unmounted = false
  const unmount = () => {
    if (unmounted) return
    unmounted = true
    act(() => root.unmount())
    host.remove()
  }
  mountedRoots.push(unmount)
  return { host, unmount }
}

async function flush() {
  await act(async () => {
    await flushTestDom()
    await flushTestDom()
  })
}

function setInputValue(input: HTMLInputElement, value: string) {
  // This happy-dom build lacks React-detected input support, so onChange only
  // fires through React's keydown polyfill path: focus first, then change value.
  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }))
}

function buttonByText(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => (button.textContent ?? "").includes(text)
  )
}

/** The first matching button that is not disabled, for labels repeated per card. */
function enabledButtonByText(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => (button.textContent ?? "").includes(text) && !button.disabled
  )
}

/** Text of the keyword cloud card only, so list rows cannot satisfy an assertion. */
function cloudText(host: HTMLElement) {
  const heading = Array.from(host.querySelectorAll("h3")).find(
    (element) => element.textContent?.trim() === "Keyword cloud"
  )
  return heading?.closest('[data-slot="card"]')?.textContent ?? ""
}

/** Reads against the real location coverage endpoint for this test location. */
function coverageReads() {
  return fetchCalls.filter(
    (call) =>
      call.method === "GET" &&
      call.url.includes(`/locations/${LOCATION_A}/keywords`)
  ).length
}

afterEach(() => {
  // Unmount any root a failed assertion left mounted before clearing globals.
  for (const unmount of mountedRoots.splice(0)) unmount()
  globalThis.fetch = realFetch
  fetchCalls.length = 0
  document.body.innerHTML = ""
})

describe("location keywords view", () => {
  test("mounting only issues GET reads and never writes", async () => {
    installFetch({ [LOCATION_A]: emptyLists() })
    const client = makeClient()
    const { unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    expect(fetchCalls.length > 0).toBe(true)
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)
    expect(
      fetchCalls.some((call) =>
        call.url.includes(`/projects/${PROJECT}/keyword-lists`)
      )
    ).toBe(false)
    expect(
      fetchCalls.some((call) =>
        call.url.includes(`/locations/${LOCATION_A}/keyword-lists`)
      )
    ).toBe(true)
    expect(
      fetchCalls.some((call) =>
        call.url.includes(`/locations/${LOCATION_A}/keywords`)
      )
    ).toBe(true)

    unmount()
  })

  test("a manual keyword add PUTs only the location lists endpoint", async () => {
    installFetch({ [LOCATION_A]: emptyLists() })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    await act(async () => {
      buttonByText(host, "New keyword")!.click()
      await flushTestDom()
    })
    await act(async () => {
      setInputValue(
        host.querySelector<HTMLInputElement>(
          'input[aria-label="New location keyword"]'
        )!,
        "coffee shop"
      )
      await flushTestDom()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
      await flushTestDom()
      await flushTestDom()
    })

    const put = fetchCalls.find((call) => call.method === "PUT")
    expect(put).toBeTruthy()
    expect(put!.url.includes(`/locations/${LOCATION_A}/keyword-lists`)).toBe(
      true
    )
    expect((put!.body as { user_defined: Group }).user_defined.branded).toEqual(
      ["coffee shop"]
    )
    expect(fetchCalls.every((call) => call.method !== "POST")).toBe(true)
    expect(
      fetchCalls.some((call) =>
        call.url.includes(`/projects/${PROJECT}/keyword-lists`)
      )
    ).toBe(false)

    unmount()
  })

  test("the add form never nests a button inside a button", async () => {
    installFetch({ [LOCATION_A]: emptyLists() })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    await act(async () => {
      buttonByText(host, "New keyword")!.click()
      await flushTestDom()
    })

    const nested = Array.from(host.querySelectorAll("button")).filter(
      (button) => button.parentElement?.closest("button") != null
    )
    expect(nested.length).toBe(0)

    unmount()
  })

  test("selecting a suggestion writes it to this location's selected list", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        revserp_suggested: { branded: ["acme plumbing"], non_branded: [] },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    const checkbox = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Select keyword acme plumbing"]'
    )!
    expect(checkbox.getAttribute("aria-checked")).toBe("false")

    await act(async () => {
      checkbox.click()
      await flushTestDom()
      await flushTestDom()
    })

    const put = fetchCalls.find((call) => call.method === "PUT")
    expect(put).toBeTruthy()
    expect((put!.body as { selected: Group }).selected.branded).toEqual([
      "acme plumbing",
    ])
    expect(fetchCalls.every((call) => call.method !== "POST")).toBe(true)

    const checked = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Select keyword acme plumbing"]'
    )!
    expect(checked.getAttribute("aria-checked")).toBe("true")

    unmount()
  })

  test("find nearby keywords is one explicit owner POST that refreshes suggestions", async () => {
    installFetch({ [LOCATION_A]: emptyLists() })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    // Mounting and saving never call the paid-adjacent refresh endpoint.
    expect(
      fetchCalls.some((call) => call.url.includes("/landmarks/refresh"))
    ).toBe(false)
    const listsGetsBefore = fetchCalls.filter(
      (call) => call.url.includes("/keyword-lists") && call.method === "GET"
    ).length

    await act(async () => {
      buttonByText(host, "Find nearby keywords")!.click()
      await flushTestDom()
      await flushTestDom()
    })

    const refreshPosts = fetchCalls.filter(
      (call) =>
        call.method === "POST" &&
        call.url.includes(`/locations/${LOCATION_A}/landmarks/refresh`)
    )
    expect(refreshPosts).toHaveLength(1)
    const listsGetsAfter = fetchCalls.filter(
      (call) => call.url.includes("/keyword-lists") && call.method === "GET"
    ).length
    expect(listsGetsAfter > listsGetsBefore).toBe(true)

    expect(host.textContent).toContain("nearby landmark")
    const checkbox = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Select keyword nearby landmark"]'
    )!
    expect(checkbox.getAttribute("aria-checked")).toBe("false")
    expect(host.textContent?.includes("Google may bill")).toBe(false)

    unmount()
  })

  test("selected keywords stay isolated when the location changes", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        selected: { branded: ["pizza"], non_branded: [] },
      }),
      [LOCATION_B]: emptyLists({
        selected: { branded: ["sushi"], non_branded: [] },
      }),
    })
    const client = makeClient()

    const first = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()
    expect(first.host.textContent).toContain("pizza")
    first.unmount()

    const second = renderView(tree(client, PROJECT, LOCATION_B))
    await flush()
    expect(second.host.textContent).toContain("sushi")
    expect((second.host.textContent ?? "").includes("pizza")).toBe(false)
    second.unmount()
  })

  test("a read-only workspace hides add and disables selection", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        can_manage_keywords: true,
        revserp_suggested: { branded: ["acme plumbing"], non_branded: [] },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(
      tree(client, PROJECT, LOCATION_A, { canManage: false })
    )
    await flush()

    expect(buttonByText(host, "New keyword")).toBeUndefined()
    expect(buttonByText(host, "Find nearby keywords")).toBeUndefined()
    const checkbox = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Select keyword acme plumbing"]'
    )
    expect(checkbox).toBeTruthy()
    expect(checkbox!.disabled).toBe(true)
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)

    unmount()
  })

  test("any number of selected keywords is allowed with no local cap", async () => {
    const phrases = Array.from(
      { length: 12 },
      (_, index) => `suggested ${index + 1}`
    )
    installFetch({
      [LOCATION_A]: emptyLists({
        revserp_suggested: { branded: phrases, non_branded: [] },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    for (const phrase of phrases) {
      const checkbox = host.querySelector<HTMLButtonElement>(
        `button[aria-label="Select keyword ${phrase}"]`
      )!
      await act(async () => {
        checkbox.click()
        await flushTestDom()
        await flushTestDom()
      })
    }

    const puts = fetchCalls.filter((call) => call.method === "PUT")
    const finalBody = puts[puts.length - 1]!.body as { selected: Group }
    expect(finalBody.selected.branded).toHaveLength(12)
    expect((host.textContent ?? "").includes("Select up to")).toBe(false)

    unmount()
  })

  test("suggested rows label their service/locality/landmark provenance", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        revserp_suggested: {
          branded: ["acme plumbing", "acme in kathmandu"],
          non_branded: [],
        },
        suggested_origins: {
          "acme plumbing": ["service"],
          "acme in kathmandu": ["service", "locality"],
        },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    expect(host.textContent).toContain("Service")
    expect(host.textContent).toContain("Locality")
    unmount()
  })

  test("Select all then Deselect all moves every suggestion of the kind", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        revserp_suggested: {
          branded: ["acme plumbing", "acme drain"],
          non_branded: [],
        },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    await act(async () => {
      enabledButtonByText(host, "Select all")!.click()
      await flushTestDom()
      await flushTestDom()
    })
    let puts = fetchCalls.filter((call) => call.method === "PUT")
    let body = puts[puts.length - 1]!.body as { selected: Group }
    expect(body.selected.branded).toEqual(["acme plumbing", "acme drain"])

    await act(async () => {
      enabledButtonByText(host, "Deselect all")!.click()
      await flushTestDom()
      await flushTestDom()
    })
    puts = fetchCalls.filter((call) => call.method === "PUT")
    body = puts[puts.length - 1]!.body as { selected: Group }
    expect(body.selected.branded).toEqual([])

    unmount()
  })

  test("inline rename updates the user keyword in place", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        user_defined: { branded: ["acme"], non_branded: [] },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Edit keyword acme"]'
        )!
        .click()
      await flushTestDom()
    })
    await act(async () => {
      setInputValue(
        host.querySelector<HTMLInputElement>(
          'input[aria-label="Rename keyword"]'
        )!,
        "acme plumbing"
      )
      await flushTestDom()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
      await flushTestDom()
      await flushTestDom()
    })

    const puts = fetchCalls.filter((call) => call.method === "PUT")
    const body = puts[puts.length - 1]!.body as { user_defined: Group }
    expect(body.user_defined.branded).toEqual(["acme plumbing"])

    unmount()
  })

  test("changing selection refetches coverage and updates the cloud", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        revserp_suggested: { branded: ["acme plumbing"], non_branded: [] },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    expect(
      client.getQueryData(locationKeywordCoverageQueryKey(PROJECT, LOCATION_A))
    ).toBeTruthy()
    const before = coverageReads()
    expect(before > 0).toBe(true)

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Select keyword acme plumbing"]'
        )!
        .click()
      await flushTestDom()
      await flushTestDom()
    })

    expect(coverageReads() > before).toBe(true)
    const lists = client.getQueryData(
      locationKeywordListsQueryKey(PROJECT, LOCATION_A)
    ) as {
      selected: Group
    }
    expect(lists.selected.branded).toEqual(["acme plumbing"])
    expect(cloudText(host)).toContain("acme plumbing")
    unmount()
  })

  test("the cloud shows only selected keywords, never the unselected union", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        user_defined: { branded: ["acme"], non_branded: [] },
        revserp_suggested: { branded: ["acme plumbing"], non_branded: [] },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    const cloud = cloudText(host)
    expect(cloud).toContain("Keyword cloud")
    expect(cloud.includes("acme plumbing")).toBe(false)
    expect(cloud.includes("acme")).toBe(false)
    unmount()
  })

  test("bulk Select all refreshes coverage and the cloud", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        revserp_suggested: {
          branded: ["acme plumbing", "acme drain"],
          non_branded: [],
        },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    const before = coverageReads()
    await act(async () => {
      enabledButtonByText(host, "Select all")!.click()
      await flushTestDom()
      await flushTestDom()
    })

    expect(coverageReads() > before).toBe(true)
    const cloud = cloudText(host)
    expect(cloud).toContain("acme plumbing")
    expect(cloud).toContain("acme drain")
    unmount()
  })

  test("renaming a selected keyword refreshes coverage and the cloud", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        user_defined: { branded: ["acme"], non_branded: [] },
        selected: { branded: ["acme"], non_branded: [] },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    expect(cloudText(host)).toContain("acme")
    const before = coverageReads()

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Edit keyword acme"]'
        )!
        .click()
      await flushTestDom()
    })
    await act(async () => {
      setInputValue(
        host.querySelector<HTMLInputElement>(
          'input[aria-label="Rename keyword"]'
        )!,
        "acme plumbing"
      )
      await flushTestDom()
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
      await flushTestDom()
      await flushTestDom()
    })

    expect(coverageReads() > before).toBe(true)
    const cloud = cloudText(host)
    expect(cloud).toContain("acme plumbing")
    unmount()
  })

  test("Find keywords opens Revbot with a location-scoped prompt and never runs on mount", async () => {
    installFetch({ [LOCATION_A]: emptyLists() })
    const client = makeClient()
    const prompts: string[] = []
    const { host, unmount } = renderView(
      tree(client, PROJECT, LOCATION_A, {
        startPrompt: (content) => prompts.push(content),
      })
    )
    await flush()

    expect(fetchCalls.length > 0).toBe(true)
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)

    const find = buttonByText(host, "Find keywords")
    expect(find).toBeTruthy()

    await act(async () => {
      find!.click()
      await flushTestDom()
      await flushTestDom()
    })

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain(LOCATION_A)
    expect(prompts[0]).toContain(PROJECT)
    expect(prompts[0]).toContain("update_project_keywords")
    expect(prompts[0]).toContain('source: "revserp"')
    expect(prompts[0]).toContain("brand_keywords")
    expect(prompts[0]).toContain("non_brand_keywords")
    expect(fetchCalls.every((call) => call.method === "GET")).toBe(true)

    unmount()
  })

  test("the suggested card shows one Find keywords action beside provider discovery", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        revserp_suggested: { branded: ["acme plumbing"], non_branded: [] },
      }),
    })
    const client = makeClient()
    const prompts: string[] = []
    const { host, unmount } = renderView(
      tree(client, PROJECT, LOCATION_A, {
        startPrompt: (content) => prompts.push(content),
      })
    )
    await flush()

    const findButtons = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button")
    ).filter((button) => (button.textContent ?? "").trim() === "Find keywords")
    expect(findButtons).toHaveLength(1)
    expect(buttonByText(host, "Find nearby keywords")).toBeTruthy()

    await act(async () => {
      findButtons[0]!.click()
      await flushTestDom()
    })
    expect(prompts).toHaveLength(1)
    expect(fetchCalls.every((call) => call.method !== "POST")).toBe(true)

    unmount()
  })

  test("watching ends once the suggestion lists change", async () => {
    installFetch({ [LOCATION_A]: emptyLists() })
    const client = makeClient()
    const { host, unmount } = renderView(
      tree(client, PROJECT, LOCATION_A, { startPrompt: () => {} })
    )
    await flush()

    await act(async () => {
      buttonByText(host, "Find keywords")!.click()
      await flushTestDom()
    })
    expect(host.textContent).toContain("Finding…")

    await act(async () => {
      client.setQueryData(
        locationKeywordListsQueryKey(PROJECT, LOCATION_A),
        emptyLists({
          revserp_suggested: { branded: ["acme plumbing"], non_branded: [] },
        })
      )
      await flushTestDom()
      await flushTestDom()
    })

    expect((host.textContent ?? "").includes("Finding…")).toBe(false)
    expect(host.textContent).toContain("acme plumbing")

    unmount()
  })

  test("source cards have no selection controls; only the union checklist selects", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        user_defined: { branded: ["acme"], non_branded: [] },
        revserp_suggested: { branded: ["acme plumbing"], non_branded: [] },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    expect(buttonByText(host, "Select all")).toBeTruthy()
    expect(buttonByText(host, "Deselect all")).toBeTruthy()
    const boxes = Array.from(
      host.querySelectorAll('button[aria-label^="Select keyword "]')
    )
    expect(boxes).toHaveLength(2)
    expect(host.textContent).toContain("Only checked keywords persist")
    expect(host.textContent).toContain("0 of 2 selected")

    await act(async () => {
      ;(boxes[0] as HTMLButtonElement).click()
      await flushTestDom()
      await flushTestDom()
    })
    const put = fetchCalls.find((call) => call.method === "PUT")
    expect(put).toBeTruthy()
    expect((put!.body as { selected: Group }).selected.branded).toEqual([
      "acme",
    ])

    unmount()
  })

  test("the selected checklist unions sources with leftovers and no kind tabs", async () => {
    installFetch({
      [LOCATION_A]: emptyLists({
        user_defined: { branded: ["Acme"], non_branded: [] },
        revserp_suggested: { branded: ["acme", "Acme Plumbing"], non_branded: [] },
        selected: { branded: ["Old Pick"], non_branded: [] },
      }),
    })
    const client = makeClient()
    const { host, unmount } = renderView(tree(client, PROJECT, LOCATION_A))
    await flush()

    const selectedHeading = Array.from(host.querySelectorAll("h3")).find(
      (element) => element.textContent?.trim() === "Selected keywords"
    )!
    const card = selectedHeading.closest('[data-slot="card"]')!
    expect(card.textContent).toContain("1 of 3 selected")
    expect(card.textContent).toContain("Old Pick")
    expect(card.querySelectorAll('[role="tab"]').length).toBe(0)
    const boxes = Array.from(
      card.querySelectorAll('button[aria-label^="Select keyword "]')
    )
    expect(boxes).toHaveLength(3)

    unmount()
  })

  test("a read-only workspace hides the Revbot keyword action", async () => {
    installFetch({ [LOCATION_A]: emptyLists() })
    const client = makeClient()
    const { host, unmount } = renderView(
      tree(client, PROJECT, LOCATION_A, {
        canManage: false,
        startPrompt: () => {},
      })
    )
    await flush()

    expect(buttonByText(host, "Find keywords")).toBeUndefined()
    expect(buttonByText(host, "Find nearby keywords")).toBeUndefined()
    expect(host.textContent?.includes("local seed prompts")).toBe(false)

    unmount()
  })
})
