"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
} from "react"
import { ChevronLeftIcon, DownloadIcon } from "lucide-react"
import { toast } from "sonner"

import {
  ScopeBreadcrumbs,
  TablePagination,
} from "~/components/issue-explorer/scope-controls"
import {
  IssueTypeTable,
  UrlIssueTable,
} from "~/components/issue-explorer/tables"
import type {
  AIFixTarget,
  BucketScope,
  IssueScope,
  MergedIssueUrlRow,
} from "~/components/issue-explorer/types"
import {
  areStringArraysEqual,
  buildPendingAIFixRequest,
  fetchAllIssueUrls,
  generateQueuedAIFix,
} from "~/components/issue-explorer/utils"
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

// --- URL loading reducer ---

type IssueUrlState = {
  urls: MergedIssueUrlRow[]
  loading: boolean
  error: string
}

const initialIssueUrlState: IssueUrlState = {
  urls: [],
  loading: false,
  error: "",
}

type IssueUrlAction =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; urls: MergedIssueUrlRow[] }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "CLEAR" }

function issueUrlReducer(
  state: IssueUrlState,
  action: IssueUrlAction
): IssueUrlState {
  switch (action.type) {
    case "LOAD_START":
      return { urls: [], loading: true, error: "" }
    case "LOAD_SUCCESS":
      return { urls: action.urls, loading: false, error: "" }
    case "LOAD_ERROR":
      return { ...state, loading: false, error: action.error }
    case "CLEAR":
      return { urls: [], loading: false, error: "" }
  }
}

// --- Selection reducer ---

type SelectionState = {
  selectedPillarIds: string[]
  selectedBucketKeys: string[]
  selectedIssueTypeKeys: string[]
  issueTypePageIndex: number
  issueTypePageSize: number
  issueUrlPageIndex: number
  issueUrlPageSize: number
}

type SelectionAction =
  | { type: "SET_PILLAR_IDS"; payload: string[] }
  | { type: "SET_BUCKET_KEYS"; payload: string[] }
  | { type: "SET_ISSUE_TYPE_KEYS"; payload: string[] }
  | { type: "SET_ISSUE_TYPE_PAGE_INDEX"; payload: number }
  | { type: "SET_ISSUE_TYPE_PAGE_SIZE"; payload: number }
  | { type: "SET_ISSUE_URL_PAGE_INDEX"; payload: number }
  | { type: "SET_ISSUE_URL_PAGE_SIZE"; payload: number }
  | { type: "CLEAR_ISSUE_TYPES"; payload?: undefined }

function selectionReducer(
  state: SelectionState,
  action: SelectionAction
): SelectionState {
  switch (action.type) {
    case "SET_PILLAR_IDS":
      return { ...state, selectedPillarIds: action.payload }
    case "SET_BUCKET_KEYS":
      return {
        ...state,
        selectedBucketKeys: action.payload,
        selectedIssueTypeKeys: [],
        issueTypePageIndex: 0,
      }
    case "SET_ISSUE_TYPE_KEYS":
      return {
        ...state,
        selectedIssueTypeKeys: action.payload,
        issueUrlPageIndex: 0,
      }
    case "SET_ISSUE_TYPE_PAGE_INDEX":
      return { ...state, issueTypePageIndex: action.payload }
    case "SET_ISSUE_TYPE_PAGE_SIZE":
      return { ...state, issueTypePageSize: action.payload }
    case "SET_ISSUE_URL_PAGE_INDEX":
      return { ...state, issueUrlPageIndex: action.payload }
    case "SET_ISSUE_URL_PAGE_SIZE":
      return { ...state, issueUrlPageSize: action.payload }
    case "CLEAR_ISSUE_TYPES":
      return {
        ...state,
        selectedIssueTypeKeys: [],
        issueUrlPageIndex: 0,
      }
  }
}

