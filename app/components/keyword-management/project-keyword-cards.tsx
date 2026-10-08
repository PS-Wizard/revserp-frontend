"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, PlusIcon, RefreshCwIcon, TagsIcon, XIcon } from "lucide-react"

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
} from "~/components/keyword-management/keyword-card-parts"
import { OverviewKeywordCloud } from "~/components/overview-keyword-cloud"
import { useRevbotStartPrompt } from "~/components/revbot/revbot-start-prompt-context"
import { useOrganizationEventsListener } from "~/hooks/use-organization-events"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { InputGroup, InputGroupInput } from "~/components/ui/input-group"
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

const MAX_PROJECT_KEYWORDS_PER_KIND_PER_SOURCE = 10

const FIND_KEYWORDS_PROMPT = `Suggest keywords for this project with the Revserp keyword tools.

1. Start by calling get_business_profile AND get_project_keywords so you know the brand, category, location, offering, audience, and the keywords already saved (both user-defined and Revserp-suggested).
2. Ground every suggestion in real evidence: when Search Console is connected, use live GSC queries, impressions, clicks, and positions. Otherwise read crawled page CONTENT (titles, headings, body text) — not just URLs — opening important pages where needed.
3. Write the result with update_project_keywords. Both brand_keywords and non_brand_keywords are required and each must contain 1 to ${MAX_PROJECT_KEYWORDS_PER_KIND_PER_SOURCE} keywords. Pick the strongest terms backed by the GSC/crawl evidence above. Never invent search volume, clicks, or rankings.
4. Never modify the user's own keywords and never write business-profile keyword fields. update_project_keywords (Revserp suggestions) only. Keep strong existing suggestions and replace weaker terms when needed to stay within ${MAX_PROJECT_KEYWORDS_PER_KIND_PER_SOURCE} brand and ${MAX_PROJECT_KEYWORDS_PER_KIND_PER_SOURCE} non-brand keywords.`

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

function AddKeywordForm({
  kind,
  projectId,
  locked,
  onBusyChange,
  onDone,
}: {
  kind: KindTab
  projectId: string
  locked: boolean
  onBusyChange: (busy: boolean) => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const keyword = value.trim()
    if (!keyword || busy || locked) return
    // Capture the project at click time: a slow response must only ever
    // touch this project's cache entry, never the currently viewed project.
    const requestProjectId = projectId
    setBusy(true)
    onBusyChange(true)
    setError("")
    try {
      const response = await createProjectKeyword(requestProjectId, {
        keyword,
        kind,
      })
      await applyProjectKeywordListsResponse(
        queryClient,
        requestProjectId,
        response
      )
      onDone()
    } catch (submitError) {
      setError(keywordErrorMessage(submitError, "Could not add keyword."))
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <div className="flex items-center gap-2">
        <InputGroup className="flex-1">
          <InputGroupInput
            aria-label={`New ${KEYWORD_KIND_LABELS[kind].toLowerCase()} keyword`}
            autoFocus
            disabled={busy || locked}
            maxLength={200}
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !busy && !locked) onDone()
            }}
            placeholder="e.g. acme plumbing repair"
            value={value}
          />
        </InputGroup>
        <Button
          disabled={!value.trim() || busy || locked}
          size="sm"
          type="submit"
          variant="default"
        >
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button
          disabled={busy || locked}
          onClick={onDone}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}

