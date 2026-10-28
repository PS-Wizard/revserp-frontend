"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CopyIcon,
  FileCodeIcon,
  FileTextIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react"

import type {
  AIReasoningEffort,
  ProjectResponse,
} from "~/lib/api.types"
import {
  CONTENT_DRAFT_MUTATING_TOOLS,
  contentDraftQueryKey,
  contentDraftQueryOptions,
  fetchContentDraft,
  patchContentDraft,
  type ContentDraft,
  type ContentDraftPatch,
} from "~/lib/content-drafts-api"
import { useRevbot, isTurnActiveStatus } from "~/components/revbot/use-revbot"
import { RevbotViewContent } from "~/components/revbot/revbot-view"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Badge } from "~/components/ui/badge"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"
import {
  ContentEditor,
  type CommentAnchor,
  type ContentEditorExternalBody,
} from "./content-editor"
import {
  buildCommentsMessage,
  getLiveDraftCommentRanges,
  liveCommentSnippet,
  type DraftComment,
  type DraftCommentRange,
} from "./content-comments"
import { CommentLayer } from "./comment-gutter"

type DraftFields = {
  title: string
  meta_title: string
  meta_description: string
  target_keyword: string
}

type SavedSnapshot = DraftFields & { body: string }

const EMPTY_FIELDS: DraftFields = {
  title: "",
  meta_title: "",
  meta_description: "",
  target_keyword: "",
}

function snapshotOf(draft: ContentDraft): SavedSnapshot {
  return {
    title: draft.title ?? "",
    meta_title: draft.meta_title ?? "",
    meta_description: draft.meta_description ?? "",
    target_keyword: draft.target_keyword ?? "",
    body: draft.body ?? "",
  }
}

const META_TITLE_GUIDE = 60
const META_DESCRIPTION_GUIDE = 155
const SNIPPET_MAX = 280

function CountHint({ value, guide }: { value: number; guide: number }) {
  return (
    <span
      className={cn(
        "shrink-0 text-[11px] tabular-nums",
        value > guide ? "text-amber-500" : "text-muted-foreground/70"
      )}
    >
      {value}/{guide}
    </span>
  )
}

function siteHostOf(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null
  try {
    return new URL(
      /^https?:\/\//.test(baseUrl) ? baseUrl : `https://${baseUrl}`
    ).host
  } catch {
    return null
  }
}

/** The document's own H1: borderless, wraps and grows with its content. */
function DraftTitle({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <textarea
      aria-label="Draft title"
      className="field-sizing-content block min-h-0 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 disabled:cursor-default md:text-4xl"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, " "))}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault()
      }}
      placeholder="Untitled draft"
      rows={1}
      value={value}
    />
  )
}

const metaFieldClass =
  "w-full min-w-0 rounded-md border border-border/60 bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:border-ring disabled:cursor-default disabled:opacity-60"

function MetaField({
  label,
  count,
  children,
}: {
  label: string
  count?: { value: number; guide: number }
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        {count ? <CountHint {...count} /> : null}
      </span>
      {children}
    </label>
  )
}

