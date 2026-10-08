import { describe, expect, test } from "bun:test"
import {
  describeAIAuditFailure,
  getAIAuditResultsPath,
} from "./ai-audit-results"

describe("AI audit result navigation", () => {
  test("location audit opens its location and exact audit, not project visibility", () => {
    const path = getAIAuditResultsPath({
      id: "old-audit",
      project_id: "project-1",
      location_id: "branch-2",
      crawl_id: "crawl-1",
    })
    const url = new URL(path, "http://localhost")
    expect(url.pathname).toBe("/app")
    expect(url.searchParams.get("project")).toBe("project-1")
    expect(url.searchParams.get("location")).toBe("branch-2")
    expect(url.searchParams.get("audit")).toBe("old-audit")
    expect(url.searchParams.has("crawl")).toBe(false)
  })
  test("project audit opens its own project, crawl and audit", () => {
    const url = new URL(
      getAIAuditResultsPath({
        id: "audit-1",
        project_id: "project-2",
        crawl_id: "crawl-3",
      }),
      "http://localhost"
    )
    expect(url.pathname).toBe("/app")
    expect(url.searchParams.get("project")).toBe("project-2")
    expect(url.searchParams.get("crawl")).toBe("crawl-3")
    expect(url.searchParams.get("audit")).toBe("audit-1")
    expect(url.searchParams.has("location")).toBe(false)
  })
})

test("missing profile failure gives an action instead of an internal project ID", () => {
  expect(
    describeAIAuditFailure("no business profile for project secret-id")
  ).toBe(
    "Add a business profile for this project, then try the visibility test again."
  )
  expect(describeAIAuditFailure(" provider busy ")).toBe("provider busy")
  expect(describeAIAuditFailure(null)).toBeUndefined()
})
