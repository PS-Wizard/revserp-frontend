import { describe, expect, test } from "bun:test"

import {
  buildWorkspaceNavGroups,
  findActiveTabKey,
  isWorkspaceTabActive,
} from "./workspace-sidebar-nav"

describe("location scoped nav groups", () => {
  const base = {
    gscConnector: false,
    integrations: true,
    maxCompetitors: 1,
    projectId: "proj-1",
  }

  test("parent keeps the marketplace group", () => {
    const groups = buildWorkspaceNavGroups(base)
    expect(groups.some((entry) => entry.key === "marketplace")).toBe(true)
  })

  test("location scope hides marketplace but keeps locations", () => {
    const groups = buildWorkspaceNavGroups({
      ...base,
      isLocationScoped: true,
    })
    expect(groups.some((entry) => entry.key === "marketplace")).toBe(false)
    const locations = groups.find((entry) => entry.key === "locations")
    expect(locations?.tabs[0].href).toBe("/app/projects/proj-1/locations")
  })

  test("location scope keeps audit and visibility groups intact", () => {
    const groups = buildWorkspaceNavGroups({
      ...base,
      isLocationScoped: true,
    })
    expect(groups.some((entry) => entry.key === "audit")).toBe(true)
    expect(groups.some((entry) => entry.key === "visibility")).toBe(true)
  })

  test("location scope hides the whole-site site-graph audit tab", () => {
    const locationTabs = buildWorkspaceNavGroups({
      ...base,
      isLocationScoped: true,
    })
      .find((entry) => entry.key === "audit")
      ?.tabs.map((tab) => tab.key)
    expect(locationTabs?.includes("audit-site-graph")).toBe(false)
    expect(locationTabs).toContain("audit-overview")
    const parentTabs = buildWorkspaceNavGroups(base)
      .find((entry) => entry.key === "audit")
      ?.tabs.map((tab) => tab.key)
    expect(parentTabs).toContain("audit-site-graph")
  })
})

describe("location competitors merged tab", () => {
  test("zero quota hides parent competitors", () => {
    const groups = buildWorkspaceNavGroups({
      gscConnector: false,
      integrations: false,
      maxCompetitors: 0,
      projectId: "proj-1",
    })
    expect(groups.some((entry) => entry.key === "compare")).toBe(false)
  })

  test("location scope has no separate competitors tab: the Maps test owns it", () => {
    for (const maxCompetitors of [0, 5]) {
      const groups = buildWorkspaceNavGroups({
        gscConnector: false,
        integrations: false,
        maxCompetitors,
        projectId: "proj-1",
        isLocationScoped: true,
      })
      expect(groups.some((entry) => entry.key === "compare")).toBe(false)
      const visibility = groups.find((entry) => entry.key === "visibility")
      expect(visibility?.tabs.map((tab) => tab.key)).toContain("visibility-maps")
    }
  })

  test("quota keeps parent competitors", () => {
    const groups = buildWorkspaceNavGroups({
      gscConnector: false,
      integrations: false,
      maxCompetitors: 2,
      projectId: "proj-1",
    })
    const compare = groups.find((entry) => entry.key === "compare")
    expect(compare?.tabs.map((tab) => tab.key)).toEqual(["competitors"])
  })
})

describe("visibility mode tabs", () => {
  const parent = {
    gscConnector: false,
    integrations: false,
    maxCompetitors: 0,
    projectId: "proj-1",
  }

  test("parent keeps one modeless visibility tab", () => {
    const tabs = buildWorkspaceNavGroups(parent)
      .find((entry) => entry.key === "visibility")
      ?.tabs.filter((tab) => tab.view === "revserp-visibility")
    expect(tabs?.map((tab) => tab.key)).toEqual(["visibility-test"])
  })

  test("location splits maps and ai outer options", () => {
    const groups = buildWorkspaceNavGroups({ ...parent, isLocationScoped: true })
    const tabs = groups
      .find((entry) => entry.key === "visibility")
      ?.tabs.filter((tab) => tab.view === "revserp-visibility")
    expect(tabs?.map((tab) => tab.key)).toEqual([
      "visibility-maps",
      "visibility-ai",
    ])
    const maps = tabs?.[0]
    const ai = tabs?.[1]
    expect(isWorkspaceTabActive(maps!, "revserp-visibility", "overview", undefined, "maps")).toBe(true)
    expect(isWorkspaceTabActive(maps!, "revserp-visibility", "overview", undefined, "ai")).toBe(false)
    expect(isWorkspaceTabActive(ai!, "revserp-visibility", "overview", undefined, "ai")).toBe(true)
    expect(findActiveTabKey(groups, "revserp-visibility", "overview", undefined, "ai")).toBe("visibility-ai")
  })
})
