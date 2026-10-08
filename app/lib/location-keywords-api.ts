import { clientApiFetch, clientApiPut } from "~/lib/api"
import type { KeywordCoverageSeed } from "~/lib/api.types"
import { locationWorkspaceAPIPath } from "~/lib/location-workspace"

export type LocationKeywordKind = "brand" | "non_brand"

/** One explicit branded/non_branded phrase pair. Lists start empty and are only
 * ever changed by an explicit user action. */
export type LocationKeywordGroup = {
  branded: string[]
  non_branded: string[]
}

export type LocationKeywordSuggestionSource =
  "service" | "locality" | "landmark"

/** GET/PUT /projects/{p}/locations/{l}/keyword-lists. */
export type LocationKeywordListsResponse = {
  can_manage_keywords: boolean
  /** Phrases the user typed. Never auto-filled from suggestions. */
  user_defined: LocationKeywordGroup
  /** Deterministic saved-service/locality/landmark suggestions, no lookup. */
  revserp_suggested: LocationKeywordGroup
  /** Explicit subset the user selected; starts empty. */
  selected: LocationKeywordGroup
  /** Normalized suggested phrase to the input buckets it came from. */
  suggested_origins: Record<string, LocationKeywordSuggestionSource[]>
}

/** PUT body: suggestions are derived and never written back. */
export type LocationKeywordListsWrite = {
  user_defined: LocationKeywordGroup
  selected: LocationKeywordGroup
}

/** GET /projects/{p}/locations/{l}/keywords — parent coverage DTO over whole-site
 * pages using this location's selected keywords. */
export type LocationKeywordCoverageResponse = {
  project_id: string
  location_id: string
  crawl_id: string | null
  seeds: KeywordCoverageSeed[]
}

/** Mirrors the backend per-phrase rune bound; the location lists have no length cap. */
export const LOCATION_KEYWORD_MAX_PHRASE_RUNES = 200

export function emptyLocationKeywordGroup(): LocationKeywordGroup {
  return { branded: [], non_branded: [] }
}

export function normalizeLocationKeywordKey(phrase: string) {
  return phrase.trim().replace(/\s+/g, " ").toLowerCase()
}

function normalizeGroup(value: unknown): LocationKeywordGroup {
  const group = (value ?? {}) as { branded?: unknown; non_branded?: unknown }
  const strings = (input: unknown) =>
    Array.isArray(input)
      ? input.filter((item): item is string => typeof item === "string")
      : []
  return {
    branded: strings(group.branded),
    non_branded: strings(group.non_branded),
  }
}

const SUGGESTION_SOURCES: LocationKeywordSuggestionSource[] = [
  "service",
  "locality",
  "landmark",
]

function normalizeSuggestedOrigins(
  value: unknown
): Record<string, LocationKeywordSuggestionSource[]> {
  if (!value || typeof value !== "object") return {}
  const out: Record<string, LocationKeywordSuggestionSource[]> = {}
  for (const [key, sources] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (!Array.isArray(sources)) continue
    const filtered = sources.filter(
      (source): source is LocationKeywordSuggestionSource =>
        SUGGESTION_SOURCES.includes(source as LocationKeywordSuggestionSource)
    )
    if (filtered.length > 0) out[key] = filtered
  }
  return out
}

export function normalizeLocationKeywordLists(
  data: LocationKeywordListsResponse | null | undefined
): LocationKeywordListsResponse {
  return {
    can_manage_keywords: data?.can_manage_keywords === true,
    user_defined: normalizeGroup(data?.user_defined),
    revserp_suggested: normalizeGroup(data?.revserp_suggested),
    selected: normalizeGroup(data?.selected),
    suggested_origins: normalizeSuggestedOrigins(data?.suggested_origins),
  }
}

export function locationKeywordKindPhrases(
  group: LocationKeywordGroup,
  kind: LocationKeywordKind
): string[] {
  return kind === "brand" ? group.branded : group.non_branded
}

export function setLocationKeywordKindPhrases(
  group: LocationKeywordGroup,
  kind: LocationKeywordKind,
  phrases: string[]
): LocationKeywordGroup {
  return kind === "brand"
    ? { ...group, branded: phrases }
    : { ...group, non_branded: phrases }
}

