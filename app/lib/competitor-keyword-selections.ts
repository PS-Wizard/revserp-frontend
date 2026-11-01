import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { KeywordCoverageSeed } from "~/lib/api.types"
import type { CombinedProjectKeyword } from "~/lib/project-keywords-query"

/**
 * Checked competitor keywords. The backend selections API is not wired yet,
 * so checks persist to localStorage per project and apply immediately (no
 * Save button). Every reader shares this query key, which is also the key
 * the future GET / selections endpoint should populate.
 *
 * TODO: replace the localStorage read/write with the backend selections
 * GET/PUT once it exists, keeping this query key stable.
 */
export function competitorKeywordSelectionsQueryKey(projectId: string) {
  return ["competitor-keyword-selections", projectId] as const
}

function storageKey(projectId: string) {
  return `competitor-keyword-selections:${projectId}`
}

function readStoredSelections(projectId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const phrases: string[] = []
    for (const entry of parsed) {
      if (typeof entry !== "string") continue
      const phrase = entry.trim()
      if (!phrase) continue
      const key = phrase.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      phrases.push(phrase)
    }
    return phrases
  } catch {
    return []
  }
}

export function useCompetitorKeywordSelections(projectId: string | null) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: competitorKeywordSelectionsQueryKey(projectId ?? "none"),
    queryFn: () => readStoredSelections(projectId!),
    enabled: Boolean(projectId),
    staleTime: Infinity,
    gcTime: 30_000,
    retry: false,
  })
  const selected = query.data ?? []

  const toggle = useCallback(
    (phrase: string) => {
      if (!projectId) return
      const key = competitorKeywordSelectionsQueryKey(projectId)
      const current =
        queryClient.getQueryData<string[]>(key) ??
        readStoredSelections(projectId)
      const needle = phrase.toLowerCase()
      const next = current.some((row) => row.toLowerCase() === needle)
        ? current.filter((row) => row.toLowerCase() !== needle)
        : [...current, phrase]
      queryClient.setQueryData(key, next)
      try {
        localStorage.setItem(storageKey(projectId), JSON.stringify(next))
      } catch {
        // Private-mode writes fail silently; the in-memory cache still holds.
      }
    },
    [projectId, queryClient]
  )

  return { selected, toggle }
}

/** Fold checked competitor keywords into the combined list. Matches attach
 * a Competitor source; the rest join as non-brand competitor rows. */
export function mergeCompetitorSelectionsIntoCombined(
  combined: CombinedProjectKeyword[],
  selected: readonly string[]
): CombinedProjectKeyword[] {
  if (selected.length === 0) return combined
  const merged = combined.map((row) => ({ ...row, sources: [...row.sources] }))
  const index = new Map(
    merged.map((row, position) => [row.keyword.toLowerCase(), position])
  )
  for (const phrase of selected) {
    const position = index.get(phrase.toLowerCase())
    if (position === undefined) {
      merged.push({
        keyword: phrase,
        kind: "non_brand",
        sources: ["competitor"],
      })
      index.set(phrase.toLowerCase(), merged.length - 1)
    } else if (!merged[position].sources.includes("competitor")) {
      merged[position].sources.push("competitor")
    }
  }
  return merged
}

/** Fold checked competitor keywords into coverage seeds. Checked terms the
 * crawl matrix never measured surface as gaps until they get a page. */
export function mergeCompetitorSelectionsIntoSeeds(
  seeds: KeywordCoverageSeed[],
  selected: readonly string[]
): KeywordCoverageSeed[] {
  if (selected.length === 0) return seeds
  const known = new Set(seeds.map((seed) => seed.keyword.toLowerCase()))
  const extra: KeywordCoverageSeed[] = []
  for (const phrase of selected) {
    if (known.has(phrase.toLowerCase())) continue
    known.add(phrase.toLowerCase())
    extra.push({ keyword: phrase, state: "no_landing_page", matches: [] })
  }
  return extra.length === 0 ? seeds : [...seeds, ...extra]
}
