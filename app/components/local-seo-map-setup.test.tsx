import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { LocalSeoMapSetupContent } from "~/components/local-seo-map-setup"

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

  test("editable queries render with remove buttons up to five", () => {
    const html = renderSetup({
      queryDrafts: ["alpha", "beta", "gamma", "delta", "epsilon"],
    })
    expect(html).toContain("Query 1")
    expect(html).toContain("Remove")
    expect(html).toContain("epsilon")
    expect(html.includes("Add query")).toBe(false)
  })

  test("invalid query edits surface the validator message", () => {
    const html = renderSetup({ queryDrafts: ["coffee", " coffee "] })
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