export function locationKeywordGroupPhrases(
  group: LocationKeywordGroup
): string[] {
  return [...group.branded, ...group.non_branded]
}

/** Where one Selected-checklist row comes from. "selected-only" rows persist
from earlier selections even though no source list contains them anymore. */
export type LocationKeywordCandidateOrigin = "user" | "suggested" | "selected-only"

/** One row of the Selected checklist: the deduplicated union of both source
lists plus selected-only leftovers. Kind is internal metadata for the PUT. */
export type LocationSelectedUnionRow = {
  key: string
  phrase: string
  kind: LocationKeywordKind
  origin: LocationKeywordCandidateOrigin
}

/** Deduplicated union of user-defined and suggested candidates plus any
selected phrases neither source contains. First-seen text wins; a selected
phrase keeps its stored kind so toggling it off removes the right entry. */
export function buildLocationSelectedUnionRows(
  userDefined: LocationKeywordGroup,
  suggested: LocationKeywordGroup,
  selected: LocationKeywordGroup
): LocationSelectedUnionRow[] {
  const selectedKind = new Map<string, LocationKeywordKind>()
  for (const kind of ["brand", "non_brand"] as const) {
    for (const phrase of locationKeywordKindPhrases(selected, kind)) {
      const key = normalizeLocationKeywordKey(phrase)
      if (key && !selectedKind.has(key)) selectedKind.set(key, kind)
    }
  }
  const rows: LocationSelectedUnionRow[] = []
  const seen = new Set<string>()
  const add = (
    phrase: string,
    kind: LocationKeywordKind,
    origin: LocationKeywordCandidateOrigin
  ) => {
    const key = normalizeLocationKeywordKey(phrase)
    if (!key || seen.has(key)) return
    seen.add(key)
    rows.push({ key, phrase, kind: selectedKind.get(key) ?? kind, origin })
  }
  for (const kind of ["brand", "non_brand"] as const) {
    for (const phrase of locationKeywordKindPhrases(userDefined, kind))
      add(phrase, kind, "user")
  }
  for (const kind of ["brand", "non_brand"] as const) {
    for (const phrase of locationKeywordKindPhrases(suggested, kind))
      add(phrase, kind, "suggested")
  }
  for (const kind of ["brand", "non_brand"] as const) {
    for (const phrase of locationKeywordKindPhrases(selected, kind))
      add(phrase, kind, "selected-only")
  }
  return rows
}

/** A union row reads checked when selected under either kind. */
export function isLocationSelectedUnionRowChecked(
  selected: LocationKeywordGroup,
  row: LocationSelectedUnionRow
): boolean {
  return (
    isLocationKeywordSelected(selected, "brand", row.phrase) ||
    isLocationKeywordSelected(selected, "non_brand", row.phrase)
  )
}

/** Toggles one union row: off removes it from both kinds, on adds its kind. */
export function toggleLocationSelectedUnionRow(
  selected: LocationKeywordGroup,
  row: LocationSelectedUnionRow
): LocationKeywordGroup {
  if (isLocationSelectedUnionRowChecked(selected, row)) {
    return deselectLocationKeywords(deselectLocationKeywords(selected, "brand", [row.phrase]), "non_brand", [row.phrase])
  }
  return toggleLocationKeyword(selected, row.kind, row.phrase)
}

export function isLocationKeywordSelected(
  selected: LocationKeywordGroup,
  kind: LocationKeywordKind,
  phrase: string
): boolean {
  const key = normalizeLocationKeywordKey(phrase)
  return locationKeywordKindPhrases(selected, kind).some(
    (item) => normalizeLocationKeywordKey(item) === key
  )
}

/** Adds or removes one phrase from one kind without touching the other kind. */
export function toggleLocationKeyword(
  group: LocationKeywordGroup,
  kind: LocationKeywordKind,
  phrase: string
): LocationKeywordGroup {
  const key = normalizeLocationKeywordKey(phrase)
  const current = locationKeywordKindPhrases(group, kind)
  const exists = current.some(
    (item) => normalizeLocationKeywordKey(item) === key
  )
  const next = exists
    ? current.filter((item) => normalizeLocationKeywordKey(item) !== key)
    : [...current, phrase]
  return setLocationKeywordKindPhrases(group, kind, next)
}

