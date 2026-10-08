import { describe, expect, test } from "bun:test"
import { createMemoryRouter } from "react-router"

import { revbotHashTarget } from "./types"
import {
  getCrawlSelectionTarget,
  getInitialWorkspaceView,
  getProjectBackTarget,
  getProjectSwitchTarget,
  getVisibilityMode,
  getVisibilityModeTarget,
  getWorkspaceNavigationTarget,
} from "./utils"

describe("crawl selection navigation", () => {
  test("selects the crawl and Overview in one URL without losing other parameters", () => {
    const location = {
      pathname: "/app",
      search:
        "?project=p-1&crawl=latest&revbotConversation=chat-1&editorUrl=https%3A%2F%2Fexample.com%2F",
    }
    const target = getCrawlSelectionTarget(location, "older")
    const params = new URLSearchParams(target.search)

    expect(target.pathname).toBe("/app")
    expect(params.get("crawl")).toBe("older")
    expect(params.get("project")).toBe("p-1")
    expect(params.get("revbotConversation")).toBe("chat-1")
    expect(params.get("editorUrl")).toBe("https://example.com/")
    expect(revbotHashTarget(target.hash.slice(1))).toEqual({
      view: "revserp-audit",
      tab: "overview",
    })
    expect(new URLSearchParams(location.search).get("crawl")).toBe("latest")
  })

  test("workspace views preserve the selected crawl and other query parameters", () => {
    const location = {
      pathname: "/app",
      search: "?project=p-1&crawl=older&revbotConversation=chat-1",
    }
    for (const view of [
      "revserp-audit",
      "search-console",
      "analytics",
      "keywords",
      "competitors",
      "marketplace",
      "compare",
      "revserp-visibility",
    ] as const) {
      const target = getWorkspaceNavigationTarget(location, view, "seo")
      expect(target.pathname).toBe(location.pathname)
      expect(target.search).toBe(location.search)
      expect(target.hash).toBe(
        view === "revserp-audit"
          ? "#seo-tab"
          : view === "compare" || view === "revserp-visibility"
            ? ""
            : `#${view}`
      )
    }
  })

  test("a tab change during a delayed crawl load preserves selection, including back and forward", async () => {
    let releaseLoad!: () => void
    const load = new Promise<void>((resolve) => {
      releaseLoad = resolve
    })
    const router = createMemoryRouter(
      [
        {
          path: "/app",
          loader: ({ request }) =>
            new URL(request.url).searchParams.get("crawl") === "older"
              ? load
              : null,
        },
      ],
      { initialEntries: ["/app?project=p-1&crawl=latest#seo-tab"] }
    )

    try {
      const selection = router.navigate(
        getCrawlSelectionTarget(router.state.location, "older")
      )
      expect(router.state.navigation.state).toBe("loading")
      expect(router.state.navigation.location?.hash).toBe("#overview-tab")
      const tabChange = router.navigate(
        getWorkspaceNavigationTarget(
          router.state.navigation.location ?? router.state.location,
          "revserp-audit",
          "aeo"
        )
      )
      expect(
        new URLSearchParams(router.state.navigation.location?.search).get(
          "crawl"
        )
      ).toBe("older")
      expect(router.state.navigation.location?.hash).toBe("#aeo-tab")
      releaseLoad()
      await Promise.all([selection, tabChange])
      expect(
        new URLSearchParams(router.state.location.search).get("crawl")
      ).toBe("older")
      expect(router.state.location.hash).toBe("#aeo-tab")

      for (const tab of ["seo", "aeo", "pages", "overview"] as const) {
        await router.navigate(
          getWorkspaceNavigationTarget(
            router.state.location,
            "revserp-audit",
            tab
          ),
          { replace: true }
        )
        expect(
          new URLSearchParams(router.state.location.search).get("crawl")
        ).toBe("older")
        expect(
          new URLSearchParams(router.state.location.search).get("project")
        ).toBe("p-1")
        expect(router.state.location.hash).toBe(`#${tab}-tab`)
      }
      await router.navigate(-1)
      expect(
        new URLSearchParams(router.state.location.search).get("crawl")
      ).toBe("latest")
      await router.navigate(1)
      expect(
        new URLSearchParams(router.state.location.search).get("crawl")
      ).toBe("older")
    } finally {
      releaseLoad()
      router.dispose()
    }
  })

  test("locations route navigates back to /app with the project retained", () => {
    const mapLocation = {
      pathname: "/app/projects/p-9/locations",
      search: "",
    }
    const target = getWorkspaceNavigationTarget(mapLocation, "keywords", "seo")
    expect(target.pathname).toBe("/app")
    expect(target.hash).toBe("#keywords")
    expect(new URLSearchParams(target.search).get("project")).toBe("p-9")
  })
})

