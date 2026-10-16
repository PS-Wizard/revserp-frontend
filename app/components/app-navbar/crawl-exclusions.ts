/**
 * Manual Run Crawl exclusion patterns.
 *
 * Backend owns matching; this module mirrors its validation so the dialog,
 * the submit handler, and the tests share one definition:
 * - full http(s) URLs match the full canonical URL (query kept, fragment
 *   stripped server-side)
 * - root-relative paths starting with / match the URL pathname only, so a
 *   path pattern with ? or # is rejected as misleading
 * - only * is a wildcard; every other character is literal
 */

export const DEFAULT_EXCLUDED_URL_PATTERNS = [
  "/wp-admin/*",
  "/wp-login.php",
  "/xmlrpc.php",
  "/wp-cron.php",
  "/wp-trackback.php",
  "/administrator/*",
  "/user/login/*",
  "/user/logout/*",
  "/login/*",
  "/logout/*",
  "/signin/*",
  "/sign-in/*",
  "/signout/*",
  "/sign-out/*",
  "/signup/*",
  "/sign-up/*",
  "/register/*",
  "/forgot-password/*",
  "/reset-password/*",
  "/password/reset/*",
  "/user/password/*",
  "/wp-json/*",
  "/_next/*",
  "/_nuxt/*",
  "/_app/immutable/*",
  "/__nextjs*",
  "/__vite*",
  "/@vite/*",
  "/@fs/*",
  "/sockjs-node/*",
  "/webpack-hmr*",
  "/__webpack_hmr*",
  "/__debug__/*",
  "/_profiler/*",
  "/telescope/*",
  "/horizon/*",
  "/actuator/*",
  "/server-status",
  "/.git/*",
  "/.svn/*",
  "/.hg/*",
  "/.env",
  "/.env.*",
  "/node_modules/*",
] as const

export const MAX_EXCLUDED_URL_PATTERNS = 100
export const MAX_EXCLUDED_URL_PATTERN_LENGTH = 2048

// Backend counts runes, not UTF-16 units; spread counts code points the same.
export function countExcludedUrlPatternRunes(pattern: string): number {
  return [...pattern].length
}

// Backend rejects Go White_Space and Cc, same sets.
const EXCLUDED_URL_PATTERN_BLANK_OR_CONTROL = /[\p{White_Space}\p{Cc}]/u

// A % escape needs two hex digits; checked pre-query like Go's URL parse.
const EXCLUDED_URL_PATTERN_BAD_ESCAPE = /%(?![0-9A-Fa-f]{2})/

function getExcludedPathPatternError(pattern: string): string {
  if (pattern.startsWith("//")) {
    return "Use a full http(s):// URL or a path starting with /."
  }
  if (pattern.includes("?")) {
    return "Path patterns match the page path only, so drop ?."
  }
  if (EXCLUDED_URL_PATTERN_BAD_ESCAPE.test(pattern)) {
    return `"${pattern}" is not a valid URL. Rejected: ${pattern}`
  }
  return ""
}

function getExcludedFullUrlPatternError(pattern: string): string {
  const queryAt = pattern.indexOf("?")
  const head = queryAt >= 0 ? pattern.slice(0, queryAt) : pattern
  if (EXCLUDED_URL_PATTERN_BAD_ESCAPE.test(head)) {
    return `"${pattern}" is not a valid URL. Rejected: ${pattern}`
  }
  // WHATWG reads https:///x as host "x"; Go sees an empty host.
  const authority = /^https?:\/\/([^/?]*)/i.exec(pattern)?.[1]
  if (authority === undefined || authority === "") {
    return `"${pattern}" must contain a host. Rejected: ${pattern}`
  }
  let parsed: URL
  try {
    parsed = new URL(pattern)
  } catch {
    return `"${pattern}" is not a valid URL. Rejected: ${pattern}`
  }
  const scheme = parsed.protocol.toLowerCase()
  if (scheme !== "http:" && scheme !== "https:") {
    return "Use a full http(s):// URL or a path starting with /."
  }
  if (!parsed.host) {
    return `"${pattern}" must contain a host. Rejected: ${pattern}`
  }
  return ""
}

/** Empty means valid. Never throws. */
export function getExcludedUrlPatternError(pattern: string): string {
  if (!pattern) {
    return "Use a full http(s):// URL or a path starting with /."
  }
  if (countExcludedUrlPatternRunes(pattern) > MAX_EXCLUDED_URL_PATTERN_LENGTH) {
    return `Keep each pattern to ${MAX_EXCLUDED_URL_PATTERN_LENGTH} characters or fewer.`
  }
  if (EXCLUDED_URL_PATTERN_BLANK_OR_CONTROL.test(pattern)) {
    return "Patterns cannot contain spaces or control characters."
  }
  if (pattern.includes("#")) {
    return "Patterns cannot contain #; fragments are stripped."
  }
  if (pattern.startsWith("/")) return getExcludedPathPatternError(pattern)
  return getExcludedFullUrlPatternError(pattern)
}

