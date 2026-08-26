"use client"

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import {
  CheckCheckIcon,
  DownloadIcon,
  FilterIcon,
  Loader2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { TablePagination } from "~/components/issue-explorer/scope-controls"
import {
  BucketTable,
  IssueTypeTable,
  PillarTable,
  UrlIssueTable,
} from "~/components/issue-explorer/tables"
import type {
  BucketScope,
  MergedIssueUrlRow,
  PillarScope,
} from "~/components/issue-explorer/types"
import { useIssueWorkActions } from "~/components/issue-explorer/use-issue-work"
import {
  areStringArraysEqual,
  BucketUrlPager,
  urlRowKey,
  type WorkStatusFilter,
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
import { buildApiUrl, clientApiPost } from "~/lib/api"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import type { IssueWorkStateResponse } from "~/components/summary/issue-workspace.types"

import {
  downloadBlob,
  getExportFilename,
  readExportError,
} from "~/components/app-navbar/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"

// --- Selection reducer ---

type State = {
  selectedPillarIds: string[]
  drilledPillarId: string | null
  drilledBucketKey: string | null
  drilledIssueTypeId: string | null
  checkedPillarIds: string[]
  checkedBucketKeys: string[]
  checkedIssueTypeKeys: string[]
  checkedUrlKeys: string[]
  pillarPageIndex: number
  pillarPageSize: number
  bucketPageIndex: number
  bucketPageSize: number
  issueTypePageIndex: number
  issueTypePageSize: number
  urlPageIndex: number
  urlPageSize: number
}

type Action =
  | { type: "SET_PILLAR_IDS"; payload: string[] }
  | { type: "DRILL_PILLAR"; payload: string }
  | { type: "DRILL_BUCKET"; payload: string }
  | { type: "DRILL_ISSUE_TYPE"; payload: string }
  | { type: "GO_TO_PILLARS" }
  | { type: "GO_TO_BUCKETS" }
  | { type: "GO_TO_ISSUE_TYPES" }
  | { type: "SET_CHECKED_PILLARS"; payload: string[] }
  | { type: "SET_CHECKED_BUCKETS"; payload: string[] }
  | { type: "SET_CHECKED_ISSUE_TYPES"; payload: string[] }
  | { type: "SET_CHECKED_URLS"; payload: string[] }
  | { type: "SET_PILLAR_PAGE_INDEX"; payload: number }
  | { type: "SET_PILLAR_PAGE_SIZE"; payload: number }
  | { type: "SET_BUCKET_PAGE_INDEX"; payload: number }
  | { type: "SET_BUCKET_PAGE_SIZE"; payload: number }
  | { type: "SET_ISSUE_TYPE_PAGE_INDEX"; payload: number }
  | { type: "SET_ISSUE_TYPE_PAGE_SIZE"; payload: number }
  | { type: "SET_URL_PAGE_INDEX"; payload: number }
  | { type: "SET_URL_PAGE_SIZE"; payload: number }
  | { type: "RESET" }

const initialState: State = {
  selectedPillarIds: [],
  drilledPillarId: null,
  drilledBucketKey: null,
  drilledIssueTypeId: null,
  checkedPillarIds: [],
  checkedBucketKeys: [],
  checkedIssueTypeKeys: [],
  checkedUrlKeys: [],
  pillarPageIndex: 0,
  pillarPageSize: 10,
  bucketPageIndex: 0,
  bucketPageSize: 10,
  issueTypePageIndex: 0,
  issueTypePageSize: 10,
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
        checkedIssueTypeKeys: [],
        checkedUrlKeys: [],
        drilledPillarId: null,
        drilledBucketKey: null,
        drilledIssueTypeId: null,
        bucketPageIndex: 0,
      }
    case "DRILL_PILLAR":
      return {
        ...state,
        drilledPillarId: action.payload,
        drilledBucketKey: null,
        drilledIssueTypeId: null,
        checkedBucketKeys: [],
        bucketPageIndex: 0,
      }
    case "DRILL_BUCKET":
      return {
        ...state,
        drilledBucketKey: action.payload,
        drilledIssueTypeId: null,
        checkedIssueTypeKeys: [],
        checkedUrlKeys: [],
        issueTypePageIndex: 0,
        urlPageIndex: 0,
      }
    case "DRILL_ISSUE_TYPE":
      return {
        ...state,
        drilledIssueTypeId: action.payload,
        checkedUrlKeys: [],
        urlPageIndex: 0,
      }
    case "GO_TO_PILLARS":
      return {
        ...state,
        drilledPillarId: null,
        drilledBucketKey: null,
        drilledIssueTypeId: null,
        checkedBucketKeys: [],
        checkedIssueTypeKeys: [],
        checkedUrlKeys: [],
        bucketPageIndex: 0,
        issueTypePageIndex: 0,
        urlPageIndex: 0,
      }
    case "GO_TO_BUCKETS":
      return {
        ...state,
        drilledBucketKey: null,
        drilledIssueTypeId: null,
        checkedIssueTypeKeys: [],
        checkedUrlKeys: [],
        issueTypePageIndex: 0,
        urlPageIndex: 0,
      }
    case "GO_TO_ISSUE_TYPES":
      return {
        ...state,
        drilledIssueTypeId: null,
        checkedUrlKeys: [],
        urlPageIndex: 0,
      }
    case "SET_CHECKED_PILLARS":
      return { ...state, checkedPillarIds: action.payload }
    case "SET_CHECKED_BUCKETS":
      return { ...state, checkedBucketKeys: action.payload }
    case "SET_CHECKED_ISSUE_TYPES":
      return { ...state, checkedIssueTypeKeys: action.payload }
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
    case "SET_ISSUE_TYPE_PAGE_INDEX":
      return { ...state, issueTypePageIndex: action.payload }
    case "SET_ISSUE_TYPE_PAGE_SIZE":
      return { ...state, issueTypePageSize: action.payload }
    case "SET_URL_PAGE_INDEX":
      return { ...state, urlPageIndex: action.payload }
    case "SET_URL_PAGE_SIZE":
      return { ...state, urlPageSize: action.payload }
    case "RESET":
      return initialState
  }
}