describe("location workspace navigation", () => {
  test("crawl switch keeps the location param", () => {
    const params = new URLSearchParams({ project: "p-1", location: "l-9", crawl: "c-1" })
    const target = getCrawlSelectionTarget({ pathname: "/app", search: `?${params}` }, "c-2")
    const next = new URLSearchParams(target.search)
    expect(next.get("location")).toBe("l-9")
    expect(next.get("crawl")).toBe("c-2")
    expect(next.get("project")).toBe("p-1")
  })

  test("view switch keeps the location param", () => {
    const params = new URLSearchParams({ project: "p-1", location: "l-9" })
    const scoped = { pathname: "/app", search: `?${params}` }
    const target = getWorkspaceNavigationTarget(scoped, "keywords", "seo")
    expect(target.search).toBe(scoped.search)
  })

  test("back to project always lands on parent shell", () => {
    expect(getProjectBackTarget("p-1")).toBe("/app?project=p-1")
  })

  test("project switch clears location, crawl and revbot params", () => {
    const params = new URLSearchParams({ project: "p-1", location: "l-9", crawl: "c-1", revbotConversation: "c-9" })
    const target = getProjectSwitchTarget({ pathname: "/app", search: `?${params}` }, "p-2")
    expect(target.startsWith("/app?")).toBe(true)
    const next = new URLSearchParams(target.slice(5))
    expect(next.get("project")).toBe("p-2")
    expect(next.get("location")).toBeNull()
    expect(next.get("crawl")).toBeNull()
    expect(next.get("revbotConversation")).toBeNull()
  })
})

describe("visibility mode", () => {
  test("absent or unknown mode reads as maps", () => {
    expect(getVisibilityMode("")).toBe("maps")
    expect(getVisibilityMode("?project=p-1")).toBe("maps")
    expect(getVisibilityMode("?visibility=grid")).toBe("maps")
    expect(getVisibilityMode("?visibility=ai")).toBe("ai")
  })

  test("mode switch keeps the location param", () => {
    const params = new URLSearchParams({ project: "p-1", location: "l-9" })
    const target = getVisibilityModeTarget(
      { pathname: "/app", search: `?${params}` },
      "ai"
    )
    const next = new URLSearchParams(target.split("?")[1] ?? "")
    expect(next.get("visibility")).toBe("ai")
    expect(next.get("location")).toBe("l-9")
    expect(next.get("project")).toBe("p-1")
  })
})

describe("visibility mode defaults", () => {
  test("explicit choice wins over a saved run link", () => {
    expect(getVisibilityMode("?visibility=maps&audit=a-1")).toBe("maps")
    expect(getVisibilityMode("?visibility=ai&audit=a-1")).toBe("ai")
  })

  test("saved AI run deep link without a choice lands on AI", () => {
    expect(getVisibilityMode("?project=p-1&audit=a-1")).toBe("ai")
    expect(getInitialWorkspaceView("?project=p-1&audit=a-1")).toBe(
      "revserp-visibility"
    )
  })

  test("plain shell defaults to maps and audit", () => {
    expect(getVisibilityMode("?project=p-1")).toBe("maps")
    expect(getInitialWorkspaceView("?project=p-1")).toBe("revserp-audit")
  })
})
