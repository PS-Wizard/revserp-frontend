import type { MCPConnection, MCPCatalogItem, MCPService } from "~/lib/api.types"

export const CUSTOM_MCP_CATALOG_ID = "custom"

/**
 * Catalogue entries the UI ships on its own. The server catalogue wins for any
 * id it already returns, so an older backend simply leaves these in place.
 */
export const MARKETPLACE_CATALOG_PRESETS: MCPCatalogItem[] = [
  {
    id: "wordpress",
    title: "WordPress",
    description: "Read, draft and publish content on your WordPress site.",
    service: "wordpress",
    auth_required: true,
  },
  {
    id: "deepwiki",
    title: "DeepWiki",
    description: "Ask questions about any public GitHub repository.",
    service: "custom",
    endpoint_url: "https://mcp.deepwiki.com/mcp",
    auth_required: false,
  },
  {
    id: "cloudflare-docs",
    title: "Cloudflare Docs",
    description: "Search Cloudflare documentation and the API reference.",
    service: "custom",
    endpoint_url: "https://docs.mcp.cloudflare.com/mcp",
    auth_required: false,
  },
  {
    id: "microsoft-learn",
    title: "Microsoft Learn",
    description: "Search Microsoft Learn docs, tutorials and samples.",
    service: "custom",
    endpoint_url: "https://learn.microsoft.com/api/mcp",
    auth_required: false,
  },
  {
    id: "se-ranking",
    title: "SE Ranking",
    description:
      "Query SEO rankings and keyword positions for tracked projects.",
    service: "custom",
    endpoint_url: "https://api.seranking.com/mcp",
    auth_required: true,
    setup_note: "API access is required. API/MCP trial is available.",
  },
  {
    id: "sanity",
    title: "Sanity",
    description: "Read and edit structured content in your Sanity datasets.",
    service: "custom",
    endpoint_url: "https://mcp.sanity.io",
    auth_required: true,
    setup_note: "Use a Sanity API token with the required project permissions.",
  },
  {
    id: "windsor-ai",
    title: "Windsor.ai",
    description:
      "Pull marketing and advertising data from the sources you connect.",
    service: "custom",
    endpoint_url: "https://mcp.windsor.ai/",
    auth_required: true,
    setup_note:
      "Use your Windsor.ai API key. Source access depends on your plan.",
  },
  {
    id: "ahrefs",
    title: "Ahrefs",
    description: "Query backlinks, keywords and site metrics from Ahrefs.",
    service: "custom",
    endpoint_url: "https://api.ahrefs.com/mcp/mcp",
    auth_required: true,
    setup_note: "A paid Ahrefs plan and an MCP key are required.",
  },
  {
    id: "storyblok",
    title: "Storyblok",
    description:
      "Read and update headless CMS content in your Storyblok spaces.",
    service: "custom",
    endpoint_url: "https://mcp.storyblok.com/mcp",
    auth_required: true,
    setup_note:
      "Use a personal access token. MCP plan access is not yet verified.",
  },
  {
    id: "semrush",
    title: "Semrush",
    description: "Query SEO and competitor research data from Semrush.",
    service: "custom",
    endpoint_url: "https://mcp.semrush.com/v2/mcp",
    auth_required: true,
    connection_supported: false,
    setup_note:
      "Requires Apikey authentication or OAuth. The current bearer-token connector does not support this setup.",
  },
  {
    id: "accuranker",
    title: "AccuRanker",
    description: "Query AccuRanker ranking and search performance projects.",
    service: "custom",
    endpoint_url: "https://connect.accuranker.com/mcp",
    auth_required: true,
    connection_supported: false,
    setup_note:
      "Requires OAuth sign-in. The current connector does not support OAuth.",
  },
]

export const CUSTOM_MCP_CATALOG_ITEM: MCPCatalogItem = {
  id: CUSTOM_MCP_CATALOG_ID,
  title: "Custom MCP",
  description: "Any streamable HTTP MCP server, with or without a token.",
  service: "custom",
  auth_required: false,
}

/** Self-hosted brand assets. Simple Icons glyphs and provider favicons. */
export const MARKETPLACE_BRAND_LOGOS: Record<string, string> = {
  wordpress: "/brands/wordpress.svg",
  "cloudflare-docs": "/brands/cloudflare.svg",
  "microsoft-learn": "/brands/microsoft-learn.png",
  sanity: "/brands/sanity.svg",
  storyblok: "/brands/storyblok.svg",
  semrush: "/brands/semrush.svg",
  "se-ranking": "/brands/se-ranking.ico",
  ahrefs: "/brands/ahrefs.ico",
}

/** Known providers with no self-hosted mark render their initials instead. */
export const MARKETPLACE_BRAND_INITIALS: Record<string, string> = {
  accuranker: "AR",
  "windsor-ai": "W",
  deepwiki: "DW",
}

