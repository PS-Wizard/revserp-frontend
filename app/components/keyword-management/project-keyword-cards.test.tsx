import { afterEach, describe, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import {
  CombinedKeywordCloudCard,
  CombinedKeywordsCard,
  DefineYourKeywordsCard,
} from "~/components/keyword-management/project-keyword-cards"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

type KeywordKind = "brand" | "non_brand"
type Keyword = { id: string; keyword: string; kind: KeywordKind }
type Combined = { keyword: string; kind: KeywordKind; sources: string[] }
type Lists = {
  can_manage_keywords: boolean
  user_defined: Keyword[]
  revserp_suggested: Keyword[]
  combined: Combined[]
}

const PROJECT = "proj-1"
const fetchCalls: Array<{ url: string; method: string }> = []
const realFetch = globalThis.fetch

function emptyLists(partial: Partial<Lists> = {}): Lists {
  return {
    can_manage_keywords: true,
    user_defined: [],
    revserp_suggested: [],
    combined: [],
    ...partial,
  }
}

function installFetch(store: Lists) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    fetchCalls.push({ url, method })
    if (
      url.includes(`/projects/${PROJECT}/keyword-lists`) &&
      method === "GET"
    ) {
      return Response.json(store)
    }
    return new Response(JSON.stringify({ error: "unexpected" }), {
      status: 400,
    })
  }) as typeof fetch
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
}

const mountedRoots: Array<() => void> = []

function render(element: ReactElement, client = makeClient()) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    )
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

function buttonByText(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => (button.textContent ?? "").includes(text)
  )
}

function nestedButtons(host: HTMLElement) {
  return Array.from(host.querySelectorAll("button")).filter(
    (button) => button.parentElement?.closest("button") != null
  )
}

afterEach(() => {
  // Unmount any root a failed assertion left mounted before clearing globals.
  for (const unmount of mountedRoots.splice(0)) unmount()
  globalThis.fetch = realFetch
  fetchCalls.length = 0
  document.body.innerHTML = ""
})

describe("shared project keyword cards", () => {
  test("Define your keywords uses the shared header, list, and remove control", async () => {
    installFetch(
      emptyLists({
        user_defined: [{ id: "kw-1", keyword: "acme plumbing", kind: "brand" }],
      })
    )
    const { host, unmount } = render(
      <DefineYourKeywordsCard projectId={PROJECT} />
    )
    await flush()

    expect(host.textContent).toContain("Define your keywords")
    expect(host.textContent).toContain("Brand")
    expect(host.textContent).toContain("Non-brand")
    expect(host.textContent).toContain("acme plumbing")
    expect(
      host.querySelector('button[aria-label="Remove acme plumbing"]')
    ).toBeTruthy()
    expect(nestedButtons(host).length).toBe(0)

    unmount()
  })

  test("the parent add form never nests a button inside a button", async () => {
    installFetch(emptyLists())
    const { host, unmount } = render(
      <DefineYourKeywordsCard projectId={PROJECT} />
    )
    await flush()

    await act(async () => {
      buttonByText(host, "New keyword")!.click()
      await flushTestDom()
    })

    expect(nestedButtons(host).length).toBe(0)

    unmount()
  })

  test("Combined keywords lists shared rows with source badges", async () => {
    installFetch(
      emptyLists({
        combined: [
          {
            keyword: "emergency plumber",
            kind: "brand",
            sources: ["user", "revserp"],
          },
        ],
      })
    )
    const { host, unmount } = render(
      <CombinedKeywordsCard projectId={PROJECT} />
    )
    await flush()

    expect(host.textContent).toContain("Combined keywords")
    expect(host.textContent).toContain("emergency plumber")
    expect(host.textContent).toContain("User-defined")
    expect(host.textContent).toContain("Revserp suggested")

    unmount()
  })

  test("the keyword cloud reuses the shared cloud renderer", async () => {
    installFetch(
      emptyLists({
        combined: [
          { keyword: "acme plumbing", kind: "brand", sources: ["user"] },
        ],
      })
    )
    const { host, unmount } = render(
      <CombinedKeywordCloudCard projectId={PROJECT} />
    )
    await flush()

    expect(host.textContent).toContain("Keyword cloud")
    expect(host.textContent).toContain("acme plumbing")
    expect(host.textContent).toContain("Brand")
    expect(host.textContent).toContain("Non-brand")

    unmount()
  })
})
