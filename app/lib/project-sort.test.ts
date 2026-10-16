import { describe, expect, test } from "bun:test"

import type { ProjectResponse } from "~/lib/api.types"
import { sortProjectsByName } from "./project-sort"

function project(id: string, name: string): ProjectResponse {
  return {
    id,
    name,
    organization_id: "org-1",
    base_url: `https://${id}.example.com`,
  }
}

describe("sortProjectsByName", () => {
  test("sorts names A–Z without regard to case and orders numbers naturally", () => {
    const projects = [
      project("z", "Zulu"),
      project("b", "beta"),
      project("ten", "Project 10"),
      project("a", "Alpha"),
      project("two", "project 2"),
    ]
    expect(sortProjectsByName(projects).map(({ name }) => name)).toEqual([
      "Alpha",
      "beta",
      "project 2",
      "Project 10",
      "Zulu",
    ])
    expect(projects.map(({ id }) => id)).toEqual(["z", "b", "ten", "a", "two"])
    expect(sortProjectsByName(projects)[0]).toBe(projects[3])
  })

  test("uses project ids to keep equal names in a stable order", () => {
    const projects = [project("b", "alpha"), project("a", "Alpha")]
    expect(sortProjectsByName(projects).map(({ id }) => id)).toEqual(["a", "b"])
    expect(sortProjectsByName([...projects].reverse()).map(({ id }) => id)).toEqual(["a", "b"])
    expect(sortProjectsByName([])).toEqual([])
  })
})