export function DefineYourKeywordsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<KindTab>("brand")
  const [adding, setAdding] = useState(false)
  const [addBusy, setAddBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState("")

  const { query, data } = useKeywordLists(projectId)
  const canManage = data.can_manage_keywords
  // Add and remove share one lock: both write the full lists response, so
  // overlapping mutations could apply out of order and drop a change.
  const mutating = busyId !== null || addBusy

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

  const rows = filterByKind(data.user_defined, tab)

  return (
    <Card className={keywordCardClass}>
      <KeywordCardHeader
        brandCount={filterByKind(data.user_defined, "brand").length}
        nonBrandCount={filterByKind(data.user_defined, "non_brand").length}
        onTab={(next) => {
          setTab(next)
          setAdding(false)
        }}
        tab={tab}
        title="Define your keywords"
      />
      {!projectId ? (
        <KeywordCardEmpty message="Select a project to manage keywords." />
      ) : query.isLoading && !query.data ? (
        <KeywordCardSkeleton />
      ) : query.isError ? (
        <KeywordCardError
          message={keywordErrorMessage(query.error, "Could not load keywords.")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <KeywordCardList
            emptyMessage={`No ${KEYWORD_KIND_LABELS[tab].toLowerCase()} keywords yet.`}
            getKey={(keyword) => keyword.id}
            getPhrase={(keyword) => keyword.keyword}
            items={rows}
            trailing={
              canManage
                ? (keyword) => (
                    <Button
                      aria-label={`Remove ${keyword.keyword}`}
                      disabled={mutating}
                      onClick={() => void handleRemove(keyword)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      {busyId === keyword.id ? (
                        <Loader2 aria-hidden="true" className="animate-spin" />
                      ) : (
                        <XIcon aria-hidden="true" />
                      )}
                    </Button>
                  )
                : undefined
            }
          />
          {canManage ? (
            <div className="shrink-0 border-t border-border/40 px-3 py-3">
              <p className="mb-2 px-2 text-xs text-muted-foreground">
                {rows.length}/{MAX_PROJECT_KEYWORDS_PER_KIND_PER_SOURCE}{" "}
                {KEYWORD_KIND_LABELS[tab].toLowerCase()} keywords.
                {rows.length >= MAX_PROJECT_KEYWORDS_PER_KIND_PER_SOURCE
                  ? " Remove one to add another."
                  : null}
              </p>
              {adding &&
              rows.length < MAX_PROJECT_KEYWORDS_PER_KIND_PER_SOURCE ? (
                <AddKeywordForm
                  key={`${projectId}:${tab}`}
                  kind={tab}
                  locked={busyId !== null}
                  onBusyChange={setAddBusy}
                  onDone={() => setAdding(false)}
                  projectId={projectId}
                />
              ) : (
                <>
                  <Button
                    disabled={
                      mutating ||
                      rows.length >= MAX_PROJECT_KEYWORDS_PER_KIND_PER_SOURCE
                    }
                    onClick={() => setAdding(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <PlusIcon data-icon="inline-start" />
                    New keyword
                  </Button>
                  {removeError ? (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {removeError}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}

export function SuggestedKeywordsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const features = useFeatures()
  const revbotPrompt = useRevbotStartPrompt()
  const startPrompt = revbotPrompt?.startPrompt
  const [tab, setTab] = useState<KindTab>("brand")
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

  const rows = filterByKind(data.revserp_suggested, tab)

  return (
    <Card className={keywordCardClass}>
      <KeywordCardHeader
        brandCount={filterByKind(data.revserp_suggested, "brand").length}
        nonBrandCount={filterByKind(data.revserp_suggested, "non_brand").length}
        onTab={setTab}
        tab={tab}
        title="Revserp suggested"
      />
      {!projectId ? (
        <KeywordCardEmpty message="Select a project to see suggestions." />
      ) : query.isLoading && !query.data ? (
        <KeywordCardSkeleton />
      ) : query.isError ? (
        <KeywordCardError
          message={keywordErrorMessage(
            query.error,
            "Could not load suggestions."
          )}
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
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
      ) : (
        <>
          <KeywordCardList
            emptyMessage="No suggested keywords yet."
            getKey={(keyword) => keyword.id}
            getPhrase={(keyword) => keyword.keyword}
            items={rows}
          />
          {canManage && startPrompt ? (
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
          ) : null}
        </>
      )}
    </Card>
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

export function CombinedKeywordsCard({
  projectId,
}: {
  projectId: string | null
}) {
  const [tab, setTab] = useState<KindTab>("brand")
  const { query, data } = useKeywordLists(projectId)
  const rows = filterByKind(data.combined, tab)

  return (
    <Card className={keywordCardClass}>
      <KeywordCardHeader
        brandCount={filterByKind(data.combined, "brand").length}
        nonBrandCount={filterByKind(data.combined, "non_brand").length}
        onTab={setTab}
        tab={tab}
        title="Combined keywords"
      />
      {!projectId ? (
        <KeywordCardEmpty message="Select a project to see combined keywords." />
      ) : query.isLoading && !query.data ? (
        <KeywordCardSkeleton />
      ) : query.isError ? (
        <KeywordCardError
          message={keywordErrorMessage(query.error, "Could not load keywords.")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <KeywordCardList
          emptyMessage={`No ${KEYWORD_KIND_LABELS[tab].toLowerCase()} keywords yet.`}
          getKey={(keyword) => `${keyword.kind}:${keyword.keyword}`}
          getPhrase={(keyword) => keyword.keyword}
          items={rows}
          rowClassName="flex-wrap items-center gap-x-2 gap-y-1"
          trailing={(keyword) => <SourceBadges sources={keyword.sources} />}
        />
      )}
    </Card>
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
