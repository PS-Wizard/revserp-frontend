import { Fragment } from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronDownIcon,
  ListFilterIcon,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

type IssueTypeOption = {
  id: string
  label: string
  severity: string
  affected_url_count: number
}

// Severity is the natural grouping for issue types; order groups worst-first
// and push unknown/blank severities to the end under an "Other" heading.
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]

function severityRank(severity: string) {
  const index = SEVERITY_ORDER.indexOf(severity.toLowerCase())
  return index === -1 ? SEVERITY_ORDER.length : index
}

function severityLabel(severity: string) {
  if (!severity) return "Other"
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase()
}

function groupBySeverity(issueTypes: IssueTypeOption[]) {
  const groups = new Map<string, IssueTypeOption[]>()
  for (const issueType of issueTypes) {
    const key = issueType.severity?.toLowerCase() || ""
    const existing = groups.get(key)
    if (existing) existing.push(issueType)
    else groups.set(key, [issueType])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => severityRank(a) - severityRank(b))
    .map(([severity, items]) => ({
      severity,
      label: severityLabel(severity),
      items: [...items].sort(
        (left, right) => right.affected_url_count - left.affected_url_count
      ),
    }))
}

/**
 * Grouped multi-select filter for the issue types within a drilled bucket.
 * Options are grouped by severity; toggling checkboxes scopes the URL table to
 * the selected types (empty selection = all). Rendered only when the bucket has
 * more than one issue type.
 */
export function IssueTypeFilter({
  issueTypes,
  selected,
  onChange,
}: {
  issueTypes: IssueTypeOption[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  if (issueTypes.length <= 1) return null

  const selectedSet = new Set(selected)
  const activeCount = selected.length
  const groups = groupBySeverity(issueTypes)
  const toggle = (id: string) =>
    onChange(
      selectedSet.has(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id]
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="sm" variant="outline" />}
        className="gap-1.5"
      >
        <ListFilterIcon className="size-4" />
        Issue type
        {activeCount > 0 ? (
          <Badge
            variant="secondary"
            className="ml-0.5 h-5 min-w-5 justify-center rounded-full px-1 tabular-nums"
          >
            {activeCount}
          </Badge>
        ) : null}
        <ChevronDownIcon className="size-4 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-72">
        <DropdownMenuItem
          disabled={activeCount === 0}
          onClick={() => onChange([])}
        >
          Clear filter
          <span className="ml-auto text-xs text-muted-foreground">
            {issueTypes.length} types
          </span>
        </DropdownMenuItem>
        {groups.map((group) => (
          <Fragment key={group.severity || "other"}>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {group.items.map((issueType) => (
                <DropdownMenuCheckboxItem
                  key={issueType.id}
                  checked={selectedSet.has(issueType.id)}
                  onCheckedChange={() => toggle(issueType.id)}
                >
                  <span className="truncate" title={issueType.label}>
                    {issueType.label}
                  </span>
                  <span className="ml-auto pl-2 text-xs text-muted-foreground tabular-nums">
                    {issueType.affected_url_count}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type TablePaginationProps = {
  pageIndex: number
  pageSize: number
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
    <div className="flex items-center gap-8">
      <div className="hidden items-center gap-2 lg:flex">
        <span className="text-sm font-medium text-muted-foreground">
          Rows per page
        </span>
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
  )
}
