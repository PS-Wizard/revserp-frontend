import { describe, expect, test } from "bun:test"

import { describeLocationMapsViewportDrift } from "~/components/locations/location-visibility-maps"

describe("viewport drift note", () => {
  test("missing or unusable drift reads as no note, never a fake zero", () => {
    expect(describeLocationMapsViewportDrift({})).toBeNull()
    expect(
      describeLocationMapsViewportDrift({ viewport_drift_m: null })
    ).toBeNull()
    expect(
      describeLocationMapsViewportDrift({ viewport_drift_m: -1 })
    ).toBeNull()
    expect(
      describeLocationMapsViewportDrift({ viewport_drift_m: Number.NaN })
    ).toBeNull()
  })

  test("drift alone reports the saved raw distance", () => {
    expect(
      describeLocationMapsViewportDrift({ viewport_drift_m: 120.4 })
    ).toBe("Centre drift \u2248 120 m")
  })

  test("requested and returned centres show side by side with the distance", () => {
    expect(
      describeLocationMapsViewportDrift({
        requested_ll: "@27.70000,85.30000,14z",
        echoed_ll: "@27.70100,85.30100,14z",
        viewport_drift_m: 45.2,
      })
    ).toBe(
      "Requested @27.70000,85.30000,14z \u00b7 Returned @27.70100,85.30100,14z \u00b7 Centre drift \u2248 45 m"
    )
  })
})
