"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TagsIcon,
  XIcon,
} from "lucide-react"

import {
  KEYWORD_KIND_LABELS,
  KeywordCardEmpty,
  KeywordCardError,
  KeywordCardHeader,
  KeywordCardList,
  KeywordCardSkeleton,
  KeywordCloudCard,
  KeywordCloudMessage,
  KeywordCloudSkeleton,
  keywordCardClass,
  keywordErrorMessage,
  type KeywordKind,
} from "~/components/keyword-management/keyword-card-parts"
import { OverviewKeywordCloud } from "~/components/overview-keyword-cloud"
import { useRevbotStartPrompt } from "~/components/revbot/revbot-start-prompt-context"
import { useOrganizationEventsListener } from "~/hooks/use-organization-events"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { InputGroup, InputGroupInput } from "~/components/ui/input-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Textarea } from "~/components/ui/textarea"
import { useFeatures } from "~/lib/features"
import {
  applyProjectKeywordListsResponse,
  createProjectKeyword,
  deleteProjectKeyword,
  normalizeProjectKeywordLists,
  projectKeywordListsQueryOptions,
  type CombinedProjectKeyword,
  type ProjectKeyword,
  type ProjectKeywordKind,
} from "~/lib/project-keywords-query"

type KindTab = ProjectKeywordKind

/** Loading state of a card's remote lists. */
export type KeywordCardStatus = "loading" | "error" | "ready"

/** One row of a read-only combined list. */
export type CombinedKeywordItem = { key: string; phrase: string }

export const MAX_PROJECT_KEYWORDS_PER_SOURCE = {
  brand: 10,
  non_brand: 20,
} as const

const FIND_KEYWORDS_PROMPT = `Suggest keywords for this project with the Revserp keyword tools.

1. Start by calling get_business_profile AND get_project_keywords so you know the brand, category, location, offering, audience, and the keywords already saved (both user-defined and Revserp-suggested).
2. Ground every suggestion in real evidence: when Search Console is connected, use live GSC queries, impressions, clicks, and positions. Otherwise read crawled page CONTENT (titles, headings, body text) — not just URLs — opening important pages where needed.
3. Write the result with update_project_keywords. Both brand_keywords and non_brand_keywords are required and brand_keywords must contain 1 to ${MAX_PROJECT_KEYWORDS_PER_SOURCE.brand} keywords and non_brand_keywords 1 to ${MAX_PROJECT_KEYWORDS_PER_SOURCE.non_brand}. Pick the strongest terms backed by the GSC/crawl evidence above. Never invent search volume, clicks, or rankings.
4. Never modify the user's own keywords and never write business-profile keyword fields. update_project_keywords (Revserp suggestions) only. Keep strong existing suggestions and replace weaker terms when needed to stay within ${MAX_PROJECT_KEYWORDS_PER_SOURCE.brand} brand and ${MAX_PROJECT_KEYWORDS_PER_SOURCE.non_brand} non-brand keywords.`

function useKeywordLists(
  projectId: string | null,
  refetchInterval?: number | false
) {
  const query = useQuery({
    ...projectKeywordListsQueryOptions(projectId!),
    enabled: Boolean(projectId),
    refetchInterval,
  })
  const data = useMemo(
    () => normalizeProjectKeywordLists(query.data),
    [query.data]
  )
  return { query, data }
}

function filterByKind<T extends { kind: ProjectKeywordKind }>(
  rows: T[],
  kind: KindTab
) {
  return rows.filter((row) => row.kind === kind)
}

/** Split pasted text on commas or newlines, trim, drop empties, dedupe case-insensitively. */
export function parseBulkKeywords(raw: string): string[] {
  const seen = new Set<string>()
  const phrases: string[] = []
  for (const chunk of raw.split(/[,\n]+/)) {
    const phrase = chunk.trim()
    if (!phrase) continue
    const key = phrase.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    phrases.push(phrase)
  }
  return phrases
}

