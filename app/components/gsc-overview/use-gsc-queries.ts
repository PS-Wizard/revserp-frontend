import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError, clientApiFetch } from "~/lib/api"
import type {
  GSCSearchAnalyticsRowResponse,
  ProjectGSCQueriesResponse,
} from "~/lib/api.types"

export type GSCQueryPreset = "all" | "questions"

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
  offset: number
) {
  const params = new URLSearchParams({
    limit: String(queriesPageSize),
    offset: String(offset),
  })
  if (search) params.set("search", search)
  if (preset === "questions") params.set("preset", "questions")
  return `/projects/${projectID}/gsc/queries?${params.toString()}`
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
}: {
  projectID: string
  siteURL: string
  search: string
  preset: GSCQueryPreset
  enabled: boolean
}) {
  const [state, setState] = useState<QueriesState>(emptyState)
  const [debouncedSearch, setDebouncedSearch] = useState(search)

  const generationRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const offsetRef = useRef(0)

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

      setState((current) => ({
        ...current,
        isLoading: offset === 0,
        isLoadingMore: offset > 0,
        errorMessage: "",
      }))

      try {
        const response = await clientApiFetch<ProjectGSCQueriesResponse>(
          buildQueriesPath(projectID, debouncedSearch, preset, offset),
          { signal: controller.signal }
        )
        if (generation !== generationRef.current) return

        offsetRef.current = offset
        setState((current) => ({
          rows:
            offset === 0
              ? response.queries.rows
              : [...current.rows, ...response.queries.rows],
          hasMore: response.queries.has_more,
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
    [debouncedSearch, preset, projectID]
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

  return { ...state, loadMore }
}
