import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

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
