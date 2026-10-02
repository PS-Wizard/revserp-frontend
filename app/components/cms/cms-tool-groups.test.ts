import { describe, expect, test } from "bun:test"
import type { CMSToolResponse } from "~/lib/api.types"
import { groupCMSTools } from "./cms-tool-groups"

function tool(
  name: string,
  extra: Partial<CMSToolResponse> = {}
): CMSToolResponse {
  return { name, description: `${name} description`, ...extra }
}

describe("groupCMSTools", () => {
  test("tools without a group fall into Other tools", () => {
    const sections = groupCMSTools([
      tool("cms__list_collections"),
      tool("wp__x"),
    ])
    expect(sections).toHaveLength(1)
    expect(sections[0].key).toBe("other")
    expect(sections[0].title).toBe("Other tools")
    expect(sections[0].rows).toHaveLength(2)
  })

  test("groups keep their reported title and count reads before writes", () => {
    const sections = groupCMSTools([
      tool("wp__update_content", { group: "content", write: true }),
      tool("wp__get_content", { group: "content" }),
      tool("wp__delete_content", { group: "content", write: true }),
      tool("cms__list_records", { group: "rune" }),
    ])
    expect(sections.map((section) => section.key)).toEqual(["content", "rune"])
    expect(sections[0].title).toBe("Content")
    expect(sections[0].rows.map((row) => row.label)).toEqual([
      "Get Content",
      "Update Content",
      "Delete Content",
    ])
    expect(sections[0].rows.map((row) => row.write)).toEqual([
      false,
      true,
      true,
    ])
    expect(sections[1].title).toBe("Rune CMS")
  })

  test("rows carry the label and description for the tooltip", () => {
    const [section] = groupCMSTools([
      tool("cms__list_records", {
        group: "rune",
        description: "Browse records",
      }),
    ])
    expect(section.rows[0].label).toBe("List Records")
    expect(section.rows[0].description).toBe("Browse records")
    expect(section.rows[0].name).toBe("cms__list_records")
    const [bare] = groupCMSTools([tool("list_records", { group: "rune" })])
    expect(bare.rows[0].label).toBe("Browse records")
  })
})
