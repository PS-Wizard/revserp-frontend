"use client"

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import { DownloadIcon, Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import {
  IssueTypeFilter,
  TablePagination,
} from "~/components/issue-explorer/scope-controls"
import {
  BucketTable,
  PillarTable,
  UrlIssueTable,
} from "~/components/issue-explorer/tables"
import type {
  BucketScope,
  FixSelection,
  MergedIssueUrlRow,
  PillarScope,
} from "~/components/issue-explorer/types"
import {
  areStringArraysEqual,
  BucketUrlPager,
  generateBatchAIFix,
  urlRowKey,
} from "~/components/issue-explorer/utils"
import { useDragSelection } from "~/components/issue-explorer/use-drag-selection"
import { formatBucketLabel } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { ApiError, buildApiUrl } from "~/lib/api"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import {
  downloadBlob,
  getExportFilename,
  readExportError,
} from "~/components/app-navbar/utils"

// --- Selection reducer ---

type State = {
  selectedPillarIds: string[]
  drilledPillarId: string | null
  drilledBucketKey: string | null
  issueTypeFilter: string[]
  checkedPillarIds: string[]
  checkedBucketKeys: string[]
  checkedUrlKeys: string[]
  pillarPageIndex: number
  pillarPageSize: number
  bucketPageIndex: number
  bucketPageSize: number
  urlPageIndex: number
  urlPageSize: number
}

type Action =
  | { type: "SET_PILLAR_IDS"; payload: string[] }
  | { type: "DRILL_PILLAR"; payload: string }
  | { type: "DRILL_BUCKET"; payload: string }
  | { type: "GO_TO_PILLARS" }
  | { type: "GO_TO_BUCKETS" }
  | { type: "SET_ISSUE_TYPE_FILTER"; payload: string[] }
  | { type: "SET_CHECKED_PILLARS"; payload: string[] }
  | { type: "SET_CHECKED_BUCKETS"; payload: string[] }
  | { type: "SET_CHECKED_URLS"; payload: string[] }
  | { type: "SET_PILLAR_PAGE_INDEX"; payload: number }
  | { type: "SET_PILLAR_PAGE_SIZE"; payload: number }
  | { type: "SET_BUCKET_PAGE_INDEX"; payload: number }
  | { type: "SET_BUCKET_PAGE_SIZE"; payload: number }
  | { type: "SET_URL_PAGE_INDEX"; payload: number }
  | { type: "SET_URL_PAGE_SIZE"; payload: number }
  | { type: "RESET" }

const initialState: State = {
  selectedPillarIds: [],
  drilledPillarId: null,
  drilledBucketKey: null,
  issueTypeFilter: [],
  checkedPillarIds: [],
  checkedBucketKeys: [],
  checkedUrlKeys: [],
  pillarPageIndex: 0,
  pillarPageSize: 10,
  bucketPageIndex: 0,
  bucketPageSize: 10,
  urlPageIndex: 0,
  urlPageSize: 10,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_PILLAR_IDS":
      return {
        ...state,
        selectedPillarIds: action.payload,
        checkedPillarIds: [],
        checkedBucketKeys: [],
        checkedUrlKeys: [],
        drilledPillarId: null,
        drilledBucketKey: null,
        issueTypeFilter: [],
        bucketPageIndex: 0,
      }
    case "DRILL_PILLAR":
      return {
        ...state,
        drilledPillarId: action.payload,
        drilledBucketKey: null,
        checkedBucketKeys: [],
        bucketPageIndex: 0,
      }
    case "DRILL_BUCKET":
      return {
        ...state,
        drilledBucketKey: action.payload,
        issueTypeFilter: [],
        checkedUrlKeys: [],
        urlPageIndex: 0,
      }
    case "GO_TO_PILLARS":
      return {
        ...state,
        drilledPillarId: null,
        drilledBucketKey: null,
        checkedBucketKeys: [],
        checkedUrlKeys: [],
        issueTypeFilter: [],
        bucketPageIndex: 0,
        urlPageIndex: 0,
      }
    case "GO_TO_BUCKETS":
      return {
        ...state,
        drilledBucketKey: null,
        checkedUrlKeys: [],
        issueTypeFilter: [],
        urlPageIndex: 0,
      }
    case "SET_ISSUE_TYPE_FILTER":
      return {
        ...state,
        issueTypeFilter: action.payload,
        checkedUrlKeys: [],
        urlPageIndex: 0,
      }
    case "SET_CHECKED_PILLARS":
      return { ...state, checkedPillarIds: action.payload }
    case "SET_CHECKED_BUCKETS":
      return { ...state, checkedBucketKeys: action.payload }
    case "SET_CHECKED_URLS":
      return { ...state, checkedUrlKeys: action.payload }
    case "SET_PILLAR_PAGE_INDEX":
      return { ...state, pillarPageIndex: action.payload }
    case "SET_PILLAR_PAGE_SIZE":
      return { ...state, pillarPageSize: action.payload }
    case "SET_BUCKET_PAGE_INDEX":
      return { ...state, bucketPageIndex: action.payload }
    case "SET_BUCKET_PAGE_SIZE":
      return { ...state, bucketPageSize: action.payload }
    case "SET_URL_PAGE_INDEX":
      return { ...state, urlPageIndex: action.payload }
    case "SET_URL_PAGE_SIZE":
      return { ...state, urlPageSize: action.payload }
    case "RESET":
      return initialState
  }
}