const initialSelectionState: SelectionState = {
  selectedPillarIds: [],
  selectedBucketKeys: [],
  selectedIssueTypeKeys: [],
  issueTypePageIndex: 0,
  issueTypePageSize: 10,
  issueUrlPageIndex: 0,
  issueUrlPageSize: 10,
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
  const [selection, dispatchSelection] = useReducer(
    selectionReducer,
    initialSelectionState
  )
  const {
    selectedPillarIds,
    selectedBucketKeys,
    selectedIssueTypeKeys,
    issueTypePageIndex,
    issueTypePageSize,
    issueUrlPageIndex,
    issueUrlPageSize,
  } = selection

  const [issueUrlState, dispatchIssueUrl] = useReducer(
    issueUrlReducer,
    initialIssueUrlState
  )
  const {
    urls: mergedIssueUrls,
    loading: isLoadingIssueUrls,
    error: issueUrlsError,
  } = issueUrlState
  const [pendingFixTargetKeys, setPendingFixTargetKeys] = useState<string[]>([])

  // Lazy-init refs to avoid creating objects on every render
  const pendingFixTargetKeysRef = useRef<Set<string>>(null!)
  if (!pendingFixTargetKeysRef.current) {
    pendingFixTargetKeysRef.current = new Set<string>()
  }
  const issueUrlsCacheRef = useRef<Map<string, MergedIssueUrlRow[]>>(null!)
  if (!issueUrlsCacheRef.current) {
    issueUrlsCacheRef.current = new Map<string, MergedIssueUrlRow[]>()
  }
  const issueUrlsCache = issueUrlsCacheRef.current

  const pillarOptions = breakdown?.pillars ?? EMPTY_PILLARS

  // --- Selection sync in render (replaces useEffect-based derived-state pattern) ---

  syncSelectedPillars({
    initialPillarId,
    pillarOptions,
    selectedPillarIds,
    setSelectedPillarIds: (ids: string[]) =>
      dispatchSelection({ type: "SET_PILLAR_IDS", payload: ids }),
  })

  const selectedPillars = useMemo(() => {
    return pillarOptions.filter((pillar) =>
      selectedPillarIds.includes(pillar.id)
    )
  }, [pillarOptions, selectedPillarIds])

  const availableBucketScopes = useMemo<BucketScope[]>(() => {
    return selectedPillars.flatMap((pillar) =>
      pillar.buckets.map((bucket) => ({
        key: `${pillar.id}::${bucket.id}`,
        pillarId: pillar.id,
        pillarLabel: pillar.label,
        bucketId: bucket.id,
        bucketLabel: formatBucketLabel(bucket.id, bucket.label),
      }))
    )
  }, [selectedPillars])

  // Sync buckets after computing available scopes
  syncSelectedBuckets({
    availableBucketScopes,
    initialPillarId,
    selectedBucketKeys,
    setSelectedBucketKeys: (keys: string[]) =>
      dispatchSelection({ type: "SET_BUCKET_KEYS", payload: keys }),
  })

  const availableIssueScopes = useMemo<IssueScope[]>(() => {
    const selectedBucketScopes = availableBucketScopes.filter((bucketScope) =>
      selectedBucketKeys.includes(bucketScope.key)
    )
    return selectedBucketScopes.flatMap((bucketScope) => {
      const pillar = selectedPillars.find(
        (item) => item.id === bucketScope.pillarId
      )
      const bucket = pillar?.buckets.find(
        (item) => item.id === bucketScope.bucketId
      )

      return (bucket?.issues ?? []).map((issueType) => ({
        key: `${bucketScope.key}::${issueType.id}`,
        pillarId: bucketScope.pillarId,
        pillarLabel: bucketScope.pillarLabel,
        bucketId: bucketScope.bucketId,
        bucketLabel: bucketScope.bucketLabel,
        issueTypeId: issueType.id,
        issueTypeLabel: issueType.label,
        issueType,
      }))
    })
  }, [availableBucketScopes, selectedBucketKeys, selectedPillars])

  const selectedIssueScopes = useMemo(() => {
    return availableIssueScopes.filter((issueScope) =>
      selectedIssueTypeKeys.includes(issueScope.key)
    )
  }, [availableIssueScopes, selectedIssueTypeKeys])

  // Sync issue types after computing available scopes
  syncSelectedIssueTypes({
    availableIssueScopes,
    selectedIssueTypeKeys,
    onApply: (keys: string[]) =>
      dispatchSelection({ type: "SET_ISSUE_TYPE_KEYS", payload: keys }),
  })

  const issueUrlCacheKey = [
    breakdown?.crawl_id ?? "",
    ...selectedIssueScopes.map((issueScope) => issueScope.key).sort(),
  ].join("|")
  const cachedIssueUrls = selectedIssueTypeKeys.length
    ? issueUrlsCache.get(issueUrlCacheKey)
    : undefined
  const displayedIssueUrls = cachedIssueUrls ?? mergedIssueUrls
  const crawlId = breakdown?.crawl_id ?? ""

  useEffect(() => {
    issueUrlsCache.clear()
    dispatchIssueUrl({ type: "CLEAR" })
  }, [crawlId, dispatchIssueUrl, issueUrlsCache])

  const onSelectedBucketKeysChange = useCallback((nextBucketKeys: string[]) => {
    dispatchSelection({ type: "SET_BUCKET_KEYS", payload: nextBucketKeys })
  }, [])

  const onSelectedIssueTypeKeysChange = useCallback(
    (nextIssueTypeKeys: string[]) => {
      dispatchSelection({
        type: "SET_ISSUE_TYPE_KEYS",
        payload: nextIssueTypeKeys,
      })
    },
    []
  )

  const onBackToIssueTypes = useCallback(() => {
    dispatchSelection({ type: "CLEAR_ISSUE_TYPES" })
    dispatchIssueUrl({ type: "CLEAR" })
  }, [])

  const onSelectIssueType = useCallback((issueTypeKey: string) => {
    dispatchSelection({ type: "SET_ISSUE_TYPE_KEYS", payload: [issueTypeKey] })
  }, [])

  useEffect(() => {
    if (!breakdown || !selectedIssueTypeKeys.length) {
      return
    }

    const cacheKey = issueUrlCacheKey
    if (issueUrlsCache.has(cacheKey)) {
      return
    }

    const controller = new AbortController()
    const { signal } = controller

    async function loadIssueUrls() {
      dispatchIssueUrl({ type: "LOAD_START" })

      try {
        const rowsByScope = await Promise.all(
          selectedIssueScopes.map((issueScope) =>
            fetchAllIssueUrls(crawlId, issueScope, signal)
          )
        )

        if (signal.aborted) return

        const nextRows = rowsByScope
          .flat()
          .sort((left, right) => left.url.localeCompare(right.url))
        issueUrlsCache.set(cacheKey, nextRows)
        dispatchIssueUrl({ type: "LOAD_SUCCESS", urls: nextRows })
      } catch (error) {
        if (signal.aborted) return
        dispatchIssueUrl({
          type: "LOAD_ERROR",
          error:
            error instanceof Error
              ? error.message
              : "Unable to load issue URLs.",
        })
      }
    }

    void loadIssueUrls()

    return () => {
      controller.abort()
    }
  }, [
    breakdown,
    crawlId,
    dispatchIssueUrl,
    issueUrlCacheKey,
    issueUrlsCache,
    selectedIssueScopes,
    selectedIssueTypeKeys.length,
  ])

  const issueTypeRows = useMemo(() => {
    return [...availableIssueScopes].sort(
      (left, right) =>
        right.issueType.final_penalty - left.issueType.final_penalty
    )
  }, [availableIssueScopes])

  const paginatedIssueTypeRows = useMemo(() => {
    const start = issueTypePageIndex * issueTypePageSize
    return issueTypeRows.slice(start, start + issueTypePageSize)
  }, [issueTypePageIndex, issueTypePageSize, issueTypeRows])

  const paginatedMergedIssueUrls = useMemo(() => {
    const start = issueUrlPageIndex * issueUrlPageSize
    return displayedIssueUrls.slice(start, start + issueUrlPageSize)
  }, [issueUrlPageIndex, issueUrlPageSize, displayedIssueUrls])

  const hasSelectedIssueTypes = selectedIssueTypeKeys.length > 0
  const hasMultipleSources =
    selectedPillarIds.length > 1 ||
    selectedBucketKeys.length > 1 ||
    selectedIssueTypeKeys.length > 1

  const isFixActionPending = useCallback(
    (targetKey: string) => pendingFixTargetKeys.includes(targetKey),
    [pendingFixTargetKeys]
  )

  const onFixAction = useCallback(
    (target: AIFixTarget) => {
      if (!breakdown?.crawl_id || !projectId) {
        toast.error("Recommended fixes are unavailable for this view.")
        return
      }

      const request = buildPendingAIFixRequest(target)

      if (pendingFixTargetKeysRef.current.has(target.key)) {
        return
      }

      pendingFixTargetKeysRef.current.add(target.key)
      setPendingFixTargetKeys([...pendingFixTargetKeysRef.current])

      const queuedFixPromise = generateQueuedAIFix({
        crawlId: breakdown.crawl_id,
        projectId,
        request,
        target,
      })

      toast.promise(queuedFixPromise, {
        loading: `Generating fixes for ${target.issueTypeLabel}…`,
        success: (conversation) => ({
          message: `Fixes are ready in "${conversation.title || "Untitled chat"}".`,
          action: onOpenAIConversation
            ? {
                label: "Open chat",
                onClick: () =>
                  onOpenAIConversation(conversation.id, {
                    pillarId: target.pillarId,
                    bucketIds: [target.bucketId],
                    issueTypeIds: [target.issueTypeId],
                  }),
              }
            : undefined,
        }),
        error: (error) =>
          error instanceof ApiError
            ? error.message
            : "Unable to generate recommended fixes.",
      })

      const clearPendingTarget = () => {
        pendingFixTargetKeysRef.current.delete(target.key)
        setPendingFixTargetKeys([...pendingFixTargetKeysRef.current])
      }
      void queuedFixPromise.then(clearPendingTarget, clearPendingTarget)
    },
    [breakdown?.crawl_id, onOpenAIConversation, projectId]
  )

  if (!breakdown || !pillarOptions.length || !availableBucketScopes.length) {
    return <NoIssueBreakdown />
  }

  return (
    <IssueExplorerContent
      availableBucketScopes={availableBucketScopes}
      availableIssueScopes={availableIssueScopes}
      displayedIssueUrls={displayedIssueUrls}
      crawlId={crawlId}
      onBackToIssueTypes={onBackToIssueTypes}
      onFixAction={onFixAction}
      onSelectIssueType={onSelectIssueType}
      onSelectedBucketKeysChange={onSelectedBucketKeysChange}
      onSelectedIssueTypeKeysChange={onSelectedIssueTypeKeysChange}
      viewState={{ hasMultipleSources, hasSelectedIssueTypes }}
      isFixActionPending={isFixActionPending}
      isLoadingIssueUrls={isLoadingIssueUrls}
      issueTypePageIndex={issueTypePageIndex}
      issueTypePageSize={issueTypePageSize}
      issueTypeRows={issueTypeRows}
      issueUrlPageIndex={issueUrlPageIndex}
      issueUrlPageSize={issueUrlPageSize}
      issueUrlsError={issueUrlsError}
      paginatedIssueTypeRows={paginatedIssueTypeRows}
      paginatedMergedIssueUrls={paginatedMergedIssueUrls}
      totalIssueTypeRows={issueTypeRows.length}
      pillarOptions={pillarOptions}
      selectedBucketKeys={selectedBucketKeys}
      selectedIssueTypeKeys={selectedIssueTypeKeys}
      selectedPillarIds={selectedPillarIds}
      selectedPillars={selectedPillars}
      setIssueTypePageIndex={(v) =>
        dispatchSelection({ type: "SET_ISSUE_TYPE_PAGE_INDEX", payload: v })
      }
      setIssueTypePageSize={(v) =>
        dispatchSelection({ type: "SET_ISSUE_TYPE_PAGE_SIZE", payload: v })
      }
      setIssueUrlPageIndex={(v) =>
        dispatchSelection({ type: "SET_ISSUE_URL_PAGE_INDEX", payload: v })
      }
      setIssueUrlPageSize={(v) =>
        dispatchSelection({ type: "SET_ISSUE_URL_PAGE_SIZE", payload: v })
      }
      setSelectedPillarIds={(v) =>
        dispatchSelection({ type: "SET_PILLAR_IDS", payload: v })
      }
    />
  )
}

