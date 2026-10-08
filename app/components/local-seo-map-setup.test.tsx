import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import {
  LocalSeoMapSetupContent,
  addLocalSeoQueryDraft,
  countEnabledLocalSeoMapDrafts,
} from "~/components/local-seo-map-setup"
import type {
  LocalSeoLandmark,
  LocalSeoLocationQueryDraft,
  LocalSeoLocationQueryRecord,
} from "~/lib/local-seo-api"

function draft(
  text: string,
  overrides: Partial<LocalSeoLocationQueryDraft> = {}
): LocalSeoLocationQueryDraft {
  return { text, enabled: true, kind: "map", source: "manual", ...overrides }
}

function renderSetup(
  overrides: Partial<Parameters<typeof LocalSeoMapSetupContent>[0]> = {}
) {
  return renderToStaticMarkup(
    <LocalSeoMapSetupContent
      radiusM={5000}
      onRadiusChange={() => {}}
      serviceText="coffee"
      onServiceTextChange={() => {}}
      localityText="Downtown"
      onLocalityTextChange={() => {}}
      queryDrafts={[]}
      onQueryDraftsChange={() => {}}
      onGenerate={() => {}}
      generating={false}
      generateError={null}
      onSave={() => {}}
      saving={false}
      saveError={null}
      {...overrides}
    />
  )
}

describe("map setup content", () => {
  test("stacks radius, service, locality, generate, add, and save", () => {
    const html = renderSetup()
    expect(html).toContain("Sampling radius in metres")
    expect(html).toContain("fixed at 3x3")
    expect(html).toContain("Service text")
    expect(html).toContain("Locality")
    expect(html).toContain("Generate queries · Free")
    expect(html).toContain("Add query")
    expect(html).toContain("Save queries")
    expect(html.includes("Step 1 of 2")).toBe(false)
    expect(html.includes("Next: queries")).toBe(false)
  })

  test("radius errors stay visible instead of silently clamping", () => {
    const html = renderSetup({ radiusM: 50 })
    expect(html).toContain("between 1000 and 25000")
  })

  test("editable queries render with an enable checkbox, remove, and an add row", () => {
    const html = renderSetup({
      queryDrafts: ["alpha", "beta", "gamma", "delta", "epsilon"].map((text) =>
        draft(text)
      ),
    })
    expect(html).toContain("Query 1")
    expect(html).toContain('aria-label="Enable query 1"')
    expect(html).toContain("Remove")
    expect(html).toContain("epsilon")
    expect(html).toContain("Add query")
  })

  test("a disabled draft renders its checkbox unchecked", () => {
    const html = renderSetup({
      queryDrafts: [draft("alpha"), draft("beta", { enabled: false })],
    })
    expect(html).toContain('aria-label="Enable query 2"')
    expect(
      /<button[^>]*aria-checked="false"[^>]*aria-label="Enable query 2"/.test(
        html
      )
    ).toBe(true)
  })

  test("invalid query edits surface the validator message", () => {
    const html = renderSetup({
      queryDrafts: [draft("coffee"), draft(" coffee ")],
    })
    expect(html).toContain("must all be distinct")
  })

  test("generate and save messages render honestly", () => {
    const html = renderSetup({
      generating: true,
      generateError: "Could not generate queries",
      saving: true,
      saveError: "Could not save queries",
    })
    expect(html).toContain("Generating…")
    expect(html).toContain("Could not generate queries")
    expect(html).toContain("Saving…")
    expect(html).toContain("Could not save queries")
  })
})

describe("generate guidance", () => {
  test("both missing fields are named in the disabled Generate reason", () => {
    const html = renderSetup({ serviceText: "", localityText: "" })
    expect(html).toContain(
      "Enter a service and a locality to generate queries."
    )
    expect(html).toContain('aria-describedby="map-setup-generate-guidance"')
  })

  test("only a missing service is named", () => {
    const html = renderSetup({ serviceText: "" })
    expect(html).toContain("Enter a service to generate queries.")
    expect(html.includes("locality to generate")).toBe(false)
  })

  test("only a missing locality is named", () => {
    const html = renderSetup({ localityText: "" })
    expect(html).toContain("Enter a locality to generate queries.")
    expect(html.includes("service to generate")).toBe(false)
  })

  test("ready fields leave Generate with no missing-field reason", () => {
    const html = renderSetup()
    expect(html.includes("map-setup-generate-guidance")).toBe(false)
    expect(html.includes("to generate queries")).toBe(false)
  })

  test("generating disables Generate without naming a missing field", () => {
    const html = renderSetup({ generating: true })
    expect(html).toContain("Generating…")
    expect(html.includes("map-setup-generate-guidance")).toBe(false)
  })

  test("empty query list explains how to fill it without auto generating", () => {
    const html = renderSetup({ queryDrafts: [] })
    expect(html).toContain(
      "No queries yet. Add or select services, then press Generate queries, or use Add query to write one by hand."
    )
  })
})

