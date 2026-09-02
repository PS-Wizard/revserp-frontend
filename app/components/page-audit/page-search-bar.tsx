"use client"

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react"

import {
  useCrawlPageSearch,
  PAGE_SEARCH_PAGE_SIZE,
} from "~/components/page-audit/use-page-audit-queries"
import type { SelectedAuditPage } from "~/components/page-audit/page-audit-context"
import { Input } from "~/components/ui/input"
import { Button } from "~/components/ui/button"
import type { CrawlPageSearchResultPage } from "~/lib/api.types"
import { cn } from "~/lib/utils"

function pagePrimaryLine(page: CrawlPageSearchResultPage) {
  if (page.title?.trim()) return page.title.trim()
  try {
    const parsed = new URL(page.url)
    const path = `${parsed.pathname}${parsed.search}`
    return path === "/" ? parsed.hostname : path
  } catch {
    return page.url
  }
}

function pageSecondaryLine(page: CrawlPageSearchResultPage) {
  if (!page.title?.trim()) return null
  try {
    const parsed = new URL(page.url)
    const path = `${parsed.pathname}${parsed.search}`
    return path === "/" ? parsed.hostname : `${parsed.hostname}${path}`
  } catch {
    return page.url
  }
}

export const PageSearchBar = memo(function PageSearchBar({
  crawlId,
  disabled,
  selectedPage,
  onSelectPage,
  onClearPage,
}: {
  crawlId: string | null
  disabled?: boolean
  selectedPage: SelectedAuditPage | null
  onSelectPage: (page: SelectedAuditPage) => void
  onClearPage: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const searchQuery = useCrawlPageSearch(crawlId, query, open && !selectedPage)

  const pages = useMemo(
    () => searchQuery.data?.pages.flatMap((page) => page.pages) ?? [],
    [searchQuery.data]
  )

  const total = searchQuery.data?.pages[0]?.pagination.total ?? 0

  useEffect(() => {
    if (!open || selectedPage) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open, selectedPage])

  useEffect(() => {
    if (!open || selectedPage) return
    const node = loadMoreRef.current
    const root = listRef.current
    if (!node || !root) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          searchQuery.hasNextPage &&
          !searchQuery.isFetchingNextPage
        ) {
          void searchQuery.fetchNextPage()
        }
      },
      { root, rootMargin: "120px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [
    open,
    searchQuery.fetchNextPage,
    searchQuery.hasNextPage,
    searchQuery.isFetchingNextPage,
    selectedPage,
  ])

  const handleSelect = useCallback(
    (page: CrawlPageSearchResultPage) => {
      onSelectPage({
        id: page.id,
        url: page.url,
        title: page.title,
      })
      setQuery("")
      setOpen(false)
      inputRef.current?.blur()
    },
    [onSelectPage]
  )

  const handleClear = useCallback(() => {
    onClearPage()
    setQuery("")
    setOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [onClearPage])

  const displayValue = selectedPage
    ? selectedPage.title?.trim() || selectedPage.url
    : query

  return (
    <div ref={rootRef} className="relative mx-auto w-full min-w-0 max-w-md">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        aria-autocomplete="list"
        aria-controls={open ? "page-search-results" : undefined}
        aria-expanded={open}
        aria-label="Search pages"
        autoComplete="off"
        className={cn(
          "h-9 w-full bg-background pl-9 text-sm",
          selectedPage ? "pr-9" : "pr-3"
        )}
        disabled={disabled}
        onChange={(event) => {
          if (selectedPage) return
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (!selectedPage && !disabled) setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
          }
        }}
        placeholder="Search pages…"
        readOnly={Boolean(selectedPage)}
        role="combobox"
        value={displayValue}
      />
      {selectedPage ? (
        <Button
          aria-label="Clear selected page"
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
          onClick={handleClear}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </Button>
      ) : null}

      {open && !disabled && !selectedPage ? (
        <div
          id="page-search-results"
          className="surface-dialog absolute top-[calc(100%+6px)] z-50 w-full min-w-[18rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          role="listbox"
        >
          <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
            {searchQuery.isLoading && !pages.length ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                <Loader2Icon
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
                Searching…
              </div>
            ) : null}
            {!searchQuery.isLoading && !pages.length ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No pages found.
              </div>
            ) : null}
            {pages.map((page) => {
              const primary = pagePrimaryLine(page)
              const secondary = pageSecondaryLine(page)
              return (
                <button
                  key={page.id}
                  className="w-full min-w-0 rounded-md px-2.5 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(page)}
                  role="option"
                  title={page.url}
                  type="button"
                >
                  <span className="block truncate text-[13px] leading-5 font-medium text-foreground">
                    {primary}
                  </span>
                  {secondary ? (
                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground">
                      {secondary}
                    </span>
                  ) : null}
                </button>
              )
            })}
            <div ref={loadMoreRef} className="h-1" />
            {searchQuery.isFetchingNextPage ? (
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2Icon
                  aria-hidden="true"
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                />
                Loading more…
              </div>
            ) : null}
            {total > PAGE_SEARCH_PAGE_SIZE && pages.length > 0 ? (
              <div className="border-t border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
                {pages.length.toLocaleString()} of {total.toLocaleString()}{" "}
                pages
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
})