const EMPTY_PILLARS: ScoreBreakdownResponse["pillars"] = []

export function IssueExplorer({
  breakdown,
  focusRequest,
  initialPillarId,
  onOpenAIConversation,
  projectId,
}: {
  breakdown: ScoreBreakdownResponse | null
  focusRequest?: {
    pillarId?: string
    bucketId: string
    issueTypeId?: string
    autoSelect?: number
    token: number
  } | null
  initialPillarId?: string
  onOpenAIConversation?: (
    conversationId: string,
    scope?: { pillarId: string; bucketIds: string[]; issueTypeIds: string[] }
  ) => void
  projectId?: string
}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const {
    selectedPillarIds,
    drilledPillarId,
    drilledBucketKey,
    issueTypeFilter,
    checkedPillarIds,
    checkedBucketKeys,
    checkedUrlKeys,
    pillarPageIndex,
    pillarPageSize,
    bucketPageIndex,
    bucketPageSize,
    urlPageIndex,
    urlPageSize,
  } = state

  const [isSubmittingFix, setIsSubmittingFix] = useState(false)
  const pagerRef = useRef<BucketUrlPager | null>(null)
  const [urlState, setUrlState] = useState<{
    key: string
    pageRows: MergedIssueUrlRow[]
    loadedRows: MergedIssueUrlRow[]
    total: number
    loading: boolean
    error: string
  }>({
    key: "",
    pageRows: [],
    loadedRows: [],
    total: 0,
    loading: false,
    error: "",
  })

  const pillarOptions = breakdown?.pillars ?? EMPTY_PILLARS
  const crawlId = breakdown?.crawl_id ?? ""

  // --- Sync selected pillars (default: initial pillar, else all) ---
  syncSelectedPillars({
    initialPillarId,
    pillarOptions,
    selectedPillarIds,
    setSelectedPillarIds: (ids) =>
      dispatch({ type: "SET_PILLAR_IDS", payload: ids }),
  })

  const selectedPillars = useMemo(
    () =>
      pillarOptions.filter((pillar) => selectedPillarIds.includes(pillar.id)),
    [pillarOptions, selectedPillarIds]
  )

  const soloPillarId =
    selectedPillars.length === 1 ? selectedPillars[0].id : null
  const effectivePillarId = drilledPillarId ?? soloPillarId
  const effectivePillar = useMemo(
    () => selectedPillars.find((pillar) => pillar.id === effectivePillarId) ?? null,
    [selectedPillars, effectivePillarId]
  )

  const pillarRows = useMemo<PillarScope[]>(
    () =>
      [...selectedPillars]
        .sort((left, right) => right.total_penalty - left.total_penalty)
        .map((pillar) => ({
          key: pillar.id,
          pillarLabel: pillar.label,
          pillar,
        })),
    [selectedPillars]
  )

  const bucketScopes = useMemo<BucketScope[]>(() => {
    if (!effectivePillar) return []
    return effectivePillar.buckets.map((bucket) => ({
      key: `${effectivePillar.id}::${bucket.id}`,
      pillarId: effectivePillar.id,
      pillarLabel: effectivePillar.label,
      bucketId: bucket.id,
      bucketLabel: formatBucketLabel(bucket.id, bucket.label),
      bucket,
    }))
  }, [effectivePillar])

  const bucketRows = useMemo(
    () =>
      [...bucketScopes].sort(
        (left, right) => right.bucket.total_penalty - left.bucket.total_penalty
      ),
    [bucketScopes]
  )

  const drilledBucket = useMemo(
    () => bucketScopes.find((scope) => scope.key === drilledBucketKey) ?? null,
    [bucketScopes, drilledBucketKey]
  )

  // The URL pager iterates bucket.issues, so scoping it to the selected issue
  // types filters server-side (no over-fetch). Empty filter = every type.
  const effectiveDrilledBucket = useMemo<BucketScope | null>(() => {
    if (!drilledBucket || !issueTypeFilter.length) return drilledBucket
    const selected = new Set(issueTypeFilter)
    return {
      ...drilledBucket,
      bucket: {
        ...drilledBucket.bucket,
        issues: drilledBucket.bucket.issues.filter((issue) =>
          selected.has(issue.id)
        ),
      },
    }
  }, [drilledBucket, issueTypeFilter])

  // --- Reset everything when the crawl changes ---
  useEffect(() => {
    dispatch({ type: "RESET" })
    pagerRef.current = null
    setUrlState({
      key: "",
      pageRows: [],
      loadedRows: [],
      total: 0,
      loading: false,
      error: "",
    })
  }, [crawlId])

  // --- Drill into an externally-requested bucket (e.g. from a bucket card
  // or the issue treemap) ---
  const lastFocusTokenRef = useRef<number | null>(null)
  const autoSelectRef = useRef<number | null>(null)
  useEffect(() => {
    if (!focusRequest) return
    if (focusRequest.token === lastFocusTokenRef.current) return
    const pillarId = focusRequest.pillarId ?? effectivePillarId
    if (!pillarId) return
    const pillar = selectedPillars.find((p) => p.id === pillarId)
    if (!pillar) return
    const bucket = pillar.buckets.find((b) => b.id === focusRequest.bucketId)
    if (!bucket) return
    lastFocusTokenRef.current = focusRequest.token
    autoSelectRef.current = focusRequest.autoSelect ?? null
    dispatch({ type: "DRILL_PILLAR", payload: pillarId })
    dispatch({ type: "DRILL_BUCKET", payload: `${pillarId}::${bucket.id}` })
    if (
      focusRequest.issueTypeId &&
      bucket.issues.some((issue) => issue.id === focusRequest.issueTypeId)
    ) {
      dispatch({
        type: "SET_ISSUE_TYPE_FILTER",
        payload: [focusRequest.issueTypeId],
      })
    }
  }, [focusRequest, effectivePillarId, selectedPillars])

  // --- Create a fresh lazy pager whenever the drilled bucket or its issue-type
  // filter changes (the filter is part of the key so it recreates the pager) ---
  const urlCacheKey = drilledBucket
    ? `${crawlId}::${drilledBucket.key}::${[...issueTypeFilter].sort().join(",")}`
    : ""
  useEffect(() => {
    if (!effectiveDrilledBucket || !crawlId) {
      pagerRef.current = null
      return
    }

    const controller = new AbortController()
    pagerRef.current = new BucketUrlPager(
      crawlId,
      effectiveDrilledBucket,
      controller.signal
    )
    setUrlState({
      key: urlCacheKey,
      pageRows: [],
      loadedRows: [],
      total: 0,
      loading: false,
      error: "",
    })

    return () => controller.abort()
  }, [crawlId, effectiveDrilledBucket, urlCacheKey])

  // --- Fetch only the page currently being displayed from the pager ---
  useEffect(() => {
    const pager = pagerRef.current
    if (!pager || !effectiveDrilledBucket || !crawlId) return

    setUrlState((prev) =>
      prev.key === urlCacheKey ? { ...prev, loading: true, error: "" } : prev
    )

    pager
      .getPage(urlPageIndex, urlPageSize)
      .then(async ({ rows, total }) => {
        if (pagerRef.current !== pager) return
        setUrlState({
          key: urlCacheKey,
          pageRows: rows,
          loadedRows: pager.loadedRows,
          total,
          loading: false,
          error: "",
        })

        // Treemap clicks request an auto-selection of the first N rows. Only
        // consume it on the first page (urlPageIndex === 0) so paginating later
        // never re-triggers it. getPage is chained (not concurrent) — the pager
        // is not concurrency-safe.
        const autoSelectCount = autoSelectRef.current
        if (autoSelectCount && urlPageIndex === 0) {
          autoSelectRef.current = null
          const { rows: autoRows } = await pager.getPage(0, autoSelectCount)
          if (pagerRef.current !== pager) return
          setUrlState((prev) =>
            prev.key === urlCacheKey
              ? { ...prev, loadedRows: pager.loadedRows }
              : prev
          )
          dispatch({
            type: "SET_CHECKED_URLS",
            payload: autoRows
              .slice(0, autoSelectCount)
              .map((row) => urlRowKey(row)),
          })
        }
      })
      .catch((error) => {
        if (pagerRef.current !== pager) return
        setUrlState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load issue URLs.",
        }))
      })
  }, [crawlId, effectiveDrilledBucket, urlCacheKey, urlPageIndex, urlPageSize])

  const isCurrentUrlState = urlState.key === urlCacheKey
  const displayedUrls = isCurrentUrlState ? urlState.pageRows : []
  const loadedUrls = isCurrentUrlState ? urlState.loadedRows : []
  const totalUrlRows = isCurrentUrlState ? urlState.total : 0
  const isLoadingUrls = isCurrentUrlState && urlState.loading
  const urlError = isCurrentUrlState ? urlState.error : ""

  const paginatedPillarRows = useMemo(() => {
    const start = pillarPageIndex * pillarPageSize
    return pillarRows.slice(start, start + pillarPageSize)
  }, [pillarRows, pillarPageIndex, pillarPageSize])

  const paginatedBucketRows = useMemo(() => {
    const start = bucketPageIndex * bucketPageSize
    return bucketRows.slice(start, start + bucketPageSize)
  }, [bucketRows, bucketPageIndex, bucketPageSize])

  // --- Selection toggles ---
  const onTogglePillar = useCallback(
    (key: string) => {
      dispatch({
        type: "SET_CHECKED_PILLARS",
        payload: checkedPillarIds.includes(key)
          ? checkedPillarIds.filter((item) => item !== key)
          : [...checkedPillarIds, key],
      })
    },
    [checkedPillarIds]
  )

  const onToggleAllPillars = useCallback(
    (checked: boolean) => {
      dispatch({
        type: "SET_CHECKED_PILLARS",
        payload: checked ? pillarRows.map((row) => row.key) : [],
      })
    },
    [pillarRows]
  )

  const onToggleBucket = useCallback(
    (key: string) => {
      dispatch({
        type: "SET_CHECKED_BUCKETS",
        payload: checkedBucketKeys.includes(key)
          ? checkedBucketKeys.filter((item) => item !== key)
          : [...checkedBucketKeys, key],
      })
    },
    [checkedBucketKeys]
  )

  const onToggleAllBuckets = useCallback(
    (checked: boolean) => {
      dispatch({
        type: "SET_CHECKED_BUCKETS",
        payload: checked ? bucketRows.map((row) => row.key) : [],
      })
    },
    [bucketRows]
  )

  const onToggleUrl = useCallback(
    (key: string) => {
      dispatch({
        type: "SET_CHECKED_URLS",
        payload: checkedUrlKeys.includes(key)
          ? checkedUrlKeys.filter((item) => item !== key)
          : [...checkedUrlKeys, key],
      })
    },
    [checkedUrlKeys]
  )

  const onToggleAllUrls = useCallback(
    (checked: boolean) => {
      if (!checked) {
        dispatch({ type: "SET_CHECKED_URLS", payload: [] })
        return
      }

      const pager = pagerRef.current
      if (!pager) return

      // "Select all" spans every URL in the bucket, not just the visible
      // page, so this is the one place we fetch the remaining pages.
      void pager.loadAll().then(({ rows }) => {
        if (pagerRef.current !== pager) return
        setUrlState((prev) =>
          prev.key === urlCacheKey ? { ...prev, loadedRows: rows } : prev
        )
        dispatch({
          type: "SET_CHECKED_URLS",
          payload: rows.map((row) => urlRowKey(row)),
        })
      })
    },
    [urlCacheKey]
  )

  const pillarDrag = useDragSelection(
    checkedPillarIds,
    useCallback(
      (keys: string[]) =>
        dispatch({ type: "SET_CHECKED_PILLARS", payload: keys }),
      []
    )
  )
  const bucketDrag = useDragSelection(
    checkedBucketKeys,
    useCallback(
      (keys: string[]) =>
        dispatch({ type: "SET_CHECKED_BUCKETS", payload: keys }),
      []
    )
  )
  const urlDrag = useDragSelection(
    checkedUrlKeys,
    useCallback(
      (keys: string[]) => dispatch({ type: "SET_CHECKED_URLS", payload: keys }),
      []
    )
  )

  // --- Build fix selections from the current checked rows ---
  const fixSelections = useMemo<FixSelection[]>(() => {
    if (drilledBucket) {
      const checkedSet = new Set(checkedUrlKeys)
      const rows = loadedUrls.filter((row) => checkedSet.has(urlRowKey(row)))
      if (!rows.length) return []
      return [
        {
          pillarId: drilledBucket.pillarId,
          pillarLabel: drilledBucket.pillarLabel,
          bucketIds: [drilledBucket.bucketId],
          bucketLabels: [drilledBucket.bucketLabel],
          issueTypeIds: [...new Set(rows.map((row) => row.issueTypeId))],
          urls: [...new Set(rows.map((row) => row.url))],
        },
      ]
    }

    if (effectivePillar) {
      // Whole-bucket selection: leave issueTypeIds empty so the backend
      // expands to every issue type in the selected buckets.
      const checkedSet = new Set(checkedBucketKeys)
      const scopes = bucketScopes.filter((scope) => checkedSet.has(scope.key))
      const byPillar = new Map<string, FixSelection>()
      for (const scope of scopes) {
        const existing = byPillar.get(scope.pillarId)
        if (existing) {
          existing.bucketIds.push(scope.bucketId)
          existing.bucketLabels.push(scope.bucketLabel)
        } else {
          byPillar.set(scope.pillarId, {
            pillarId: scope.pillarId,
            pillarLabel: scope.pillarLabel,
            bucketIds: [scope.bucketId],
            bucketLabels: [scope.bucketLabel],
            issueTypeIds: [],
            urls: [],
          })
        }
      }
      return [...byPillar.values()]
    }

    // Whole-pillar selection: every bucket of every checked pillar.
    const checkedSet = new Set(checkedPillarIds)
    return selectedPillars
      .filter((pillar) => checkedSet.has(pillar.id))
      .map((pillar) => ({
        pillarId: pillar.id,
        pillarLabel: pillar.label,
        bucketIds: pillar.buckets.map((bucket) => bucket.id),
        bucketLabels: pillar.buckets.map((bucket) =>
          formatBucketLabel(bucket.id, bucket.label)
        ),
        issueTypeIds: [],
        urls: [],
      }))
  }, [
    bucketScopes,
    checkedBucketKeys,
    checkedPillarIds,
    checkedUrlKeys,
    effectivePillar,
    loadedUrls,
    drilledBucket,
    selectedPillars,
  ])

  const selectionCount = drilledBucket
    ? checkedUrlKeys.length
    : effectivePillar
      ? checkedBucketKeys.length
      : checkedPillarIds.length

  const onRecommendFixes = useCallback(() => {
    if (!crawlId || !projectId) {
      toast.error("Recommended fixes are unavailable for this view.")
      return
    }
    if (!fixSelections.length) return

    const maxScopedUrls = 20
    const droppedUrls = fixSelections.reduce(
      (sum, s) => sum + Math.max(0, s.urls.length - maxScopedUrls),
      0
    )
    if (droppedUrls > 0) {
      toast.warning(
        `Only the first ${maxScopedUrls} URLs per pillar are sent for fixes; ${droppedUrls} will be skipped.`
      )
    }

    setIsSubmittingFix(true)
    const promise = generateBatchAIFix({
      crawlId,
      projectId,
      selections: fixSelections,
    })

    const first = fixSelections[0]
    toast.promise(promise, {
      loading: "Generating recommended fixes…",
      success: (conversation) => ({
        message: `Fixes are ready in "${conversation.title || "Untitled chat"}".`,
        action: onOpenAIConversation
          ? {
              label: "Open chat",
              onClick: () =>
                onOpenAIConversation(conversation.id, {
                  pillarId: first.pillarId,
                  bucketIds: first.bucketIds,
                  issueTypeIds: first.issueTypeIds,
                }),
            }
          : undefined,
      }),
      error: (error) =>
        error instanceof ApiError
          ? error.message
          : "Unable to generate recommended fixes.",
    })

    const done = () => setIsSubmittingFix(false)
    void promise.then(done, done)
  }, [crawlId, fixSelections, onOpenAIConversation, projectId])

  const onExport = useCallback(async () => {
    if (!crawlId) return

    const params = new URLSearchParams()
    if (drilledBucket) {
      params.set("pillar_ids", drilledBucket.pillarId)
      params.set("bucket_keys", drilledBucket.key)
      const checkedSet = new Set(checkedUrlKeys)
      const urls = [
        ...new Set(
          loadedUrls
            .filter((row) => checkedSet.has(urlRowKey(row)))
            .map((row) => row.url)
        ),
      ]
      params.set("issue_urls", urls.join(","))
    } else if (effectivePillar) {
      params.set("pillar_ids", effectivePillar.id)
      params.set("bucket_keys", checkedBucketKeys.join(","))
    } else {
      const checkedSet = new Set(checkedPillarIds)
      const checkedPillars = selectedPillars.filter((pillar) =>
        checkedSet.has(pillar.id)
      )
      params.set("pillar_ids", checkedPillarIds.join(","))
      params.set(
        "bucket_keys",
        checkedPillars
          .flatMap((pillar) =>
            pillar.buckets.map((bucket) => `${pillar.id}::${bucket.id}`)
          )
          .join(",")
      )
    }

    try {
      const response = await fetch(
        buildApiUrl(`/crawls/${crawlId}/score-breakdown/export.xlsx?${params}`),
        { credentials: "include" }
      )
      if (!response.ok) {
        throw new Error(await readExportError(response))
      }
      const blob = await response.blob()
      const filename = getExportFilename(
        response.headers.get("content-disposition"),
        `crawl-${crawlId.slice(0, 8)}-issues.xlsx`
      )
      downloadBlob(blob, filename)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to export crawl issues."
      )
    }
  }, [
    checkedBucketKeys,
    checkedPillarIds,
    checkedUrlKeys,
    crawlId,
    effectivePillar,
    loadedUrls,
    drilledBucket,
    selectedPillars,
  ])

  if (!breakdown || !pillarOptions.length) {
    return <NoIssueBreakdown />
  }

  const canAct = selectionCount > 0

  // --- Breadcrumbs ---
  const crumbs: { label: string; onClick?: () => void }[] = []
  if (selectedPillars.length > 1) {
    crumbs.push({
      label: "Pillars",
      onClick:
        effectivePillarId || drilledBucketKey
          ? () => dispatch({ type: "GO_TO_PILLARS" })
          : undefined,
    })
  }
  if (effectivePillarId && effectivePillar) {
    crumbs.push({
      label: effectivePillar.label,
      onClick: drilledBucketKey
        ? () => dispatch({ type: "GO_TO_BUCKETS" })
        : undefined,
    })
  }
  if (drilledBucket) {
    crumbs.push({ label: drilledBucket.bucketLabel })
  }

  return (
    <div className="px-4 pb-24 lg:px-6 lg:pb-32">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
              return (
                <Fragment key={crumb.label}>
                  <BreadcrumbItem>
                    {isLast || !crumb.onClick ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        className="cursor-pointer"
                        render={
                          <button onClick={crumb.onClick} type="button" />
                        }
                      >
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {isLast ? null : <BreadcrumbSeparator />}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center justify-end gap-3">
          {drilledBucket ? (
            <IssueTypeFilter
              issueTypes={drilledBucket.bucket.issues}
              selected={issueTypeFilter}
              onChange={(ids) =>
                dispatch({ type: "SET_ISSUE_TYPE_FILTER", payload: ids })
              }
            />
          ) : null}
          <Button
            disabled={!canAct || isSubmittingFix || !projectId}
            onClick={onRecommendFixes}
            size="sm"
          >
            {isSubmittingFix ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4" />
            )}
            Recommend Fixes{selectionCount > 0 ? ` (${selectionCount})` : ""}
          </Button>
        </div>
      </div>

      <div>
        {drilledBucket ? (
          <UrlIssueTable
            checkedKeys={checkedUrlKeys}
            error={urlError}
            getRowProps={urlDrag.getRowProps}
            isLoading={isLoadingUrls}
            onToggleAll={onToggleAllUrls}
            onToggleRow={onToggleUrl}
            rows={displayedUrls}
            totalRows={totalUrlRows}
          />
        ) : effectivePillar ? (
          <BucketTable
            checkedKeys={checkedBucketKeys}
            getRowProps={bucketDrag.getRowProps}
            onDrill={(key) => dispatch({ type: "DRILL_BUCKET", payload: key })}
            onToggleAll={onToggleAllBuckets}
            onToggleRow={onToggleBucket}
            rows={paginatedBucketRows}
            totalRows={bucketRows.length}
          />
        ) : (
          <PillarTable
            checkedKeys={checkedPillarIds}
            getRowProps={pillarDrag.getRowProps}
            onDrill={(key) => dispatch({ type: "DRILL_PILLAR", payload: key })}
            onToggleAll={onToggleAllPillars}
            onToggleRow={onTogglePillar}
            rows={paginatedPillarRows}
            totalRows={pillarRows.length}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          disabled={!canAct}
          onClick={onExport}
          size="sm"
          variant="outline"
        >
          <DownloadIcon className="size-4" />
          Export XLSX
        </Button>
        <TablePagination
          pageIndex={
            drilledBucket
              ? urlPageIndex
              : effectivePillar
                ? bucketPageIndex
                : pillarPageIndex
          }
          pageSize={
            drilledBucket
              ? urlPageSize
              : effectivePillar
                ? bucketPageSize
                : pillarPageSize
          }
          setPageIndex={(v) =>
            dispatch({
              type: drilledBucket
                ? "SET_URL_PAGE_INDEX"
                : effectivePillar
                  ? "SET_BUCKET_PAGE_INDEX"
                  : "SET_PILLAR_PAGE_INDEX",
              payload: v,
            })
          }
          setPageSize={(v) =>
            dispatch({
              type: drilledBucket
                ? "SET_URL_PAGE_SIZE"
                : effectivePillar
                  ? "SET_BUCKET_PAGE_SIZE"
                  : "SET_PILLAR_PAGE_SIZE",
              payload: v,
            })
          }
          totalRows={
            drilledBucket
              ? totalUrlRows
              : effectivePillar
                ? bucketRows.length
                : pillarRows.length
          }
        />
      </div>
    </div>
  )
}

// --- Sync helper (pure computation, called from render) ---

type SyncSelectedPillarsArgs = {
  initialPillarId?: string
  pillarOptions: ScoreBreakdownResponse["pillars"]
  selectedPillarIds: string[]
  setSelectedPillarIds: (values: string[]) => void
}

function syncSelectedPillars({
  initialPillarId,
  pillarOptions,
  selectedPillarIds,
  setSelectedPillarIds,
}: SyncSelectedPillarsArgs) {
  if (!pillarOptions.length) {
    if (selectedPillarIds.length) setSelectedPillarIds([])
    return
  }

  if (
    initialPillarId &&
    pillarOptions.some((pillar) => pillar.id === initialPillarId)
  ) {
    const next = [initialPillarId]
    if (!areStringArraysEqual(selectedPillarIds, next))
      setSelectedPillarIds(next)
    return
  }

  const valid = selectedPillarIds.filter((id) =>
    pillarOptions.some((pillar) => pillar.id === id)
  )

  if (!valid.length) {
    const all = pillarOptions.map((pillar) => pillar.id)
    if (!areStringArraysEqual(selectedPillarIds, all)) setSelectedPillarIds(all)
    return
  }

  if (!areStringArraysEqual(valid, selectedPillarIds))
    setSelectedPillarIds(valid)
}

function NoIssueBreakdown() {
  return (
    <div className="px-4 lg:px-6">
      <Card className="border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader>
          <CardTitle>Issues</CardTitle>
          <CardDescription>
            No completed crawl breakdown is available yet.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