// --- Sync helpers (pure computation, called from render) ---

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
    if (selectedPillarIds.length) {
      setSelectedPillarIds([])
    }
    return
  }

  if (
    initialPillarId &&
    pillarOptions.some((pillar) => pillar.id === initialPillarId)
  ) {
    const nextSelectedPillarIds = [initialPillarId]
    if (!areStringArraysEqual(selectedPillarIds, nextSelectedPillarIds)) {
      setSelectedPillarIds(nextSelectedPillarIds)
    }
    return
  }

  const nextSelectedPillarIds = selectedPillarIds.filter((pillarId) =>
    pillarOptions.some((pillar) => pillar.id === pillarId)
  )

  if (!nextSelectedPillarIds.length) {
    const fallbackPillarIds = [pillarOptions[0].id]
    if (!areStringArraysEqual(selectedPillarIds, fallbackPillarIds)) {
      setSelectedPillarIds(fallbackPillarIds)
    }
    return
  }

  if (!areStringArraysEqual(nextSelectedPillarIds, selectedPillarIds)) {
    setSelectedPillarIds(nextSelectedPillarIds)
  }
}

type SyncSelectedBucketsArgs = {
  availableBucketScopes: BucketScope[]
  initialPillarId?: string
  selectedBucketKeys: string[]
  setSelectedBucketKeys: (values: string[]) => void
}

