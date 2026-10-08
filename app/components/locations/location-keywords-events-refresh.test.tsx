import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query"

import { LocationKeywordsView } from "~/components/locations/location-keywords-view"
import { RevbotStartPromptContext } from "~/components/revbot/revbot-start-prompt-context"
import { OrganizationEventsProvider } from "~/hooks/use-organization-events"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import {
  fetchLocalSeoLandmarks,
  localSeoLandmarksQueryKey,
} from "~/lib/local-seo-api"
import { FeaturesProvider } from "~/lib/features"
import type { OrgFeatures } from "~/lib/api.types"

installTestDom()

const ORG = "org-1"
const PROJECT = "proj-1"
const LOCATION_A = "loc-a"

const FEATURES: OrgFeatures = {
  auto_crawl: true,
  gsc_connector: true,
  ai_chat: true,
  integrations: true,
  ai_use_internal_prompt: false,
  ai_monthly_message_limit: 50,
  ai_concurrent_turn_limit_per_user: 2,
  ai_allowed_reasoning_efforts: ["none", "low", "high", "max"],
  max_competitors: 3,
  max_projects: 5,
}

const EMPTY_LISTS = {
  can_manage_keywords: true,
  user_defined: { branded: [], non_branded: [] },
  revserp_suggested: { branded: [], non_branded: [] },
  selected: { branded: [], non_branded: [] },
  suggested_origins: {},
}

const encoder = new TextEncoder()
const realFetch = globalThis.fetch
let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
let keywordListsGets = 0
let landmarksGets = 0

function installSSEFetch() {
  keywordListsGets = 0
  landmarksGets = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes(`/organizations/${ORG}/events`)) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller
        },
      })
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      })
    }
    if (url.includes(`/locations/${LOCATION_A}/keyword-lists`)) {
      keywordListsGets += 1
      return Response.json(EMPTY_LISTS)
    }
    if (url.includes(`/locations/${LOCATION_A}/landmarks`)) {
      landmarksGets += 1
      return Response.json([])
    }
    if (url.includes(`/locations/${LOCATION_A}/keywords`)) {
      return Response.json({
        project_id: PROJECT,
        location_id: LOCATION_A,
        crawl_id: null,
        seeds: [],
      })
    }
    throw new Error(`unexpected request ${url}`)
  }) as typeof fetch
}

function emitLocationKeywordsEvent(locationId: string) {
  streamController?.enqueue(
    encoder.encode(
      `event: location_keywords.updated\nid: 7\ndata: ${JSON.stringify({
        organization_id: ORG,
        project_id: PROJECT,
        resource_id: locationId,
        payload: {
          location_id: locationId,
          source: "revserp",
          brand_keywords: 0,
          non_brand_keywords: 0,
        },
      })}\n\n`
    )
  )
}

function LandmarksProbe() {
  useQuery({
    queryKey: localSeoLandmarksQueryKey(PROJECT, LOCATION_A),
    queryFn: () => fetchLocalSeoLandmarks(PROJECT, LOCATION_A),
  })
  return null
}

function buttonByText(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => (button.textContent ?? "").includes(text)
  )
}

async function flush() {
  await act(async () => {
    await flushTestDom()
    await flushTestDom()
    await flushTestDom()
  })
}

/** The provider opens the SSE stream in an effect; wait until the test can push to it. */
async function waitForStream() {
  for (let attempt = 0; attempt < 20 && !streamController; attempt += 1) {
    await flush()
  }
  if (!streamController) throw new Error("SSE stream never opened")
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let client: QueryClient | null = null

afterEach(async () => {
  await act(async () => {
    root?.unmount()
    streamController?.close()
    await flushTestDom()
  })
  host?.remove()
  client?.clear()
  root = null
  host = null
  client = null
  streamController = null
  globalThis.fetch = realFetch
})

function mountView(prompts: string[]) {
  installSSEFetch()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(
      <QueryClientProvider client={client!}>
        <FeaturesProvider features={FEATURES}>
          <OrganizationEventsProvider
            onCrawlEvent={() => {}}
            onReady={() => {}}
            onViewVisibility={() => {}}
            orgId={ORG}
            revalidate={() => {}}
          >
            <RevbotStartPromptContext.Provider
              value={{
                startPrompt: (content) => prompts.push(content),
                isActive: false,
              }}
            >
              <LandmarksProbe />
              <LocationKeywordsView
                locationId={LOCATION_A}
                projectId={PROJECT}
              />
            </RevbotStartPromptContext.Provider>
          </OrganizationEventsProvider>
        </FeaturesProvider>
      </QueryClientProvider>
    )
  })
}

describe("location keywords Revbot refresh over SSE", () => {
  test("a location_keywords.updated frame ends watching and re-reads only this location, even with unchanged lists", async () => {
    const prompts: string[] = []
    mountView(prompts)
    await flush()
    await waitForStream()

    await act(async () => {
      buttonByText(host!, "Find keywords")!.click()
      await flushTestDom()
    })
    expect(prompts).toHaveLength(1)
    expect(host!.textContent).toContain("Finding…")

    const keywordGetsBefore = keywordListsGets
    const landmarkGetsBefore = landmarksGets

    await act(async () => {
      emitLocationKeywordsEvent(LOCATION_A)
      await flushTestDom()
    })
    await flush()

    // The event, not a list diff, ends watching: the lists are still empty.
    expect((host!.textContent ?? "").includes("Finding…")).toBe(false)
    expect(host!.textContent).toContain("Find keywords")
    // Canonical invalidation re-read the card and this location's landmarks.
    expect(keywordListsGets > keywordGetsBefore).toBe(true)
    expect(landmarksGets > landmarkGetsBefore).toBe(true)
  })

  test("a sibling location's frame is ignored", async () => {
    mountView([])
    await flush()
    await waitForStream()

    await act(async () => {
      buttonByText(host!, "Find keywords")!.click()
      await flushTestDom()
    })
    const landmarkGetsBefore = landmarksGets

    await act(async () => {
      emitLocationKeywordsEvent("loc-sibling")
      await flushTestDom()
    })
    await flush()

    expect(host!.textContent).toContain("Finding…")
    // Only the central branch invalidates landmarks; a sibling frame must not.
    expect(landmarksGets).toBe(landmarkGetsBefore)
  })
})
