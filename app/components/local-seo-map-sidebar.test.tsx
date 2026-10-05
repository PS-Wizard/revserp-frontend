import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import {
  LocalSeoMapSidebar,
  describeLocalSeoRadiusLabel,
  describeLocalSeoSidebarRow,
} from "~/components/local-seo-map-sidebar"
import type { LocalSeoLocation, LocalSeoRun } from "~/lib/local-seo-api"

function makeLocation(
  overrides: Partial<LocalSeoLocation> = {}
): LocalSeoLocation {
  return {
    id: "loc-1",
    project_id: "proj-1",
    name: "Roastery",
    place_id: null,
    address: "Main St",
    locality: "Downtown",
    query_service: "coffee",
    latitude: 27.7,
    longitude: 85.3,
    queries: [],
    ...overrides,
  }
}

function makeRun(status: LocalSeoRun["status"]): LocalSeoRun {
  return {
    id: "run-1",
    location_id: "loc-1",
    status,
    radius_m: 5000,
    expected_credits: 135,
    credits_used: 0,
    retry_credits: 0,
    queries: ["coffee"],
    cells: [],
  }
}

const noop = () => {}

function renderSidebar(
  overrides: Partial<Parameters<typeof LocalSeoMapSidebar>[0]> = {}
) {
  return renderToStaticMarkup(
    <LocalSeoMapSidebar
      collapsed={false}
      locations={[]}
      runByLocation={new Map()}
      selectedId={null}
      selectedRadiusM={5000}
      searchActive={false}
      locationsPending={false}
      locationsError={null}
      onSelectLocation={noop}
      onAddLocation={noop}
      onToggleCollapsed={noop}
      {...overrides}
    />
  )
}

describe("sidebar radius label", () => {
  test("names whole and fractional kilometres", () => {
    expect(describeLocalSeoRadiusLabel(5000)).toBe("5 km radius")
    expect(describeLocalSeoRadiusLabel(1500)).toBe("1.5 km radius")
  })

  test("never invents a radius for an invalid value", () => {
    expect(describeLocalSeoRadiusLabel(0)).toBe("Radius not set")
    expect(describeLocalSeoRadiusLabel(Number.NaN)).toBe("Radius not set")
  })
})

describe("sidebar row state", () => {
  test("an unbound save reads as an unresolved search area", () => {
    const row = describeLocalSeoSidebarRow(
      makeLocation({ place_id: null }),
      null
    )
    expect(row.bound).toBe(false)
    expect(row.label).toContain("Unresolved search area")
    expect(row.label).toContain("not a business location")
  })

  test("a bound listing with no run reads as no runs yet", () => {
    const row = describeLocalSeoSidebarRow(
      makeLocation({ place_id: "ChIJ1" }),
      null
    )
    expect(row.bound).toBe(true)
    expect(row.label).toBe("No runs yet")
  })

  test("a bound listing reports its latest run status", () => {
    expect(
      describeLocalSeoSidebarRow(
        makeLocation({ place_id: "ChIJ1" }),
        makeRun("completed")
      ).label
    ).toBe("Run completed")
    expect(
      describeLocalSeoSidebarRow(
        makeLocation({ place_id: "ChIJ1" }),
        makeRun("partial")
      ).label
    ).toBe("Run partial")
  })
})

describe("sidebar rendering", () => {
  test("lists bound and unresolved saved locations with the add action", () => {
    const bound = makeLocation({
      id: "bound",
      name: "Baneshwor",
      place_id: "ChIJ1",
    })
    const draft = makeLocation({
      id: "draft",
      name: "Corner Shop",
      place_id: null,
    })
    const html = renderSidebar({
      locations: [bound, draft],
      runByLocation: new Map([[bound.id, makeRun("completed")]]),
    })
    expect(html).toContain("Locations")
    expect(html).toContain("Add location")
    expect(html).toContain("Baneshwor")
    expect(html).toContain("Corner Shop")
    expect(html).toContain("Unresolved search area")
    expect(html).toContain("Run completed")
  })

  test("selected bound details carry the kilometre radius and tabs frame", () => {
    const bound = makeLocation({
      id: "bound",
      name: "Baneshwor",
      place_id: "ChIJ1",
    })
    const html = renderSidebar({
      locations: [bound],
      selectedId: bound.id,
      selectedRadiusM: 10000,
      children: <p>Overview content</p>,
    })
    expect(html).toContain("10 km radius")
    expect(html).toContain("Overview content")
    expect(html).toContain('aria-current="true"')
  })

  test("search mode swaps the list for the in-panel form", () => {
    const bound = makeLocation({
      id: "bound",
      name: "Baneshwor",
      place_id: "ChIJ1",
    })
    const html = renderSidebar({
      locations: [bound],
      searchActive: true,
      searchForm: <p>Add a location form</p>,
    })
    expect(html).toContain("Add a location form")
    expect(html.includes("Add location</button>")).toBe(false)
    expect(html.includes("Baneshwor")).toBe(false)
  })

  test("the expanded header carries the collapse control", () => {
    expect(renderSidebar()).toContain('aria-label="Collapse locations"')
  })

  test("a collapsed panel shrinks to the expand button container", () => {
    const html = renderSidebar({ collapsed: true })
    expect(html).toContain('aria-label="Expand locations panel"')
    expect(html.includes("<header")).toBe(false)
    expect(html.includes("Add location")).toBe(false)
    expect(html.includes("No locations yet")).toBe(false)
  })

  test("top surface aligns to the navbar dock, not the outer row", () => {
    const html = renderSidebar()
    expect(html.includes("top-[13px]")).toBe(true)
    expect(html.includes("top-2")).toBe(false)
  })

  test("collapsed is a compact square, expanded spans near full height", () => {
    const collapsed = renderSidebar({ collapsed: true })
    const expanded = renderSidebar()
    expect(collapsed.includes("w-11")).toBe(true)
    expect(collapsed.includes("bottom-3")).toBe(false)
    expect(expanded.includes("bottom-3")).toBe(true)
  })

  test("an empty list teaches the next step", () => {
    expect(renderSidebar()).toContain("No locations yet")
  })
})
