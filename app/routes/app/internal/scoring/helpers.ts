import type { ScoreBreakdownIssueTypeResponse, ScoreBreakdownPillarResponse } from "~/lib/api.types"

export function deepClone<T>(value: T): T {
  return structuredClone(value)
}

const UPPERCASE_PARTS = new Set(["seo", "aeo", "og", "h1", "h2", "h3"])

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== "object") return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }

  if (!Array.isArray(a) && !Array.isArray(b)) {
    const keysA = Object.keys(a as Record<string, unknown>)
    const keysB = Object.keys(b as Record<string, unknown>)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    )
  }

  return false
}

export function humanize(value: string) {
  return value
    .split("_")
    .map((part) => {
      if (!part) return ""
      return UPPERCASE_PARTS.has(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
}

export function fmtNum(value: number | undefined | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "\u2014"
  return value.toFixed(digits).replace(/\.00$/, "")
}

export function sortedEntries(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort(([a], [b]) =>
    humanize(a).localeCompare(humanize(b))
  )
}

export function buildIssueMap(pillar: ScoreBreakdownPillarResponse): Map<string, ScoreBreakdownIssueTypeResponse> {
  const map = new Map<string, ScoreBreakdownIssueTypeResponse>()
  for (const bucket of pillar.buckets) {
    for (const issue of bucket.issues) {
      map.set(issue.id, issue)
    }
  }
  return map
}

export function findIssue(
  pillar: ScoreBreakdownPillarResponse | undefined,
  issueTypeId: string
) {
  if (!pillar) return undefined
  return buildIssueMap(pillar).get(issueTypeId)
}
