import { describe, expect, test } from "bun:test"

import { loader } from "./settings-integrations"
import { revbotHashTarget } from "~/components/app-navbar/types"
import { getInitialWorkspaceView } from "~/components/app-navbar/utils"

async function locationHeader(url: string) {
  try {
    await loader({ request: new Request(url) })
    throw new Error("loader did not redirect")
  } catch (response) {
    if (response instanceof Response) return response.headers.get("Location")
    throw response
  }
}

describe("settings integrations alias", () => {
  test("opens the MCP page with the project kept", async () => {
    expect(
      await locationHeader(
        "http://localhost/app/settings/integrations?project=p-1"
      )
    ).toBe("/app?project=p-1#marketplace")
  })

  test("drops the location scope, integrations are parent level", async () => {
    expect(
      await locationHeader(
        "http://localhost/app/settings/integrations?project=p-1&location=l-9"
      )
    ).toBe("/app?project=p-1#marketplace")
  })
})

describe("alias root state", () => {
  test("redirect target initializes the shell onto the MCP page", async () => {
    const target = await locationHeader(
      "http://localhost/app/settings/integrations?project=p-1"
    )
    if (!target) throw new Error("alias did not redirect")
    const url = new URL(target, "http://localhost")
    expect(getInitialWorkspaceView(url.search)).toBe("revserp-audit")
    expect(revbotHashTarget(url.hash.replace(/^#/, ""))).toEqual({
      view: "marketplace",
    })
  })
})
