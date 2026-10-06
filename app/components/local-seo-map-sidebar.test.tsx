import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import {
  LocalSeoMapSidebar,
  describeLocalSeoRadiusLabel,
  describeLocalSeoSidebarRow,
  filterLocalSeoSidebarLocations,
  type LocalSeoMapSidebarProps,
} from "~/components/local-seo-map-sidebar"
import { LocalSeoMapDetailPanel } from "~/components/local-seo-map-detail-panel"
import type { LocalSeoLocation, LocalSeoRun } from "~/lib/local-seo-api"
import type { ReactNode } from "react"

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
    localities: [],
    services: [],
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

function renderSidebar(overrides: Partial<LocalSeoMapSidebarProps> = {}) {
  return renderToStaticMarkup(
    <LocalSeoMapSidebar
      collapsed={false}
      locations={[]}
      runByLocation={new Map()}
      selectedId={null}
      locationsPending={false}
      locationsError={null}
      onSelectLocation={noop}
      onAddLocation={noop}
      onToggleCollapsed={noop}
      {...overrides}
    />
  )
}

function renderDetail(
  overrides: Partial<Parameters<typeof LocalSeoMapDetailPanel>[0]> = {},
  children: ReactNode = <p>Overview content</p>
) {
  return renderToStaticMarkup(
    <LocalSeoMapDetailPanel
      title="Baneshwor"
      meta="Main St"
      pill="5 km radius"
      onClose={noop}
      activeTab="overview"
      onTabChange={noop}
      {...overrides}
    >
      {children}
    </LocalSeoMapDetailPanel>
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

describe("sidebar search filter", () => {
  const roastery = makeLocation({
    name: "Roastery",
    address: "Main St",
    locality: "Downtown",
  })
  const other = makeLocation({
    id: "loc-2",
    name: "Bakery",
    address: "Side Rd",
    locality: "Uptown",
  })

  test("an empty query keeps every saved location", () => {
    expect(filterLocalSeoSidebarLocations([roastery, other], "  ")).toEqual([
      roastery,
      other,
    ])
  })

  test("matches on name, address, and locality, ignoring case", () => {
    expect(filterLocalSeoSidebarLocations([roastery, other], "ROAST")).toEqual([
      roastery,
    ])
    expect(filterLocalSeoSidebarLocations([roastery, other], "main")).toEqual([
      roastery,
    ])
    expect(filterLocalSeoSidebarLocations([roastery, other], "uptown")).toEqual(
      [other]
    )
  })

  test("an unmatched query returns nothing", () => {
    expect(filterLocalSeoSidebarLocations([roastery, other], "zzz")).toEqual([])
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
    expect(html).toContain("New location")
    expect(html).toContain("Baneshwor")
    expect(html).toContain("Corner Shop")
    expect(html).toContain("Unresolved search area")
    expect(html).toContain("Run completed")
    expect(html).toContain("5 km radius")
  })

  test("the panel is list-only: a search field, never the tab detail", () => {
    const html = renderSidebar({
      locations: [makeLocation({ place_id: "ChIJ1" })],
      selectedId: "loc-1",
    })
    expect(html).toContain('aria-label="Search saved locations"')
    expect(html.includes("Overview")).toBe(false)
    expect(html.includes("Queries")).toBe(false)
    expect(html.includes("Close details")).toBe(false)
  })

  test("a selected row is marked current without a nested detail section", () => {
    const bound = makeLocation({ place_id: "ChIJ1" })
    const html = renderSidebar({ locations: [bound], selectedId: bound.id })
    expect(html).toContain('aria-current="true"')
    expect(html.includes('aria-label="Roastery details"')).toBe(false)
  })

  test("the expanded header keeps only the collapse control", () => {
    const html = renderSidebar()
    expect(html).toContain('aria-label="Collapse locations"')
    expect(html).toContain("w-[clamp(18rem,22vw,22rem)]")
    expect(html.includes("Add location")).toBe(false)
  })

  test("New location is a pinned footer row, not a header button", () => {
    const html = renderSidebar()
    expect(html).toContain("New location")
    expect(html.includes("border-t")).toBe(true)
    expect(html.includes("<header")).toBe(true)
    const headerEnd = html.indexOf("</header>")
    const footerStart = html.indexOf("New location")
    expect(footerStart > headerEnd).toBe(true)
  })

  test("a collapsed panel shrinks to the expand button container", () => {
    const html = renderSidebar({ collapsed: true })
    expect(html).toContain('aria-label="Expand locations panel"')
    expect(html.includes("<header")).toBe(false)
    expect(html.includes("New location")).toBe(false)
    expect(html.includes("Search saved locations")).toBe(false)
    expect(html.includes("No locations yet")).toBe(false)
  })

  test("an empty list teaches the next step", () => {
    expect(renderSidebar()).toContain("No locations yet")
  })

  test("a filtered-out list explains the empty result", () => {
    const html = renderSidebar({ locations: [makeLocation()] })
    expect(html).toContain("Roastery")
    expect(html.includes("No saved locations match this search.")).toBe(false)
  })
})

describe("detail panel", () => {
  test("carries the name, meta line, radius pill, and close control", () => {
    const html = renderDetail()
    expect(html).toContain("Baneshwor")
    expect(html).toContain("Main St")
    expect(html).toContain("5 km radius")
    expect(html).toContain('aria-label="Close details"')
    expect(html).toContain('aria-label="Baneshwor details"')
  })

  test("pins the tabs and renders the active content", () => {
    const html = renderDetail()
    expect(html).toContain("Overview")
    expect(html).toContain("Queries")
    expect(html).toContain("Listing")
    expect(html).toContain("Run")
    expect(html).toContain("Overview content")
    expect(html).toContain('data-slot="tabs"')
  })

  test("the add/search flow drops the tabs and shows the back control", () => {
    const html = renderDetail(
      {
        title: "Add location",
        meta: undefined,
        pill: undefined,
        activeTab: undefined,
        onTabChange: undefined,
        onBack: noop,
      },
      <p>Search form</p>
    )
    expect(html).toContain("Add location")
    expect(html).toContain("Search form")
    expect(html.includes("Overview")).toBe(false)
    expect(html).toContain('aria-label="Back to locations"')
  })

  test("the below-lg back control is hidden on wide screens", () => {
    const html = renderDetail({ onBack: noop, backClassName: "lg:hidden" })
    expect(html).toContain('aria-label="Back to locations"')
    expect(html).toContain("lg:hidden")
  })
})
