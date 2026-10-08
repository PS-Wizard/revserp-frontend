import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { createMemoryRouter, RouterProvider } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import type { LocalSeoLocation } from "~/lib/local-seo-api"
import ProjectLocationsRoute, {
  locationListCanManageFromMatches,
  parentWebsiteUrlFromMatches,
} from "~/routes/app/project-locations"

installTestDom()

let fetchBefore: typeof fetch | null = null

function makeLocation(): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: "proj-1",
    name: "Main Street Cafe",
    place_id: "ChIJ1",
    address: "Main Street 1",
    locality: "Downtown",
    localities: [],
    services: [],
    latitude: 27.71,
    longitude: 85.33,
    queries: [],
  }
}

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  if (fetchBefore) globalThis.fetch = fetchBefore
  fetchBefore = null
  document.body.innerHTML = ""
})

async function renderRoute(
  initialEntry: string,
  locations: LocalSeoLocation[] = []
) {
  fetchBefore = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.endsWith("/projects/proj-1/locations")) {
      return Response.json(locations)
    }
    throw new Error(`unexpected ${url}`)
  }) as typeof fetch

  const router = createMemoryRouter(
    [
      {
        id: "routes/app",
        path: "/app/projects/:projectID/locations",
        element: <ProjectLocationsRoute />,
      },
      { path: "/app", element: <div>scoped shell</div> },
    ],
    { initialEntries: [initialEntry] }
  )

  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
  })
  for (let index = 0; index < 3; index++) {
    await act(async () => {
      await flushTestDom()
    })
  }
  return router
}

describe("project locations route", () => {
  test("old location audit toasts forward to the scoped shell", async () => {
    const router = await renderRoute(
      "/app/projects/proj-1/locations?location=loc-9&audit=audit-3"
    )
    expect(router.state.location.pathname).toBe("/app")
    expect(router.state.location.search).toBe(
      "?project=proj-1&location=loc-9&audit=audit-3"
    )
  })

  test("the plain route stays a list", async () => {
    await renderRoute("/app/projects/proj-1/locations", [makeLocation()])
    expect(document.body.textContent).toContain("Main Street Cafe")
  })

  test("resolves the parent website URL by the route's project id", () => {
    const matches = [
      {
        id: "routes/app",
        data: {
          activeProject: { id: "other", base_url: "https://other.example" },
          projects: [
            { id: "proj-1", base_url: "https://local-visibility.example" },
            { id: "other", base_url: "https://other.example" },
          ],
        },
      },
    ]
    expect(parentWebsiteUrlFromMatches(matches, "proj-1")).toBe(
      "https://local-visibility.example"
    )
    expect(parentWebsiteUrlFromMatches(matches, "missing")).toBeNull()
    expect(parentWebsiteUrlFromMatches([], "proj-1")).toBeNull()
  })
})

describe("location delete permission", () => {
  test("delete is owner-gated with deny-by-default", () => {
    const owner = [
      {
        id: "routes/app",
        data: {
          me: {
            active_org_id: "org-1",
            organizations: [{ id: "org-1", role: "owner" }],
          },
        },
      },
    ]
    expect(locationListCanManageFromMatches(owner)).toBe(true)

    const member = [
      {
        id: "routes/app",
        data: {
          me: {
            active_org_id: "org-1",
            organizations: [{ id: "org-1", role: "member" }],
          },
        },
      },
    ]
    expect(locationListCanManageFromMatches(member)).toBe(false)
    expect(locationListCanManageFromMatches([])).toBe(false)
    expect(
      locationListCanManageFromMatches([{ id: "routes/app" }])
    ).toBe(false)
  })

  test("the list hides trash without an owner membership", async () => {
    await renderRoute("/app/projects/proj-1/locations", [makeLocation()])
    expect(
      document.body.querySelector('button[aria-label^="Delete location"]')
    ).toBeNull()
  })
})
