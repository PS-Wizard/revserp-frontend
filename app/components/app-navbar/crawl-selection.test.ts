import { describe, expect, test } from "bun:test"
import { createMemoryRouter } from "react-router"

import { revbotHashTarget } from "./types"
import { getCrawlSelectionTarget, getWorkspaceNavigationTarget } from "./utils"

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
})