function syncSelectedBuckets({
  availableBucketScopes,
  initialPillarId,
  selectedBucketKeys,
  setSelectedBucketKeys,
}: SyncSelectedBucketsArgs) {
  if (!availableBucketScopes.length) {
    if (selectedBucketKeys.length) {
      setSelectedBucketKeys([])
    }
    return
  }

  const nextSelectedBucketKeys = selectedBucketKeys.filter((bucketKey) =>
    availableBucketScopes.some((bucketScope) => bucketScope.key === bucketKey)
  )

  if (!nextSelectedBucketKeys.length) {
    const fallbackBucketKeys = initialPillarId
      ? availableBucketScopes.map((bucketScope) => bucketScope.key)
      : [availableBucketScopes[0].key]
    if (!areStringArraysEqual(selectedBucketKeys, fallbackBucketKeys)) {
      setSelectedBucketKeys(fallbackBucketKeys)
    }
    return
  }

  if (!areStringArraysEqual(nextSelectedBucketKeys, selectedBucketKeys)) {
    setSelectedBucketKeys(nextSelectedBucketKeys)
  }
}

type SyncSelectedIssueTypesArgs = {
  availableIssueScopes: IssueScope[]
  selectedIssueTypeKeys: string[]
  onApply: (keys: string[]) => void
}

