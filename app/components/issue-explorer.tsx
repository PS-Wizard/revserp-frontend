"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { CompileLoader } from "~/components/compile-loader"
import { Badge } from "~/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Input } from "~/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { clientApiFetch } from "~/lib/api"
import type {
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownIssueURLsResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

type BucketScope = {
  key: string
  pillarId: string
  pillarLabel: string
  bucketId: string
  bucketLabel: string
}

type IssueScope = {
  key: string
  pillarId: string
  pillarLabel: string
  bucketId: string
  bucketLabel: string
  issueTypeId: string
  issueTypeLabel: string
  issueType: ScoreBreakdownIssueTypeResponse
}

type MergedIssueUrlRow = ScoreBreakdownIssueURLsResponse["urls"][number] & {
  source: string
}

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
  const issueUrlsCacheRef = useRef(new Map<string, MergedIssueUrlRow[]>())

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

  useEffect(() => {
    issueUrlsCacheRef.current.clear()
    setMergedIssueUrls([])
    setIssueUrlsError("")
  }, [breakdown?.crawl_id])

  useEffect(() => {
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
  }, [initialPillarId, pillarOptions, selectedPillarIds])

  useEffect(() => {
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
  }, [availableBucketScopes, initialPillarId, selectedBucketKeys])

  useEffect(() => {
    const nextSelectedIssueTypeKeys = selectedIssueTypeKeys.filter((issueTypeKey) =>
      availableIssueScopes.some((issueScope) => issueScope.key === issueTypeKey)
    )

    if (!areStringArraysEqual(nextSelectedIssueTypeKeys, selectedIssueTypeKeys)) {
      setSelectedIssueTypeKeys(nextSelectedIssueTypeKeys)
    }
  }, [availableIssueScopes, selectedIssueTypeKeys])

  useEffect(() => {
    setIssueTypePageIndex(0)
    setSelectedIssueTypeKeys([])
  }, [selectedBucketKeys.join("|")])

  useEffect(() => {
    setIssueUrlPageIndex(0)
  }, [selectedIssueTypeKeys.join("|")])

  useEffect(() => {
    if (!breakdown || !selectedIssueTypeKeys.length) {
      setMergedIssueUrls([])
      setIssueUrlsError("")
      return
    }

    const selectedIssueScopes = availableIssueScopes.filter((issueScope) =>
      selectedIssueTypeKeys.includes(issueScope.key)
    )
    const crawlId = breakdown.crawl_id
    const cacheKey = [
      breakdown.crawl_id,
      ...selectedIssueScopes.map((issueScope) => issueScope.key).sort(),
    ].join("|")
    const cachedRows = issueUrlsCacheRef.current.get(cacheKey)

    if (cachedRows) {
      setMergedIssueUrls(cachedRows)
      setIssueUrlsError("")
      return
    }

    let cancelled = false

    async function loadIssueUrls() {
      setIsLoadingIssueUrls(true)
      setIssueUrlsError("")

      try {
        const rowsByScope = await Promise.all(
          selectedIssueScopes.map((issueScope) =>
            fetchAllIssueUrls(crawlId, issueScope)
          )
        )

        if (cancelled) {
          return
        }

        const nextRows = rowsByScope.flat().sort((left, right) =>
          left.url.localeCompare(right.url)
        )
        issueUrlsCacheRef.current.set(cacheKey, nextRows)
        setMergedIssueUrls(nextRows)
      } catch (error) {
        if (cancelled) {
          return
        }

        setIssueUrlsError(
          error instanceof Error ? error.message : "Unable to load issue URLs."
        )
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
  }, [availableIssueScopes, breakdown, selectedIssueTypeKeys])

  const issueTypeRows = useMemo(() => {
    return availableIssueScopes
      .map((issueScope) => issueScope)
      .sort((left, right) => right.issueType.final_penalty - left.issueType.final_penalty)
  }, [availableIssueScopes])

  const paginatedIssueTypeRows = useMemo(() => {
    const start = issueTypePageIndex * issueTypePageSize
    return issueTypeRows.slice(start, start + issueTypePageSize)
  }, [issueTypePageIndex, issueTypePageSize, issueTypeRows])

  const paginatedMergedIssueUrls = useMemo(() => {
    const start = issueUrlPageIndex * issueUrlPageSize
    return mergedIssueUrls.slice(start, start + issueUrlPageSize)
  }, [issueUrlPageIndex, issueUrlPageSize, mergedIssueUrls])

  const hasSelectedIssueTypes = selectedIssueTypeKeys.length > 0
  const hasMultipleSources =
    selectedPillarIds.length > 1 ||
    selectedBucketKeys.length > 1 ||
    selectedIssueTypeKeys.length > 1

  if (!breakdown || !pillarOptions.length || !availableBucketScopes.length) {
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

  return (
    <div className="px-4 pb-24 lg:px-6 lg:pb-32">
      <div className="mb-4 flex w-full items-start justify-between gap-4">
        <div className="inline-flex flex-col rounded-lg border border-foreground/20 bg-muted/95 p-[3px] shadow-2xl shadow-black/40 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-1 rounded-md px-1.5 py-1">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <ScopeMultiMenu
                    label={getSelectionLabel(
                      selectedPillars.map((pillar) => pillar.label),
                      "Select pillars"
                    )}
                    options={pillarOptions.map((pillar) => ({
                      value: pillar.id,
                      label: pillar.label,
                    }))}
                    selectedValues={selectedPillarIds}
                    title="Pillars"
                    onToggle={(value) =>
                      toggleSelection(value, selectedPillarIds, setSelectedPillarIds, false)
                    }
                  />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <ScopeMultiMenu
                    label={getSelectionLabel(
                      availableBucketScopes
                        .filter((bucketScope) => selectedBucketKeys.includes(bucketScope.key))
                        .map((bucketScope) => bucketScope.bucketLabel),
                      "Select buckets"
                    )}
                    options={availableBucketScopes.map((bucketScope) => ({
                      value: bucketScope.key,
                      label: `${bucketScope.pillarLabel} / ${bucketScope.bucketLabel}`,
                    }))}
                    selectedValues={selectedBucketKeys}
                    title="Buckets"
                    onToggle={(value) =>
                      toggleSelection(value, selectedBucketKeys, setSelectedBucketKeys, false)
                    }
                  />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <ScopeMultiMenu
                    label={getSelectionLabel(
                      availableIssueScopes
                        .filter((issueScope) => selectedIssueTypeKeys.includes(issueScope.key))
                        .map((issueScope) => issueScope.issueTypeLabel),
                      "Issue Types"
                    )}
                    options={availableIssueScopes.map((issueScope) => ({
                      value: issueScope.key,
                      label: `${issueScope.bucketLabel} / ${issueScope.issueTypeLabel}`,
                    }))}
                    selectedValues={selectedIssueTypeKeys}
                    title="Issue types"
                    onToggle={(value) =>
                      toggleSelection(value, selectedIssueTypeKeys, setSelectedIssueTypeKeys, true)
                    }
                  />
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <TablePagination
          pageIndex={hasSelectedIssueTypes ? issueUrlPageIndex : issueTypePageIndex}
          pageSize={hasSelectedIssueTypes ? issueUrlPageSize : issueTypePageSize}
          rowLabel={hasSelectedIssueTypes ? "URLs" : "issue types"}
          setPageIndex={hasSelectedIssueTypes ? setIssueUrlPageIndex : setIssueTypePageIndex}
          setPageSize={hasSelectedIssueTypes ? setIssueUrlPageSize : setIssueTypePageSize}
          totalRows={hasSelectedIssueTypes ? mergedIssueUrls.length : issueTypeRows.length}
        />
      </div>

      <div className="min-h-[32rem]">
        {hasSelectedIssueTypes ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="mb-4"
              onClick={() => setSelectedIssueTypeKeys([])}
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
              totalRows={mergedIssueUrls.length}
            />
          </>
        ) : (
          <IssueTypeTable
            hasMultipleSources={hasMultipleSources}
            rows={paginatedIssueTypeRows}
            totalRows={issueTypeRows.length}
            onSelectIssueType={(issueTypeKey) => setSelectedIssueTypeKeys([issueTypeKey])}
          />
        )}
      </div>
    </div>
  )
}

function ScopeMultiMenu({
  label,
  onToggle,
  options,
  selectedValues,
  title,
}: {
  label: string
  onToggle: (value: string) => void
  options: Array<{ value: string; label: string }>
  selectedValues: string[]
  title: string
}) {
  const [query, setQuery] = useState("")
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return options
    }

    return options.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery)
    )
  }, [options, query])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="xs" variant="ghost" className="h-7 rounded-md bg-transparent px-1.5 text-foreground hover:bg-background/80" />}
      >
        {label}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{title}</DropdownMenuLabel>
          <div className="px-1 pb-1">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="h-8"
            />
          </div>
          <DropdownMenuSeparator />
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <DropdownMenuCheckboxItem
                checked={selectedValues.includes(option.value)}
                key={option.value}
                onCheckedChange={() => onToggle(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))
          ) : (
            <div className="px-2 py-3 text-sm text-muted-foreground">No results.</div>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function IssueTypeTable({
  hasMultipleSources,
  onSelectIssueType,
  rows,
  totalRows,
}: {
  hasMultipleSources: boolean
  onSelectIssueType: (value: string) => void
  rows: IssueScope[]
  totalRows: number
}) {
  if (!totalRows) {
    return <EmptyMessage message="No issue types found for the selected scope." />
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            {hasMultipleSources ? <TableHead>Source</TableHead> : null}
            <TableHead>Issue Type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead className="text-right">Affected URLs</TableHead>
            <TableHead className="text-right">Penalty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              className="cursor-pointer"
              key={row.key}
              onClick={() => onSelectIssueType(row.key)}
            >
              {hasMultipleSources ? (
                <TableCell className="whitespace-normal text-muted-foreground">
                  {row.pillarLabel} / {row.bucketLabel}
                </TableCell>
              ) : null}
              <TableCell className="whitespace-normal">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium text-foreground">{row.issueTypeLabel}</span>
                  <span className="line-clamp-2 text-muted-foreground">
                    {row.issueType.details_preview}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <SeverityBadge severity={row.issueType.severity} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.issueType.affected_url_count}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPenalty(row.issueType.final_penalty)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function UrlIssueTable({
  error,
  hasMultipleSources,
  isLoading,
  rows,
  title,
  totalRows,
}: {
  error: string
  hasMultipleSources: boolean
  isLoading: boolean
  rows: MergedIssueUrlRow[]
  title: string
  totalRows: number
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
        <CompileLoader className="text-foreground" size={40} />
        <div className="flex flex-col gap-1">
          <p className="font-medium">Loading affected URLs</p>
          <p className="text-sm text-muted-foreground">Fetching rows for {title}.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return <EmptyMessage message={error} />
  }

  if (!totalRows) {
    return <EmptyMessage message="No affected URLs were returned for the selected issue types." />
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            {hasMultipleSources ? <TableHead>Source</TableHead> : null}
            <TableHead>URL</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.source}-${row.url}-${index}`}>
              {hasMultipleSources ? (
                <TableCell className="whitespace-normal text-muted-foreground">
                  {row.source}
                </TableCell>
              ) : null}
              <TableCell className="max-w-[18rem] whitespace-normal break-all font-medium text-foreground">
                {row.url}
              </TableCell>
              <TableCell>
                <SeverityBadge severity={row.severity} />
              </TableCell>
              <TableCell className="max-w-[18rem] whitespace-normal">{row.message}</TableCell>
              <TableCell className="max-w-[24rem] whitespace-normal text-muted-foreground">
                {row.details}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function TablePagination({
  pageIndex,
  pageSize,
  rowLabel,
  setPageIndex,
  setPageSize,
  totalRows,
}: {
  pageIndex: number
  pageSize: number
  rowLabel: string
  setPageIndex: (value: number) => void
  setPageSize: (value: number) => void
  totalRows: number
}) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))

  return (
    <div className="mt-4 flex justify-end">
      <div className="flex items-center gap-8">
        <div className="hidden items-center gap-2 lg:flex">
          <span className="text-sm font-medium text-muted-foreground">Rows per page</span>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              setPageSize(Number(value))
              setPageIndex(0)
            }}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue placeholder={`${pageSize}`} />
            </SelectTrigger>
            <SelectContent side="top">
              <SelectGroup>
                {[10, 20, 30, 40, 50].map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm font-medium">
          Page {Math.min(pageIndex + 1, pageCount)} of {pageCount}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => setPageIndex(0)}
            disabled={pageIndex === 0}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            className="size-8"
            size="icon"
            onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
            disabled={pageIndex === 0}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            className="size-8"
            size="icon"
            onClick={() => setPageIndex(Math.min(pageCount - 1, pageIndex + 1))}
            disabled={pageIndex >= pageCount - 1}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            className="hidden size-8 lg:flex"
            size="icon"
            onClick={() => setPageIndex(pageCount - 1)}
            disabled={pageIndex >= pageCount - 1}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

function EmptyMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/30 px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  return <Badge variant="outline">{severity || "Unknown"}</Badge>
}

function formatPenalty(value: number) {
  return Number(value.toFixed(2)).toString()
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

function getSelectionLabel(values: string[], fallback: string) {
  if (!values.length) {
    return fallback
  }

  if (values.length === 1) {
    return values[0]
  }

  return `${values.length} selected`
}

function toggleSelection(
  value: string,
  selectedValues: string[],
  setSelectedValues: (values: string[]) => void,
  allowEmpty: boolean
) {
  const isSelected = selectedValues.includes(value)

  if (isSelected) {
    if (!allowEmpty && selectedValues.length === 1) {
      return
    }

    setSelectedValues(selectedValues.filter((item) => item !== value))
    return
  }

  setSelectedValues([...selectedValues, value])
}

async function fetchAllIssueUrls(crawlId: string, issueScope: IssueScope) {
  const pageSize = 100
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  const rows: MergedIssueUrlRow[] = []

  while (offset < total) {
    const response = await clientApiFetch<ScoreBreakdownIssueURLsResponse>(
      `/crawls/${crawlId}/score-breakdown/${issueScope.pillarId}/${issueScope.bucketId}/${issueScope.issueTypeId}/urls?limit=${pageSize}&offset=${offset}`
    )

    total = response.pagination.total
    rows.push(
      ...response.urls.map((row) => ({
        ...row,
        source: `${issueScope.pillarLabel} / ${issueScope.bucketLabel} / ${issueScope.issueTypeLabel}`,
      }))
    )
    offset += response.urls.length

    if (!response.urls.length) {
      break
    }
  }

  return rows
}
