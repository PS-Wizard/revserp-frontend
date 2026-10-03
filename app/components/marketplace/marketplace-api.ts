import {
  ApiError,
  clientApiDelete,
  clientApiFetch,
  clientApiPost,
  clientApiPut,
} from "~/lib/api"
import type {
  MCPCatalogItem,
  MCPConnection,
  MCPConnectionCreateBody,
  MCPConnectionPatchBody,
  MCPToolInfo,
  MCPToolPermission,
  MCPToolPermissionEdit,
} from "~/lib/api.types"

/** Marketplace connection reads and writes for one project. */

export function mcpCatalogQueryKey(projectId: string) {
  return ["mcp-catalog", projectId] as const
}

export function mcpConnectionsQueryKey(projectId: string) {
  return ["mcp-connections", projectId] as const
}

export function mcpBase(projectId: string) {
  return `/projects/${projectId}/mcp`
}

export function mcpConnectionPath(projectId: string, connectionId: string) {
  return `${mcpBase(projectId)}/connections/${connectionId}`
}

export async function fetchMCPCatalog(projectId: string) {
  return clientApiFetch<{ items: MCPCatalogItem[] }>(
    `${mcpBase(projectId)}/catalog`
  )
}

export async function fetchMCPConnections(projectId: string) {
  return clientApiFetch<{ connections: MCPConnection[] }>(
    `${mcpBase(projectId)}/connections`
  )
}

export async function createMCPConnection(
  projectId: string,
  body: MCPConnectionCreateBody
) {
  return clientApiPost<{ connection: MCPConnection }>(
    `${mcpBase(projectId)}/connections`,
    body
  )
}

export async function patchMCPConnection(
  projectId: string,
  connectionId: string,
  body: MCPConnectionPatchBody
) {
  return clientApiFetch<{ connection: MCPConnection }>(
    mcpConnectionPath(projectId, connectionId),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

export async function checkMCPConnection(
  projectId: string,
  connectionId: string
) {
  return clientApiPost<{ connection: MCPConnection }>(
    `${mcpConnectionPath(projectId, connectionId)}/check`,
    {}
  )
}

export async function deleteMCPConnection(
  projectId: string,
  connectionId: string
) {
  await clientApiDelete(`${mcpConnectionPath(projectId, connectionId)}`)
}

export async function saveMCPToolPermissions(
  projectId: string,
  connectionId: string,
  permissions: MCPToolPermissionEdit[]
) {
  return clientApiPut<{ connection: MCPConnection }>(
    `${mcpConnectionPath(projectId, connectionId)}/permissions`,
    { permissions }
  )
}

/** Connect-form field errors. Only the failing field is flagged. */
export type MCPConnectionField = "name" | "endpointUrl" | "bearerToken"

export type MCPConnectionFieldError = {
  field: MCPConnectionField
  message: string
}

/** Client-side connect-form validation; the server re-validates before saving. */
export function validateMCPConnectionForm(values: {
  name: string
  endpointUrl: string
  bearerToken: string
  tokenOptional?: boolean
}): MCPConnectionFieldError | null {
  if (!values.name.trim())
    return { field: "name", message: "Name this connection." }
  if (values.name.trim().length > 80)
    return { field: "name", message: "Keep the name under 80 characters." }
  try {
    const parsed = new URL(values.endpointUrl.trim())
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      !parsed.hostname
    ) {
      return {
        field: "endpointUrl",
        message:
          "Enter the full MCP endpoint URL, starting with http:// or https://.",
      }
    }
  } catch {
    return {
      field: "endpointUrl",
      message:
        "Enter the full MCP endpoint URL, starting with http:// or https://.",
    }
  }
  if (!values.tokenOptional && !values.bearerToken) {
    return { field: "bearerToken", message: "Enter a bearer token to connect." }
  }
  return null
}

export function mcpErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

/** Changed available-only edits from explicit user overrides. Refreshed server
 * policy and unavailable tools never appear here, so saving cannot resend them. */
export function connectionPermissionEdits(
  tools: MCPToolInfo[],
  overrides: Record<string, MCPToolPermission>
): MCPToolPermissionEdit[] {
  return tools
    .filter(
      (tool) =>
        tool.available &&
        overrides[tool.name] !== undefined &&
        overrides[tool.name] !== tool.permission
    )
    .map((tool) => ({
      tool_name: tool.name,
      permission: overrides[tool.name] ?? tool.permission,
    }))
}

/** Permission choices for the configure list. Everything defaults to ask. */
export const MCP_PERMISSION_CHOICES: Array<{
  value: MCPToolPermission
  label: string
}> = [
  { value: "ask", label: "Ask" },
  { value: "allow", label: "Always allow" },
  { value: "deny", label: "Always deny" },
]

export function humanizeMCPToolName(name: string) {
  return name
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function humanizeMCPGroup(key: string) {
  const text = humanizeMCPToolName(key)
  return text || "Other tools"
}
