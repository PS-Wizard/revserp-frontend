"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { Editor } from "@tiptap/core"
import { MessageSquareTextIcon, PencilIcon, TrashIcon, XIcon } from "lucide-react"

import { cn } from "~/lib/utils"
import { getLiveDraftCommentRanges, type DraftComment } from "./content-comments"

const CARD_GAP = 8
const ESTIMATED_CARD_HEIGHT = 118
const MARKER_GAP = 36

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return reduced
}

function stackTops(
  sorted: Array<{ id: string; top: number }>,
  minGap: number,
  heights: Map<string, number>,
  fallback: number
) {
  const placed = new Map<string, number>()
  let cursor = -Infinity
  for (const item of sorted) {
    const y = Math.max(item.top, cursor + minGap)
    placed.set(item.id, y)
    cursor = y + (heights.get(item.id) ?? fallback)
  }
  return placed
}

function CommentCard({
  comment,
  active,
  onHover,
  onEdit,
  onDelete,
  onClose,
  registerRef,
}: {
  comment: DraftComment
  active: boolean
  onHover: (id: string | null) => void
  onEdit: (id: string, note: string) => void
  onDelete: (id: string) => void
  onClose?: () => void
  registerRef?: (id: string, element: HTMLDivElement | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.note)

  useEffect(() => {
    if (!editing) setDraft(comment.note)
  }, [comment.note, editing])

  const save = () => {
    const text = draft.trim()
    if (text && text !== comment.note) onEdit(comment.id, text)
    setEditing(false)
  }

  return (
    <div
      ref={registerRef ? (el) => registerRef(comment.id, el) : undefined}
      tabIndex={-1}
      onMouseEnter={() => onHover(comment.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(comment.id)}
      onBlur={() => onHover(null)}
      className={cn(
        "draft-comment-card group w-full rounded-xl border p-3 text-left shadow-sm surface-dialog",
        active ? "border-amber-300/50" : "border-border"
      )}
    >
      <div className="flex items-start gap-2">
        <MessageSquareTextIcon
          aria-hidden="true"
          className="mt-0.5 size-3.5 shrink-0 text-amber-500/90"
        />
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          “{comment.snippet}”
        </p>
        {onClose ? (
          <button
            aria-label="Close comment"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <XIcon aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <textarea
            autoFocus
            aria-label="Edit comment"
            className="max-h-28 min-h-14 w-full resize-none rounded-lg bg-accent/50 px-2 py-1.5 text-[13px] leading-relaxed outline-none"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                save()
              } else if (event.key === "Escape") {
                event.preventDefault()
                setEditing(false)
                setDraft(comment.note)
              }
            }}
            rows={2}
            value={draft}
          />
          <div className="flex justify-end gap-1">
            <button
              className="h-7 rounded-full px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                setEditing(false)
                setDraft(comment.note)
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-7 rounded-full bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              disabled={!draft.trim()}
              onClick={save}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 line-clamp-4 text-[13px] leading-relaxed">
          {comment.note}
        </p>
      )}
      {!editing ? (
        <div className="mt-1 flex justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            aria-label={`Edit comment: ${comment.note}`}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setEditing(true)}
            type="button"
          >
            <PencilIcon aria-hidden="true" className="size-3.5" />
          </button>
          <button
            aria-label={`Delete comment: ${comment.note}`}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
            onClick={() => onDelete(comment.id)}
            type="button"
          >
            <TrashIcon aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Document grid with a right-margin comment layer. Wide containers get
 * stacked cards in a gutter; narrow containers get margin markers that open
 * the same card in a popover. Anchor positions come from the live decoration
 * ranges (never stored).
 */
export function CommentLayer({
  editor,
  comments,
  activeId,
  focusRequest,
  docKey,
  onHover,
  onSelect,
  onEdit,
  onDelete,
  children,
}: {
  editor: Editor | null
  comments: DraftComment[]
  activeId: string | null
  focusRequest: { id: string; nonce: number } | null
  docKey: string | number
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onEdit: (id: string, note: string) => void
  onDelete: (id: string) => void
  children: ReactNode
}) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<HTMLDivElement>(null)
  const cardHeights = useRef(new Map<string, number>())
  const cardRefs = useRef(new Map<string, HTMLDivElement | null>())
  const reducedMotion = usePrefersReducedMotion()
  const [tick, setTick] = useState(0)
  const [gutterTops, setGutterTops] = useState<Map<string, number>>(new Map())
  const [markerTops, setMarkerTops] = useState<Map<string, number>>(new Map())
  const [heightsTick, setHeightsTick] = useState(0)
  const [openMarkerId, setOpenMarkerId] = useState<string | null>(null)

  useEffect(() => {
    if (!editor) return
    const onTransaction = () => setTick((value) => value + 1)
    editor.on("transaction", onTransaction)
    return () => {
      editor.off("transaction", onTransaction)
    }
  }, [editor])

  useLayoutEffect(() => {
    if (!editor || comments.length === 0) {
      setGutterTops(new Map())
      setMarkerTops(new Map())
      return
    }
    const gutter = gutterRef.current
    const markers = markersRef.current
    if (!gutter || !markers) return
    const live = getLiveDraftCommentRanges(editor)
    const gutterTop = gutter.getBoundingClientRect().top
    const markersTop = markers.getBoundingClientRect().top

    const raw = comments.flatMap((comment) => {
      const range = live.get(comment.id)
      if (!range) return []
      try {
        const coords = editor.view.coordsAtPos(range.from)
        return [
          {
            id: comment.id,
            gutterY: coords.top - gutterTop - 12,
            markerY: coords.top - markersTop - 16,
          },
        ]
      } catch {
        return []
      }
    })

    setGutterTops(
      stackTops(
        raw
          .map((item) => ({ id: item.id, top: item.gutterY }))
          .sort((a, b) => a.top - b.top),
        CARD_GAP,
        cardHeights.current,
        ESTIMATED_CARD_HEIGHT
      )
    )
    setMarkerTops(
      stackTops(
        raw
          .map((item) => ({ id: item.id, top: item.markerY }))
          .sort((a, b) => a.top - b.top),
        MARKER_GAP,
        new Map(),
        MARKER_GAP
      )
    )

    // Second pass once real card heights are measured.
    let changed = false
    for (const element of cardRefs.current.values()) {
      if (!element) continue
      const id = element.dataset.commentCard
      if (!id) continue
      const height = element.offsetHeight
      if (height > 0 && cardHeights.current.get(id) !== height) {
        cardHeights.current.set(id, height)
        changed = true
      }
    }
    if (changed) setHeightsTick((value) => value + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, comments, tick, docKey, heightsTick])

  useEffect(() => {
    if (!focusRequest) return
    const element = cardRefs.current.get(focusRequest.id)
    element?.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    })
    element?.focus({ preventScroll: true })
  }, [focusRequest, reducedMotion, gutterTops])

  useEffect(() => {
    if (openMarkerId && !comments.some((c) => c.id === openMarkerId)) {
      setOpenMarkerId(null)
    }
  }, [comments, openMarkerId])

  const registerRef = (id: string, element: HTMLDivElement | null) => {
    if (element) {
      element.dataset.commentCard = id
      cardRefs.current.set(id, element)
    } else {
      cardRefs.current.delete(id)
    }
  }

  return (
    <div className="draft-doc-grid">
      <article className="draft-doc-article">
        {children}
        <div
          ref={markersRef}
          className="draft-markers"
          aria-hidden={comments.length === 0}
        >
          {comments.map((comment) => {
            const y = markerTops.get(comment.id)
            if (y === undefined) return null
            const open = openMarkerId === comment.id
            return (
              <div
                key={comment.id}
                className="draft-marker-slot"
                style={{ transform: `translate3d(0, ${Math.max(y, 0)}px, 0)` }}
              >
                <button
                  aria-label={`Open comment: ${comment.note}`}
                  aria-expanded={open}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full transition-colors",
                    activeId === comment.id
                      ? "text-amber-500"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    onSelect(comment.id)
                    setOpenMarkerId(open ? null : comment.id)
                  }}
                  onMouseEnter={() => onHover(comment.id)}
                  onMouseLeave={() => onHover(null)}
                  type="button"
                >
                  <span
                    className={cn(
                      "size-2 rounded-full transition-transform duration-150",
                      activeId === comment.id
                        ? "scale-125 bg-amber-400"
                        : "bg-amber-400/60"
                    )}
                  />
                </button>
                {open ? (
                  <>
                    <button
                      aria-label="Close comment"
                      className="fixed inset-0 z-30 cursor-default bg-transparent"
                      onClick={() => setOpenMarkerId(null)}
                      type="button"
                    />
                    <div className="draft-float-in absolute top-8 right-0 z-40 w-64">
                      <CommentCard
                        comment={comment}
                        active
                        onHover={onHover}
                        onEdit={onEdit}
                        onDelete={(id) => {
                          setOpenMarkerId(null)
                          onDelete(id)
                        }}
                        onClose={() => setOpenMarkerId(null)}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      </article>
      <div
        ref={gutterRef}
        className="draft-gutter"
        aria-hidden={comments.length === 0}
      >
        {comments.map((comment) => {
          const y = gutterTops.get(comment.id)
          if (y === undefined) return null
          return (
            <div
              key={comment.id}
              className="draft-comment-card-slot"
              style={{ transform: `translate3d(0, ${Math.max(y, 0)}px, 0)` }}
            >
              <CommentCard
                comment={comment}
                active={activeId === comment.id}
                onHover={onHover}
                onEdit={onEdit}
                onDelete={onDelete}
                registerRef={registerRef}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
