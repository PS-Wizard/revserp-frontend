"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeftIcon } from "lucide-react"

import { ScopeBreadcrumbs, TablePagination } from "~/components/issue-explorer/scope-controls"
import { EmptyMessage, IssueTypeTable, UrlIssueTable } from "~/components/issue-explorer/tables"
import type { BucketScope, IssueScope, MergedIssueUrlRow } from "~/components/issue-explorer/types"
import { areStringArraysEqual, fetchAllIssueUrls } from "~/components/issue-explorer/utils"
import { Button } from "~/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import type { ScoreBreakdownResponse } from "~/lib/api.types"

const EMPTY_PILLARS: ScoreBreakdownResponse["pillars"] = []

export function IssueExplorer({
  breakdown,
  initialPillarId,
}: {
  breakdown: ScoreBreakdownResponse | null
  initialPillarId?: string
}) {
  const [selectedPillarIds, setSelectedPillarIds] = useState<string[]>([])
  const [selectedBucketKeys, setSelectedBucketKeys] = useState<string[]>([])
  const [selectedIssueTypeKeys, setSelectedIssueTypeKeys] = useState<string[]>([])
  const [issueTypePageIndex, setIssueTypePageIndex] = useState(0)
  const [issueTypePageSize, setIssueTypePageSize] = useState(10)
  const [issueUrlPageIndex, setIssueUrlPageIndex] = useState(0)
  const [issueUrlPageSize, setIssueUrlPageSize] = useState(10)
  const [mergedIssueUrls, setMergedIssueUrls] = useState<MergedIssueUrlRow[]>([])
  const [isLoadingIssueUrls, setIsLoadingIssueUrls] = useState(false)
  const [issueUrlsError, setIssueUrlsError] = useState("")
  const issueUrlsCacheRef = useRef<Map<string, MergedIssueUrlRow[]> | null>(null)
  if (issueUrlsCacheRef.current === null) {
    issueUrlsCacheRef.current = new Map()
  }
  const issueUrlsCache = issueUrlsCacheRef.current

  const pillarOptions = breakdown?.pillars ?? EMPTY_PILLARS

  const selectedPillars = useMemo(() => {
    return pillarOptions.filter((pillar) => selectedPillarIds.includes(pillar.id))
  }, [pillarOptions, selectedPillarIds])

  const availableBucketScopes = useMemo<BucketScope[]>(() => {
    return selectedPillars.flatMap((pillar) =>
      pillar.buckets.map((bucket) => ({
        key: `${pillar.id}::${bucket.id}`,
        pillarId: pillar.id,
        pillarLabel: pillar.label,
        bucketId: bucket.id,
        bucketLabel: bucket.label,
      }))
    )
  }, [selectedPillars])

  const availableIssueScopes = useMemo<IssueScope[]>(() => {
    return availableBucketScopes.flatMap((bucketScope) => {
      const pillar = selectedPillars.find((item) => item.id === bucketScope.pillarId)
      const bucket = pillar?.buckets.find((item) => item.id === bucketScope.bucketId)

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
  }, [availableBucketScopes, selectedPillars])
  const selectedIssueScopes = useMemo(() => {
    return availableIssueScopes.filter((issueScope) => selectedIssueTypeKeys.includes(issueScope.key))
  }, [availableIssueScopes, selectedIssueTypeKeys])
  const issueUrlCacheKey = [
    breakdown?.crawl_id ?? "",
    ...selectedIssueScopes.map((issueScope) => issueScope.key).sort(),
  ].join("|")
  const cachedIssueUrls = selectedIssueTypeKeys.length ? issueUrlsCache.get(issueUrlCacheKey) : undefined
  const displayedIssueUrls = cachedIssueUrls ?? mergedIssueUrls
  const crawlId = breakdown?.crawl_id ?? ""
  const previousCrawlIdRef = useRef(crawlId)
  if (previousCrawlIdRef.current !== crawlId) {
    previousCrawlIdRef.current = crawlId
    issueUrlsCache.clear()
    if (mergedIssueUrls.length) {
      setMergedIssueUrls([])
    }
    if (issueUrlsError) {
      setIssueUrlsError("")
    }
  }

  const handleSelectedBucketKeysChange = useCallback((nextBucketKeys: string[]) => {
    setSelectedBucketKeys(nextBucketKeys)
    setIssueTypePageIndex(0)
    setSelectedIssueTypeKeys([])
  }, [])

  const handleSelectedIssueTypeKeysChange = useCallback((nextIssueTypeKeys: string[]) => {
    setSelectedIssueTypeKeys(nextIssueTypeKeys)
    setIssueUrlPageIndex(0)
  }, [])

  useEffect(() => {
    syncSelectedPillars({
      initialPillarId,
      pillarOptions,
      selectedPillarIds,
      setSelectedPillarIds,
    })
  }, [initialPillarId, pillarOptions, selectedPillarIds])

  useEffect(() => {
    syncSelectedBuckets({
      availableBucketScopes,
      initialPillarId,
      selectedBucketKeys,
      setSelectedBucketKeys: handleSelectedBucketKeysChange,
    })
  }, [availableBucketScopes, handleSelectedBucketKeysChange, initialPillarId, selectedBucketKeys])

  useEffect(() => {
    const nextSelectedIssueTypeKeys = selectedIssueTypeKeys.filter((issueTypeKey) =>
      availableIssueScopes.some((issueScope) => issueScope.key === issueTypeKey)
    )

    if (!areStringArraysEqual(nextSelectedIssueTypeKeys, selectedIssueTypeKeys)) {
      handleSelectedIssueTypeKeysChange(nextSelectedIssueTypeKeys)
    }
  }, [availableIssueScopes, handleSelectedIssueTypeKeysChange, selectedIssueTypeKeys])

  useEffect(() => {
    if (!breakdown || !selectedIssueTypeKeys.length) {
      return
    }

    const cacheKey = issueUrlCacheKey
    if (issueUrlsCache.has(cacheKey)) {
      return
    }

    let cancelled = false

    async function loadIssueUrls() {
      setIsLoadingIssueUrls(true)
      setIssueUrlsError("")

      try {
        const rowsByScope = await Promise.all(
          selectedIssueScopes.map((issueScope) => fetchAllIssueUrls(crawlId, issueScope))
        )

        if (cancelled) {
          return
        }

        const nextRows = rowsByScope.flat().sort((left, right) => left.url.localeCompare(right.url))
        issueUrlsCache.set(cacheKey, nextRows)
        setMergedIssueUrls(nextRows)
      } catch (error) {
        if (cancelled) {
          return
        }

        setIssueUrlsError(error instanceof Error ? error.message : "Unable to load issue URLs.")
      } finally {
        if (!cancelled) {
          setIsLoadingIssueUrls(false)
        }
      }
    }

    void loadIssueUrls()

    return () => {
      cancelled = true
    }
  }, [breakdown, crawlId, issueUrlCacheKey, issueUrlsCache, selectedIssueScopes, selectedIssueTypeKeys.length])

  const issueTypeRows = useMemo(() => {
    return [...availableIssueScopes].sort(
      (left, right) => right.issueType.final_penalty - left.issueType.final_penalty
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
    selectedPillarIds.length > 1 || selectedBucketKeys.length > 1 || selectedIssueTypeKeys.length > 1

  if (!breakdown || !pillarOptions.length || !availableBucketScopes.length) {
    return <NoIssueBreakdown />
  }

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
          setSelectedBucketKeys={handleSelectedBucketKeysChange}
          setSelectedIssueTypeKeys={handleSelectedIssueTypeKeysChange}
          setSelectedPillarIds={setSelectedPillarIds}
        />
        <TablePagination
          pageIndex={hasSelectedIssueTypes ? issueUrlPageIndex : issueTypePageIndex}
          pageSize={hasSelectedIssueTypes ? issueUrlPageSize : issueTypePageSize}
          rowLabel={hasSelectedIssueTypes ? "URLs" : "issue types"}
          setPageIndex={hasSelectedIssueTypes ? setIssueUrlPageIndex : setIssueTypePageIndex}
          setPageSize={hasSelectedIssueTypes ? setIssueUrlPageSize : setIssueTypePageSize}
          totalRows={hasSelectedIssueTypes ? displayedIssueUrls.length : issueTypeRows.length}
        />
      </div>

      <div className="min-h-[32rem]">
        {hasSelectedIssueTypes ? (
          <>
            <Button
              className="mb-4"
              onClick={() => {
                handleSelectedIssueTypeKeysChange([])
                setMergedIssueUrls([])
                setIssueUrlsError("")
              }}
              size="sm"
              variant="outline"
            >
              <ChevronLeftIcon data-icon="inline-start" />
              Back to issue types
            </Button>
            <UrlIssueTable
              error={issueUrlsError}
              hasMultipleSources={hasMultipleSources}
              isLoading={isLoadingIssueUrls}
              rows={paginatedMergedIssueUrls}
              title="Selected issue types"
              totalRows={displayedIssueUrls.length}
            />
          </>
        ) : (
          <IssueTypeTable
            hasMultipleSources={hasMultipleSources}
            rows={paginatedIssueTypeRows}
            totalRows={issueTypeRows.length}
            onSelectIssueType={(issueTypeKey) => handleSelectedIssueTypeKeysChange([issueTypeKey])}
          />
        )}
      </div>
    </div>
  )
}

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

  if (initialPillarId && pillarOptions.some((pillar) => pillar.id === initialPillarId)) {
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

function NoIssueBreakdown() {
  return (
    <div className="px-4 lg:px-6">
      <Card className="border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader>
          <CardTitle>Issues</CardTitle>
          <CardDescription>No completed crawl breakdown is available yet.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

