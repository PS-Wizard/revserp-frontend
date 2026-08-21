"use client"

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from "react"
import {
  ArrowUpRightIcon,
  Loader2Icon,
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  ClipboardIcon,
  FileWarningIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useSearchParams } from "react-router"

import { RevbotMarkdown } from "~/components/revbot/revbot-markdown"
import { Button } from "~/components/ui/button"
import { DropdownPillSurface } from "~/components/ui/hover-pill"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Input } from "~/components/ui/input"
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "~/components/ui/menubar"
import { ButtonGroup } from "~/components/ui/button-group"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Popover, PopoverContent } from "~/components/ui/popover"
import { Skeleton } from "~/components/ui/skeleton"
import { Separator } from "~/components/ui/separator"
import { PageEditorSidebar, type CrawlPageLink } from "./page-editor-sidebar"
import { clientApiFetch } from "~/lib/api"
import {
  contentBlocksToMarkdown,
  isValidContentBlocks,
  type ParsedBlock,
} from "./content-blocks-to-markdown"

type CrawlPage = {
  url: string
  title?: string | null
  visible_text?: string | null
  content_blocks?: ParsedBlock[] | null
}

type SelectionAnchor = {
  getBoundingClientRect: () => DOMRect
  getClientRects: () => DOMRectList
}

type EditorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "document"; page: CrawlPage; markdown: string }
  | { status: "legacy" }
  | { status: "error"; message: string }

const LEGACY_MESSAGE =
  "This page does not have a supported extraction. Run a full recrawl, then try again."

function EditorLink({ children, ...props }: ComponentProps<"a">) {
  return (
    <a {...props} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  )
}

function EditorPageSearchInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label="Search crawled pages"
        autoFocus
        className="h-8 border-white/10 bg-white/5 pl-8 text-xs placeholder:text-white/35"
        onChange={(event) => onChange(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="Search pages…"
        value={value}
      />
    </div>
  )
}

function EditorImage({ alt, ...props }: ComponentProps<"img">) {
  return (
    <img
      {...props}
      alt={alt ?? ""}
      className="block h-auto max-h-[50vh] w-auto max-w-[min(100%,36rem)] object-contain"
      loading="lazy"
    />
  )
}

const EDITOR_MARKDOWN_COMPONENTS = { a: EditorLink, img: EditorImage }

const EditableDocument = memo(function EditableDocument({
  editableRef,
  markdown,
  onSelectionChange,
  title,
  showImages,
}: {
  editableRef: RefObject<HTMLDivElement | null>
  markdown: string
  onSelectionChange: () => void
  title: string
  showImages: boolean
}) {
  return (
    <div
      ref={editableRef}
      aria-label="Extracted page content"
      aria-multiline="true"
      className={`page-editor-content outline-none focus:outline-none focus-visible:outline-none ${showImages ? "" : "[&_img]:hidden"}`}
      contentEditable
      onKeyUp={onSelectionChange}
      onPointerUp={onSelectionChange}
      role="textbox"
      spellCheck
      suppressContentEditableWarning
    >
      <p className="mb-8 text-sm text-muted-foreground">Title: {title}</p>
      <RevbotMarkdown components={EDITOR_MARKDOWN_COMPONENTS}>
        {markdown}
      </RevbotMarkdown>
    </div>
  )
})

async function copyText(text: string) {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard API is unavailable")
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.append(textarea)
    textarea.select()
    document.execCommand("copy")
    textarea.remove()
  }
}