export type CatalogGroupId = "seo" | "content" | "analytics" | "others"

const CATALOG_GROUP_IDS: Record<string, CatalogGroupId> = {
  "se-ranking": "seo",
  ahrefs: "seo",
  semrush: "seo",
  accuranker: "seo",
  wordpress: "content",
  sanity: "content",
  storyblok: "content",
  "windsor-ai": "analytics",
}

export const CATALOG_GROUP_ORDER: CatalogGroupId[] = [
  "seo",
  "content",
  "analytics",
  "others",
]

export const CATALOG_GROUP_TITLES: Record<CatalogGroupId, string> = {
  seo: "SEO and visibility",
  content: "Content and publishing",
  analytics: "Analytics and ads",
  others: "Others",
}

/** Frontend-only grouping: unknown and future entries land in Others. */
export function catalogGroupId(id: string): CatalogGroupId {
  return CATALOG_GROUP_IDS[id] ?? "others"
}

/** Ordered groups, empty ones dropped, each keeping catalogue order. */
export function groupCatalogItems(items: MCPCatalogItem[]) {
  return CATALOG_GROUP_ORDER.map((id) => ({
    id,
    title: CATALOG_GROUP_TITLES[id],
    items: items.filter((item) => catalogGroupId(item.id) === id),
  })).filter((group) => group.items.length > 0)
}

/** Server-supplied brand metadata wins; shipped marks are the fallback. */
export function marketplaceBrandLogo(id: string, logo?: string) {
  return logo ?? MARKETPLACE_BRAND_LOGOS[id]
}

/** Missing metadata from an older backend degrades to the generic transport. */
export function catalogEntryService(item: MCPCatalogItem): MCPService {
  if (item.service) return item.service
  return item.id === "wordpress" ? "wordpress" : "custom"
}

/**
 * Whether the connector can create a new connection for this entry. Absent
 * metadata from an older backend means supported.
 */
export function catalogEntryConnectionSupported(item: MCPCatalogItem) {
  return item.connection_supported !== false
}

/** Catalogue id a saved connection's endpoint belongs to, if any. */
export function connectionBrandId(endpointUrl: string) {
  const normalized = normalizePresetEndpoint(endpointUrl)
  return MARKETPLACE_CATALOG_PRESETS.find(
    (item) => catalogEntryEndpoint(item) === normalized
  )?.id
}

/** Brand mark for a saved connection, matched by preset endpoint. */
export function connectionBrandLogo(endpointUrl: string) {
  const id = connectionBrandId(endpointUrl)
  return id ? marketplaceBrandLogo(id) : undefined
}

/** Preset endpoints only; WordPress and the generic row supply their own. */
export function catalogEntryEndpoint(item: MCPCatalogItem) {
  const service = catalogEntryService(item)
  if (service !== "custom" || !item.endpoint_url) return null
  return normalizePresetEndpoint(item.endpoint_url)
}

/** Scheme and host are case-insensitive; a trailing slash is not an endpoint. */
export function normalizePresetEndpoint(raw: string) {
  const trimmed = raw.trim()
  try {
    const parsed = new URL(trimmed)
    const path = parsed.pathname.replace(/\/+$/, "")
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "")
  }
}

export function mergeCatalogPresets(serverItems: MCPCatalogItem[] | undefined) {
  const serverOwned = new Set(
    (serverItems ?? [])
      .filter((item) => item.id !== CUSTOM_MCP_CATALOG_ID)
      .map((item) => item.id)
  )
  return [
    ...(serverItems ?? []).filter((item) => item.id !== CUSTOM_MCP_CATALOG_ID),
    ...MARKETPLACE_CATALOG_PRESETS.filter((item) => !serverOwned.has(item.id)),
  ]
}

/**
 * Connections a catalogue row owns. Branded presets match the exact canonical
 * endpoint, never every custom connection, so unrelated servers stay in the
 * generic row.
 */
export function catalogConnectionsForItem(
  item: MCPCatalogItem,
  connections: MCPConnection[],
  catalogItems: MCPCatalogItem[]
) {
  if (catalogEntryService(item) === "wordpress") {
    return connections.filter(
      (connection) => connection.service === "wordpress"
    )
  }
  const presetEndpoint = catalogEntryEndpoint(item)
  const custom = connections.filter(
    (connection) => connection.service === "custom"
  )
  if (presetEndpoint) {
    return custom.filter(
      (connection) =>
        normalizePresetEndpoint(connection.endpoint_url) === presetEndpoint
    )
  }
  const presetEndpoints = new Set(
    catalogItems.map(catalogEntryEndpoint).filter((value) => value !== null)
  )
  return custom.filter(
    (connection) =>
      !presetEndpoints.has(normalizePresetEndpoint(connection.endpoint_url))
  )
}