describe("saved services govern generation", () => {
  test("server effective services are named and the manual fallback is gone", () => {
    const html = renderSetup({
      serviceText: "coffee",
      effectiveServices: ["Coffee", "Espresso Bar"],
    })
    expect(html).toContain("Saved services")
    expect(html).toContain(
      "Generation uses the saved services: Coffee · Espresso Bar."
    )
    expect(html.includes("Service text")).toBe(false)
    expect(html.includes('id="map-setup-service"')).toBe(false)
    expect(
      /<button[^>]*disabled=""[^>]*id="map-setup-generate"/.test(html)
    ).toBe(false)
  })

  test("an empty saved-services list blocks generation and points to Business profile", () => {
    const html = renderSetup({
      serviceText: "coffee",
      effectiveServices: [],
    })
    expect(html).toContain(
      "No saved services for this location yet. Add or select services in Business profile before generating queries."
    )
    expect(
      /<button[^>]*disabled=""[^>]*id="map-setup-generate"/.test(html)
    ).toBe(true)
    // The unsaved serviceText fallback must not rescue an empty saved list.
    expect(html.includes("Enter a service to generate queries.")).toBe(false)
  })

  test("without saved services the standalone Service text fallback still works", () => {
    const html = renderSetup({ serviceText: "coffee" })
    expect(html).toContain("Service text")
    expect(html.includes('id="map-setup-service"')).toBe(true)
    expect(html.includes("Saved services")).toBe(false)
  })
})

function mapRecord(
  text: string,
  overrides: Partial<LocalSeoLocationQueryRecord> = {}
): LocalSeoLocationQueryRecord {
  return {
    id: `q-${text}`,
    text,
    ordinal: 0,
    enabled: true,
    kind: "map",
    source: "generated",
    origin: "landmark",
    landmark_id: null,
    ...overrides,
  }
}

function makeLandmark(
  overrides: Partial<LocalSeoLandmark> = {}
): LocalSeoLandmark {
  return {
    id: "lm-1",
    name: "Boudhanath",
    latitude: 27.7,
    longitude: 85.3,
    straight_line_m: 300,
    provider: "google_places",
    provider_ref: "places/lm-1",
    categories: [],
    fetched_at: "2026-01-01T00:00:00Z",
    selected: false,
    ...overrides,
  }
}

function checkboxHtml(html: string, label: string): string {
  return (
    html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? ""
  )
}

describe("shared enabled map query count", () => {
  test("counts enabled map drafts only, across sources", () => {
    expect(
      countEnabledLocalSeoMapDrafts([
        draft("alpha"),
        draft("beta", { enabled: false }),
        draft("gamma", { source: "generated" }),
        {
          text: "question",
          enabled: true,
          kind: "ai_question",
          source: "manual",
        },
      ])
    ).toBe(2)
  })

  test("adding a query never truncates the list and starts enabled", () => {
    const drafts = ["a", "b", "c", "d", "e"].map((text) => draft(text))
    const next = addLocalSeoQueryDraft(drafts)
    expect(next).toHaveLength(6)
    expect(next[5]).toEqual({
      text: "",
      enabled: true,
      kind: "map",
      source: "manual",
    })
  })

  test("a new draft always starts enabled", () => {
    expect(addLocalSeoQueryDraft([draft("a")])[1].enabled).toBe(true)
  })
})

describe("visible enabled count", () => {
  test("names the enabled count without blocking a sixth row", () => {
    const html = renderSetup({
      queryDrafts: [
        draft("a"),
        draft("b"),
        draft("c"),
        draft("d"),
        draft("e"),
        draft("f", { enabled: false }),
      ],
    })
    expect(html).toContain(
      "5 map queries enabled. A run requires at least one."
    )
    expect(checkboxHtml(html, "Enable query 6").includes('disabled=""')).toBe(
      false
    )
    expect(checkboxHtml(html, "Enable query 2").includes('disabled=""')).toBe(
      false
    )
    expect(html.includes('aria-label="Remove query 6"')).toBe(true)
  })

  test("a landmark candidate row names its source and stored record id", () => {
    const record = mapRecord("coffee near Boudhanath", {
      id: "q-land",
      enabled: false,
      landmark_id: "lm-1",
    })
    const html = renderSetup({
      queryDrafts: [
        draft("coffee near Boudhanath", {
          id: "q-land",
          enabled: false,
          source: "generated",
        }),
      ],
      queryRecords: [record],
      landmarks: [makeLandmark()],
    })
    expect(html).toContain('data-query-record-id="q-land"')
    expect(html).toContain("Landmark: Boudhanath")
  })
})
