"use client"

import { clientApiPut } from "~/lib/api"
import type { LocationWebsiteScopeRevision } from "~/lib/location-workspace"

export type LocationWebsiteScopeMatch = "none" | "exact" | "subtree"

export type LocationWebsiteScopeInput = {
  url: string | null
  match: LocationWebsiteScopeMatch
}

/** Short human label for a branch website scope match. */
export function describeLocationWebsiteScopeMatch(
  match: LocationWebsiteScopeMatch
): string {
  if (match === "exact") return "Exact page"
  if (match === "subtree") return "Page subtree"
  return "No branch scope"
}

/**
 * Validates branch website scope input before it is sent to the server.
 * Returns the error message to show, or null when the input may be saved.
 * The server re-validates same-site origin; the client only rejects input
 * that can never match (relative URLs, non-web schemes, ambiguous paths).
 */
export function validateLocationWebsiteScopeInput(
  rawUrl: string,
  match: LocationWebsiteScopeMatch
): string | null {
  const url = rawUrl.trim()
  if (match === "none") {
    if (url !== "") {
      return "Clear the URL to remove the branch scope, or choose Exact page or Page subtree to use it."
    }
    return null
  }
  if (url === "") {
    return match === "exact"
      ? "Enter the exact page URL served by the parent site."
      : "Enter the section URL whose descendant pages belong to this location."
  }
  if (/\s/.test(url)) {
    return "URLs cannot contain spaces. Paste the full address from the browser bar."
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return "Enter an absolute URL starting with http:// or https://."
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http:// and https:// pages can be in scope."
  }
  if (parsed.hostname === "") {
    return "Enter an absolute URL starting with http:// or https://."
  }
  const rawPath = url.slice(url.indexOf(parsed.host) + parsed.host.length)
  const pathOnly = rawPath.split(/[?#]/, 1)[0] ?? ""
  if (
    /%2f/i.test(pathOnly) ||
    /%2e/i.test(pathOnly) ||
    /(^|\/)\.\.?(\/|$)/.test(pathOnly)
  ) {
    return "Encoded slashes, dots, and dot segments are ambiguous and never match. Use the plain path."
  }
  return null
}

/**
 * Normalizes a scope URL the same way matching does: lowercase host,
 * default ports dropped, query and fragment ignored, trailing slash
 * removed except for the site root. Returns null when unparseable.
 */
export function normalizeLocationWebsiteScopeUrl(
  rawUrl: string
): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
  let path = parsed.pathname
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  return `${parsed.origin}${path}`
}

function normalizePagePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1)
  return path
}

/**
 * Checks whether a stored page URL falls inside a branch website scope.
 * Exact matches one page; subtree matches the page and its descendants at
 * a path segment boundary. Query and fragment are ignored for matching.
 */
export function locationWebsiteScopeMatchesPage(
  scopeUrl: string,
  match: LocationWebsiteScopeMatch,
  pageUrl: string
): boolean {
  if (match === "none") return false
  let scope: URL
  let page: URL
  try {
    scope = new URL(scopeUrl)
    page = new URL(pageUrl)
  } catch {
    return false
  }
  if (scope.origin !== page.origin) return false
  const scopePath = normalizePagePath(scope.pathname)
  const pagePath = normalizePagePath(page.pathname)
  if (match === "exact") return pagePath === scopePath
  if (scopePath === "/") return true
  return pagePath === scopePath || pagePath.startsWith(`${scopePath}/`)
}

/** Saves a new branch website scope revision. Appends, never overwrites. */
export function saveLocationWebsiteScope(
  projectId: string,
  locationId: string,
  input: LocationWebsiteScopeInput
): Promise<LocationWebsiteScopeRevision> {
  return clientApiPut<LocationWebsiteScopeRevision>(
    `/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(locationId)}/website-scope`,
    { url: input.url, match: input.match }
  )
}
