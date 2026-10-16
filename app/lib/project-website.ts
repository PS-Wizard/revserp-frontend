import type { ProjectResponse } from "~/lib/api.types"

/** Safe public website URL for a project. Only http(s); never javascript: etc. */
export function getSafeProjectWebsiteUrl(
  project: Pick<ProjectResponse, "base_url">
): string | null {
  const raw = project.base_url.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  return url.toString()
}
