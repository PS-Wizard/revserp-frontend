import type { AIAuditResponse } from "~/lib/api.types"

export function getAIAuditResultsPath(
  audit: Pick<AIAuditResponse, "id" | "project_id" | "location_id" | "crawl_id">
) {
  const params = new URLSearchParams({ audit: audit.id })
  if (audit.location_id) {
    params.set("location", audit.location_id)
    return `/app/projects/${encodeURIComponent(audit.project_id)}/locations?${params}`
  }
  params.set("project", audit.project_id)
  if (audit.crawl_id) params.set("crawl", audit.crawl_id)
  return `/app?${params}`
}

export function describeAIAuditFailure(error: unknown) {
  if (typeof error !== "string" || !error.trim()) return undefined
  if (error.trim().startsWith("no business profile for project ")) {
    return "Add a business profile for this project, then try the visibility test again."
  }
  return error.trim()
}