function syncSelectedIssueTypes({
  availableIssueScopes,
  selectedIssueTypeKeys,
  onApply,
}: SyncSelectedIssueTypesArgs) {
  const nextSelectedIssueTypeKeys = selectedIssueTypeKeys.filter(
    (issueTypeKey) =>
      availableIssueScopes.some((issueScope) => issueScope.key === issueTypeKey)
  )

  const resolvedKeys =
    nextSelectedIssueTypeKeys.length === 0 && availableIssueScopes.length > 0
      ? availableIssueScopes.map((s) => s.key)
      : nextSelectedIssueTypeKeys

  if (!areStringArraysEqual(resolvedKeys, selectedIssueTypeKeys)) {
    onApply(resolvedKeys)
  }
}

// --- Presentational sub-components ---

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

type IssueExplorerContentProps = {
  availableBucketScopes: BucketScope[]
  availableIssueScopes: IssueScope[]
  displayedIssueUrls: MergedIssueUrlRow[]
  onBackToIssueTypes: () => void
  onFixAction: (target: AIFixTarget) => void
  onSelectIssueType: (key: string) => void
  onSelectedBucketKeysChange: (keys: string[]) => void
  onSelectedIssueTypeKeysChange: (keys: string[]) => void
  isLoadingIssueUrls: boolean
  issueTypePageIndex: number
  issueTypePageSize: number
  issueTypeRows: IssueScope[]
  issueUrlPageIndex: number
  issueUrlPageSize: number
  issueUrlsError: string
  crawlId: string
  paginatedIssueTypeRows: IssueScope[]
  paginatedMergedIssueUrls: MergedIssueUrlRow[]
  totalIssueTypeRows: number
  pillarOptions: Array<{ id: string; label: string }>
  selectedBucketKeys: string[]
  selectedIssueTypeKeys: string[]
  selectedPillarIds: string[]
  selectedPillars: Array<{ label: string }>
  setIssueTypePageIndex: (v: number) => void
  setIssueTypePageSize: (v: number) => void
  setIssueUrlPageIndex: (v: number) => void
  setIssueUrlPageSize: (v: number) => void
  setSelectedPillarIds: (v: string[]) => void
  /** Combined view state flags */
  viewState: {
    hasMultipleSources: boolean
    hasSelectedIssueTypes: boolean
  }
  isFixActionPending: (key: string) => boolean
}

