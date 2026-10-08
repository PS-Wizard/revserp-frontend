import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { ProjectGoogleAccountBar } from "~/components/project-google-account-bar"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const PROJECT = "proj-1"

type FetchCall = { url: string; method: string; body: unknown }
const fetchCalls: FetchCall[] = []
const originalFetch = globalThis.fetch

function installFetch() {
  ;(globalThis as Record<string, unknown>).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    let body: unknown = null
    if (typeof init?.body === "string") body = JSON.parse(init.body)
    fetchCalls.push({ url, method, body })
    return Response.json({ ok: true })
  }) as typeof fetch
}

let root: Root | null = null
let changed = 0

function renderBar(overrides: Record<string, unknown> = {}) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <ProjectGoogleAccountBar
        projectId={PROJECT}
        service="gsc"
        googleConnectionId="conn-1"
        googleConnections={[
          {
            id: "conn-1",
            google_account_email: "owner@example.com",
            google_status: "active",
          },
        ]}
        googleAccountEmail="owner@example.com"
        needsReconnect={false}
        currentPropertyId="https://example.com/"
        selectPath={`/projects/${PROJECT}/gsc/select-site`}
        selectBody={(googleConnectionId) => ({
          site_url: "https://example.com/",
          google_connection_id: googleConnectionId,
        })}
        disconnectPath={`/projects/${PROJECT}/gsc/disconnect`}
        isOrganizationOwner
        onChanged={() => {
          changed += 1
        }}
        {...overrides}
      />
    )
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
  globalThis.fetch = originalFetch
  fetchCalls.length = 0
  changed = 0
  if (root) {
    act(() => {
      root!.unmount()
    })
    root = null
  }
  document.body.innerHTML = ""
})

describe("project google account bar", () => {
  test("single account renders as static email with binding-only copy", () => {
    installFetch()
    const container = renderBar()
    expect(container.innerHTML).toContain("owner@example.com")
    expect(container.innerHTML).toContain("only this project")
    buttonByText(container, "Add another account")
  })

  test("multiple accounts render a picker and non-owners see no actions", () => {
    installFetch()
    const connections = [
      {
        id: "conn-1",
        google_account_email: "owner@example.com",
        google_status: "active",
      },
      {
        id: "conn-2",
        google_account_email: "other@example.com",
        google_status: "active",
      },
    ]
    const container = renderBar({ googleConnections: connections })
    expect(container.querySelector('[role="combobox"]') !== null).toBe(true)
    expect(container.innerHTML).toContain("owner@example.com")
    expect(container.innerHTML).toContain("Add another account")
  })

  test("non-owners see the account without management actions", () => {
    installFetch()
    const container = renderBar({
      isOrganizationOwner: false,
      disconnectPath: null,
    })
    expect(container.innerHTML).toContain("owner@example.com")
    expect(container.innerHTML.includes("Add another account")).toBe(false)
    expect(container.innerHTML.includes("Disconnect property")).toBe(false)
    expect(container.innerHTML.includes("Reconnect account")).toBe(false)
  })

  test("reconnect shows only for owners when the account needs it", () => {
    installFetch()
    const container = renderBar({ needsReconnect: true })
    expect(
      container.innerHTML.includes("Reconnect account")
    ).toBe(true)
    const hidden = renderBar({ needsReconnect: false })
    expect(hidden.innerHTML.includes("Reconnect account")).toBe(false)
  })

  test("legacy blank-email bound account offers a targeted reconnect", () => {
    installFetch()
    const container = renderBar({
      needsReconnect: false,
      tokenError: undefined,
      googleConnectionId: "legacy-id",
      googleConnections: [{ id: "legacy-id", google_status: "active" }],
      googleAccountEmail: "",
    })
    expect(container.innerHTML).toContain("Google account")
    expect(container.innerHTML.includes("Reconnect account")).toBe(true)
  })

  test("disconnect posts the binding endpoint and refreshes", async () => {
    installFetch()
    const container = renderBar()
    const button = buttonByText(container, "Disconnect property")
    await act(async () => {
      button.click()
      await flushTestDom()
    })
    await flushUntil(() => changed === 1)
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]?.url).toContain(
      `/projects/${PROJECT}/gsc/disconnect`
    )
    expect(fetchCalls[0]?.method).toBe("POST")
  })
})
