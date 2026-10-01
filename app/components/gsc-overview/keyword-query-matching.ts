"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import {
  projectKeywordListsQueryOptions,
  type ProjectKeyword,
} from "~/lib/project-keywords-query"

export const PROJECT_KEYWORD_QUERY_MAX_LABEL_LENGTH = 120

/** Which combined keyword-list entries a GSC query phrase-matches. */
export type ProjectKeywordQueryMatch = {
  brand: boolean
  nonBrand: boolean
}

const NO_PROJECT_KEYWORD_QUERY_MATCH: ProjectKeywordQueryMatch = {
  brand: false,
  nonBrand: false,
}

/**
 * Matches a GSC query against the combined deduplicated project keyword list
 * (user-defined plus Revserp-suggested, user classification wins on
 * duplicates). A keyword counts
 * as a match only when its normalized tokens appear consecutively in the
 * query, so "cat" never matches "education" and "life insurance" matches
 * "best life insurance Nepal" but not "life jacket insurance plans".
 */
export type ProjectKeywordQueryMatcher = {
  matchProjectKeywordQuery: (query: string) => ProjectKeywordQueryMatch
}

export function truncateProjectKeywordQueryLabel(query: string): string {
  const points = Array.from(query)
  if (points.length <= PROJECT_KEYWORD_QUERY_MAX_LABEL_LENGTH) return query
  return `${points.slice(0, PROJECT_KEYWORD_QUERY_MAX_LABEL_LENGTH).join("")}…`
}

export function tokenizeProjectKeywordQueryText(value: string): string[] {
  const cleaned = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}+#]+/gu, " ")
    .trim()
  return cleaned ? cleaned.split(/ +/) : []
}

function containsConsecutiveTokens(
  haystack: string[],
  needle: string[]
): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let hit = true
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        hit = false
        break
      }
    }
    if (hit) return true
  }
  return false
}

/**
 * Builds a GSC query keyword matcher from the combined deduplicated keyword
 * list. Callers pass the combined union (both sources, user classification
 * takes precedence on duplicates).
 */
export function createProjectKeywordQueryMatcher(
  combined: Array<Pick<ProjectKeyword, "keyword" | "kind">>
): ProjectKeywordQueryMatcher {
  const brandPhrases: string[][] = []
  const nonBrandPhrases: string[][] = []
  for (const entry of combined) {
    const tokens = tokenizeProjectKeywordQueryText(entry.keyword)
    if (!tokens.length) continue
    if (entry.kind === "brand") brandPhrases.push(tokens)
    else nonBrandPhrases.push(tokens)
  }
  return {
    matchProjectKeywordQuery: (query) => {
      const tokens = tokenizeProjectKeywordQueryText(query)
      if (!tokens.length) return NO_PROJECT_KEYWORD_QUERY_MATCH
      return {
        brand: brandPhrases.some((phrase) =>
          containsConsecutiveTokens(tokens, phrase)
        ),
        nonBrand: nonBrandPhrases.some((phrase) =>
          containsConsecutiveTokens(tokens, phrase)
        ),
      }
    },
  }
}

/**
 * Loads the combined deduplicated keyword lists for GSC query matching. A list failure
 * never blocks the GSC page: consumers render without badges and say so.
 */
export function useProjectKeywordQueryMatcher(projectId: string | null) {
  const listsQuery = useQuery({
    ...projectKeywordListsQueryOptions(projectId ?? ""),
    enabled: Boolean(projectId),
  })
  const matcher = useMemo(
    () =>
      createProjectKeywordQueryMatcher(listsQuery.data?.combined ?? []),
    [listsQuery.data]
  )
  return {
    projectKeywordQueryMatcher: matcher,
    projectKeywordListsReady: Boolean(listsQuery.data),
    projectKeywordListsFailed: listsQuery.isError,
    retryProjectKeywordLists: listsQuery.refetch,
  }
}
