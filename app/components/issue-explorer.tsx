"use client"

import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import {
  ChevronLeftIcon,
  DownloadIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { TablePagination } from "~/components/issue-explorer/scope-controls"
import { BucketTable, UrlIssueTable } from "~/components/issue-explorer/tables"
import type {
  BucketScope,
  FixSelection,
  MergedIssueUrlRow,
} from "~/components/issue-explorer/types"
import {
  areStringArraysEqual,
  fetchBucketUrls,
  generateBatchAIFix,
  urlRowKey,
} from "~/components/issue-explorer/utils"
import { useDragSelection } from "~/components/issue-explorer/use-drag-selection"
import { formatBucketLabel } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { ApiError, buildApiUrl } from "~/lib/api"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import { downloadBlob, getExportFilename } from "~/components/app-navbar/utils"

// --- Selection reducer ---

type State = {
  selectedPillarIds: string[]
  drilledBucketKey: string | null
  checkedBucketKeys: string[]
  checkedUrlKeys: string[]
  bucketPageIndex: number
  bucketPageSize: number
  urlPageIndex: number
  urlPageSize: number
}

type Action =
  | { type: "SET_PILLAR_IDS"; payload: string[] }
  | { type: "DRILL_IN"; payload: string }
  | { type: "DRILL_OUT" }
  | { type: "SET_CHECKED_BUCKETS"; payload: string[] }
  | { type: "SET_CHECKED_URLS"; payload: string[] }
  | { type: "SET_BUCKET_PAGE_INDEX"; payload: number }
  | { type: "SET_BUCKET_PAGE_SIZE"; payload: number }
  | { type: "SET_URL_PAGE_INDEX"; payload: number }
  | { type: "SET_URL_PAGE_SIZE"; payload: number }
  | { type: "RESET" }

const initialState: State = {
  selectedPillarIds: [],
  drilledBucketKey: null,
  checkedBucketKeys: [],
  checkedUrlKeys: [],
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
        checkedBucketKeys: [],
        checkedUrlKeys: [],
        drilledBucketKey: null,
        bucketPageIndex: 0,
      }
    case "DRILL_IN":
      return {
        ...state,
        drilledBucketKey: action.payload,
        checkedUrlKeys: [],
        urlPageIndex: 0,
      }
    case "DRILL_OUT":
      return {
        ...state,
        drilledBucketKey: null,
        checkedUrlKeys: [],
        urlPageIndex: 0,
      }
    case "SET_CHECKED_BUCKETS":
      return { ...state, checkedBucketKeys: action.payload }
    case "SET_CHECKED_URLS":
      return { ...state, checkedUrlKeys: action.payload }
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
  initialPillarId,
  onOpenAIConversation,
  projectId,
}: {
  breakdown: ScoreBreakdownResponse | null
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
    drilledBucketKey,
    checkedBucketKeys,
    checkedUrlKeys,
    bucketPageIndex,
    bucketPageSize,
    urlPageIndex,
    urlPageSize,
  } = state

  const [isSubmittingFix, setIsSubmittingFix] = useState(false)
  const [urlState, setUrlState] = useState<{
    key: string
    urls: MergedIssueUrlRow[]
    loading: boolean
    error: string
  }>({ key: "", urls: [], loading: false, error: "" })

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
    () => pillarOptions.filter((pillar) => selectedPillarIds.includes(pillar.id)),
    [pillarOptions, selectedPillarIds]
  )

  const availableBucketScopes = useMemo<BucketScope[]>(() => {
    return selectedPillars.flatMap((pillar) =>
      pillar.buckets.map((bucket) => ({
        key: `${pillar.id}::${bucket.id}`,
        pillarId: pillar.id,
        pillarLabel: pillar.label,
        bucketId: bucket.id,
        bucketLabel: formatBucketLabel(bucket.id, bucket.label),
        bucket,
      }))
    )
  }, [selectedPillars])

  const bucketRows = useMemo(
    () =>
      [...availableBucketScopes].sort(
        (left, right) => right.bucket.total_penalty - left.bucket.total_penalty
      ),
    [availableBucketScopes]
  )

  const drilledBucket = useMemo(
    () => availableBucketScopes.find((scope) => scope.key === drilledBucketKey) ?? null,
    [availableBucketScopes, drilledBucketKey]
  )

  const hasMultiplePillars = selectedPillarIds.length > 1

  // --- Reset everything when the crawl changes ---
  useEffect(() => {
    dispatch({ type: "RESET" })
    setUrlState({ key: "", urls: [], loading: false, error: "" })
  }, [crawlId])

  // --- Load URLs for the drilled bucket ---
  const urlCacheKey = drilledBucket ? `${crawlId}::${drilledBucket.key}` : ""
  useEffect(() => {
    if (!drilledBucket || !crawlId) return

    const controller = new AbortController()
    const { signal } = controller

    setUrlState({ key: urlCacheKey, urls: [], loading: true, error: "" })

    fetchBucketUrls(crawlId, drilledBucket, signal)
      .then((rows) => {
        if (signal.aborted) return
        const sorted = rows.sort((a, b) => a.url.localeCompare(b.url))
        setUrlState({ key: urlCacheKey, urls: sorted, loading: false, error: "" })
      })
      .catch((error) => {
        if (signal.aborted) return
        setUrlState({
          key: urlCacheKey,
          urls: [],
          loading: false,
          error:
            error instanceof Error ? error.message : "Unable to load issue URLs.",
        })
      })

    return () => controller.abort()
  }, [crawlId, drilledBucket, urlCacheKey])

  const displayedUrls = urlState.key === urlCacheKey ? urlState.urls : []
  const isLoadingUrls = urlState.key === urlCacheKey && urlState.loading
  const urlError = urlState.key === urlCacheKey ? urlState.error : ""

  const paginatedBucketRows = useMemo(() => {
    const start = bucketPageIndex * bucketPageSize
    return bucketRows.slice(start, start + bucketPageSize)
  }, [bucketRows, bucketPageIndex, bucketPageSize])

  const paginatedUrls = useMemo(() => {
    const start = urlPageIndex * urlPageSize
    return displayedUrls.slice(start, start + urlPageSize)
  }, [displayedUrls, urlPageIndex, urlPageSize])

  // --- Selection toggles ---
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
      dispatch({
        type: "SET_CHECKED_URLS",
        payload: checked ? displayedUrls.map((row) => urlRowKey(row)) : [],
      })
    },
    [displayedUrls]
  )

  const bucketDrag = useDragSelection(
    checkedBucketKeys,
    useCallback(
      (keys: string[]) => dispatch({ type: "SET_CHECKED_BUCKETS", payload: keys }),
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
      const rows = displayedUrls.filter((row) => checkedSet.has(urlRowKey(row)))
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

    // Whole-bucket selection: leave issueTypeIds empty so the backend expands
    // to every issue type in the selected buckets.
    const checkedSet = new Set(checkedBucketKeys)
    const scopes = availableBucketScopes.filter((scope) => checkedSet.has(scope.key))
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
  }, [
    availableBucketScopes,
    checkedBucketKeys,
    checkedUrlKeys,
    displayedUrls,
    drilledBucket,
  ])

  const selectionCount = drilledBucket
    ? checkedUrlKeys.length
    : checkedBucketKeys.length

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
          displayedUrls
            .filter((row) => checkedSet.has(urlRowKey(row)))
            .map((row) => row.url)
        ),
      ]
      params.set("issue_urls", urls.join(","))
    } else {
      if (selectedPillarIds.length)
        params.set("pillar_ids", selectedPillarIds.join(","))
      params.set("bucket_keys", checkedBucketKeys.join(","))
    }

    try {
      const response = await fetch(
        buildApiUrl(`/crawls/${crawlId}/score-breakdown/export.xlsx?${params}`),
        { credentials: "include" }
      )
      if (!response.ok) {
        const errorText = await response.text()
        let errorMsg = "Unable to export crawl issues."
        try {
          const body = JSON.parse(errorText)
          if (typeof (body as Record<string, unknown>).error === "string") {
            errorMsg = (body as Record<string, unknown>).error as string
          }
        } catch {
          // use default message
        }
        throw new Error(errorMsg)
      }
      const blob = await response.blob()
      const filename = getExportFilename(
        response.headers.get("content-disposition"),
        `crawl-${crawlId.slice(0, 8)}-issues.xlsx`
      )
      downloadBlob(blob, filename)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to export crawl issues."
      )
    }
  }, [
    checkedBucketKeys,
    checkedUrlKeys,
    crawlId,
    displayedUrls,
    drilledBucket,
    selectedPillarIds,
  ])

  if (!breakdown || !pillarOptions.length) {
    return <NoIssueBreakdown />
  }

  const canAct = selectionCount > 0

  return (
    <div className="px-4 pb-24 lg:px-6 lg:pb-32">
      <div className="mb-4 grid grid-cols-3 items-center gap-3">
        <div className="flex min-w-0 items-center justify-start">
          {drilledBucket ? (
            <Button
              onClick={() => dispatch({ type: "DRILL_OUT" })}
              size="sm"
              variant="outline"
            >
              <ChevronLeftIcon data-icon="inline-start" />
              Back to buckets
            </Button>
          ) : null}
        </div>
        <span className="truncate text-center font-medium text-foreground">
          {drilledBucket?.bucketLabel}
        </span>
        <div className="flex items-center justify-end">
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
            rows={paginatedUrls}
            totalRows={displayedUrls.length}
          />
        ) : (
          <BucketTable
            checkedKeys={checkedBucketKeys}
            getRowProps={bucketDrag.getRowProps}
            hasMultiplePillars={hasMultiplePillars}
            onDrill={(key) => dispatch({ type: "DRILL_IN", payload: key })}
            onToggleAll={onToggleAllBuckets}
            onToggleRow={onToggleBucket}
            rows={paginatedBucketRows}
            totalRows={bucketRows.length}
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
          pageIndex={drilledBucket ? urlPageIndex : bucketPageIndex}
          pageSize={drilledBucket ? urlPageSize : bucketPageSize}
          setPageIndex={(v) =>
            dispatch({
              type: drilledBucket
                ? "SET_URL_PAGE_INDEX"
                : "SET_BUCKET_PAGE_INDEX",
              payload: v,
            })
          }
          setPageSize={(v) =>
            dispatch({
              type: drilledBucket ? "SET_URL_PAGE_SIZE" : "SET_BUCKET_PAGE_SIZE",
              payload: v,
            })
          }
          totalRows={drilledBucket ? displayedUrls.length : bucketRows.length}
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
    if (!areStringArraysEqual(selectedPillarIds, next)) setSelectedPillarIds(next)
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

  if (!areStringArraysEqual(valid, selectedPillarIds)) setSelectedPillarIds(valid)
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