function IssueExplorerContent(props: IssueExplorerContentProps) {
  const {
    availableBucketScopes,
    crawlId,
    availableIssueScopes,
    displayedIssueUrls,
    onBackToIssueTypes,
    onFixAction,
    onSelectIssueType,
    onSelectedBucketKeysChange,
    onSelectedIssueTypeKeysChange,
    isLoadingIssueUrls,
    issueTypePageIndex,
    issueTypePageSize,
    issueTypeRows,
    issueUrlPageIndex,
    issueUrlPageSize,
    issueUrlsError,
    totalIssueTypeRows,
    paginatedIssueTypeRows,
    paginatedMergedIssueUrls,
    pillarOptions,
    selectedBucketKeys,
    selectedIssueTypeKeys,
    selectedPillarIds,
    selectedPillars,
    setIssueTypePageIndex,
    setIssueTypePageSize,
    setIssueUrlPageIndex,
    setIssueUrlPageSize,
    setSelectedPillarIds,
    viewState,
    isFixActionPending,
  } = props
  const { hasMultipleSources, hasSelectedIssueTypes } = viewState

  const handleExportXlsx = useCallback(async () => {
    if (!crawlId) return

    const params = new URLSearchParams()
    if (selectedPillarIds.length)
      params.set("pillar_ids", selectedPillarIds.join(","))
    if (selectedBucketKeys.length)
      params.set("bucket_keys", selectedBucketKeys.join(","))
    if (selectedIssueTypeKeys.length)
      params.set("issue_type_keys", selectedIssueTypeKeys.join(","))

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
        error instanceof Error
          ? error.message
          : "Unable to export crawl issues."
      )
    }
  }, [crawlId, selectedPillarIds, selectedBucketKeys, selectedIssueTypeKeys])

  return (
    <div className="px-4 pb-24 lg:px-6 lg:pb-32">
      <div className="mb-4 flex w-full items-start justify-between gap-4">
        <ScopeBreadcrumbs
          availableBucketScopes={availableBucketScopes}
          availableIssueScopes={availableIssueScopes}
          pillarOptions={pillarOptions}
          selectedBucketKeys={selectedBucketKeys}
          selectedIssueTypeKeys={selectedIssueTypeKeys}
          selectedPillarIds={selectedPillarIds}
          selectedPillarLabels={selectedPillars.map((pillar) => pillar.label)}
          setSelectedBucketKeys={onSelectedBucketKeysChange}
          setSelectedIssueTypeKeys={onSelectedIssueTypeKeysChange}
          setSelectedPillarIds={setSelectedPillarIds}
        />
        <TablePagination
          pageIndex={
            hasSelectedIssueTypes ? issueUrlPageIndex : issueTypePageIndex
          }
          pageSize={
            hasSelectedIssueTypes ? issueUrlPageSize : issueTypePageSize
          }
          rowLabel={hasSelectedIssueTypes ? "URLs" : "issue types"}
          setPageIndex={
            hasSelectedIssueTypes ? setIssueUrlPageIndex : setIssueTypePageIndex
          }
          setPageSize={
            hasSelectedIssueTypes ? setIssueUrlPageSize : setIssueTypePageSize
          }
          totalRows={
            hasSelectedIssueTypes
              ? displayedIssueUrls.length
              : issueTypeRows.length
          }
        />
      </div>

      <div className="mb-4 flex justify-end">
        <Button
          disabled={!crawlId || !selectedIssueTypeKeys.length}
          onClick={handleExportXlsx}
          size="sm"
          variant="outline"
        >
          <DownloadIcon className="size-4" />
          Export XLSX
        </Button>
      </div>

      <IssueExplorerTableArea
        displayedIssueUrls={displayedIssueUrls}
        hasMultipleSources={hasMultipleSources}
        hasSelectedIssueTypes={hasSelectedIssueTypes}
        isFixActionPending={isFixActionPending}
        isLoadingIssueUrls={isLoadingIssueUrls}
        issueUrlsError={issueUrlsError}
        onBackToIssueTypes={onBackToIssueTypes}
        onFixAction={onFixAction}
        onSelectIssueType={onSelectIssueType}
        paginatedIssueTypeRows={paginatedIssueTypeRows}
        paginatedMergedIssueUrls={paginatedMergedIssueUrls}
        totalIssueTypeRows={totalIssueTypeRows}
      />
    </div>
  )
}