export function RenameKeywordEditor({
  initialValue,
  disabled,
  maxLength = 200,
  onSave,
  onCancel,
}: {
  initialValue: string
  disabled: boolean
  maxLength?: number
  onSave: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const phrase = value.trim()
    if (!phrase || disabled) return
    onSave(phrase)
  }

  return (
    <form
      className="flex flex-1 items-center gap-2"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <InputGroup className="flex-1">
        <InputGroupInput
          aria-label="Rename keyword"
          autoFocus
          disabled={disabled}
          maxLength={maxLength}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !disabled) onCancel()
          }}
          value={value}
        />
      </InputGroup>
      <Button
        disabled={!value.trim() || disabled}
        size="xs"
        type="submit"
        variant="default"
      >
        Save
      </Button>
      <Button
        disabled={disabled}
        onClick={onCancel}
        size="xs"
        type="button"
        variant="ghost"
      >
        Cancel
      </Button>
    </form>
  )
}

export function AddKeywordsDialog({
  kind,
  existing,
  maxPerKind,
  open,
  locked,
  onOpenChange,
  onBusyChange,
  onSubmit,
  onDone,
}: {
  kind: KeywordKind
  existing: string[]
  maxPerKind?: number
  open: boolean
  locked: boolean
  onOpenChange: (open: boolean) => void
  onBusyChange?: (busy: boolean) => void
  onSubmit: (kind: KeywordKind, phrases: string[]) => void | Promise<void>
  onDone: () => void
}) {
  const [raw, setRaw] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const existingKeys = useMemo(
    () => new Set(existing.map((phrase) => phrase.toLowerCase())),
    [existing]
  )
  const parsed = useMemo(
    () =>
      parseBulkKeywords(raw).filter(
        (phrase) => !existingKeys.has(phrase.toLowerCase())
      ),
    [raw, existingKeys]
  )
  const slots =
    maxPerKind == null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, maxPerKind - existing.length)
  const fittable = parsed.slice(0, slots)
  const skipped = parsed.length - fittable.length

  async function handleSubmit() {
    if (fittable.length === 0 || busy || locked) return
    setBusy(true)
    onBusyChange?.(true)
    setError("")
    try {
      await onSubmit(kind, fittable)
      onDone()
    } catch (submitError) {
      setError(keywordErrorMessage(submitError, "Could not add keywords."))
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Add {KEYWORD_KIND_LABELS[kind].toLowerCase()} keywords
          </DialogTitle>
          <DialogDescription>
            One per line or separated by commas. Duplicates are skipped.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label={`New ${KEYWORD_KIND_LABELS[kind].toLowerCase()} keywords`}
          autoFocus
          className="min-h-32 resize-y"
          disabled={busy || locked}
          maxLength={2000}
          onChange={(event) => setRaw(event.currentTarget.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault()
              void handleSubmit()
            }
          }}
          placeholder={
            "acme plumbing repair\nemergency plumber, drain cleaning"
          }
          value={raw}
        />
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {parsed.length === 0
            ? maxPerKind != null
              ? `${slots} of ${maxPerKind} slots left.`
              : "Add as many keywords as you need."
            : `${fittable.length} new keyword${
                fittable.length === 1 ? "" : "s"
              } will be added.`}
          {skipped > 0
            ? ` ${skipped} won't fit — remove one to add another.`
            : null}
        </p>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={busy || locked}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            disabled={fittable.length === 0 || busy || locked}
            onClick={() => void handleSubmit()}
            type="button"
          >
            {busy
              ? "Saving…"
              : `Add ${fittable.length === 0 ? "" : `${fittable.length} `}keyword${
                  fittable.length === 1 ? "" : "s"
                }`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UserKeywordsCard({
  title,
  brandPhrases,
  nonBrandPhrases,
  status,
  errorText,
  onRetry,
  canManage,
  disabled,
  locked = false,
  busyPhrase = null,
  maxPerKind,
  addButtonLabel = "Add keywords",
  actionError = null,
  emptyState = null,
  onAddBusyChange,
  onAdd,
  onRemove,
  onRename,
  renameMaxLength = 200,
}: {
  title: string
  brandPhrases: string[]
  nonBrandPhrases: string[]
  status: KeywordCardStatus
  errorText: string
  onRetry: () => void
  canManage: boolean
  disabled: boolean
  locked?: boolean
  busyPhrase?: string | null
  /** Per-kind caps; omitted means uncapped (locations). */
  maxPerKind?: Record<KeywordKind, number>
  addButtonLabel?: string
  actionError?: string | null
  emptyState?: ReactNode
  onAddBusyChange?: (busy: boolean) => void
  onAdd: (kind: KeywordKind, phrases: string[]) => void | Promise<void>
  onRemove: (kind: KeywordKind, phrase: string) => void
  onRename?: (kind: KeywordKind, from: string, to: string) => void
  renameMaxLength?: number
}) {
  const [tab, setTab] = useState<KeywordKind>("brand")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const rows = tab === "brand" ? brandPhrases : nonBrandPhrases
  const max = maxPerKind?.[tab]
  const full = max != null && rows.length >= max

  return (
    <Card className={keywordCardClass}>
      <KeywordCardHeader
        brandCount={brandPhrases.length}
        nonBrandCount={nonBrandPhrases.length}
        onTab={(next) => {
          setTab(next)
          setAdding(false)
          setEditing(null)
        }}
        tab={tab}
        title={title}
      />
      {status === "loading" ? (
        <KeywordCardSkeleton />
      ) : status === "error" ? (
        <KeywordCardError message={errorText} onRetry={onRetry} />
      ) : (
        <>
          {rows.length === 0 && emptyState ? (
            emptyState
          ) : (
            <KeywordCardList
              emptyMessage={`No ${KEYWORD_KIND_LABELS[tab].toLowerCase()} keywords yet.`}
              getKey={(phrase) => phrase}
              getPhrase={(phrase) => phrase}
              items={rows}
              renderEditor={
                onRename
                  ? (phrase) =>
                      phrase === editing ? (
                        <RenameKeywordEditor
                          disabled={disabled}
                          initialValue={phrase}
                          maxLength={renameMaxLength}
                          onCancel={() => setEditing(null)}
                          onSave={(value) => {
                            onRename(tab, phrase, value)
                            setEditing(null)
                          }}
                        />
                      ) : null
                  : undefined
              }
              trailing={
                canManage
                  ? (phrase) => (
                      <>
                        {onRename ? (
                          <Button
                            aria-label={`Edit keyword ${phrase}`}
                            disabled={disabled}
                            onClick={() => setEditing(phrase)}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <PencilIcon aria-hidden="true" />
                          </Button>
                        ) : null}
                        <Button
                          aria-label={`Remove ${phrase}`}
                          disabled={disabled}
                          onClick={() => onRemove(tab, phrase)}
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                        >
                          {busyPhrase === phrase ? (
                            <Loader2
                              aria-hidden="true"
                              className="animate-spin"
                            />
                          ) : (
                            <XIcon aria-hidden="true" />
                          )}
                        </Button>
                      </>
                    )
                  : undefined
              }
            />
          )}
          {canManage ? (
            <div className="shrink-0 border-t border-border/40 px-3 py-3">
              <p className="mb-2 px-2 text-xs text-muted-foreground">
                {max != null ? `${rows.length}/${max} ` : `${rows.length} `}
                {KEYWORD_KIND_LABELS[tab].toLowerCase()} keywords.
                {full ? " Remove one to add another." : null}
              </p>
              <Button
                disabled={disabled || full}
                onClick={() => setAdding(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon data-icon="inline-start" />
                {addButtonLabel}
              </Button>
              {actionError ? (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {actionError}
                </p>
              ) : null}
              {adding && !full ? (
                <AddKeywordsDialog
                  key={tab}
                  existing={rows}
                  kind={tab}
                  locked={locked}
                  maxPerKind={max}
                  onBusyChange={onAddBusyChange}
                  onDone={() => setAdding(false)}
                  onOpenChange={(open) => {
                    if (!open) setAdding(false)
                  }}
                  onSubmit={onAdd}
                  open={adding}
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}

export function SuggestedKeywordsCard({
  brandPhrases,
  nonBrandPhrases,
  status,
  errorText,
  onRetry,
  toolbar,
  emptyState = null,
  footer = null,
  belowList = null,
  emptyMessage = "No suggested keywords yet.",
  getTrailing,
}: {
  brandPhrases: string[]
  nonBrandPhrases: string[]
  status: KeywordCardStatus
  errorText: string
  onRetry: () => void
  toolbar?: (tab: KeywordKind, rows: string[]) => ReactNode
  emptyState?: ReactNode
  footer?: ReactNode | ((tab: KeywordKind, rows: string[]) => ReactNode)
  belowList?: ReactNode
  emptyMessage?: string
  getTrailing?: (phrase: string) => ReactNode
}) {
  const [tab, setTab] = useState<KeywordKind>("brand")
  const rows = tab === "brand" ? brandPhrases : nonBrandPhrases

  return (
    <Card className={keywordCardClass}>
      <KeywordCardHeader
        brandCount={brandPhrases.length}
        nonBrandCount={nonBrandPhrases.length}
        onTab={setTab}
        tab={tab}
        title="Revserp suggested"
      />
      {status === "loading" ? (
        <KeywordCardSkeleton />
      ) : status === "error" ? (
        <KeywordCardError message={errorText} onRetry={onRetry} />
      ) : (
        <>
          {toolbar ? (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/40 px-3 py-2">
              {toolbar(tab, rows)}
            </div>
          ) : null}
          {rows.length === 0 && emptyState ? (
            emptyState
          ) : (
            <KeywordCardList
              emptyMessage={emptyMessage}
              getKey={(phrase) => phrase}
              getPhrase={(phrase) => phrase}
              items={rows}
              trailing={getTrailing}
            />
          )}
          {belowList}
          {typeof footer === "function" ? footer(tab, rows) : footer}
        </>
      )}
    </Card>
  )
}

export function CombinedKeywordsCard({
  brandItems,
  nonBrandItems,
  status,
  errorText,
  onRetry,
  emptyState = null,
  emptyMessage = (kind) =>
    `No ${KEYWORD_KIND_LABELS[kind].toLowerCase()} keywords yet.`,
  getTrailing,
}: {
  brandItems: CombinedKeywordItem[]
  nonBrandItems: CombinedKeywordItem[]
  status: KeywordCardStatus
  errorText: string
  onRetry: () => void
  emptyState?: ReactNode
  emptyMessage?: string | ((kind: KeywordKind) => string)
  getTrailing?: (item: CombinedKeywordItem) => ReactNode
}) {
  const [tab, setTab] = useState<KeywordKind>("brand")
  const items = tab === "brand" ? brandItems : nonBrandItems

  return (
    <Card className={keywordCardClass}>
      <KeywordCardHeader
        brandCount={brandItems.length}
        nonBrandCount={nonBrandItems.length}
        onTab={setTab}
        tab={tab}
        title="Combined keywords"
      />
      {status === "loading" ? (
        <KeywordCardSkeleton />
      ) : status === "error" ? (
        <KeywordCardError message={errorText} onRetry={onRetry} />
      ) : items.length === 0 && emptyState ? (
        emptyState
      ) : (
        <KeywordCardList
          emptyMessage={
            typeof emptyMessage === "function"
              ? emptyMessage(tab)
              : emptyMessage
          }
          getKey={(item) => item.key}
          getPhrase={(item) => item.phrase}
          items={items}
          rowClassName="flex-wrap items-center gap-x-2 gap-y-1"
          trailing={getTrailing}
        />
      )}
    </Card>
  )
}

export function DefineYourKeywordsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const queryClient = useQueryClient()
  const [addBusy, setAddBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState("")

  const { query, data } = useKeywordLists(projectId)
  const canManage = data.can_manage_keywords
  // Add and remove share one lock: both write the full lists response, so
  // overlapping mutations could apply out of order and drop a change.
  const mutating = busyId !== null || addBusy
  const status: KeywordCardStatus = !projectId
    ? "ready"
    : query.isLoading && !query.data
      ? "loading"
      : query.isError
        ? "error"
        : "ready"

  async function handleRemove(keyword: ProjectKeyword) {
    if (!projectId || mutating) return
    const requestProjectId = projectId
    setBusyId(keyword.id)
    setRemoveError("")
    try {
      const response = await deleteProjectKeyword(requestProjectId, keyword.id)
      await applyProjectKeywordListsResponse(
        queryClient,
        requestProjectId,
        response
      )
    } catch (removeErr) {
      setRemoveError(
        keywordErrorMessage(removeErr, "Could not remove keyword.")
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleAdd(kind: KeywordKind, phrases: string[]) {
    if (!projectId) return
    // Capture the project at click time: a slow response must only ever
    // touch this project's cache entry, never the currently viewed project.
    const requestProjectId = projectId
    for (const keyword of phrases) {
      const response = await createProjectKeyword(requestProjectId, {
        keyword,
        kind,
      })
      await applyProjectKeywordListsResponse(
        queryClient,
        requestProjectId,
        response
      )
    }
  }

  return (
    <UserKeywordsCard
      actionError={removeError || null}
      brandPhrases={filterByKind(data.user_defined, "brand").map(
        (keyword) => keyword.keyword
      )}
      busyPhrase={
        data.user_defined.find((keyword) => keyword.id === busyId)?.keyword ??
        null
      }
      canManage={canManage}
      disabled={mutating}
      emptyState={
        !projectId ? (
          <KeywordCardEmpty message="Select a project to manage keywords." />
        ) : undefined
      }
      errorText={keywordErrorMessage(query.error, "Could not load keywords.")}
      locked={busyId !== null}
      maxPerKind={MAX_PROJECT_KEYWORDS_PER_SOURCE}
      nonBrandPhrases={filterByKind(data.user_defined, "non_brand").map(
        (keyword) => keyword.keyword
      )}
      onAdd={handleAdd}
      onAddBusyChange={setAddBusy}
      onRemove={(kind, phrase) => {
        const keyword = data.user_defined.find(
          (row) => row.kind === kind && row.keyword === phrase
        )
        if (keyword) void handleRemove(keyword)
      }}
      onRetry={() => void query.refetch()}
      status={status}
      title="Define your keywords"
    />
  )
}

export function ProjectSuggestedKeywordsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const features = useFeatures()
  const revbotPrompt = useRevbotStartPrompt()
  const startPrompt = revbotPrompt?.startPrompt
  const [watching, setWatching] = useState(false)
  const baselineRef = useRef<string | null>(null)

  // While waiting for Revbot, poll so a suggestion write (plus the central
  // SSE invalidation) ends the watching state without touching the events module.
  const { query, data } = useKeywordLists(projectId, watching ? 5000 : false)
  const canManage = data.can_manage_keywords

  const signature = useMemo(
    () =>
      data.revserp_suggested
        .map((row) => `${row.kind}:${row.keyword.toLowerCase()}`)
        .sort()
        .join("|"),
    [data.revserp_suggested]
  )

  // A successful suggestion write ends watching even when the new lists are
  // identical to the baseline (e.g. a refresh that confirms the same terms),
  // where the signature comparison below could never fire.
  useOrganizationEventsListener((event) => {
    if (event.type !== "project_keywords.updated") return
    if (!watching) return
    if ((event.project_id ?? null) !== projectId) return
    setWatching(false)
  })

  useEffect(() => {
    if (!watching || baselineRef.current === null) return
    if (signature !== baselineRef.current) {
      setWatching(false)
    }
  }, [watching, signature])

  useEffect(() => {
    if (!watching) return
    const timeout = window.setTimeout(() => setWatching(false), 5 * 60_000)
    return () => window.clearTimeout(timeout)
  }, [watching])

  const canGenerate = Boolean(
    features.ai_chat && startPrompt && projectId && canManage && !watching
  )

  function openKeywordChat() {
    if (!startPrompt) return
    baselineRef.current = signature
    setWatching(true)
    startPrompt(FIND_KEYWORDS_PROMPT, { keepDocked: true })
  }

  const emptyState = !projectId ? (
    <KeywordCardEmpty message="Select a project to see suggestions." />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50">
        <TagsIcon aria-hidden="true" className="size-5 text-violet-400" />
      </div>
      <p className="text-sm font-medium text-foreground">
        No suggested keywords
      </p>
      <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
        Let Revbot find them from Search Console and crawl data.
      </p>
      {canManage && startPrompt && projectId ? (
        <Button
          className="mt-2"
          disabled={watching || !canGenerate}
          onClick={openKeywordChat}
          size="sm"
          type="button"
        >
          {watching ? (
            <>
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              Generating…
            </>
          ) : (
            "Find keywords"
          )}
        </Button>
      ) : null}
      {watching ? (
        <Button
          onClick={() => void query.refetch()}
          size="sm"
          type="button"
          variant="ghost"
        >
          Check again
        </Button>
      ) : null}
    </div>
  )

  return (
    <SuggestedKeywordsCard
      brandPhrases={filterByKind(data.revserp_suggested, "brand").map(
        (keyword) => keyword.keyword
      )}
      emptyState={emptyState}
      errorText={keywordErrorMessage(
        query.error,
        "Could not load suggestions."
      )}
      footer={(_tab, rows) =>
        rows.length > 0 && canManage && startPrompt ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 px-3 py-2.5">
            <span className="truncate px-2 text-xs text-muted-foreground">
              {watching
                ? "Waiting for new suggestions…"
                : "Suggestions only — yours stay untouched."}
            </span>
            <Button
              disabled={!canGenerate}
              onClick={openKeywordChat}
              size="xs"
              type="button"
              variant="ghost"
            >
              {watching ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <RefreshCwIcon aria-hidden="true" />
              )}
              {watching ? "Working" : "Refresh"}
            </Button>
          </div>
        ) : null
      }
      nonBrandPhrases={filterByKind(data.revserp_suggested, "non_brand").map(
        (keyword) => keyword.keyword
      )}
      onRetry={() => void query.refetch()}
      status={
        !projectId
          ? "ready"
          : query.isLoading && !query.data
            ? "loading"
            : query.isError
              ? "error"
              : "ready"
      }
    />
  )
}

function SourceBadges({
  sources,
}: {
  sources: CombinedProjectKeyword["sources"]
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {sources.includes("user") ? (
        <Badge variant="secondary">User-defined</Badge>
      ) : null}
      {sources.includes("revserp") ? (
        <Badge variant="outline">Revserp suggested</Badge>
      ) : null}
    </span>
  )
}

export function ProjectCombinedKeywordsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const { query, data } = useKeywordLists(projectId)

  return (
    <CombinedKeywordsCard
      brandItems={filterByKind(data.combined, "brand").map((keyword) => ({
        key: `${keyword.kind}:${keyword.keyword}`,
        phrase: keyword.keyword,
      }))}
      emptyState={
        !projectId ? (
          <KeywordCardEmpty message="Select a project to see combined keywords." />
        ) : undefined
      }
      errorText={keywordErrorMessage(query.error, "Could not load keywords.")}
      getTrailing={(item) => {
        const row = data.combined.find(
          (candidate) => `${candidate.kind}:${candidate.keyword}` === item.key
        )
        return row ? <SourceBadges sources={row.sources} /> : null
      }}
      nonBrandItems={filterByKind(data.combined, "non_brand").map(
        (keyword) => ({
          key: `${keyword.kind}:${keyword.keyword}`,
          phrase: keyword.keyword,
        })
      )}
      onRetry={() => void query.refetch()}
      status={
        !projectId
          ? "ready"
          : query.isLoading && !query.data
            ? "loading"
            : query.isError
              ? "error"
              : "ready"
      }
    />
  )
}

export function CombinedKeywordCloudCard({
  projectId,
}: {
  projectId: string | null
}) {
  const { query, data } = useKeywordLists(projectId)

  return (
    <KeywordCloudCard>
      {!projectId ? (
        <KeywordCloudMessage text="Select a project to see the keyword cloud." />
      ) : query.isLoading && !query.data ? (
        <KeywordCloudSkeleton />
      ) : query.isError ? (
        <KeywordCardError
          message={keywordErrorMessage(query.error, "Could not load keywords.")}
          onRetry={() => void query.refetch()}
        />
      ) : data.combined.length === 0 ? (
        <KeywordCloudMessage text="Add keywords above to see them here." />
      ) : (
        <OverviewKeywordCloud items={data.combined} />
      )}
    </KeywordCloudCard>
  )
}