/** Collapsed: a SERP-style preview. Expanded: labeled metadata fields. */
function SearchAppearance({
  fields,
  disabled,
  siteHost,
  onChange,
}: {
  fields: DraftFields
  disabled: boolean
  siteHost: string | null
  onChange: (key: keyof DraftFields, value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const metaTitle = fields.meta_title.trim()
  const metaDescription = fields.meta_description.trim()
  const keyword = fields.target_keyword.trim()

  return (
    <section aria-label="Search appearance" className="mt-4">
      <button
        aria-expanded={open}
        className="group relative block w-full rounded-xl border border-border/60 px-4 py-3 text-left transition-colors hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Search appearance</span>
          <span className="flex items-center gap-2">
            {keyword ? <Badge variant="secondary">{keyword}</Badge> : null}
            <span className="flex items-center gap-0.5 group-hover:text-foreground">
              {open ? "Done" : "Edit"}
              <ChevronDownIcon
                aria-hidden="true"
                className={cn(
                  "size-3 transition-transform duration-150 motion-reduce:transition-none",
                  open && "rotate-180"
                )}
              />
            </span>
          </span>
        </span>
        {siteHost ? (
          <span className="block truncate text-xs text-muted-foreground">
            {siteHost}
          </span>
        ) : null}
        <span
          className={cn(
            "mt-0.5 block truncate text-base",
            metaTitle ? "text-primary" : "text-muted-foreground"
          )}
        >
          {metaTitle || fields.title.trim() || "Untitled draft"}
        </span>
        <span
          className={cn(
            "mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground",
            !metaDescription && "text-muted-foreground/60"
          )}
        >
          {metaDescription || "Add a meta description"}
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-4 px-0.5 pt-4 pb-1">
            <MetaField
              count={{
                value: fields.meta_title.length,
                guide: META_TITLE_GUIDE,
              }}
              label="Meta title"
            >
              <input
                className={metaFieldClass}
                disabled={disabled}
                onChange={(event) => onChange("meta_title", event.target.value)}
                placeholder="Title shown in search results"
                value={fields.meta_title}
              />
            </MetaField>
            <MetaField
              count={{
                value: fields.meta_description.length,
                guide: META_DESCRIPTION_GUIDE,
              }}
              label="Meta description"
            >
              <textarea
                className={cn(
                  metaFieldClass,
                  "field-sizing-content min-h-16 resize-none"
                )}
                disabled={disabled}
                onChange={(event) =>
                  onChange("meta_description", event.target.value)
                }
                placeholder="Summary shown under the title"
                value={fields.meta_description}
              />
            </MetaField>
            <MetaField label="Target keyword">
              <input
                className={metaFieldClass}
                disabled={disabled}
                onChange={(event) =>
                  onChange("target_keyword", event.target.value)
                }
                placeholder="Primary keyword"
                value={fields.target_keyword}
              />
            </MetaField>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Full-height draft workspace: pinned Revbot chat on the left, the document
 * on the right with an inline-comment margin. The chat is bound to the
 * draft's conversation and never touches the project conversation list.
 */
export function ContentDraftPage({
  project,
  draftId,
  allowedEfforts,
  canManageOrganization,
  initialPrompt,
  onInitialPromptConsumed,
  onBack,
}: {
  project: ProjectResponse
  draftId: string
  allowedEfforts: AIReasoningEffort[]
  canManageOrganization: boolean
  /** First-turn text for a freshly created draft; sent once, then cleared. */
  initialPrompt: string | null
  onInitialPromptConsumed: () => void
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const draftQuery = useQuery(contentDraftQueryOptions(draftId))
  const draft = draftQuery.data ?? null

  const [fields, setFields] = useState<DraftFields | null>(null)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved"
  )
  const [externalBody, setExternalBody] =
    useState<ContentEditorExternalBody | null>(null)
  const [quoteInsert, setQuoteInsert] = useState<{
    text: string
    nonce: number
  } | null>(null)
  const [comments, setComments] = useState<DraftComment[]>([])
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<{
    id: string
    nonce: number
  } | null>(null)
  const [editorInstance, setEditorInstance] = useState<
    import("@tiptap/react").Editor | null
  >(null)

  const fieldsRef = useRef<DraftFields | null>(null)
  const savedRef = useRef<SavedSnapshot | null>(null)
  const pendingBodyRef = useRef<string | null>(null)
  const commentsRef = useRef<DraftComment[]>([])
  const saveTimerRef = useRef<number | null>(null)
  const externalNonceRef = useRef(0)
  const quoteNonceRef = useRef(0)
  const focusNonceRef = useRef(0)
  const initializedDraftRef = useRef<string | null>(null)
  const autoSentRef = useRef(false)
  const editorRef =
    useRef<import("@tiptap/react").Editor | null>(null)

  useEffect(() => {
    fieldsRef.current = fields
  }, [fields])
  useEffect(() => {
    commentsRef.current = comments
  }, [comments])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null)
        window.clearTimeout(saveTimerRef.current)
    }
  }, [])

  const applyRemoteDraft = useCallback(
    (fresh: ContentDraft) => {
      const snapshot = snapshotOf(fresh)
      savedRef.current = snapshot
      pendingBodyRef.current = null
      const nextFields = {
        title: snapshot.title,
        meta_title: snapshot.meta_title,
        meta_description: snapshot.meta_description,
        target_keyword: snapshot.target_keyword,
      }
      fieldsRef.current = nextFields
      setFields(nextFields)
      setSaveStatus("saved")
      if (commentsRef.current.length > 0) {
        const count = commentsRef.current.length
        commentsRef.current = []
        setComments([])
        setActiveCommentId(null)
        toast.message(
          `Draft updated — cleared ${count} unsent comment${count === 1 ? "" : "s"} pointing at old text.`
        )
      }
      externalNonceRef.current += 1
      setExternalBody({
        markdown: snapshot.body,
        nonce: externalNonceRef.current,
      })
    },
    []
  )

  useEffect(() => {
    if (!draft || initializedDraftRef.current === draft.id) return
    if (draft.project_id !== project.id) return
    initializedDraftRef.current = draft.id
    autoSentRef.current = false
    applyRemoteDraft(draft)
  }, [draft, project.id, applyRemoteDraft])

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const saved = savedRef.current
    const latest = fieldsRef.current
    if (!saved || !latest) return
    const body = pendingBodyRef.current ?? saved.body
    const patch: ContentDraftPatch = {}
    if (latest.title !== saved.title) patch.title = latest.title
    if (latest.meta_title !== saved.meta_title)
      patch.meta_title = latest.meta_title
    if (latest.meta_description !== saved.meta_description)
      patch.meta_description = latest.meta_description
    if (latest.target_keyword !== saved.target_keyword)
      patch.target_keyword = latest.target_keyword
    if (body !== saved.body) patch.body = body
    if (Object.keys(patch).length === 0) {
      setSaveStatus("saved")
      return
    }
    setSaveStatus("saving")
    try {
      const updated = await patchContentDraft(draftId, patch)
      const snapshot = snapshotOf(updated)
      savedRef.current = snapshot
      // Only clear the pending body when nothing newer arrived mid-flight.
      if (pendingBodyRef.current === body) pendingBodyRef.current = null
      setSaveStatus("saved")
    } catch {
      setSaveStatus("error")
      toast.error("Couldn't save the draft. Changes will retry on the next edit.")
    }
  }, [draftId])

  const flushSaveRef = useRef(flushSave)
  useEffect(() => {
    flushSaveRef.current = flushSave
  }, [flushSave])

  const scheduleSave = useCallback(() => {
    setSaveStatus("saving")
    if (saveTimerRef.current !== null)
      window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void flushSaveRef.current()
    }, 800)
  }, [])

  const refetchDraft = useCallback(async () => {
    try {
      const fresh = await fetchContentDraft(draftId)
      if (fresh.project_id !== project.id) return
      queryClient.setQueryData(contentDraftQueryKey(draftId), fresh)
      applyRemoteDraft(fresh)
    } catch {
      // Keep local content; the next settled turn retries.
    }
  }, [draftId, project.id, queryClient, applyRemoteDraft])

  const refetchTimerRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (refetchTimerRef.current !== null)
        window.clearTimeout(refetchTimerRef.current)
    }
  }, [])
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current !== null)
      window.clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = window.setTimeout(() => {
      refetchTimerRef.current = null
      void refetchDraft()
    }, 400)
  }, [refetchDraft])

  const handleToolResult = useCallback(
    (name: string, status: string) => {
      if (status !== "completed") return
      if (!CONTENT_DRAFT_MUTATING_TOOLS.has(name)) return
      scheduleRefetch()
    },
    [scheduleRefetch]
  )

  const handleTurnSettled = useCallback(() => {
    scheduleRefetch()
  }, [scheduleRefetch])

  const revbot = useRevbot({
    activeProject: project,
    allowedEfforts,
    requestedConversationId: null,
    pinnedConversationId: draft?.conversation_id ?? null,
    disableConversationList: true,
    onToolResult: handleToolResult,
    onTurnSettled: handleTurnSettled,
    onBeforeSend: () => flushSaveRef.current(),
    onConversationChange: () => {},
  })

  const busy = isTurnActiveStatus(revbot.status)

  // Fresh drafts send the library prompt as the first turn once the draft's
  // conversation is loaded and confirmed empty.
  useEffect(() => {
    if (!initialPrompt || autoSentRef.current) return
    if (!draft || revbot.conversationId !== draft.conversation_id) return
    if (revbot.loading || busy) return
    autoSentRef.current = true
    onInitialPromptConsumed()
    if (revbot.messages.length > 0) return
    void revbot.send(initialPrompt)
  }, [
    initialPrompt,
    draft,
    revbot.conversationId,
    revbot.loading,
    busy,
    revbot.messages.length,
    revbot.send,
    onInitialPromptConsumed,
  ])

  const updateField = useCallback(
    (key: keyof DraftFields, value: string) => {
      setFields((current) => {
        const next = { ...(current ?? EMPTY_FIELDS), [key]: value }
        fieldsRef.current = next
        return next
      })
      scheduleSave()
    },
    [scheduleSave]
  )

  const handleBodyChange = useCallback(
    (markdown: string) => {
      if (pendingBodyRef.current === markdown) return
      pendingBodyRef.current = markdown
      if (savedRef.current && markdown !== savedRef.current.body) {
        scheduleSave()
      }
    },
    [scheduleSave]
  )

  const handleCopy = useCallback(async (format: "markdown" | "html") => {
    const editor = editorRef.current
    const markdown =
      pendingBodyRef.current ??
      editor?.getMarkdown() ??
      savedRef.current?.body ??
      ""
    const text =
      format === "markdown" ? markdown : (editor?.getHTML() ?? markdown)
    try {
      await navigator.clipboard.writeText(text)
      toast.success(format === "markdown" ? "Markdown copied" : "HTML copied")
    } catch {
      toast.error("Couldn't copy to the clipboard.")
    }
  }, [])

  const commentRanges: DraftCommentRange[] = useMemo(
    () =>
      comments.map((comment) => ({
        id: comment.id,
        from: comment.from,
        to: comment.to,
      })),
    [comments]
  )

  const handleAddComment = useCallback((anchor: CommentAnchor, note: string) => {
    const text = note.trim()
    if (!text) return
    const snippet =
      anchor.snippet.length > SNIPPET_MAX
        ? `${anchor.snippet.slice(0, SNIPPET_MAX)}…`
        : anchor.snippet
    const comment: DraftComment = {
      id: crypto.randomUUID(),
      note: text,
      snippet,
      from: anchor.from,
      to: anchor.to,
    }
    setComments((current) => [...current, comment])
    setActiveCommentId(comment.id)
  }, [])

  const handleAnchorsLost = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const gone = new Set(ids)
    setComments((current) => {
      if (!current.some((comment) => gone.has(comment.id))) return current
      return current.filter((comment) => !gone.has(comment.id))
    })
    setActiveCommentId((current) =>
      current && gone.has(current) ? null : current
    )
  }, [])

  const handleHighlightHover = useCallback((id: string | null) => {
    setActiveCommentId((current) => (current === id ? current : id))
  }, [])

  const focusComment = useCallback((id: string) => {
    setActiveCommentId(id)
    focusNonceRef.current += 1
    setFocusRequest({ id, nonce: focusNonceRef.current })
  }, [])

  const handleEditComment = useCallback((id: string, note: string) => {
    setComments((current) =>
      current.map((comment) =>
        comment.id === id ? { ...comment, note } : comment
      )
    )
  }, [])

  const handleDeleteComment = useCallback((id: string) => {
    setComments((current) => current.filter((comment) => comment.id !== id))
    setActiveCommentId((current) => (current === id ? null : current))
  }, [])

  const revbotSendRef = useRef(revbot.send)
  useEffect(() => {
    revbotSendRef.current = revbot.send
  }, [revbot.send])

  const handleSendComments = useCallback(() => {
    const editor = editorRef.current
    if (!editor || busy) return
    const live = getLiveDraftCommentRanges(editor)
    const items = commentsRef.current.flatMap((comment) => {
      const range = live.get(comment.id)
      if (!range) return []
      const snippet = liveCommentSnippet(editor, range) ?? comment.snippet
      if (!snippet) return []
      return [{ snippet, note: comment.note }]
    })
    if (items.length === 0) {
      toast.message("Those comments no longer point at text — cleared.")
      setComments([])
      setActiveCommentId(null)
      return
    }
    if (items.length < commentsRef.current.length) {
      toast.message("Some comments were dropped — their text was deleted.")
    }
    const message = buildCommentsMessage(items)
    setComments([])
    setActiveCommentId(null)
    void revbotSendRef.current(message)
  }, [busy])

  if (draftQuery.isLoading && !draft) {
    return (
      <div className="flex min-h-full flex-col gap-4 py-6 md:py-8">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
          <Skeleton className="h-[26rem] rounded-2xl lg:h-auto" />
          <Skeleton className="min-h-[24rem] rounded-2xl" />
        </div>
      </div>
    )
  }

  if (draftQuery.isError || !draft) {
    return (
      <div className="flex min-h-full flex-col gap-4 py-6 md:py-8">
        <div>
          <Button onClick={onBack} size="sm" type="button" variant="ghost">
            <ArrowLeftIcon aria-hidden="true" />
            Drafts
          </Button>
        </div>
        <Card className="flex flex-1 items-center justify-center p-6">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Couldn't load this draft</EmptyTitle>
              <EmptyDescription>
                {draftQuery.error instanceof Error
                  ? draftQuery.error.message
                  : "The draft may have been deleted."}
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex items-center justify-center gap-2">
              <Button
                onClick={() => void draftQuery.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
              <Button onClick={onBack} size="sm" type="button">
                Back to drafts
              </Button>
            </div>
          </Empty>
        </Card>
      </div>
    )
  }

  if (draft.project_id !== project.id) {
    return (
      <div className="flex min-h-full flex-col gap-4 py-6 md:py-8">
        <div>
          <Button onClick={onBack} size="sm" type="button" variant="ghost">
            <ArrowLeftIcon aria-hidden="true" />
            Drafts
          </Button>
        </div>
        <Card className="flex flex-1 items-center justify-center p-6">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Draft not found</EmptyTitle>
              <EmptyDescription>
                This draft belongs to a different project.
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex items-center justify-center">
              <Button onClick={onBack} size="sm" type="button">
                Back to drafts
              </Button>
            </div>
          </Empty>
        </Card>
      </div>
    )
  }

  const values = fields ?? EMPTY_FIELDS

  return (
    <div className="draft-page flex min-h-full flex-col gap-5 py-6 md:py-8 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <header className="flex items-center gap-1">
        <Button onClick={onBack} size="sm" type="button" variant="ghost">
          <ArrowLeftIcon aria-hidden="true" />
          Drafts
        </Button>
        <div className="flex-1" />
        <span
          aria-live="polite"
          className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block"
          key={saveStatus}
        >
          <span className="draft-fade-swap inline-block">
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "error"
                ? "Couldn't save"
                : "Saved"}
          </span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" type="button" variant="ghost">
                <CopyIcon aria-hidden="true" />
                Copy
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => void handleCopy("markdown")}>
                <FileTextIcon aria-hidden="true" />
                Copy markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleCopy("html")}>
                <FileCodeIcon aria-hidden="true" />
                Copy HTML
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <section
          aria-label="Draft conversation"
          className="flex h-[28rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 lg:h-auto"
        >
          <RevbotViewContent
            activeProject={project}
            allowedEfforts={allowedEfforts}
            revbot={revbot}
            compact
            composerQuoteInsert={quoteInsert}
            defaultHistoryOpen={false}
            hideCompactHeader
            hideHistory
            canManageOrganization={canManageOrganization}
            showMic={false}
            variant="dark"
          />
        </section>

        <section
          aria-label="Draft document"
          className="draft-doc-scroll relative min-h-[28rem] lg:min-h-0 lg:overflow-y-auto"
        >
          {busy ? (
            <div className="sticky top-0 z-10 flex justify-center pt-3">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
                <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
                Revbot is writing — editing paused
              </span>
            </div>
          ) : null}
          <div className="draft-doc-grid draft-doc-head">
            <div className="min-w-0">
              <DraftTitle
                disabled={busy}
                onChange={(value) => updateField("title", value)}
                value={values.title}
              />
              <SearchAppearance
                disabled={busy}
                fields={values}
                onChange={updateField}
                siteHost={siteHostOf(project.base_url)}
              />
            </div>
          </div>
          <CommentLayer
            editor={editorInstance}
            comments={comments}
            activeId={activeCommentId}
            focusRequest={focusRequest}
            docKey={`${draft.id}:${externalBody?.nonce ?? 0}`}
            onHover={handleHighlightHover}
            onSelect={focusComment}
            onEdit={handleEditComment}
            onDelete={handleDeleteComment}
          >
            <ContentEditor
              key={draft.id}
              readOnly={busy}
              externalBody={externalBody}
              onBodyChange={handleBodyChange}
              onAskSelection={(quoted) => {
                quoteNonceRef.current += 1
                setQuoteInsert({ text: quoted, nonce: quoteNonceRef.current })
              }}
              onReady={(editor) => {
                editorRef.current = editor
                setEditorInstance(editor)
              }}
              commentRanges={commentRanges}
              commentActiveId={activeCommentId}
              onAddComment={handleAddComment}
              onCommentHighlightClick={focusComment}
              onCommentHighlightHover={handleHighlightHover}
              onCommentAnchorsLost={handleAnchorsLost}
            />
          </CommentLayer>

          {comments.length > 0 ? (
            <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
              <div className="draft-send-bar pointer-events-auto flex items-center gap-1 rounded-full border border-border py-1.5 pr-1.5 pl-4 shadow-lg surface-dialog">
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  {comments.length} comment{comments.length === 1 ? "" : "s"}
                </span>
                <button
                  className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  disabled={busy}
                  onClick={handleSendComments}
                  type="button"
                >
                  <ArrowUpIcon aria-hidden="true" className="size-3.5" />
                  Send to Revbot
                </button>
                <button
                  aria-label="Clear all comments"
                  className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => {
                    setComments([])
                    setActiveCommentId(null)
                  }}
                  type="button"
                >
                  <XIcon aria-hidden="true" className="size-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