export function PageEditor() {
  const [searchParams, setSearchParams] = useSearchParams()
  const editorUrl = searchParams.get("editorUrl")
  const crawlId = searchParams.get("crawl")
  const isOpen = Boolean(editorUrl && crawlId)
  const [state, setState] = useState<EditorState>({ status: "idle" })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [isClosing, setIsClosing] = useState(false)
  const [sidebarPages, setSidebarPages] = useState<CrawlPageLink[]>([])
  const [pageSearch, setPageSearch] = useState("")
  const [showImages, setShowImages] = useState(true)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const editableRef = useRef<HTMLDivElement>(null)
  const selectedRangeRef = useRef<Range | null>(null)
  const [selection, setSelection] = useState<{
    text: string
    anchor: SelectionAnchor
  } | null>(null)
  const [selectionAction, setSelectionAction] = useState<
    "reword" | "fix" | null
  >(null)
  const selectionActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  useEffect(() => {
    return () => {
      if (selectionActionTimerRef.current)
        clearTimeout(selectionActionTimerRef.current)
    }
  }, [])

  const clearSelection = useCallback(() => {
    selectedRangeRef.current = null
    setSelection(null)
  }, [])

  const close = useCallback(() => {
    setIsClosing(true)
    clearSelection()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete("editorUrl")
      return next
    })
  }, [clearSelection, setSearchParams])

  const selectEditorUrl = useCallback(
    (url: string) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.set("editorUrl", url)
        return next
      })
    },
    [setSearchParams]
  )

  useEffect(() => {
    if (!isOpen) setIsClosing(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !editorUrl || !crawlId) return

    const controller = new AbortController()
    setState({ status: "loading" })
    void clientApiFetch<CrawlPage>(
      `/crawls/${encodeURIComponent(crawlId)}/pages/by-url?url=${encodeURIComponent(editorUrl)}`,
      { signal: controller.signal }
    )
      .then((page) => {
        if (!isValidContentBlocks(page.content_blocks)) {
          setState({ status: "legacy" })
          return
        }
        const markdown = contentBlocksToMarkdown(page.content_blocks, page.url)
        setState(
          markdown
            ? { status: "document", markdown, page }
            : { status: "legacy" }
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load this page.",
        })
      })

    return () => controller.abort()
  }, [crawlId, editorUrl, isOpen])

  useEffect(() => {
    if (!isOpen) {
      clearSelection()
      return
    }

    const previousFocus = document.activeElement
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        if (selectedRangeRef.current) clearSelection()
        else close()
        return
      }
      if (event.key !== "Tab") return

      const panel = panelRef.current
      if (!panel) return
      const selector =
        'a[href], button:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
      const toolbar = document.querySelector<HTMLElement>(
        "[data-editor-selection-toolbar]"
      )
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(selector),
        ...(toolbar?.querySelectorAll<HTMLElement>(selector) ?? []),
      ]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const activeIsInside =
        panel.contains(active) || Boolean(toolbar?.contains(active))
      if (event.shiftKey && (active === first || !activeIsInside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("keydown", handleKeyDown, true)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus()
      }
    }
  }, [clearSelection, close, isOpen])

  const updateSelection = useCallback(() => {
    const root = editableRef.current
    const current = window.getSelection()
    if (!root || !current || current.rangeCount === 0 || current.isCollapsed) {
      clearSelection()
      return
    }

    const range = current.getRangeAt(0)
    const text = current.toString()
    if (!root.contains(range.commonAncestorContainer) || !text.trim()) {
      clearSelection()
      return
    }

    const rect = range.getBoundingClientRect()
    selectedRangeRef.current = range.cloneRange()
    setSelection({
      text,
      anchor: {
        getBoundingClientRect: () => rect,
        getClientRects: () => [rect] as unknown as DOMRectList,
      },
    })
  }, [clearSelection])

  const getSelectionRange = useCallback(() => {
    const savedRange = selectedRangeRef.current
    if (savedRange) return savedRange
    const current = window.getSelection()
    if (!current || current.rangeCount === 0) return null
    const range = current.getRangeAt(0)
    return editableRef.current?.contains(range.commonAncestorContainer)
      ? range.cloneRange()
      : null
  }, [])

  const copySelection = useCallback(() => {
    const text = getSelectionRange()?.toString() ?? selection?.text
    if (!text) return
    void copyText(text)
    clearSelection()
  }, [clearSelection, getSelectionRange, selection?.text])

  const deleteSelection = useCallback(() => {
    const range = getSelectionRange()
    if (!range) return
    try {
      range.deleteContents()
      range.collapse(true)
      const current = window.getSelection()
      current?.removeAllRanges()
      current?.addRange(range)
    } catch {
      return
    }
    clearSelection()
  }, [clearSelection, getSelectionRange])

  const runSelectionAction = useCallback(
    (action: "reword" | "fix") => {
      if (selectionAction) return
      setSelectionAction(action)
      selectionActionTimerRef.current = setTimeout(() => {
        setSelectionAction(null)
        selectionActionTimerRef.current = null
      }, 2000)
    },
    [selectionAction]
  )

  const normalizedPageSearch = pageSearch.trim().toLowerCase()
  const visibleSidebarPages = normalizedPageSearch
    ? sidebarPages.filter((page) =>
        `${page.title ?? ""} ${page.url}`
          .toLowerCase()
          .includes(normalizedPageSearch)
      )
    : sidebarPages

  return (
    <>
      <div
        aria-hidden={!isOpen || isClosing}
        className="page-editor-shell fixed inset-3 z-[10000] flex"
        data-open={isOpen && !isClosing}
        inert={!isOpen || isClosing ? true : undefined}
      >
        <section
          ref={panelRef}
          aria-label="Extracted page"
          aria-modal="true"
          className="surface-dialog relative h-full w-full flex-1 overflow-hidden rounded-xl border border-border text-foreground"
          role="dialog"
        >
          <div className="flex h-full w-full flex-col">
            <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-2">
              <a
                className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                href={editorUrl ?? undefined}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open link
                <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
              </a>
              <DropdownMenu
                onOpenChange={(open) => {
                  if (!open) setPageSearch("")
                }}
              >
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label="Switch crawled page"
                      className="flex max-w-[min(50vw,32rem)] min-w-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-foreground hover:bg-white/10 data-[popup-open]:bg-white/10"
                      title={
                        state.status === "document"
                          ? state.page.title || state.page.url
                          : editorUrl || "Extracted page"
                      }
                      type="button"
                    />
                  }
                >
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {state.status === "document"
                      ? state.page.title || state.page.url
                      : editorUrl || "Extracted page"}
                  </span>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 data-[popup-open]:rotate-180"
                  />
                </DropdownMenuTrigger>
                <DropdownPillSurface
                  align="center"
                  className="max-h-80 w-72"
                  pillClassName="bg-white/10"
                  positionerClassName="z-[10010]"
                  side="bottom"
                >
                  {(pill) => (
                    <>
                      <div
                        className="surface-dialog sticky top-0 z-10 p-1.5 pb-2"
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <EditorPageSearchInput
                          onChange={setPageSearch}
                          value={pageSearch}
                        />
                      </div>
                      {visibleSidebarPages.length ? (
                        visibleSidebarPages.map((page, index) => (
                          <DropdownMenuItem
                            key={page.url}
                            {...pill.getItemProps(index)}
                            onClick={() => selectEditorUrl(page.url)}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {page.title?.trim() || page.url}
                            </span>
                            {page.url === editorUrl ? (
                              <CheckIcon
                                aria-hidden="true"
                                className="size-4 shrink-0"
                              />
                            ) : null}
                          </DropdownMenuItem>
                        ))
                      ) : (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                          {sidebarPages.length
                            ? "No matching pages."
                            : "No crawled pages loaded."}
                        </p>
                      )}
                    </>
                  )}
                </DropdownPillSurface>
              </DropdownMenu>
              <Button
                className="justify-self-end"
                ref={closeButtonRef}
                aria-label="Close page"
                onClick={close}
                size="icon"
                variant="ghost"
              >
                <XIcon aria-hidden="true" />
              </Button>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-2 p-2">
              {isOpen && crawlId && editorUrl ? (
                <PageEditorSidebar
                  collapsed={sidebarCollapsed}
                  currentUrl={editorUrl}
                  crawlId={crawlId}
                  onCollapsedChange={setSidebarCollapsed}
                  onSelectUrl={selectEditorUrl}
                  onPagesChange={setSidebarPages}
                />
              ) : null}
              <div
                className="min-h-0 min-w-0 overflow-y-auto px-6 pt-8 pb-8"
                onPointerDown={clearSelection}
                onScroll={clearSelection}
              >
                <div className="mx-auto w-full max-w-[1200px]">
                  {state.status === "loading" || state.status === "idle" ? (
                    <div
                      aria-label="Loading page"
                      className="flex flex-col gap-5"
                      role="status"
                    >
                      <Skeleton className="h-10 w-3/4" />
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-11/12" />
                      <Skeleton className="h-5 w-4/5" />
                      <Skeleton className="mt-4 h-32 w-full" />
                    </div>
                  ) : state.status === "error" ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FileWarningIcon aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>Could not load this page</EmptyTitle>
                        <EmptyDescription>{state.message}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : state.status === "legacy" ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FileWarningIcon aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>Unsupported page extraction</EmptyTitle>
                        <EmptyDescription>{LEGACY_MESSAGE}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : state.status === "document" ? (
                    <>
                      <Menubar
                        className="mb-6 w-full"
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <MenubarMenu>
                          <MenubarTrigger>File</MenubarTrigger>
                          <MenubarContent positionerClassName="z-[10010]">
                            <MenubarGroup>
                              <MenubarItem
                                onClick={() =>
                                  window.open(
                                    state.page.url,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                              >
                                Open original
                                <MenubarShortcut>↗</MenubarShortcut>
                              </MenubarItem>
                              <MenubarItem disabled>Save draft</MenubarItem>
                            </MenubarGroup>
                            <MenubarSeparator />
                            <MenubarGroup>
                              <MenubarItem onClick={close}>
                                Close editor
                              </MenubarItem>
                            </MenubarGroup>
                          </MenubarContent>
                        </MenubarMenu>
                        <Separator orientation="vertical" />
                        <MenubarMenu>
                          <MenubarTrigger>Edit</MenubarTrigger>
                          <MenubarContent positionerClassName="z-[10010]">
                            <MenubarGroup>
                              <MenubarItem disabled>
                                Undo
                                <MenubarShortcut>⌘Z</MenubarShortcut>
                              </MenubarItem>
                              <MenubarItem disabled>
                                Redo
                                <MenubarShortcut>⇧⌘Z</MenubarShortcut>
                              </MenubarItem>
                            </MenubarGroup>
                            <MenubarSeparator />
                            <MenubarGroup>
                              <MenubarItem disabled>Cut</MenubarItem>
                              <MenubarItem disabled>Copy</MenubarItem>
                              <MenubarItem disabled>Paste</MenubarItem>
                            </MenubarGroup>
                          </MenubarContent>
                        </MenubarMenu>
                        <Separator orientation="vertical" />
                        <MenubarMenu>
                          <MenubarTrigger>View</MenubarTrigger>
                          <MenubarContent positionerClassName="z-[10010]">
                            <MenubarGroup>
                              <MenubarCheckboxItem
                                checked={showImages}
                                onCheckedChange={setShowImages}
                              >
                                Show images
                              </MenubarCheckboxItem>
                              <MenubarCheckboxItem
                                checked={!sidebarCollapsed}
                                onCheckedChange={(checked) =>
                                  setSidebarCollapsed(!checked)
                                }
                              >
                                Show crawled pages
                              </MenubarCheckboxItem>
                            </MenubarGroup>
                          </MenubarContent>
                        </MenubarMenu>
                        <Separator className="ml-auto" orientation="vertical" />
                        <MenubarMenu>
                          <MenubarTrigger>Rewrite</MenubarTrigger>
                          <MenubarContent
                            align="end"
                            positionerClassName="z-[10010]"
                          >
                            <MenubarGroup>
                              <MenubarItem
                                disabled={
                                  !selection || Boolean(selectionAction)
                                }
                                onClick={() => runSelectionAction("reword")}
                              >
                                Reword selection
                              </MenubarItem>
                              <MenubarItem
                                disabled={Boolean(selectionAction)}
                                onClick={() => runSelectionAction("fix")}
                              >
                                Fix page
                              </MenubarItem>
                            </MenubarGroup>
                          </MenubarContent>
                        </MenubarMenu>
                      </Menubar>
                      <EditableDocument
                        editableRef={editableRef}
                        markdown={state.markdown}
                        onSelectionChange={updateSelection}
                        showImages={showImages}
                        title={state.page.title || state.page.url}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Popover
        onOpenChange={(open) => {
          if (!open && !selectedRangeRef.current) clearSelection()
        }}
        open={Boolean(selection)}
      >
        <PopoverContent
          anchor={selection?.anchor ?? null}
          className="w-auto p-1"
          data-editor-selection-toolbar
          positionerClassName="z-[10010]"
          side="top"
          sideOffset={8}
        >
          <ButtonGroup
            aria-label="Selected text actions"
            onPointerDown={(event) => event.preventDefault()}
          >
            <Button
              disabled={Boolean(selectionAction)}
              onClick={copySelection}
              size="sm"
              variant="ghost"
            >
              <ClipboardIcon aria-hidden="true" data-icon="inline-start" />
              Copy
            </Button>
            <Button
              disabled={Boolean(selectionAction)}
              onClick={deleteSelection}
              size="sm"
              variant="ghost"
            >
              <Trash2Icon aria-hidden="true" data-icon="inline-start" />
              Delete
            </Button>
            <Button
              disabled={Boolean(selectionAction)}
              onClick={() => runSelectionAction("reword")}
              size="sm"
              variant="ghost"
            >
              {selectionAction === "reword" ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : null}
              Reword
            </Button>
            <Button
              disabled={Boolean(selectionAction)}
              onClick={() => runSelectionAction("fix")}
              size="sm"
              variant="ghost"
            >
              {selectionAction === "fix" ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : null}
              Fix Page
            </Button>
          </ButtonGroup>
        </PopoverContent>
      </Popover>
    </>
  )
}
