import { afterEach, beforeEach, expect, test } from "bun:test"
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  createMemoryRouter,
  RouterProvider,
  useLoaderData,
} from "react-router"

import { getProjectIdFromLocationsPath } from "~/components/app-navbar/utils"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import { useLastActiveProject } from "./use-last-active-project"

installTestDom()

let root: Root | null = null
let host: HTMLDivElement | null = null
let router: ReturnType<typeof createMemoryRouter> | null = null
let userId = "user-1"
let projects = [{ id: "p-1" }, { id: "p-2" }]
let blockProjectId: string | null = null
let releaseNavigation: (() => void) | null = null
const loadedUrls: string[] = []
const storageKey = (id = "user-1") => `revserp:last-active-project:v1:${id}`

type ProjectData = {
  userId: string
  activeProjectId: string | null
  projects: { id: string }[]
}

function Probe() {
  const data = useLoaderData() as ProjectData
  useLastActiveProject(data)
  return <output>{data.activeProjectId ?? "none"}</output>
}

beforeEach(() => {
  window.localStorage.clear()
  userId = "user-1"
  projects = [{ id: "p-1" }, { id: "p-2" }]
  blockProjectId = null
  releaseNavigation = null
  loadedUrls.length = 0
})

afterEach(async () => {
  releaseNavigation?.()
  await act(async () => {
    root?.unmount()
    await flushTestDom()
  })
  router?.dispose()
  host?.remove()
  root = null
  router = null
  host = null
})

async function settle() {
  await flushTestDom()
  await flushTestDom()
}

async function mount(entry = "/app") {
  router = createMemoryRouter(
    [
      {
        path: "/app/*",
        Component: Probe,
        HydrateFallback: () => null,
        loader: async ({ request }) => {
          const url = new URL(request.url)
          loadedUrls.push(`${url.pathname}${url.search}`)
          const requestedProjectId =
            getProjectIdFromLocationsPath(url.pathname) ??
            url.searchParams.get("project")
          if (requestedProjectId === blockProjectId && blockProjectId) {
            await new Promise<void>((resolve) => {
              releaseNavigation = resolve
            })
          }
          return {
            userId,
            activeProjectId:
              projects.find((project) => project.id === requestedProjectId)?.id ??
              projects[0]?.id ??
              null,
            projects,
          } satisfies ProjectData
        },
      },
    ],
    { initialEntries: [entry] }
  )
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <StrictMode>
        <RouterProvider router={router!} />
      </StrictMode>
    )
    await settle()
  })
}

test("a bare app visit restores the saved project once and preserves view and hash", async () => {
  window.localStorage.setItem(storageKey(), "p-2")
  await mount("/app?visibility=maps#pages-tab")
  expect(host?.textContent).toBe("p-2")
  expect(router?.state.location.search).toBe("?visibility=maps&project=p-2")
  expect(router?.state.location.hash).toBe("#pages-tab")
  expect(router?.state.historyAction).toBe("REPLACE")
  expect(loadedUrls.filter((url) => url.includes("project=p-2"))).toHaveLength(1)
  expect(window.localStorage.getItem(storageKey())).toBe("p-2")
})

test("an explicit project wins and becomes the remembered project", async () => {
  window.localStorage.setItem(storageKey(), "p-2")
  await mount("/app?project=p-1")
  expect(host?.textContent).toBe("p-1")
  expect(loadedUrls).toHaveLength(1)
  expect(window.localStorage.getItem(storageKey())).toBe("p-1")
})

test("a project switch is saved and a later bare visit restores it", async () => {
  await mount("/app?project=p-1")
  await act(async () => {
    await router!.navigate("/app?project=p-2")
    await settle()
  })
  expect(window.localStorage.getItem(storageKey())).toBe("p-2")
  await act(async () => {
    await router!.navigate("/app")
    await settle()
  })
  expect(host?.textContent).toBe("p-2")
  expect(router?.state.location.search).toBe("?project=p-2")
})

test("a deleted or unavailable saved project falls back to an available project", async () => {
  window.localStorage.setItem(storageKey(), "deleted-project")
  await mount()
  expect(host?.textContent).toBe("p-1")
  expect(loadedUrls).toHaveLength(1)
  expect(window.localStorage.getItem(storageKey())).toBe("p-1")
})

test("no projects clears an unavailable saved selection", async () => {
  projects = []
  window.localStorage.setItem(storageKey(), "p-2")
  await mount()
  expect(host?.textContent).toBe("none")
  expect(window.localStorage.getItem(storageKey())).toBeNull()
})

test("a different user does not inherit the previous user's project", async () => {
  window.localStorage.setItem(storageKey(), "p-2")
  userId = "user-2"
  await mount()
  expect(host?.textContent).toBe("p-1")
  expect(window.localStorage.getItem(storageKey("user-2"))).toBe("p-1")
  expect(window.localStorage.getItem(storageKey("user-1"))).toBe("p-2")
})

for (const entry of [
  "/app/admin",
  "/app/settings/integrations",
  "/app?crawl=c-1",
  "/app?location=l-1",
  "/app?audit=a-1",
  "/app?revbotConversation=conversation-1",
]) {
  test(`a scoped route leaves the saved project unchanged: ${entry}`, async () => {
    window.localStorage.setItem(storageKey(), "p-2")
    await mount(entry)
    expect(loadedUrls).toHaveLength(1)
    expect(window.localStorage.getItem(storageKey())).toBe("p-2")
  })
}

test("a locations project path wins over the saved selection", async () => {
  window.localStorage.setItem(storageKey(), "p-1")
  await mount("/app/projects/p-2/locations")
  expect(host?.textContent).toBe("p-2")
  expect(loadedUrls).toHaveLength(1)
  expect(window.localStorage.getItem(storageKey())).toBe("p-2")
})

test("pending project navigation cannot save the previous project's loader data", async () => {
  await mount("/app?project=p-1")
  blockProjectId = "p-2"
  let navigation: Promise<void> | undefined
  await act(async () => {
    navigation = router!.navigate("/app?project=p-2")
    await settle()
  })
  expect(router?.state.navigation.state).toBe("loading")
  expect(window.localStorage.getItem(storageKey())).toBe("p-1")
  await act(async () => {
    releaseNavigation!()
    await navigation
    await settle()
  })
  expect(window.localStorage.getItem(storageKey())).toBe("p-2")
})

test("blocked local storage leaves normal project selection working", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage access denied")
    },
  })
  try {
    await mount("/app?project=p-2")
    expect(host?.textContent).toBe("p-2")
    expect(loadedUrls).toHaveLength(1)
  } finally {
    if (descriptor) Object.defineProperty(window, "localStorage", descriptor)
    else delete (window as unknown as Record<string, unknown>).localStorage
  }
})
