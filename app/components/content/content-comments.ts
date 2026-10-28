import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export type DraftComment = {
  id: string
  note: string
  /** Snippet captured when the comment was made; live text wins at send. */
  snippet: string
  /** Creation anchors. Live positions always come from the plugin. */
  from: number
  to: number
}

export type DraftCommentRange = {
  id: string
  from: number
  to: number
}

export const draftCommentPluginKey = new PluginKey("draftComments")

export type DraftCommentMeta = {
  add?: DraftCommentRange[]
  remove?: string[]
  /** Present (even null) means the active highlight changed. */
  activeId?: string | null
}

function buildDecorations(
  doc: Parameters<typeof DecorationSet.create>[0],
  ranges: DraftCommentRange[],
  activeId: string | null
) {
  return DecorationSet.create(
    doc,
    ranges.map((range) =>
      Decoration.inline(
        range.from,
        range.to,
        {
          class:
            range.id === activeId
              ? "draft-comment-mark draft-comment-mark-active"
              : "draft-comment-mark",
          "data-comment-id": range.id,
        },
        { commentId: range.id }
      )
    )
  )
}

/**
 * Highlights unsent comment ranges. Decorations only — the document (and
 * therefore the saved markdown) is never touched. Positions map through
 * transactions; ranges deleted by edits are dropped automatically.
 */
type CommentPluginState = {
  decos: DecorationSet
  activeId: string | null
}

export const DraftCommentHighlight = Extension.create({
  name: "draftCommentHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: draftCommentPluginKey,
        state: {
          init: (): CommentPluginState => ({
            decos: DecorationSet.empty,
            activeId: null,
          }),
          apply(tr, prev): CommentPluginState {
            const meta = tr.getMeta(
              draftCommentPluginKey
            ) as DraftCommentMeta | undefined
            const mapped = prev.decos.map(tr.mapping, tr.doc)
            if (!meta) {
              return mapped === prev.decos
                ? prev
                : { decos: mapped, activeId: prev.activeId }
            }
            let decos = mapped
            let activeId = prev.activeId
            if (meta.remove?.length) {
              const gone = new Set(meta.remove)
              decos = DecorationSet.create(
                tr.doc,
                decos
                  .find()
                  .filter(
                    (deco) =>
                      typeof (deco.spec as { commentId?: unknown })?.commentId !==
                        "string" ||
                      !gone.has(
                        (deco.spec as { commentId: string }).commentId
                      )
                  )
              )
            }
            if (meta.add?.length) {
              decos = decos.add(
                tr.doc,
                meta.add.map((range) =>
                  Decoration.inline(
                    range.from,
                    range.to,
                    {
                      class: "draft-comment-mark",
                      "data-comment-id": range.id,
                    },
                    { commentId: range.id }
                  )
                )
              )
            }
            if ("activeId" in meta) activeId = meta.activeId ?? null
            // Rebuild classes from live positions — React ranges go stale
            // after edits, so positions are never re-seeded from props.
            const live = decos
              .find()
              .map((deco) => ({
                id: (deco.spec as { commentId: string }).commentId,
                from: deco.from,
                to: deco.to,
              }))
              .filter((entry) => typeof entry.id === "string")
            return {
              decos: buildDecorations(tr.doc, live, activeId),
              activeId,
            }
          },
        },
        props: {
          decorations(state) {
            return (
              draftCommentPluginKey.getState(state) as
                | CommentPluginState
                | undefined
            )?.decos
          },
        },
      }),
    ]
  },
})

/** Push a granular comment update (additions use fresh positions). */
export function updateDraftCommentDecorations(
  editor: Editor,
  meta: DraftCommentMeta
) {
  editor.view.dispatch(editor.state.tr.setMeta(draftCommentPluginKey, meta))
}

/** Live positions for comments whose ranges survived edits. */
export function getLiveDraftCommentRanges(
  editor: Editor
): Map<string, { from: number; to: number }> {
  const live = new Map<string, { from: number; to: number }>()
  const state = draftCommentPluginKey.getState(
    editor.state
  ) as CommentPluginState | undefined
  const decos = state?.decos
  if (!decos) return live
  for (const deco of decos.find()) {
    const id = (deco.spec as { commentId?: unknown } | undefined)?.commentId
    if (typeof id !== "string" || live.has(id)) continue
    live.set(id, { from: deco.from, to: deco.to })
  }
  return live
}

/** Exact selected text for one comment, read at send time. */
export function liveCommentSnippet(
  editor: Editor,
  range: { from: number; to: number },
  maxLength = 280
): string | null {
  const text = editor.state.doc.textBetween(range.from, range.to, "\n").trim()
  if (!text) return null
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

export type CommentMessageItem = {
  snippet: string
  note: string
}

/** The single batched message sent to Revbot for all pending comments. */
export function buildCommentsMessage(items: CommentMessageItem[]): string {
  const lines = items.map(
    (item, index) =>
      `${index + 1}. On: "${item.snippet}"\n   Comment: ${item.note}`
  )
  return `Please address these comments on the draft (use edit_draft):\n\n${lines.join("\n\n")}`
}
