"use client"

import { useEffect, useRef, useState } from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Markdown } from "@tiptap/markdown"
import { MessageSquareTextIcon, TextQuoteIcon } from "lucide-react"

import { quoteSelectionToMarkdown } from "./content-quote"
import {
  DraftCommentHighlight,
  getLiveDraftCommentRanges,
  updateDraftCommentDecorations,
  type DraftCommentRange,
} from "./content-comments"

export type ContentEditorExternalBody = {
  markdown: string
  nonce: number
}

export type CommentAnchor = {
  from: number
  to: number
  snippet: string
}

type FloatAnchor = CommentAnchor & {
  top: number
  bottom: number
  centerX: number
  /** Whether the toolbar fits above the selection inside the scroller. */
  roomAbove: boolean
}

const TOOLBAR_WIDTH = 300
const TOOLBAR_HEIGHT = 40
const FLOAT_GAP = 8

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Tiptap document editor for content drafts. Markdown in, markdown out
 * (via @tiptap/markdown); the parent owns persistence and remote sync.
 * Comment highlights are ProseMirror decorations — never document content.
 */
export function ContentEditor({
  readOnly,
  placeholder = "Start writing, or ask Revbot on the left…",
  externalBody,
  onBodyChange,
  onAskSelection,
  onReady,
  commentRanges,
  commentActiveId,
  onAddComment,
  onCommentHighlightClick,
  onCommentHighlightHover,
  onCommentAnchorsLost,
}: {
  readOnly: boolean
  placeholder?: string
  /** Bump nonce to replace the document (remote draft update). */
  externalBody: ContentEditorExternalBody | null
  onBodyChange: (markdown: string) => void
  onAskSelection: (quotedMarkdown: string) => void
  onReady?: (editor: Editor | null) => void
  commentRanges: DraftCommentRange[]
  commentActiveId: string | null
  onAddComment: (anchor: CommentAnchor, note: string) => void
  onCommentHighlightClick: (id: string) => void
  onCommentHighlightHover: (id: string | null) => void
  onCommentAnchorsLost: (ids: string[]) => void
}) {
  const onBodyChangeRef = useRef(onBodyChange)
  const onAskSelectionRef = useRef(onAskSelection)
  const onAddCommentRef = useRef(onAddComment)
  const onHighlightClickRef = useRef(onCommentHighlightClick)
  const onHighlightHoverRef = useRef(onCommentHighlightHover)
  const onAnchorsLostRef = useRef(onCommentAnchorsLost)
  const commentRangesRef = useRef(commentRanges)
  const prevCommentIdsRef = useRef<string[]>([])
  const appliedExternalRef = useRef<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [toolbar, setToolbar] = useState<FloatAnchor | null>(null)
  const [composer, setComposer] = useState<FloatAnchor | null>(null)
  const [note, setNote] = useState("")

  useEffect(() => {
    onBodyChangeRef.current = onBodyChange
  }, [onBodyChange])
  useEffect(() => {
    onAskSelectionRef.current = onAskSelection
  }, [onAskSelection])
  useEffect(() => {
    onAddCommentRef.current = onAddComment
  }, [onAddComment])
  useEffect(() => {
    onHighlightClickRef.current = onCommentHighlightClick
  }, [onCommentHighlightClick])
  useEffect(() => {
    onHighlightHoverRef.current = onCommentHighlightHover
  }, [onCommentHighlightHover])
  useEffect(() => {
    onAnchorsLostRef.current = onCommentAnchorsLost
  }, [onCommentAnchorsLost])
  useEffect(() => {
    commentRangesRef.current = commentRanges
  }, [commentRanges])

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
        }),
        Placeholder.configure({ placeholder }),
        Markdown,
        DraftCommentHighlight,
      ],
      content: "",
      contentType: "markdown",
      editable: !readOnly,
      editorProps: {
        attributes: {
          class: "content-editor-tiptap",
        },
        handleClick: (_view, _pos, event) => {
          const target = event.target as HTMLElement | null
          const mark = target?.closest?.("[data-comment-id]")
          const id = mark?.getAttribute("data-comment-id")
          if (id) onHighlightClickRef.current(id)
          return false
        },
      },
      onUpdate: ({ editor: next }) => {
        onBodyChangeRef.current(next.getMarkdown())
      },
      onTransaction: ({ editor: next }) => {
        // Ranges deleted by edits lose their decoration — report them so
        // React state drops the orphaned comments.
        const live = getLiveDraftCommentRanges(next)
        const missing = commentRangesRef.current
          .map((range) => range.id)
          .filter((id) => !live.has(id))
        if (missing.length > 0) onAnchorsLostRef.current(missing)

        if (!next.isEditable) {
          setToolbar(null)
          return
        }
        const { from, to, empty } = next.state.selection
        if (empty) {
          setToolbar(null)
          return
        }
        const text = next.state.doc.textBetween(from, to, "\n")
        if (!quoteSelectionToMarkdown(text)) {
          setToolbar(null)
          return
        }
        try {
          const start = next.view.coordsAtPos(from)
          const end = next.view.coordsAtPos(to)
          const box = wrapperRef.current?.getBoundingClientRect()
          if (!box) {
            setToolbar(null)
            return
          }
          const scroller = wrapperRef.current?.closest(".draft-doc-scroll")
          const viewportTop = Math.max(
            scroller?.getBoundingClientRect().top ?? 0,
            0
          )
          // Container-relative coords: the floats are absolutely positioned
          // inside the wrapper, so they scroll with the doc.
          setToolbar({
            from,
            to,
            snippet: text.trim(),
            top: start.top - box.top,
            bottom: end.bottom - box.top,
            centerX: (start.left + end.right) / 2 - box.left,
            roomAbove: start.top - viewportTop >= TOOLBAR_HEIGHT + FLOAT_GAP,
          })
        } catch {
          setToolbar(null)
        }
      },
    },
    []
  )

  useEffect(() => {
    onReady?.(editor)
    return () => onReady?.(null)
  }, [editor, onReady])

  useEffect(() => {
    editor?.setEditable(!readOnly)
    if (readOnly) {
      setToolbar(null)
      setComposer(null)
    }
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor || !externalBody) return
    if (appliedExternalRef.current === externalBody.nonce) return
    appliedExternalRef.current = externalBody.nonce
    if (editor.getMarkdown() !== externalBody.markdown) {
      editor.commands.setContent(externalBody.markdown, {
        contentType: "markdown",
      })
    }
  }, [editor, externalBody])

  // Granular decoration sync: additions carry fresh positions, removals drop
  // by id, and mapping preserves everything else — stale React ranges never
  // re-seed positions.
  useEffect(() => {
    if (!editor) return
    const prev = new Set(prevCommentIdsRef.current)
    const nextIds = commentRanges.map((range) => range.id)
    prevCommentIdsRef.current = nextIds
    const nextSet = new Set(nextIds)
    const add = commentRanges.filter((range) => !prev.has(range.id))
    const remove = [...prev].filter((id) => !nextSet.has(id))
    if (add.length === 0 && remove.length === 0) return
    updateDraftCommentDecorations(editor, { add, remove })
  }, [editor, commentRanges])

  useEffect(() => {
    if (!editor) return
    updateDraftCommentDecorations(editor, { activeId: commentActiveId })
  }, [editor, commentActiveId])

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const onOver = (event: Event) => {
      const target = event.target as HTMLElement | null
      const id = target
        ?.closest?.("[data-comment-id]")
        ?.getAttribute("data-comment-id")
      onHighlightHoverRef.current(id ?? null)
    }
    const onOut = () => onHighlightHoverRef.current(null)
    dom.addEventListener("mouseover", onOver)
    dom.addEventListener("mouseout", onOut)
    return () => {
      dom.removeEventListener("mouseover", onOver)
      dom.removeEventListener("mouseout", onOut)
    }
  }, [editor])

  const openComposer = (anchor: FloatAnchor) => {
    setToolbar(null)
    setNote("")
    setComposer(anchor)
  }

  const saveComposer = () => {
    const text = note.trim()
    if (!composer || !text) return
    onAddCommentRef.current(
      { from: composer.from, to: composer.to, snippet: composer.snippet },
      text
    )
    setComposer(null)
    setNote("")
    editor?.commands.focus()
  }

  const toolbarPlacement = toolbar
    ? toolbar.roomAbove
      ? "above"
      : "below"
    : null

  return (
    <div className="relative min-h-full" ref={wrapperRef}>
      <div className="typeset typeset-docs draft-doc-typeset">
        <EditorContent editor={editor} />
      </div>

      {toolbar && !composer && toolbarPlacement ? (
        <div
          className="draft-float-in absolute z-40 flex items-center gap-0.5 rounded-full border border-border p-1 shadow-lg surface-dialog"
          style={{
            left: clamp(
              toolbar.centerX,
              TOOLBAR_WIDTH / 2 + 8,
              Math.max(
                TOOLBAR_WIDTH / 2 + 8,
                (wrapperRef.current?.clientWidth ?? window.innerWidth) -
                  TOOLBAR_WIDTH / 2 -
                  8
              )
            ),
            top:
              toolbarPlacement === "above"
                ? toolbar.top - FLOAT_GAP
                : toolbar.bottom + FLOAT_GAP,
            transform: `translate(-50%, ${toolbarPlacement === "above" ? "-100%" : "0"})`,
          }}
        >
          <button
            className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openComposer(toolbar)}
            type="button"
          >
            <MessageSquareTextIcon aria-hidden="true" className="size-3.5" />
            Comment
          </button>
          <button
            className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const quoted = quoteSelectionToMarkdown(
                editor?.state.doc.textBetween(toolbar.from, toolbar.to, "\n") ?? ""
              )
              if (quoted) onAskSelectionRef.current(quoted)
              setToolbar(null)
              editor?.commands.focus()
            }}
            type="button"
          >
            <TextQuoteIcon aria-hidden="true" className="size-3.5" />
            Ask Revbot
          </button>
        </div>
      ) : null}

      {composer ? (
        <div
          className="draft-float-in absolute z-40 w-72 rounded-xl border border-border p-2 shadow-xl surface-dialog"
          style={{
            left: clamp(
              composer.centerX - 144,
              8,
              Math.max(8, (wrapperRef.current?.clientWidth ?? window.innerWidth) - 296)
            ),
            top: composer.bottom + FLOAT_GAP,
          }}
        >
          <textarea
            autoFocus
            aria-label="Comment on the selected text"
            className="max-h-28 min-h-16 w-full resize-none rounded-lg bg-transparent px-2 py-1.5 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground"
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                saveComposer()
              } else if (event.key === "Escape") {
                event.preventDefault()
                setComposer(null)
                setNote("")
                editor?.commands.focus()
              }
            }}
            placeholder="Leave a comment…"
            rows={2}
            value={note}
          />
          <div className="flex items-center justify-between px-1 pt-1 pb-0.5">
            <span className="text-[11px] text-muted-foreground">
              ⌘/Ctrl+Enter to save · Esc to cancel
            </span>
            <button
              className="h-7 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              disabled={!note.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={saveComposer}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