type IssueExplorerTableAreaProps = {
  displayedIssueUrls: MergedIssueUrlRow[]
  hasMultipleSources: boolean
  hasSelectedIssueTypes: boolean
  isFixActionPending: (key: string) => boolean
  isLoadingIssueUrls: boolean
  issueUrlsError: string
  onBackToIssueTypes: () => void
  onFixAction: (target: AIFixTarget) => void
  onSelectIssueType: (key: string) => void
  paginatedIssueTypeRows: IssueScope[]
  paginatedMergedIssueUrls: MergedIssueUrlRow[]
  totalIssueTypeRows: number
}

function IssueExplorerTableArea({
  displayedIssueUrls,
  hasMultipleSources,
  hasSelectedIssueTypes,
  isFixActionPending,
  isLoadingIssueUrls,
  issueUrlsError,
  onBackToIssueTypes,
  onFixAction,
  onSelectIssueType,
  paginatedIssueTypeRows,
  paginatedMergedIssueUrls,
  totalIssueTypeRows,
}: IssueExplorerTableAreaProps) {
  return (
    <div className="min-h-[32rem]">
      {hasSelectedIssueTypes ? (
        <>
          <Button
            className="mb-4"
            onClick={onBackToIssueTypes}
            size="sm"
            variant="outline"
          >
            <ChevronLeftIcon data-icon="inline-start" />
            Back to issue types
          </Button>
          <UrlIssueTable
            error={issueUrlsError}
            hasMultipleSources={hasMultipleSources}
            isFixActionPending={isFixActionPending}
            isLoading={isLoadingIssueUrls}
            onFixAction={onFixAction}
            rows={paginatedMergedIssueUrls}
            title="Selected issue types"
            totalRows={displayedIssueUrls.length}
          />
        </>
      ) : (
        <IssueTypeTable
          hasMultipleSources={hasMultipleSources}
          isFixActionPending={isFixActionPending}
          onFixAction={onFixAction}
          rows={paginatedIssueTypeRows}
          totalRows={totalIssueTypeRows}
          onSelectIssueType={onSelectIssueType}
        />
      )}
    </div>
  )
}
