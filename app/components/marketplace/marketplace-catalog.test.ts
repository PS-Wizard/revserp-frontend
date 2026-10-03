import { existsSync } from "node:fs"
import { describe, expect, test } from "bun:test"

import {
  catalogConnectionsForItem,
  catalogEntryConnectionSupported,
  catalogEntryService,
  catalogGroupId,
  connectionBrandLogo,
  CUSTOM_MCP_CATALOG_ITEM,
  groupCatalogItems,
  MARKETPLACE_BRAND_INITIALS,
  MARKETPLACE_BRAND_LOGOS,
  MARKETPLACE_CATALOG_PRESETS,
  mergeCatalogPresets,
  normalizePresetEndpoint,
} from "./marketplace-catalog"
import type { MCPConnection, MCPCatalogItem } from "~/lib/api.types"

function connection(overrides: Partial<MCPConnection>): MCPConnection {
  return {
    id: "c-1",
    project_id: "p-1",
    name: "DeepWiki",
    service: "custom",
    endpoint_url: "https://mcp.deepwiki.com/mcp",
    revision: "rev-1",
    tools: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  }
}

const catalogItems = [...MARKETPLACE_CATALOG_PRESETS, CUSTOM_MCP_CATALOG_ITEM]

function preset(id: string): MCPCatalogItem {
  const item = MARKETPLACE_CATALOG_PRESETS.find((entry) => entry.id === id)
  if (!item) throw new Error(`preset ${id} missing`)
  return item
}

describe("mergeCatalogPresets", () => {
  test("keeps the server catalogue and adds the presets it omits", () => {
    const merged = mergeCatalogPresets([
      {
        id: "wordpress",
        title: "WordPress site",
        description: "Site content.",
      },
      { id: "deepwiki", title: "DeepWiki", description: "Server copy." },
    ])
    const byId = new Map(merged.map((item) => [item.id, item]))
    expect(byId.get("wordpress")?.title).toBe("WordPress site")
    expect(byId.get("deepwiki")?.description).toBe("Server copy.")
    expect(merged.map((item) => item.id)).toEqual([
      "wordpress",
      "deepwiki",
      "cloudflare-docs",
      "microsoft-learn",
      "se-ranking",
      "sanity",
      "windsor-ai",
      "ahrefs",
      "storyblok",
      "semrush",
      "accuranker",
    ])
  })

  test("an absent server catalogue still yields every preset once", () => {
    expect(mergeCatalogPresets(undefined).map((item) => item.id)).toEqual([
      "wordpress",
      "deepwiki",
      "cloudflare-docs",
      "microsoft-learn",
      "se-ranking",
      "sanity",
      "windsor-ai",
      "ahrefs",
      "storyblok",
      "semrush",
      "accuranker",
    ])
    expect(
      mergeCatalogPresets([CUSTOM_MCP_CATALOG_ITEM]).filter(
        (item) => item.id === CUSTOM_MCP_CATALOG_ITEM.id
      )
    ).toHaveLength(0)
  })
})

describe("catalogEntryService", () => {
  test("metadata wins and absent metadata falls back to the id", () => {
    expect(catalogEntryService(preset("deepwiki"))).toBe("custom")
    expect(
      catalogEntryService({ id: "wordpress", title: "w", description: "d" })
    ).toBe("wordpress")
    expect(
      catalogEntryService({ id: "unknown", title: "u", description: "d" })
    ).toBe("custom")
  })
})

describe("normalizePresetEndpoint", () => {
  test("ignores case and trailing slashes but not paths", () => {
    expect(normalizePresetEndpoint("HTTPS://MCP.DeepWiki.com/mcp/")).toBe(
      normalizePresetEndpoint("https://mcp.deepwiki.com/mcp")
    )
    expect(
      normalizePresetEndpoint("https://mcp.deepwiki.com/") ===
        normalizePresetEndpoint("https://mcp.deepwiki.com/mcp")
    ).toBe(false)
    expect(normalizePresetEndpoint(" not a url ")).toBe("not a url")
  })
})

describe("catalogConnectionsForItem", () => {
  test("a branded preset owns only the exact canonical endpoint", () => {
    const exact = connection({ id: "c-exact" })
    const trailing = connection({
      id: "c-trailing",
      endpoint_url: "https://mcp.deepwiki.com/mcp/",
    })
    const other = connection({
      id: "c-other",
      endpoint_url: "https://mcp.example.com/mcp",
    })
    const matches = catalogConnectionsForItem(
      preset("deepwiki"),
      [exact, trailing, other],
      catalogItems
    )
    expect(matches.map((match) => match.id)).toEqual(["c-exact", "c-trailing"])
  })

  test("WordPress rows match their adapter, not preset endpoints", () => {
    const wp = connection({ id: "c-wp", service: "wordpress" })
    expect(
      catalogConnectionsForItem(preset("wordpress"), [wp], catalogItems).map(
        (match) => match.id
      )
    ).toEqual(["c-wp"])
  })

  test("the generic row keeps only unmatched custom servers", () => {
    const presetConnection = connection({ id: "c-preset" })
    const generic = connection({
      id: "c-generic",
      name: "Acme",
      endpoint_url: "https://mcp.acme.test/mcp",
    })
    expect(
      catalogConnectionsForItem(
        CUSTOM_MCP_CATALOG_ITEM,
        [presetConnection, generic],
        catalogItems
      ).map((match) => match.id)
    ).toEqual(["c-generic"])
  })
})

