import { describe, expect, test } from "bun:test"

import {
  connectionPermissionEdits,
  humanizeMCPToolName,
  validateMCPConnectionForm,
} from "./marketplace-api"
import type { MCPToolInfo } from "~/lib/api.types"

function tool(
  name: string,
  permission: "ask" | "allow" | "deny",
  available = true
): MCPToolInfo {
  return {
    name,
    description: `${name} description`,
    group: "content",
    permission,
    available,
  }
}

describe("validateMCPConnectionForm", () => {
  const valid = {
    name: "WordPress",
    endpointUrl: "https://example.com/mcp",
    bearerToken: "secret",
  }

  test("flags the name field first", () => {
    expect(validateMCPConnectionForm({ ...valid, name: "  " })).toEqual({
      field: "name",
      message: "Name this connection.",
    })
    expect(
      validateMCPConnectionForm({ ...valid, name: "x".repeat(81) })
    ).toEqual({ field: "name", message: "Keep the name under 80 characters." })
  })

  test("flags only the endpoint field for bad URLs", () => {
    for (const endpointUrl of ["", "not-a-url", "ftp://example.com/mcp"]) {
      const result = validateMCPConnectionForm({ ...valid, endpointUrl })
      expect(result?.field).toBe("endpointUrl")
    }
    expect(validateMCPConnectionForm(valid)).toBeNull()
  })

  test("flags only the token field when required and missing", () => {
    expect(validateMCPConnectionForm({ ...valid, bearerToken: "" })).toEqual({
      field: "bearerToken",
      message: "Enter a bearer token to connect.",
    })
    expect(
      validateMCPConnectionForm({
        ...valid,
        bearerToken: "",
        tokenOptional: true,
      })
    ).toBeNull()
  })
})

describe("connectionPermissionEdits", () => {
  const tools = [
    tool("list_posts", "ask"),
    tool("update_post", "allow"),
    tool("delete_post", "deny", false),
  ]

  test("empty overrides submit nothing", () => {
    expect(connectionPermissionEdits(tools, {})).toEqual([])
  })

  test("only changed available tools are submitted", () => {
    expect(
      connectionPermissionEdits(tools, {
        list_posts: "allow",
        update_post: "allow",
        delete_post: "ask",
      })
    ).toEqual([{ tool_name: "list_posts", permission: "allow" }])
  })

  test("an override matching refreshed server policy drops out", () => {
    const refreshed = [
      tool("list_posts", "deny"),
      tool("update_post", "deny"),
      tool("delete_post", "deny", false),
    ]
    expect(
      connectionPermissionEdits(refreshed, { list_posts: "allow" })
    ).toEqual([{ tool_name: "list_posts", permission: "allow" }])
    expect(
      connectionPermissionEdits(refreshed, { list_posts: "deny" })
    ).toEqual([])
  })
})

describe("humanizeMCPToolName", () => {
  test("splits slash-separated names", () => {
    expect(humanizeMCPToolName("content/list_posts")).toBe("Content List Posts")
    expect(humanizeMCPToolName("content/update-post")).toBe(
      "Content Update Post"
    )
    expect(humanizeMCPToolName("list_posts")).toBe("List Posts")
  })
})
