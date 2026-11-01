import { afterEach, describe, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MemoryRouter, useLocation } from "react-router"

import {
  buildBulkContentPrompt,
  CONTENT_PROMPT_PARAM,
  KeywordCoverageCard,
} from "~/components/keywords/keywords-coverage"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"
import type { KeywordCoverageSeed } from "~/lib/api.types"

installTestDom()

const SEEDS: KeywordCoverageSeed[] = [
  { keyword: "emergency plumber", matches: [], state: "no_landing_page" },
  { keyword: "drain cleaning", matches: [], state: "no_landing_page" },
  {
    keyword: "water heater repair",
    matches: [
      { field: "title", url: "https://acme.example/a" },
      { field: "h1", url: "https://acme.example/b" },
    ],
    state: "cannibalized",
  },
  {
    keyword: "leak detection",
    matches: [{ field: "title", url: "https://acme.example/leak" }],
    state: "likely_targeted",
  },
]

const roots: Array<() => void> = []

afterEach(() => {
  for (const unmount of roots.splice(0)) unmount()
  document.body.innerHTML = ""
})

function LocationProbe() {
  const location = useLocation()
  return (
    <span data-testid="probe">
      {`${location.pathname}${location.search}${location.hash}`}
    </span>
  )
}

function render(element: ReactElement) {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/app?project=p-1"]}>
        {element}
        <LocationProbe />
      </MemoryRouter>
    )
  })
  roots.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host }
}

async function flush() {
  await act(async () => {
    await flushTestDom()
    await flushTestDom()
  })
}

function keywordCheckbox(host: HTMLElement, keyword: string) {
  const checkbox = host.querySelector(
    `button[aria-label='Select keyword "${keyword}"']`
  )
  if (!(checkbox instanceof window.HTMLButtonElement)) {
    throw new Error(`checkbox for "${keyword}" not found`)
  }
  return checkbox
}

function bulkButton(host: HTMLElement) {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) =>
    (candidate.textContent ?? "").startsWith("Write content (")
  )
  if (!(button instanceof window.HTMLButtonElement)) {
    throw new Error("bulk write-content button not found")
  }
  return button
}

function filterTab(host: HTMLElement, label: string) {
  const tab = Array.from(host.querySelectorAll("button")).find((candidate) =>
    (candidate.textContent ?? "").includes(label)
  )
  if (!(tab instanceof window.HTMLButtonElement)) {
    throw new Error(`filter tab "${label}" not found`)
  }
  return tab
}

describe("keyword coverage bulk selection", () => {
  test("ticking keywords enables the bulk button and prefills the content prompt", async () => {
    const { host } = render(<KeywordCoverageCard seeds={SEEDS} />)
    await flush()

    expect(bulkButton(host).textContent).toBe("Write content (0)")
    expect(bulkButton(host).disabled).toBe(true)

    for (const keyword of SEEDS.map((seed) => seed.keyword)) {
      act(() => {
        keywordCheckbox(host, keyword).click()
      })
      expect(keywordCheckbox(host, keyword).getAttribute("aria-checked")).toBe(
        "true"
      )
    }
    expect(bulkButton(host).textContent).toBe("Write content (4)")
    expect(bulkButton(host).disabled).toBe(false)

    // Selection survives a filter switch.
    act(() => {
      filterTab(host, "Gaps").click()
    })
    await flush()
    expect(bulkButton(host).textContent).toBe("Write content (4)")
    act(() => {
      filterTab(host, "All").click()
    })
    await flush()

    act(() => {
      bulkButton(host).click()
    })
    await flush()

    const probe = host.querySelector('[data-testid="probe"]')
    const url = new URL(probe?.textContent ?? "", "http://localhost")
    expect(url.pathname).toBe("/app")
    expect(url.hash).toBe("#content")
    expect(url.searchParams.get(CONTENT_PROMPT_PARAM)).toBe(
      buildBulkContentPrompt(SEEDS.map((seed) => seed.keyword))
    )
  })
})
