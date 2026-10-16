import { afterEach, describe, expect, mock, test } from "bun:test"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

// Same portal stand-in as the dialog suites: the real Vaul portal cannot
// mount in happy-dom, so drawers render inline when open.
mock.module("~/components/ui/drawer", () => ({
  Drawer: ({ open, children }: any) => (open ? <>{children}</> : null),
  DrawerContent: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
  DrawerDescription: ({ children }: any) => <div>{children}</div>,
  DrawerFooter: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
  DrawerHeader: ({ children }: any) => <div>{children}</div>,
  DrawerNested: ({ open, children }: any) => (open ? <>{children}</> : null),
  DrawerTitle: ({ children }: any) => <div>{children}</div>,
}))

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const { BusinessProfileDrawer } =
  await import("~/components/app-navbar/business-profile-drawer")
const { projectProfileCompetitorsQueryKey } =
  await import("~/components/app-navbar/project-profile-competitor-roster")
const { localSeoProjectServicesQueryKey } = await import("~/lib/local-seo-api")
import type { ProjectCompetitorsResponse } from "~/lib/api.types"

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

function renderDrawer(
  profile: ReturnType<typeof makeBusinessProfile>,
  roster?: ProjectCompetitorsResponse
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(localSeoProjectServicesQueryKey("proj-1"), [
    { id: "svc-1", label: "Coffee" },
  ])
  if (roster) {
    client.setQueryData(projectProfileCompetitorsQueryKey("proj-1"), roster)
  }
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
  test("products and services share one field and preserve existing text", async () => {
    renderDrawer(makeBusinessProfile())
    await act(async () => {
      await flushTestDom()
    })
    const html = document.body.innerHTML
    expect(html).toContain("Products and services")
    expect(html).toContain("legacy combined text stays verbatim")
    expect(html.includes("Services the business sells")).toBe(false)
  })

  test("profile form has no separate service editor", async () => {
    renderDrawer(makeBusinessProfile())
    await act(async () => {
      await flushTestDom()
    })
    const html = document.body.innerHTML
    expect(html.includes("Services the business sells")).toBe(false)
    expect(html.includes("Add service")).toBe(false)
    expect((html.match(/type="submit"/g) ?? []).length).toBe(1)
  })

  test("read-only users get no service mutation controls", async () => {
    renderDrawer(makeBusinessProfile({ canManageBusinessProfile: false }))
    await act(async () => {
      await flushTestDom()
    })
    const html = document.body.innerHTML
    expect(html).toContain("Products and services")
    expect(html.includes("Add service")).toBe(false)
    expect(html).toContain("View-only access")
    expect(html).toContain("Workspace owners and managers")
  })
})

function openCompetitorsSubdrawer() {
  const trigger = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("Competitors")
  )
  if (!trigger) throw new Error("competitors row missing")
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }))
}

describe("business profile competitor scope", () => {
  test("project scope shows the canonical roster, not the free-text list", async () => {
    renderDrawer(makeBusinessProfile(), {
      max_competitors: 5,
      competitors: [
        {
          id: "c-1",
          name: "Ahrefs",
          seed_url: "https://ahrefs.com",
          created_at: "2026-01-01T00:00:00Z",
          crawl: null,
        },
      ],
    })
    await act(async () => {
      await flushTestDom()
    })
    await act(async () => {
      openCompetitorsSubdrawer()
      await flushTestDom()
    })
    for (let i = 0; i < 20; i++) {
      if (document.body.innerHTML.includes("Ahrefs")) break
      await act(async () => {
        await flushTestDom()
      })
    }
    const html = document.body.innerHTML
    expect(html).toContain("Ahrefs")
    expect(html).toContain("https://ahrefs.com")
    expect(html).toContain("Not crawled")
    expect(html).toContain("Manage in Competitors")
    expect(document.querySelector("#business-competitors") === null).toBe(true)
  })

  test("location scope keeps the free-text competitor editor", async () => {
    renderDrawer(
      makeBusinessProfile({
        isLocationScoped: true,
        businessProfileLocationId: "loc-1",
        businessProfileLocationName: "Downtown",
        businessCompetitors: "Ahrefs",
        profileServices: [],
        setProfileServices: () => undefined,
      })
    )
    await act(async () => {
      await flushTestDom()
    })
    await act(async () => {
      openCompetitorsSubdrawer()
      await flushTestDom()
    })
    for (let i = 0; i < 20; i++) {
      if (document.querySelector("#business-competitors")) break
      await act(async () => {
        await flushTestDom()
      })
    }
    expect(document.querySelector("#business-competitors") !== null).toBe(true)
    expect(document.body.innerHTML.includes("Manage in Competitors")).toBe(
      false
    )
  })
})