const EMPTY_PILLARS: ScoreBreakdownResponse["pillars"] = []

export const IssueExplorer = memo(function IssueExplorer({
  breakdown,
  focusRequest,
  initialPillarId,
}: {
  breakdown: ScoreBreakdownResponse | null
  focusRequest?: {
    pillarId?: string
    bucketId?: string
    issueTypeId?: string
    autoSelect?: number
    token: number
  } | null
  initialPillarId?: string
}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const {
    selectedPillarIds,
    drilledPillarId,
    drilledBucketKey,
    drilledIssueTypeId,
    checkedPillarIds,
    checkedBucketKeys,
    checkedIssueTypeKeys,
    checkedUrlKeys,
    pillarPageIndex,
    pillarPageSize,
    bucketPageIndex,
    bucketPageSize,
    issueTypePageIndex,
    issueTypePageSize,
    urlPageIndex,
    urlPageSize,
  } = state

  const pagerRef = useRef<BucketUrlPager | null>(null)
  const [workStatus, setWorkStatus] = useState<WorkStatusFilter>("all")
  const [workRefreshToken, setWorkRefreshToken] = useState(0)
  const [bulkPending, setBulkPending] = useState(false)
  const [urlState, setUrlState] = useState<{
    key: string
    pageRows: MergedIssueUrlRow[]
    loadedRows: MergedIssueUrlRow[]
    total: number
    loading: boolean
    error: string
    workActionsEnabled: boolean
  }>({
    key: "",
    pageRows: [],
    loadedRows: [],
    total: 0,
    loading: false,
    error: "",
    workActionsEnabled: true,
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
    () =>
      selectedPillars.find((pillar) => pillar.id === effectivePillarId) ?? null,
    [selectedPillars, effectivePillarId]
  )

  const pillarRows = useMemo<PillarScope[]>(
    () =>
      [...selectedPillars]
        .sort((left, right) => {
          const leftZero = left.issue_row_count === 0 ? 1 : 0
          const rightZero = right.issue_row_count === 0 ? 1 : 0
          if (leftZero !== rightZero) return leftZero - rightZero
          if (right.total_penalty !== left.total_penalty)
            return right.total_penalty - left.total_penalty
          return (
            left.label.localeCompare(right.label) ||
            left.id.localeCompare(right.id)
          )
        })
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
      [...bucketScopes].sort((left, right) => {
        const leftZero = left.bucket.issue_row_count === 0 ? 1 : 0
        const rightZero = right.bucket.issue_row_count === 0 ? 1 : 0
        if (leftZero !== rightZero) return leftZero - rightZero
        if (right.bucket.total_penalty !== left.bucket.total_penalty)
          return right.bucket.total_penalty - left.bucket.total_penalty
        return (
          left.bucket.label.localeCompare(right.bucket.label) ||
          left.bucket.id.localeCompare(right.bucket.id)
        )
      }),
    [bucketScopes]
  )

  const drilledBucket = useMemo(
    () => bucketScopes.find((scope) => scope.key === drilledBucketKey) ?? null,
    [bucketScopes, drilledBucketKey]
  )

  const drilledIssueType = useMemo(
    () =>
      drilledBucket && drilledIssueTypeId
        ? (drilledBucket.bucket.issues.find(
            (issue) => issue.id === drilledIssueTypeId
          ) ?? null)
        : null,
    [drilledBucket, drilledIssueTypeId]
  )

  const issueTypeRows = useMemo(
    () =>
      drilledBucket
        ? [...drilledBucket.bucket.issues].sort((left, right) => {
            const leftZero = left.issue_row_count === 0 ? 1 : 0
            const rightZero = right.issue_row_count === 0 ? 1 : 0
            if (leftZero !== rightZero) return leftZero - rightZero
            if (right.affected_url_count !== left.affected_url_count)
              return right.affected_url_count - left.affected_url_count
            return (
              left.label.localeCompare(right.label) ||
              left.id.localeCompare(right.id)
            )
          })
        : [],
    [drilledBucket]
  )

  // The URL pager iterates bucket.issues, so scoping it to the single drilled
  // issue type filters server-side (no over-fetch). Non-null only at the URL
  // tier, so the pager/urlState only run once an issue type is drilled.
  const effectiveDrilledBucket = useMemo<BucketScope | null>(() => {
    if (!drilledBucket || !drilledIssueType) return null
    return {
      ...drilledBucket,
      bucket: {
        ...drilledBucket.bucket,
        issues: [drilledIssueType],
      },
    }
  }, [drilledBucket, drilledIssueType])

  // --- Reset everything when the crawl changes ---
  useEffect(() => {
    dispatch({ type: "RESET" })
    pagerRef.current = null
    setWorkStatus("all")
    setWorkRefreshToken(0)
    setUrlState({
      key: "",
      pageRows: [],
      loadedRows: [],
      total: 0,
      loading: false,
      error: "",
      workActionsEnabled: true,
    })
  }, [crawlId])

  const refreshUrls = useCallback(() => {
    setWorkRefreshToken((v) => v + 1)
  }, [])

  const { markDone, undo, isPending } = useIssueWorkActions(refreshUrls)

  // --- Apply an external pillar, bucket, or issue type focus. ---
  const lastFocusTokenRef = useRef<number | null>(null)
  const autoSelectRef = useRef<number | null>(null)
  useEffect(() => {
    if (!focusRequest) return
    if (focusRequest.token === lastFocusTokenRef.current) return
    const pillarId = focusRequest.pillarId ?? effectivePillarId
    if (!pillarId) return
    const pillar = selectedPillars.find((p) => p.id === pillarId)
    if (!pillar) return
    lastFocusTokenRef.current = focusRequest.token
    autoSelectRef.current = focusRequest.autoSelect ?? null
    if (pillar.issue_row_count === 0) return
    dispatch({ type: "DRILL_PILLAR", payload: pillarId })
    if (!focusRequest.bucketId) return
    const bucket = pillar.buckets.find((b) => b.id === focusRequest.bucketId)
    if (!bucket) return
    if (bucket.issue_row_count === 0) return
    dispatch({ type: "DRILL_BUCKET", payload: `${pillarId}::${bucket.id}` })
    if (!focusRequest.issueTypeId) return
    const issue = bucket.issues.find(
      (issue) => issue.id === focusRequest.issueTypeId
    )
    if (!issue || issue.issue_row_count === 0) return
    dispatch({
      type: "DRILL_ISSUE_TYPE",
      payload: focusRequest.issueTypeId,
    })
  }, [focusRequest, effectivePillarId, selectedPillars])

  // --- Create a fresh lazy pager whenever the drilled issue type changes (the
  // issue type is part of the key so it recreates the pager) ---
  const urlCacheKey =
    drilledBucket && drilledIssueTypeId
      ? `${crawlId}::${drilledBucket.key}::${drilledIssueTypeId}::${workStatus}::${workRefreshToken}`
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
      controller.signal,
      workStatus
    )
    setUrlState({
      key: urlCacheKey,
      pageRows: [],
      loadedRows: [],
      total: 0,
      loading: false,
      error: "",
      workActionsEnabled: true,
    })

    return () => controller.abort()
  }, [crawlId, effectiveDrilledBucket, urlCacheKey, workStatus])

  // --- Fetch only the page currently being displayed from the pager ---
  useEffect(() => {
    const pager = pagerRef.current
    if (!pager || !effectiveDrilledBucket || !crawlId) return

    setUrlState((prev) =>
      prev.key === urlCacheKey ? { ...prev, loading: true, error: "" } : prev
    )

    pager
      .getPage(urlPageIndex, urlPageSize)
      .then(async ({ rows, total, workActionsEnabled }) => {
        if (pagerRef.current !== pager) return
        setUrlState({
          key: urlCacheKey,
          pageRows: rows,
          loadedRows: pager.loadedRows,
          total,
          loading: false,
          error: "",
          workActionsEnabled,
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

  const handleWorkStatusChange = useCallback((value: WorkStatusFilter) => {
    setWorkStatus(value)
    dispatch({ type: "SET_URL_PAGE_INDEX", payload: 0 })
  }, [])

  const isCurrentUrlState = urlState.key === urlCacheKey
  const displayedUrls = isCurrentUrlState ? urlState.pageRows : []
  const loadedUrls = isCurrentUrlState ? urlState.loadedRows : []
  const totalUrlRows = isCurrentUrlState ? urlState.total : 0
  const isLoadingUrls = isCurrentUrlState && urlState.loading
  const urlError = isCurrentUrlState ? urlState.error : ""
  const workActionsEnabled = isCurrentUrlState
    ? urlState.workActionsEnabled
    : true

  const bulkActionableCount = useMemo(() => {
    if (!displayedUrls.length || !checkedUrlKeys.length) return 0
    const checkedSet = new Set(checkedUrlKeys)
    return displayedUrls.filter(
      (row) =>
        checkedSet.has(urlRowKey(row)) &&
        (!row.work || row.work.status === "still_open") &&
        row.issue_id
    ).length
  }, [displayedUrls, checkedUrlKeys])

  const paginatedPillarRows = useMemo(() => {
    const start = pillarPageIndex * pillarPageSize
    return pillarRows.slice(start, start + pillarPageSize)
  }, [pillarRows, pillarPageIndex, pillarPageSize])

  const paginatedBucketRows = useMemo(() => {
    const start = bucketPageIndex * bucketPageSize
    return bucketRows.slice(start, start + bucketPageSize)
  }, [bucketRows, bucketPageIndex, bucketPageSize])

  const paginatedIssueTypeRows = useMemo(() => {
    const start = issueTypePageIndex * issueTypePageSize
    return issueTypeRows.slice(start, start + issueTypePageSize)
  }, [issueTypeRows, issueTypePageIndex, issueTypePageSize])

  // --- Selection toggles (guard zero-issue rows) ---
  const onTogglePillar = useCallback(
    (key: string) => {
      const row = pillarRows.find((r) => r.key === key)
      if (!row || row.pillar.issue_row_count === 0) return
      dispatch({
        type: "SET_CHECKED_PILLARS",
        payload: checkedPillarIds.includes(key)
          ? checkedPillarIds.filter((item) => item !== key)
          : [...checkedPillarIds, key],
      })
    },
    [checkedPillarIds, pillarRows]
  )

  const onToggleAllPillars = useCallback(
    (checked: boolean) => {
      dispatch({
        type: "SET_CHECKED_PILLARS",
        payload: checked
          ? pillarRows
              .filter((row) => row.pillar.issue_row_count !== 0)
              .map((row) => row.key)
          : [],
      })
    },
    [pillarRows]
  )

  const onToggleBucket = useCallback(
    (key: string) => {
      const row = bucketRows.find((r) => r.key === key)
      if (!row || row.bucket.issue_row_count === 0) return
      dispatch({
        type: "SET_CHECKED_BUCKETS",
        payload: checkedBucketKeys.includes(key)
          ? checkedBucketKeys.filter((item) => item !== key)
          : [...checkedBucketKeys, key],
      })
    },
    [bucketRows, checkedBucketKeys]
  )

  const onToggleAllBuckets = useCallback(
    (checked: boolean) => {
      dispatch({
        type: "SET_CHECKED_BUCKETS",
        payload: checked
          ? bucketRows
              .filter((row) => row.bucket.issue_row_count !== 0)
              .map((row) => row.key)
          : [],
      })
    },
    [bucketRows]
  )

  const onToggleIssueType = useCallback(
    (key: string) => {
      const row = issueTypeRows.find((r) => r.id === key)
      if (!row || row.issue_row_count === 0) return
      dispatch({
        type: "SET_CHECKED_ISSUE_TYPES",
        payload: checkedIssueTypeKeys.includes(key)
          ? checkedIssueTypeKeys.filter((item) => item !== key)
          : [...checkedIssueTypeKeys, key],
      })
    },
    [checkedIssueTypeKeys, issueTypeRows]
  )

  const onToggleAllIssueTypes = useCallback(
    (checked: boolean) => {
      dispatch({
        type: "SET_CHECKED_ISSUE_TYPES",
        payload: checked
          ? issueTypeRows
              .filter((row) => row.issue_row_count !== 0)
              .map((row) => row.id)
          : [],
      })
    },
    [issueTypeRows]
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
      // Select all only toggles the currently visible page of URLs, not every
      // URL across all pages.
      dispatch({
        type: "SET_CHECKED_URLS",
        payload: checked ? displayedUrls.map((row) => urlRowKey(row)) : [],
      })
    },
    [displayedUrls]
  )

  const handleDrillPillar = useCallback(
    (key: string) => {
      const row = pillarRows.find((r) => r.key === key)
      if (!row || row.pillar.issue_row_count === 0) return
      dispatch({ type: "DRILL_PILLAR", payload: key })
    },
    [pillarRows]
  )

  const handleDrillBucket = useCallback(
    (key: string) => {
      const row = bucketRows.find((r) => r.key === key)
      if (!row || row.bucket.issue_row_count === 0) return
      dispatch({ type: "DRILL_BUCKET", payload: key })
    },
    [bucketRows]
  )

  const handleDrillIssueType = useCallback(
    (key: string) => {
      const row = issueTypeRows.find((r) => r.id === key)
      if (!row || row.issue_row_count === 0) return
      dispatch({ type: "DRILL_ISSUE_TYPE", payload: key })
    },
    [issueTypeRows]
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
  const issueTypeDrag = useDragSelection(
    checkedIssueTypeKeys,
    useCallback(
      (keys: string[]) =>
        dispatch({ type: "SET_CHECKED_ISSUE_TYPES", payload: keys }),
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

  const onBulkMarkDone = useCallback(async () => {
    if (!workActionsEnabled) {
      toast.error("Select the latest completed crawl to update work.")
      return
    }
    const checkedSet = new Set(checkedUrlKeys)
    const actionable = displayedUrls.filter(
      (row) =>
        checkedSet.has(urlRowKey(row)) &&
        (!row.work || row.work.status === "still_open") &&
        row.issue_id
    )
    if (!actionable.length) {
      toast.info("No actionable rows selected.")
      return
    }
    setBulkPending(true)
    let success = 0
    let failed = 0
    for (const row of actionable) {
      try {
        await clientApiPost<IssueWorkStateResponse>(
          `/crawl-issues/${row.issue_id}/work-done`,
          {}
        )
        success += 1
      } catch {
        failed += 1
      }
    }
    setBulkPending(false)
    if (success)
      toast.success(
        `Marked ${success} issue${success === 1 ? "" : "s"} as done`
      )
    if (failed) toast.error(`${failed} could not be marked`)
    dispatch({ type: "SET_CHECKED_URLS", payload: [] })
    refreshUrls()
  }, [checkedUrlKeys, displayedUrls, refreshUrls, workActionsEnabled])

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
        {
          credentials: "include",
        }
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

  if (!breakdown || !pillarOptions.length) return null

  const canAct =
    (drilledIssueType
      ? checkedUrlKeys
      : drilledBucket
        ? checkedIssueTypeKeys
        : effectivePillar
          ? checkedBucketKeys
          : checkedPillarIds
    ).length > 0

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
    crumbs.push({
      label: drilledBucket.bucketLabel,
      onClick: drilledIssueType
        ? () => dispatch({ type: "GO_TO_ISSUE_TYPES" })
        : undefined,
    })
  }
  if (drilledIssueType) {
    crumbs.push({ label: drilledIssueType.label })
  }

  return (
    <div className="px-4 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
              return (
                <Fragment key={crumb.label}>
                  <BreadcrumbItem>
                    {isLast || !crumb.onClick ? (
                      <BreadcrumbPage
                        className="max-w-[20rem] truncate"
                        title={crumb.label}
                      >
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        className="max-w-[20rem] cursor-pointer truncate"
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
        {drilledBucket && drilledIssueType ? (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="outline">
                    <FilterIcon data-icon="inline-start" />
                    {workStatus === "all"
                      ? "All issues"
                      : workStatus === "needs_action"
                        ? "Needs action"
                        : "Marked done"}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuRadioGroup
                    value={workStatus}
                    onValueChange={(v) =>
                      handleWorkStatusChange(v as WorkStatusFilter)
                    }
                  >
                    <DropdownMenuRadioItem value="all">
                      All issues
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="needs_action">
                      Needs action
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="marked_done">
                      Marked done
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {workActionsEnabled ? (
              <Button
                disabled={bulkPending || bulkActionableCount === 0}
                onClick={(e) => {
                  e.stopPropagation()
                  onBulkMarkDone()
                }}
                size="sm"
                variant="outline"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {bulkPending ? (
                  <Loader2Icon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <CheckCheckIcon data-icon="inline-start" />
                )}
                Mark work done
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex">
                      <Button disabled size="sm" variant="outline">
                        <CheckCheckIcon data-icon="inline-start" />
                        Mark work done
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>
                  Select the latest completed crawl to update work.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : null}
      </div>

      <div>
        {drilledBucket && drilledIssueType ? (
          <UrlIssueTable
            checkedKeys={checkedUrlKeys}
            crawlId={crawlId}
            error={urlError}
            getRowProps={urlDrag.getRowProps}
            isLoading={isLoadingUrls}
            onToggleAll={onToggleAllUrls}
            onToggleRow={onToggleUrl}
            rows={displayedUrls}
            totalRows={totalUrlRows}
            workActionsEnabled={workActionsEnabled}
            onMarkDone={markDone}
            onUndo={undo}
            isPending={isPending}
          />
        ) : drilledBucket ? (
          <IssueTypeTable
            checkedKeys={checkedIssueTypeKeys}
            getRowProps={issueTypeDrag.getRowProps}
            onDrill={handleDrillIssueType}
            onToggleAll={onToggleAllIssueTypes}
            onToggleRow={onToggleIssueType}
            rows={paginatedIssueTypeRows}
            totalRows={issueTypeRows.length}
          />
        ) : effectivePillar ? (
          <BucketTable
            checkedKeys={checkedBucketKeys}
            getRowProps={bucketDrag.getRowProps}
            onDrill={handleDrillBucket}
            onToggleAll={onToggleAllBuckets}
            onToggleRow={onToggleBucket}
            rows={paginatedBucketRows}
            totalRows={bucketRows.length}
          />
        ) : (
          <PillarTable
            checkedKeys={checkedPillarIds}
            getRowProps={pillarDrag.getRowProps}
            onDrill={handleDrillPillar}
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
          <DownloadIcon data-icon="inline-start" />
          Export XLSX
        </Button>
        <TablePagination
          pageIndex={
            drilledIssueType
              ? urlPageIndex
              : drilledBucket
                ? issueTypePageIndex
                : effectivePillar
                  ? bucketPageIndex
                  : pillarPageIndex
          }
          pageSize={
            drilledIssueType
              ? urlPageSize
              : drilledBucket
                ? issueTypePageSize
                : effectivePillar
                  ? bucketPageSize
                  : pillarPageSize
          }
          setPageIndex={(v) =>
            dispatch({
              type: drilledIssueType
                ? "SET_URL_PAGE_INDEX"
                : drilledBucket
                  ? "SET_ISSUE_TYPE_PAGE_INDEX"
                  : effectivePillar
                    ? "SET_BUCKET_PAGE_INDEX"
                    : "SET_PILLAR_PAGE_INDEX",
              payload: v,
            })
          }
          setPageSize={(v) =>
            dispatch({
              type: drilledIssueType
                ? "SET_URL_PAGE_SIZE"
                : drilledBucket
                  ? "SET_ISSUE_TYPE_PAGE_SIZE"
                  : effectivePillar
                    ? "SET_BUCKET_PAGE_SIZE"
                    : "SET_PILLAR_PAGE_SIZE",
              payload: v,
            })
          }
          totalRows={
            drilledIssueType
              ? totalUrlRows
              : drilledBucket
                ? issueTypeRows.length
                : effectivePillar
                  ? bucketRows.length
                  : pillarRows.length
          }
        />
      </div>
    </div>
  )
})

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