export function isValidExcludedUrlPattern(pattern: string): boolean {
  return getExcludedUrlPatternError(pattern) === ""
}

/** Space, tab, and newline all split pasted or typed input into tokens. */
export function splitExcludedUrlPatternTokens(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

export type ExcludedUrlPatternCommit = {
  patterns: string[]
  added: string[]
  duplicates: string[]
  invalid: string[]
  capped: boolean
}

/**
 * Merge raw input into the current list. Trims, drops exact duplicates,
 * keeps invalid tokens out, stops at the max count. Pure; callers persist.
 */
export function addExcludedUrlPatternTokens(
  existing: string[],
  value: string
): ExcludedUrlPatternCommit {
  const seen = new Set(existing)
  const patterns = [...existing]
  const added: string[] = []
  const duplicates: string[] = []
  const invalid: string[] = []
  let capped = false
  for (const token of splitExcludedUrlPatternTokens(value)) {
    if (seen.has(token)) {
      duplicates.push(token)
      continue
    }
    if (getExcludedUrlPatternError(token) !== "") {
      invalid.push(token)
      continue
    }
    if (patterns.length >= MAX_EXCLUDED_URL_PATTERNS) {
      capped = true
      invalid.push(token)
      continue
    }
    seen.add(token)
    patterns.push(token)
    added.push(token)
  }
  return { patterns, added, duplicates, invalid, capped }
}

/** Field message for a commit or submit rejection. Empty means clear. */
export function describeExcludedUrlPatternRejection(
  invalid: string[],
  capped: boolean
): string {
  if (capped) {
    return `Up to ${MAX_EXCLUDED_URL_PATTERNS} patterns are allowed; extras were skipped.`
  }
  if (invalid.length === 0) return ""
  if (invalid.length === 1) {
    return `${getExcludedUrlPatternError(invalid[0]!)} Rejected: ${invalid[0]}`
  }
  const shown = invalid.slice(0, 5).join(", ")
  const rest = invalid.length > 5 ? `, and ${invalid.length - 5} more` : ""
  return `These patterns are not valid: ${shown}${rest}. ${getExcludedUrlPatternError(invalid[0]!)}`
}

/** Safety net for the submit path; state entries are already committed. */
export function validateExcludedUrlPatterns(patterns: string[]): string {
  if (patterns.length > MAX_EXCLUDED_URL_PATTERNS) {
    return `Up to ${MAX_EXCLUDED_URL_PATTERNS} patterns are allowed.`
  }
  for (const pattern of patterns) {
    const error = getExcludedUrlPatternError(pattern)
    if (error !== "") return `${error} Rejected: ${pattern}`
  }
  return ""
}

export function getExcludedUrlPatternsStorageKey(
  userId: string,
  projectId: string
): string {
  return `revserp:crawl-excluded-url-patterns:${userId}:${projectId}`
}

/** Stable user scope from existing context; null skips persistence. */
export function resolveExcludedUrlPatternsUserId(
  userId?: string | null,
  fallback?: string | null
): string | null {
  return userId?.trim() || fallback?.trim() || null
}

export function getExcludedUrlPatternsStorage(): Pick<
  Storage,
  "getItem" | "setItem"
> | null {
  try {
    if (typeof window === "undefined") return null
    return window.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * Saved choices, or null when there is no valid entry (caller falls back to
 * defaults). Null also covers SSR, denied storage, and malformed data.
 */
export function loadExcludedUrlPatterns(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  userId: string | null | undefined,
  projectId: string | null | undefined
): string[] | null {
  try {
    if (!storage || !userId || !projectId) return null
    const raw = storage.getItem(
      getExcludedUrlPatternsStorageKey(userId, projectId)
    )
    if (raw == null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length > MAX_EXCLUDED_URL_PATTERNS) {
      return null
    }
    for (const entry of parsed) {
      if (typeof entry !== "string" || !isValidExcludedUrlPattern(entry)) {
        return null
      }
    }
    return [...parsed]
  } catch {
    return null
  }
}

/** Persists the exact list, including []. Never throws. */
export function saveExcludedUrlPatterns(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  userId: string | null | undefined,
  projectId: string | null | undefined,
  patterns: string[]
): void {
  try {
    if (!storage || !userId || !projectId) return
    storage.setItem(
      getExcludedUrlPatternsStorageKey(userId, projectId),
      JSON.stringify(patterns)
    )
  } catch {
    // Quota or SSR guard; the choices stay in memory for this session.
  }
}

/**
 * Manual crawl payload wiring: excluded patterns always ride as an array so
 * the backend default (none) only applies when the list is empty.
 */
export function buildRunCrawlConfigSnapshot<
  T extends Record<string, unknown>,
>(base: T, excludedUrlPatterns: string[]): T & { excluded_url_patterns: string[] } {
  return { ...base, excluded_url_patterns: [...excludedUrlPatterns] }
}
