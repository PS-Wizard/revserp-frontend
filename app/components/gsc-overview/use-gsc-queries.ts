import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError, clientApiFetch } from "~/lib/api"
import type {
  GSCQueryPageResponse,
  GSCSearchAnalyticsRowResponse,
  ProjectGSCQueriesResponse,
} from "~/lib/api.types"

export type GSCQueryPreset = "all" | "questions"

export type GSCQueryPageOptions = {
  limit: number
  offset: number
  search: string
  preset: GSCQueryPreset
}

const queriesPageSize = 100
const searchDebounceMs = 350

type QueriesState = {
  rows: GSCSearchAnalyticsRowResponse[]
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  errorMessage: string
}

const emptyState: QueriesState = {
  rows: [],
  hasMore: false,
  isLoading: false,
  isLoadingMore: false,
  errorMessage: "",
}

function buildQueriesPath(
  projectID: string,
  search: string,
  preset: GSCQueryPreset,
  offset: number,
  queriesBasePath?: string,
  extraQueryParams?: Record<string, string>
) {
  const params = new URLSearchParams({
    limit: String(queriesPageSize),
    offset: String(offset),
  })
  if (search) params.set("search", search)
  if (preset === "questions") params.set("preset", "questions")
  if (extraQueryParams) {
    for (const [key, value] of Object.entries(extraQueryParams)) {
      params.set(key, value)
    }
  }
  const base = queriesBasePath ?? `/projects/${projectID}/gsc/queries`
  return `${base}?${params.toString()}`
}

/**
 * useGSCQueries pages Search Console queries from the server. Search and the
 * question preset are applied by Google, so this walks the whole matching set
 * rather than filtering the overview's fixed top-25 slice.
 *
 * Requests are fenced two ways, matching the rest of this screen: an abort
 * controller cancels the in-flight request, and a generation counter stops a
 * slow response for an earlier project/search from overwriting a newer one.
 */
export function useGSCQueries({
  projectID,
  siteURL,
  search,
  preset,
  enabled,
  queriesBasePath,
  extraQueryParams,
  onRefreshPage,
}: {
  projectID: string
  siteURL: string
  search: string
  preset: GSCQueryPreset
  enabled: boolean
  /** Location override: page the location report queries endpoint instead
   * of the project one. Omitted for the project view (unchanged). */
  queriesBasePath?: string
  /** Fixed params (e.g. scope pins) appended to every queries page. */
  extraQueryParams?: Record<string, string>
  onRefreshPage?: (options: GSCQueryPageOptions) => Promise<void>
}) {
  const [state, setState] = useState<QueriesState>(emptyState)
  const [debouncedSearch, setDebouncedSearch] = useState(search)

  const generationRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const offsetRef = useRef(0)
  const requestedOffsetRef = useRef(0)

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedSearch(search.trim()),
      searchDebounceMs
    )
    return () => clearTimeout(timeout)
  }, [search])

  const fetchPage = useCallback(
    async (offset: number, generation: number) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      requestedOffsetRef.current = offset

      setState((current) => ({
        ...current,
        isLoading: offset === 0,
        isLoadingMore: offset > 0,
        errorMessage: "",
      }))

      try {
        const response = await clientApiFetch<
          ProjectGSCQueriesResponse & { cached?: boolean }
        >(
          buildQueriesPath(
            projectID,
            debouncedSearch,
            preset,
            offset,
            queriesBasePath,
            extraQueryParams
          ),
          { signal: controller.signal }
        )
        if (generation !== generationRef.current) return
        if (queriesBasePath && response.cached === false) {
          setState((current) => ({
            ...current,
            rows: offset === 0 ? [] : current.rows,
            hasMore: offset === 0 ? false : current.hasMore,
            isLoading: false,
            isLoadingMore: false,
            errorMessage:
              "This query page is not saved. Use Refresh to load it from Google.",
          }))
          return
        }

        const page =
          response.queries ?? (response as unknown as GSCQueryPageResponse)
        offsetRef.current = offset
        setState((current) => ({
          rows:
            offset === 0
              ? (page.rows ?? [])
              : [...current.rows.slice(0, offset), ...(page.rows ?? [])],
          hasMore: page.has_more ?? false,
          isLoading: false,
          isLoadingMore: false,
          errorMessage: "",
        }))
      } catch (error) {
        if (controller.signal.aborted) return
        if (generation !== generationRef.current) return
        setState((current) => ({
          ...current,
          isLoading: false,
          isLoadingMore: false,
          errorMessage:
            error instanceof ApiError
              ? error.message
              : "Could not load Search Console queries.",
        }))
      }
    },
    [debouncedSearch, preset, projectID, queriesBasePath, extraQueryParams]
  )

  // Any change to project, site, search, or preset is a new result set: bump the
  // generation so in-flight responses are discarded, then reload from offset 0.
  useEffect(() => {
    generationRef.current += 1
    offsetRef.current = 0

    if (!enabled || !projectID || !siteURL) {
      controllerRef.current?.abort()
      setState(emptyState)
      return
    }

    void fetchPage(0, generationRef.current)
  }, [enabled, fetchPage, projectID, siteURL])

  useEffect(
    () => () => {
      generationRef.current += 1
      controllerRef.current?.abort()
    },
    []
  )

  const loadMore = useCallback(() => {
    if (!state.hasMore || state.isLoading || state.isLoadingMore) return
    void fetchPage(offsetRef.current + queriesPageSize, generationRef.current)
  }, [fetchPage, state.hasMore, state.isLoading, state.isLoadingMore])

  const refresh = async () => {
    if (!onRefreshPage || !enabled) return
    const searchValue = search.trim()
    const offset =
      searchValue === debouncedSearch ? requestedOffsetRef.current : 0
    const generation = ++generationRef.current
    controllerRef.current?.abort()
    await onRefreshPage({
      limit: queriesPageSize,
      offset,
      search: searchValue,
      preset,
    })
    if (generation !== generationRef.current) return
    if (searchValue !== debouncedSearch) {
      setDebouncedSearch(searchValue)
      return
    }
    await fetchPage(offset, generation)
  }

  return { ...state, loadMore, refresh }
}