describe("connectionBrandLogo", () => {
  test("matches preset endpoints and leaves unknown servers to the plug", () => {
    expect(connectionBrandLogo("https://docs.mcp.cloudflare.com/mcp/")).toBe(
      "/brands/cloudflare.svg"
    )
    expect(connectionBrandLogo("https://mcp.deepwiki.com/mcp")).toBeUndefined()
  })
})

describe("groupCatalogItems", () => {
  test("orders the known groups and drops the empty ones", () => {
    const groups = groupCatalogItems([
      preset("accuranker"),
      preset("wordpress"),
      preset("windsor-ai"),
    ])
    expect(groups.map((group) => group.id)).toEqual([
      "seo",
      "content",
      "analytics",
    ])
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["accuranker"],
      ["wordpress"],
      ["windsor-ai"],
    ])
  })

  test("unknown and future entries land in Others last", () => {
    const future: MCPCatalogItem = {
      id: "future-mcp",
      title: "Future MCP",
      description: "Unknown provider.",
      service: "custom",
    }
    const groups = groupCatalogItems([
      future,
      preset("deepwiki"),
      preset("sanity"),
    ])
    expect(groups.map((group) => group.id)).toEqual(["content", "others"])
    expect(groups[1].title).toBe("Others")
    expect(groups[1].items.map((item) => item.id)).toEqual([
      "future-mcp",
      "deepwiki",
    ])
    expect(catalogGroupId("future-mcp")).toBe("others")
  })
})

describe("brand assets", () => {
  test("known providers ship a local mark or legible initials", () => {
    for (const id of [
      "se-ranking",
      "sanity",
      "windsor-ai",
      "ahrefs",
      "storyblok",
      "semrush",
      "accuranker",
    ]) {
      expect(
        MARKETPLACE_BRAND_LOGOS[id] ?? MARKETPLACE_BRAND_INITIALS[id]
      ).toBeTruthy()
    }
    for (const path of Object.values(MARKETPLACE_BRAND_LOGOS)) {
      expect(existsSync(`public${path}`)).toBe(true)
    }
    expect(MARKETPLACE_BRAND_LOGOS["se-ranking"]).toBe("/brands/se-ranking.ico")
    expect(MARKETPLACE_BRAND_LOGOS.ahrefs).toBe("/brands/ahrefs.ico")
    expect(MARKETPLACE_BRAND_INITIALS.accuranker).toBe("AR")
    expect(MARKETPLACE_BRAND_INITIALS["windsor-ai"]).toBe("W")
  })
})

describe("business catalogue presets", () => {
  test("every requested provider ships with its contract metadata", () => {
    for (const id of [
      "se-ranking",
      "sanity",
      "windsor-ai",
      "ahrefs",
      "storyblok",
      "semrush",
      "accuranker",
    ]) {
      const item = preset(id)
      expect(item.service).toBe("custom")
      expect(item.auth_required).toBe(true)
      expect(item.endpoint_url).toBeTruthy()
      expect(item.setup_note).toBeTruthy()
    }
    expect(preset("se-ranking").endpoint_url).toBe(
      "https://api.seranking.com/mcp"
    )
    expect(preset("sanity").endpoint_url).toBe("https://mcp.sanity.io")
    expect(preset("windsor-ai").endpoint_url).toBe("https://mcp.windsor.ai/")
    expect(preset("ahrefs").endpoint_url).toBe("https://api.ahrefs.com/mcp/mcp")
    expect(preset("storyblok").endpoint_url).toBe(
      "https://mcp.storyblok.com/mcp"
    )
    expect(preset("semrush").endpoint_url).toBe(
      "https://mcp.semrush.com/v2/mcp"
    )
    expect(preset("accuranker").endpoint_url).toBe(
      "https://connect.accuranker.com/mcp"
    )
  })

  test("only the OAuth providers are marked unsupported", () => {
    expect(catalogEntryConnectionSupported(preset("semrush"))).toBe(false)
    expect(catalogEntryConnectionSupported(preset("accuranker"))).toBe(false)
    for (const id of [
      "se-ranking",
      "sanity",
      "windsor-ai",
      "ahrefs",
      "storyblok",
      "wordpress",
      "deepwiki",
    ]) {
      expect(catalogEntryConnectionSupported(preset(id))).toBe(true)
    }
  })

  test("an absent support flag means supported", () => {
    expect(
      catalogEntryConnectionSupported({
        id: "server-entry",
        title: "Server entry",
        description: "From an older backend.",
      })
    ).toBe(true)
  })

  test("provider endpoints match saved connections, trailing slash included", () => {
    const matches = catalogConnectionsForItem(
      preset("windsor-ai"),
      [
        connection({ id: "c-w", endpoint_url: "https://mcp.windsor.ai" }),
        connection({
          id: "c-a",
          endpoint_url: "https://connect.accuranker.com/mcp",
        }),
        connection({ id: "c-o", endpoint_url: "https://mcp.other.test/mcp" }),
      ],
      catalogItems
    ).map((match) => match.id)
    expect(matches).toEqual(["c-w"])
  })
})