function dedupeLocationKeywordPhrases(phrases: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const phrase of phrases) {
    const key = normalizeLocationKeywordKey(phrase)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(phrase)
  }
  return out
}

/** Adds every not-yet-selected phrase of one kind, preserving order. */
export function selectLocationKeywords(
  group: LocationKeywordGroup,
  kind: LocationKeywordKind,
  phrases: string[]
): LocationKeywordGroup {
  return setLocationKeywordKindPhrases(
    group,
    kind,
    dedupeLocationKeywordPhrases([
      ...locationKeywordKindPhrases(group, kind),
      ...phrases,
    ])
  )
}

/** Removes the named phrases from one kind, leaving the other kind alone. */
export function deselectLocationKeywords(
  group: LocationKeywordGroup,
  kind: LocationKeywordKind,
  phrases: string[]
): LocationKeywordGroup {
  const remove = new Set(phrases.map(normalizeLocationKeywordKey))
  const next = locationKeywordKindPhrases(group, kind).filter(
    (item) => !remove.has(normalizeLocationKeywordKey(item))
  )
  return setLocationKeywordKindPhrases(group, kind, next)
}

/** Renames one phrase in place, de-duplicating if the new text already exists. */
export function renameLocationKeyword(
  group: LocationKeywordGroup,
  kind: LocationKeywordKind,
  from: string,
  to: string
): LocationKeywordGroup {
  const fromKey = normalizeLocationKeywordKey(from)
  const next = locationKeywordKindPhrases(group, kind).map((item) =>
    normalizeLocationKeywordKey(item) === fromKey ? to : item
  )
  return setLocationKeywordKindPhrases(
    group,
    kind,
    dedupeLocationKeywordPhrases(next)
  )
}

/** Input buckets behind one suggested phrase, or empty when unknown. */
export function locationKeywordSuggestionSources(
  response: LocationKeywordListsResponse,
  phrase: string
): LocationKeywordSuggestionSource[] {
  return response.suggested_origins[normalizeLocationKeywordKey(phrase)] ?? []
}

export function locationKeywordListsQueryKey(
  projectId: string,
  locationId: string
) {
  return ["location-keyword-lists", projectId, locationId] as const
}

export function fetchLocationKeywordLists(
  projectId: string,
  locationId: string
) {
  return clientApiFetch<LocationKeywordListsResponse>(
    `${locationWorkspaceAPIPath(projectId, locationId)}/keyword-lists`
  ).then(normalizeLocationKeywordLists)
}

export function locationKeywordListsQueryOptions(
  projectId: string,
  locationId: string
) {
  return {
    queryKey: locationKeywordListsQueryKey(projectId, locationId),
    queryFn: () => fetchLocationKeywordLists(projectId, locationId),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    enabled: Boolean(projectId && locationId),
  }
}

/** Writes only this location's explicit lists; returns the saved lists. */
export function putLocationKeywordLists(
  projectId: string,
  locationId: string,
  body: LocationKeywordListsWrite
) {
  return clientApiPut<LocationKeywordListsResponse>(
    `${locationWorkspaceAPIPath(projectId, locationId)}/keyword-lists`,
    body
  ).then(normalizeLocationKeywordLists)
}

export function locationKeywordCoverageQueryKey(
  projectId: string,
  locationId: string
) {
  return ["location-keywords", projectId, locationId] as const
}

export function fetchLocationKeywordCoverage(
  projectId: string,
  locationId: string
) {
  return clientApiFetch<LocationKeywordCoverageResponse>(
    `${locationWorkspaceAPIPath(projectId, locationId)}/keywords`
  )
}

export function locationKeywordCoverageQueryOptions(
  projectId: string,
  locationId: string
) {
  return {
    queryKey: locationKeywordCoverageQueryKey(projectId, locationId),
    queryFn: () => fetchLocationKeywordCoverage(projectId, locationId),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    enabled: Boolean(projectId && locationId),
  }
}
