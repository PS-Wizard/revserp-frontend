import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { SkillsTab } from "~/components/admin/skills-tab"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const realFetch = globalThis.fetch
let fetchHandler: (url: string) => Response = () =>
  Response.json({ skills: [] })

function installFetch() {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString()
    return fetchHandler(url)
  }) as typeof fetch
}

let root: Root | null = null

function renderTab() {
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(<SkillsTab />)
  })
  return container
}

async function flushUntil(check: () => boolean) {
  for (let i = 0; i < 40; i++) {
    if (check()) return
    await act(async () => {
      await flushTestDom()
    })
  }
  throw new Error("condition never became true")
}

function buttonByText(scope: ParentNode, text: string) {
  const found = [...scope.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text)
  )
  if (!found) throw new Error(`button "${text}" not found`)
  return found as HTMLButtonElement
}

afterEach(() => {
  globalThis.fetch = realFetch
  fetchHandler = () => Response.json({ skills: [] })
  if (root) {
    act(() => {
      root!.unmount()
    })
    root = null
  }
  document.body.innerHTML = ""
})

const SKILLS_PAYLOAD = {
  skills: [
    {
      id: "seo/local-seo",
      name: "local-seo",
      description: "When to use",
      files: ["SKILL.md", "references/checklist.md"],
    },
    {
      id: "seo/keywords",
      name: "keywords",
      description: "Keyword research",
      files: ["SKILL.md"],
    },
  ],
}

describe("admin skills tab", () => {
  test("shows loading status while the catalog request is pending", () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch
    const container = renderTab()

    expect(
      container.querySelector('[role="status"]')?.getAttribute("aria-label")
    ).toBe("Loading skills")
    expect(container.querySelector("table")).toBeNull()
  })

  test("lists name, id, description, and file paths", async () => {
    fetchHandler = (url) => {
      expect(url).toContain("/admin/skills")
      return Response.json(SKILLS_PAYLOAD)
    }
    installFetch()
    const container = renderTab()
    await flushUntil(() => container.innerHTML.includes("local-seo"))

    expect(container.innerHTML).toContain("seo/local-seo")
    expect(container.innerHTML).toContain("When to use")
    expect(container.innerHTML).toContain("SKILL.md")
    expect(container.innerHTML).toContain("references/checklist.md")
    expect(container.innerHTML).toContain("2 files")
    expect(container.innerHTML).toContain("1 file")
    expect(container.innerHTML).toContain("revserp-backend/skills/")
  })

  test("empty list shows the no-skills empty state", async () => {
    fetchHandler = () => Response.json({ skills: [] })
    installFetch()
    const container = renderTab()
    await flushUntil(() => container.innerHTML.includes("No skills deployed"))

    expect(container.innerHTML).toContain("revserp-backend/skills/")
  })

  test("error shows retry and reloads the list", async () => {
    let calls = 0
    fetchHandler = () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
        })
      }
      return Response.json(SKILLS_PAYLOAD)
    }
    installFetch()
    const container = renderTab()
    await flushUntil(() =>
      container.innerHTML.includes("Failed to load skills")
    )

    await act(async () => {
      buttonByText(container, "Retry").dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      )
      await flushTestDom()
    })
    await flushUntil(() => container.innerHTML.includes("local-seo"))
    expect(calls).toBe(2)
  })

  test("has no upload, edit, enable, or delete controls", async () => {
    fetchHandler = () => Response.json(SKILLS_PAYLOAD)
    installFetch()
    const container = renderTab()
    await flushUntil(() => container.innerHTML.includes("local-seo"))

    expect(container.querySelector('input[type="file"]')).toBeNull()
    const buttons = [...container.querySelectorAll("button")].map((button) =>
      (button.textContent ?? "").toLowerCase()
    )
    expect(/upload|edit|enable|delete/.test(buttons.join("|"))).toBe(false)
  })
})
