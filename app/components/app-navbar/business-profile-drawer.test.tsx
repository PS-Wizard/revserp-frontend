import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { BusinessProfileDrawer } from "~/components/app-navbar/business-profile-drawer"
import { localSeoProjectServicesQueryKey } from "~/lib/local-seo-api"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

function makeBusinessProfile(overrides: Record<string, unknown> = {}) {
  const noop = () => undefined
  return {
    businessProfileProject: {
      id: "proj-1",
      organization_id: "org-1",
      name: "Test Project",
      base_url: "https://example.com",
    },
    brandName: "",
    websiteUrl: "https://example.com",
    primaryCategory: "",
    primaryLocation: "",
    businessDescription: "",
    productDescription: "legacy combined text stays verbatim",
    targetAudience: "",
    businessCompetitors: "",
    seedPrompts: ["", "", "", "", ""],
    businessProfileError: "",
    isLoadingBusinessProfile: false,
    isSavingBusinessProfile: false,
    canManageBusinessProfile: true,
    aiQuestions: null,
    isLoadingAIQuestions: false,
    isRegeneratingAIQuestions: false,
    hasUnsavedChanges: false,
    closeBusinessProfileDrawer: noop,
    regenerateAIQuestions: noop,
    handleSaveBusinessProfile: noop,
    updateSeedPrompt: noop,
    setBrandName: noop,
    setWebsiteUrl: noop,
    setPrimaryCategory: noop,
    setPrimaryLocation: noop,
    setBusinessDescription: noop,
    setProductDescription: noop,
    setTargetAudience: noop,
    setBusinessCompetitors: noop,
    setSeedPrompts: noop,
    openBusinessProfileDrawer: noop,
    ...overrides,
  } as unknown as Parameters<typeof BusinessProfileDrawer>[0]["businessProfile"]
}

let root: Root | null = null
let host: HTMLDivElement | null = null

function renderDrawer(profile: ReturnType<typeof makeBusinessProfile>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(localSeoProjectServicesQueryKey("proj-1"), [
    { id: "svc-1", label: "Coffee" },
  ])
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <BusinessProfileDrawer businessProfile={profile} />
      </QueryClientProvider>
    )
  })
  // Vaul renders drawer content in a portal on document.body.
  return document.body.innerHTML
}

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  document.body.innerHTML = ""
})

describe("business profile drawer offer ownership", () => {
  test("products field is renamed and preserves legacy text with separate-services help", async () => {
    renderDrawer(makeBusinessProfile())
    await act(async () => {
      await flushTestDom()
    })
    const html = document.body.innerHTML
    expect(html).toContain("Products the business sells")
    expect(html).toContain("legacy combined text stays verbatim")
    expect(html.includes("Products and services")).toBe(false)
    expect(html).toContain("Services the business sells")
  })

  test("embedded service catalog buttons never submit the profile form", async () => {
    renderDrawer(makeBusinessProfile())
    await act(async () => {
      await flushTestDom()
    })
    const html = document.body.innerHTML
    expect(html).toContain("Services the business sells")
    expect(html).toContain("Add service")
    const submits = html.match(/type="submit"/g) ?? []
    // Only the Save profile button submits; catalog + Close/Done are buttons.
    expect(submits.length).toBe(1)
  })

  test("read-only users get no service mutation controls", async () => {
    renderDrawer(makeBusinessProfile({ canManageBusinessProfile: false }))
    await act(async () => {
      await flushTestDom()
    })
    const html = document.body.innerHTML
    expect(html).toContain("Services the business sells")
    expect(html.includes("Add service")).toBe(false)
    expect(html).toContain("View-only access")
  })
})
