import type { CMSToolResponse } from "~/lib/api.types"

const TOOL_LABELS: Record<string, string> = {
  list_collections: "List collections",
  get_collection_schema: "View collection fields",
  list_records: "Browse records",
  read_record: "Read a record",
  create_record: "Create a record",
  update_record: "Update a record",
}

const GROUP_LABELS: Record<string, string> = {
  rune: "Rune CMS",
  wordpress: "WordPress",
  other: "Other tools",
}

/** One row in the tool browser: name leads, write flag and description follow. */
export type CMSToolRow = {
  name: string
  label: string
  description: string
  write: boolean
}

/** One category block inside the single bounded scroll region. */
export type CMSToolSection = {
  key: string
  title: string
  rows: CMSToolRow[]
}

export function humanizeToolName(name: string) {
  return name
    .replace(/^(cms|wp)__/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function humanizeGroup(key: string) {
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function toolLabel(tool: CMSToolResponse) {
  return TOOL_LABELS[tool.name] ?? humanizeToolName(tool.name)
}

/**
 * Group advertised CMS tools by the group the endpoint reports. Tools without a
 * group land in "Other tools"; reads sort before writes inside each group.
 * Backend owns the category metadata, so unknown groups are shown as-is.
 */
export function groupCMSTools(tools: CMSToolResponse[]): CMSToolSection[] {
  const groups = new Map<string, CMSToolResponse[]>()
  for (const tool of tools) {
    const key = tool.group?.trim() || "other"
    const bucket = groups.get(key)
    if (bucket) bucket.push(tool)
    else groups.set(key, [tool])
  }
  return [...groups].map(([key, groupTools]) => {
    const reads = groupTools.filter((tool) => tool.write !== true)
    const writes = groupTools.filter((tool) => tool.write === true)
    return {
      key,
      title: GROUP_LABELS[key] ?? humanizeGroup(key),
      rows: [...reads, ...writes].map((tool) => ({
        name: tool.name,
        label: toolLabel(tool),
        description: tool.description ?? "",
        write: tool.write === true,
      })),
    }
  })
}
