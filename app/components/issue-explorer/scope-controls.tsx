import { useMemo, useState } from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb"
import { Button } from "~/components/ui/button"
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

import type { BucketScope, IssueScope } from "./types"
import { getSelectionLabel, toggleSelection } from "./utils"

type ScopeBreadcrumbsProps = {
  availableBucketScopes: BucketScope[]
  availableIssueScopes: IssueScope[]
  pillarOptions: Array<{ id: string; label: string }>
  selectedBucketKeys: string[]
  selectedIssueTypeKeys: string[]
  selectedPillarIds: string[]
  selectedPillarLabels: string[]
  setSelectedBucketKeys: (values: string[]) => void
  setSelectedIssueTypeKeys: (values: string[]) => void
  setSelectedPillarIds: (values: string[]) => void
}

export function ScopeBreadcrumbs({
  availableBucketScopes,
  availableIssueScopes,
  pillarOptions,
  selectedBucketKeys,
  selectedIssueTypeKeys,
  selectedPillarIds,
  selectedPillarLabels,
  setSelectedBucketKeys,
  setSelectedIssueTypeKeys,
  setSelectedPillarIds,
}: ScopeBreadcrumbsProps) {
  return (
    <div className="inline-flex flex-col rounded-lg border border-foreground/20 bg-muted/95 p-[3px] shadow-2xl shadow-black/40 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-1 rounded-md px-1.5 py-1">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <ScopeMultiMenu
                label={getSelectionLabel(selectedPillarLabels, "Select pillars")}
                options={pillarOptions.map((pillar) => ({ value: pillar.id, label: pillar.label }))}
                selectedValues={selectedPillarIds}
                title="Pillars"
                onToggle={(value) => toggleSelection(value, selectedPillarIds, setSelectedPillarIds, false)}
              />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <ScopeMultiMenu
                label={getSelectionLabel(
                  getSelectedBucketLabels(availableBucketScopes, selectedBucketKeys),
                  "Select buckets"
                )}
                multiSelect={true}
                onToggleAll={(values) => setSelectedBucketKeys(values)}
                options={availableBucketScopes.map((bucketScope) => ({
                  value: bucketScope.key,
                  label: `${bucketScope.pillarLabel} / ${bucketScope.bucketLabel}`,
                }))}
                selectedValues={selectedBucketKeys}
                title="Buckets"
                onToggle={(value) => toggleSelection(value, selectedBucketKeys, setSelectedBucketKeys, false)}
              />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <ScopeMultiMenu
                label={getSelectionLabel(
                  getSelectedIssueTypeLabels(availableIssueScopes, selectedIssueTypeKeys),
                  "Issue Types"
                )}
                multiSelect={true}
                onToggleAll={(values) => setSelectedIssueTypeKeys(values)}
                options={availableIssueScopes.map((issueScope) => ({
                  value: issueScope.key,
                  label: `${issueScope.bucketLabel} / ${issueScope.issueTypeLabel}`,
                }))}
                selectedValues={selectedIssueTypeKeys}
                title="Issue types"
                onToggle={(value) => toggleSelection(value, selectedIssueTypeKeys, setSelectedIssueTypeKeys, true)}
              />
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  )
}

type ScopeMultiMenuProps = {
  label: string
  onToggle: (value: string) => void
  onToggleAll?: (allValues: string[]) => void
  options: Array<{ value: string; label: string }>
  selectedValues: string[]
  title: string
  multiSelect?: boolean
}

function ScopeMultiMenu({ label, onToggle, onToggleAll, options, selectedValues, title, multiSelect }: ScopeMultiMenuProps) {
  const [query, setQuery] = useState("")
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return options
    }

    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
  }, [options, query])
  const allSelected = options.length > 0 && options.every((opt) => selectedValues.includes(opt.value))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="h-7 rounded-md bg-transparent px-1.5 text-foreground hover:bg-background/80"
            size="xs"
            variant="ghost"
          />
        }
      >
        {label}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{title}</DropdownMenuLabel>
          <div className="px-1 pb-1">
            <Input
              className="h-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              value={query}
            />
          </div>
          {multiSelect && options.length > 0 && (
            <div className="border-b border-border/40 px-2 py-1.5">
              <button
                className="w-full text-left text-sm font-medium text-primary hover:underline"
                onClick={() =>
                  onToggleAll?.(allSelected ? [] : options.map((o) => o.value))
                }
              >
                {allSelected ? "Unselect all" : "Select all"}
              </button>
            </div>
          )}
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

type TablePaginationProps = {
  pageIndex: number
  pageSize: number
  rowLabel: string
  setPageIndex: (value: number) => void
  setPageSize: (value: number) => void
  totalRows: number
}

export function TablePagination({
  pageIndex,
  pageSize,
  setPageIndex,
  setPageSize,
  totalRows,
}: TablePaginationProps) {
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
            <SelectTrigger className="w-20" size="sm">
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
            className="hidden h-8 w-8 p-0 lg:flex"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex(0)}
            variant="outline"
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeftIcon />
          </Button>
          <Button
            className="size-8"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeftIcon />
          </Button>
          <Button
            className="size-8"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => setPageIndex(Math.min(pageCount - 1, pageIndex + 1))}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRightIcon />
          </Button>
          <Button
            className="hidden size-8 lg:flex"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => setPageIndex(pageCount - 1)}
            size="icon"
            variant="outline"
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

function getSelectedBucketLabels(bucketScopes: BucketScope[], selectedBucketKeys: string[]) {
  const labels: string[] = []
  const selectedBucketKeySet = new Set(selectedBucketKeys)

  for (const bucketScope of bucketScopes) {
    if (selectedBucketKeySet.has(bucketScope.key)) {
      labels.push(bucketScope.bucketLabel)
    }
  }

  return labels
}

function getSelectedIssueTypeLabels(issueScopes: IssueScope[], selectedIssueTypeKeys: string[]) {
  const labels: string[] = []
  const selectedIssueTypeKeySet = new Set(selectedIssueTypeKeys)

  for (const issueScope of issueScopes) {
    if (selectedIssueTypeKeySet.has(issueScope.key)) {
      labels.push(issueScope.issueTypeLabel)
    }
  }

  return labels
}
