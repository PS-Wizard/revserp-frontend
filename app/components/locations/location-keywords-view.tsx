"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
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
  KeywordSelectionCheckbox,
  keywordCardClass,
  keywordErrorMessage,
} from "~/components/keyword-management/keyword-card-parts"
import { KeywordsCoverage } from "~/components/keywords/keywords-coverage"
import { OverviewKeywordCloud } from "~/components/overview-keyword-cloud"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { InputGroup, InputGroupInput } from "~/components/ui/input-group"
import {
  LOCATION_KEYWORD_MAX_PHRASE_RUNES,
  buildLocationSelectedUnionRows,
  isLocationSelectedUnionRowChecked,
  locationKeywordCoverageQueryKey,
  locationKeywordKindPhrases,
  locationKeywordListsQueryKey,
  locationKeywordListsQueryOptions,
  normalizeLocationKeywordKey,
  normalizeLocationKeywordLists,
  putLocationKeywordLists,
  renameLocationKeyword,
  setLocationKeywordKindPhrases,
  toggleLocationSelectedUnionRow,
  type LocationKeywordGroup,
  type LocationKeywordKind,
  type LocationKeywordListsWrite,
  type LocationKeywordSuggestionSource,
  type LocationSelectedUnionRow,
} from "~/lib/location-keywords-api"
import { refreshLocalSeoLandmarks } from "~/lib/local-seo-api"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import type { CombinedProjectKeyword } from "~/lib/project-keywords-query"
import { buildLocationFindKeywordsPrompt } from "~/components/locations/location-keywords-revbot-prompt"
import { useRevbotStartPrompt } from "~/components/revbot/revbot-start-prompt-context"
import { useOrganizationEventsListener } from "~/hooks/use-organization-events"
import { useFeatures } from "~/lib/features"

type Props = {
  projectId: string | null
  locationId: string | null
}

type ListsStatus = "loading" | "error" | "ready"

const SUGGESTION_SOURCE_LABELS: Record<
  LocationKeywordSuggestionSource,
  string
> = {
  service: "Service",
  locality: "Locality",
  landmark: "Landmark",
}

function SuggestionSourceBadges({
  sources,
}: {
  sources: LocationKeywordSuggestionSource[]
}) {
  if (sources.length === 0) return null
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {sources.map((source) => (
        <Badge className="text-[0.65rem]" key={source} variant="outline">
          {SUGGESTION_SOURCE_LABELS[source]}
        </Badge>
      ))}
    </span>
  )
}

function KeywordListToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/40 px-3 py-2">
      {children}
    </div>
  )
}

function BulkKeywordButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      size="xs"
      type="button"
      variant="ghost"
    >
      {label}
    </Button>
  )
}

function KeywordRemoveButton({
  phrase,
  disabled,
  onRemove,
}: {
  phrase: string
  disabled: boolean
  onRemove: () => void
}) {
  return (
    <Button
      aria-label={`Remove keyword ${phrase}`}
      disabled={disabled}
      onClick={onRemove}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <XIcon aria-hidden="true" />
    </Button>
  )
}

function AddKeywordForm({
  kind,
  disabled,
  onAdd,
  onDone,
}: {
  kind: LocationKeywordKind
  disabled: boolean
  onAdd: (kind: LocationKeywordKind, phrase: string) => void
  onDone: () => void
}) {
  const [value, setValue] = useState("")

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const phrase = value.trim()
    if (!phrase || disabled) return
    onAdd(kind, phrase)
    setValue("")
    onDone()
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <InputGroup className="flex-1">
        <InputGroupInput
          aria-label="New location keyword"
          autoFocus
          disabled={disabled}
          maxLength={LOCATION_KEYWORD_MAX_PHRASE_RUNES}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !disabled) onDone()
          }}
          placeholder="e.g. emergency plumber"
          value={value}
        />
      </InputGroup>
      <Button
        disabled={!value.trim() || disabled}
        size="sm"
        type="submit"
        variant="default"
      >
        Save
      </Button>
      <Button
        disabled={disabled}
        onClick={onDone}
        size="sm"
        type="button"
        variant="ghost"
      >
        Cancel
      </Button>
    </form>
  )
}

function RenameKeywordEditor({
  initialValue,
  disabled,
  onSave,
  onCancel,
}: {
  initialValue: string
  disabled: boolean
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
          maxLength={LOCATION_KEYWORD_MAX_PHRASE_RUNES}
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

export function LocationKeywordsView({ projectId, locationId }: Props) {
  const workspace = useOptionalLocationWorkspace()
  const queryClient = useQueryClient()
  const features = useFeatures()
  const revbotPrompt = useRevbotStartPrompt()
  const [mutating, setMutating] = useState(false)
  const [writeError, setWriteError] = useState("")
  const [findingNearby, setFindingNearby] = useState(false)
  const [nearbyError, setNearbyError] = useState("")
  const [watching, setWatching] = useState(false)
  const baselineRef = useRef<string | null>(null)

  const listsQuery = useQuery({
    ...locationKeywordListsQueryOptions(projectId ?? "", locationId ?? ""),
    enabled: Boolean(projectId && locationId),
    refetchInterval: watching ? 5000 : false,
  })
  const lists = useMemo(
    () => normalizeLocationKeywordLists(listsQuery.data),
    [listsQuery.data]
  )
  const suggestedSignature = useMemo(
    () =>
      [
        ...lists.revserp_suggested.branded,
        ...lists.revserp_suggested.non_branded,
      ]
        .map((phrase) => phrase.toLowerCase())
        .sort()
        .join("|"),
    [lists.revserp_suggested]
  )
  const canManage = lists.can_manage_keywords && (workspace?.canManage ?? true)
  const disabled = !canManage || mutating
  const canFindKeywords =
    features.ai_chat &&
    Boolean(revbotPrompt?.startPrompt) &&
    canManage &&
    Boolean(projectId && locationId)

  const status: ListsStatus = listsQuery.isError
    ? "error"
    : listsQuery.isLoading && !listsQuery.data
      ? "loading"
      : "ready"
  const loadErrorMessage = listsQuery.isError
    ? keywordErrorMessage(listsQuery.error, "Could not load location keywords.")
    : ""

  useEffect(() => {
    if (!watching || baselineRef.current === null) return
    if (suggestedSignature !== baselineRef.current) setWatching(false)
  }, [watching, suggestedSignature])

  useEffect(() => {
    if (!watching) return
    const timeout = window.setTimeout(() => setWatching(false), 5 * 60_000)
    return () => window.clearTimeout(timeout)
  }, [watching])

  useOrganizationEventsListener((event) => {
    if (!projectId || !locationId) return
    if ((event.project_id ?? null) !== projectId) return
    if (event.payload.location_id !== locationId) return
    if (event.type !== "location_keywords.updated") return
    void queryClient.invalidateQueries({
      queryKey: locationKeywordListsQueryKey(projectId, locationId),
    })
    void queryClient.invalidateQueries({
      queryKey: locationKeywordCoverageQueryKey(projectId, locationId),
    })
    setWatching(false)
  })

  function findKeywords() {
    const startPrompt = revbotPrompt?.startPrompt
    if (!canFindKeywords || watching || !startPrompt) return
    if (!projectId || !locationId) return
    baselineRef.current = suggestedSignature
    setWatching(true)
    startPrompt(buildLocationFindKeywordsPrompt({ projectId, locationId }), {
      keepDocked: true,
    })
  }

  const cloudItems = useMemo(() => {
    const items: CombinedProjectKeyword[] = []
    const seen = new Set<string>()
    const add = (kind: LocationKeywordKind, phrases: string[]) => {
      for (const phrase of phrases) {
        const key = `${kind}:${normalizeLocationKeywordKey(phrase)}`
        if (seen.has(key)) continue
        seen.add(key)
        items.push({ keyword: phrase, kind, sources: [] })
      }
    }
    add("brand", lists.selected.branded)
    add("non_brand", lists.selected.non_branded)
    return items
  }, [lists])

  async function saveLists(next: LocationKeywordListsWrite) {
    if (!projectId || !locationId || mutating) return
    setMutating(true)
    setWriteError("")
    try {
      const response = await putLocationKeywordLists(
        projectId,
        locationId,
        next
      )
      queryClient.setQueryData(
        locationKeywordListsQueryKey(projectId, locationId),
        response
      )
      await queryClient.invalidateQueries({
        queryKey: locationKeywordCoverageQueryKey(projectId, locationId),
      })
    } catch (error) {
      setWriteError(
        keywordErrorMessage(error, "Could not save location keywords.")
      )
    } finally {
      setMutating(false)
    }
  }

  async function findNearbyKeywords() {
    if (!projectId || !locationId || findingNearby) return
    setFindingNearby(true)
    setNearbyError("")
    try {
      await refreshLocalSeoLandmarks(projectId, locationId)
      await queryClient.invalidateQueries({
        queryKey: locationKeywordListsQueryKey(projectId, locationId),
      })
    } catch (error) {
      setNearbyError(
        keywordErrorMessage(error, "Could not look up nearby landmarks.")
      )
    } finally {
      setFindingNearby(false)
    }
  }

  const unionRows = useMemo(
    () =>
      buildLocationSelectedUnionRows(
        lists.user_defined,
        lists.revserp_suggested,
        lists.selected
      ),
    [lists.user_defined, lists.revserp_suggested, lists.selected]
  )

  function toggleUnionRow(row: LocationSelectedUnionRow) {
    if (disabled) return
    void saveLists({
      user_defined: lists.user_defined,
      selected: toggleLocationSelectedUnionRow(lists.selected, row),
    })
  }

  function selectAllUnion() {
    if (disabled) return
    const brand = unionRows
      .filter(
        (row) =>
          row.kind === "brand" &&
          !isLocationSelectedUnionRowChecked(lists.selected, row)
      )
      .map((row) => row.phrase)
    const nonBrand = unionRows
      .filter(
        (row) =>
          row.kind === "non_brand" &&
          !isLocationSelectedUnionRowChecked(lists.selected, row)
      )
      .map((row) => row.phrase)
    void saveLists({
      user_defined: lists.user_defined,
      selected: {
        branded: [...lists.selected.branded, ...brand],
        non_branded: [...lists.selected.non_branded, ...nonBrand],
      },
    })
  }

  function deselectAllUnion() {
    if (disabled) return
    void saveLists({
      user_defined: lists.user_defined,
      selected: { branded: [], non_branded: [] },
    })
  }

  function addUserKeyword(kind: LocationKeywordKind, rawPhrase: string) {
    if (disabled) return
    const phrase = rawPhrase.trim()
    if (!phrase) return
    const key = normalizeLocationKeywordKey(phrase)
    const current = locationKeywordKindPhrases(lists.user_defined, kind)
    if (current.some((item) => normalizeLocationKeywordKey(item) === key))
      return
    void saveLists({
      user_defined: setLocationKeywordKindPhrases(lists.user_defined, kind, [
        ...current,
        phrase,
      ]),
      selected: lists.selected,
    })
  }

  function removeUserKeyword(kind: LocationKeywordKind, phrase: string) {
    if (disabled) return
    const key = normalizeLocationKeywordKey(phrase)
    const next = locationKeywordKindPhrases(lists.user_defined, kind).filter(
      (item) => normalizeLocationKeywordKey(item) !== key
    )
    void saveLists({
      user_defined: setLocationKeywordKindPhrases(
        lists.user_defined,
        kind,
        next
      ),
      selected: lists.selected,
    })
  }

  function renameUserKeyword(
    kind: LocationKeywordKind,
    from: string,
    to: string
  ) {
    if (disabled) return
    const phrase = to.trim()
    if (!phrase) return
    void saveLists({
      user_defined: renameLocationKeyword(
        lists.user_defined,
        kind,
        from,
        phrase
      ),
      selected: renameLocationKeyword(lists.selected, kind, from, phrase),
    })
  }

  if (!projectId || !locationId) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <Card className={keywordCardClass}>
          <KeywordCardEmpty message="Select a location to manage its keywords." />
        </Card>
      </div>
    )
  }

  const cardKey = `${projectId}:${locationId}`

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
      {writeError ? (
        <p className="text-sm text-destructive" role="alert">
          {writeError}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-5 max-lg:auto-rows-[30rem] lg:h-[48rem] lg:grid-cols-3">
        <div className="min-h-0">
          <UserKeywordsCard
            key={`user-${cardKey}`}
            brandCount={
              locationKeywordKindPhrases(lists.user_defined, "brand").length
            }
            canManage={canManage}
            disabled={disabled}
            errorText={loadErrorMessage}
            nonBrandCount={
              locationKeywordKindPhrases(lists.user_defined, "non_brand").length
            }
            onAdd={addUserKeyword}
            onRemove={removeUserKeyword}
            onRename={renameUserKeyword}
            onRetry={() => void listsQuery.refetch()}
            status={status}
            userDefined={lists.user_defined}
          />
        </div>
        <div className="min-h-0">
          <SuggestedKeywordsCard
            key={`suggested-${cardKey}`}
            brandCount={
              locationKeywordKindPhrases(lists.revserp_suggested, "brand")
                .length
            }
            canManage={canManage}
            disabled={disabled}
            errorText={loadErrorMessage}
            findingNearby={findingNearby}
            nearbyError={nearbyError}
            nonBrandCount={
              locationKeywordKindPhrases(lists.revserp_suggested, "non_brand")
                .length
            }
            onFindNearby={() => void findNearbyKeywords()}
            canFindKeywords={canFindKeywords}
            onFindKeywords={findKeywords}
            watching={watching}
            onRefresh={() => void listsQuery.refetch()}
            onRetry={() => void listsQuery.refetch()}
            origins={lists.suggested_origins}
            status={status}
            suggested={lists.revserp_suggested}
          />
        </div>
        <div className="min-h-0">
          <SelectedKeywordsCard
            key={`selected-${cardKey}`}
            disabled={disabled}
            errorText={loadErrorMessage}
            onDeselectAll={deselectAllUnion}
            onRetry={() => void listsQuery.refetch()}
            onSelectAll={selectAllUnion}
            onToggle={toggleUnionRow}
            origins={lists.suggested_origins}
            rows={unionRows}
            selected={lists.selected}
            status={status}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-5 max-lg:auto-rows-[30rem] lg:h-[44rem] lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-h-0">
          <KeywordsCoverage
            emptyDescription="Select keywords in the cards above to measure whole-site coverage."
            key={`coverage-${cardKey}`}
            locationId={locationId}
            projectId={projectId}
            scopeNotice="Measured across the whole parent website using this location's selected keywords."
          />
        </div>
        <div className="min-h-0">
          <KeywordCloudCard>
            {cloudItems.length === 0 ? (
              <KeywordCloudMessage text="Tick selected keywords to see them here." />
            ) : (
              <OverviewKeywordCloud items={cloudItems} />
            )}
          </KeywordCloudCard>
        </div>
      </div>
    </div>
  )
}

function UserKeywordsCard({
  userDefined,
  brandCount,
  nonBrandCount,
  status,
  errorText,
  canManage,
  disabled,
  onAdd,
  onRemove,
  onRename,
  onRetry,
}: {
  userDefined: LocationKeywordGroup
  brandCount: number
  nonBrandCount: number
  status: ListsStatus
  errorText: string
  canManage: boolean
  disabled: boolean
  onAdd: (kind: LocationKeywordKind, phrase: string) => void
  onRemove: (kind: LocationKeywordKind, phrase: string) => void
  onRename: (kind: LocationKeywordKind, from: string, to: string) => void
  onRetry: () => void
}) {
  const [tab, setTab] = useState<LocationKeywordKind>("brand")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const rows = locationKeywordKindPhrases(userDefined, tab)

  return (
    <Card className={keywordCardClass}>
      <KeywordCardHeader
        brandCount={brandCount}
        nonBrandCount={nonBrandCount}
        onTab={(next) => {
          setTab(next)
          setAdding(false)
          setEditing(null)
        }}
        tab={tab}
        title="Your keywords"
      />
      {status === "loading" ? (
        <KeywordCardSkeleton />
      ) : status === "error" ? (
        <KeywordCardError message={errorText} onRetry={onRetry} />
      ) : (
        <>
          <KeywordCardList
            emptyMessage={`No ${KEYWORD_KIND_LABELS[tab].toLowerCase()} keywords yet.`}
            getKey={(phrase) => phrase}
            getPhrase={(phrase) => phrase}
            items={rows}
            renderEditor={(phrase) =>
              phrase === editing ? (
                <RenameKeywordEditor
                  disabled={disabled}
                  initialValue={phrase}
                  onCancel={() => setEditing(null)}
                  onSave={(value) => {
                    onRename(tab, phrase, value)
                    setEditing(null)
                  }}
                />
              ) : null
            }
            trailing={(phrase) => (
              <>
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
                <KeywordRemoveButton
                  disabled={disabled}
                  onRemove={() => onRemove(tab, phrase)}
                  phrase={phrase}
                />
              </>
            )}
          />
          {canManage ? (
            <div className="shrink-0 border-t border-border/40 px-3 py-3">
              <p className="mb-2 px-2 text-xs text-muted-foreground">
                {rows.length} {KEYWORD_KIND_LABELS[tab].toLowerCase()} keywords.
              </p>
              {adding ? (
                <AddKeywordForm
                  disabled={disabled}
                  kind={tab}
                  onAdd={onAdd}
                  onDone={() => setAdding(false)}
                />
              ) : (
                <Button
                  disabled={disabled}
                  onClick={() => setAdding(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PlusIcon data-icon="inline-start" />
                  New keyword
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}

function SuggestedKeywordsCard({
  suggested,
  origins,
  brandCount,
  nonBrandCount,
  status,
  errorText,
  canManage,
  canFindKeywords,
  disabled,
  watching,
  findingNearby,
  nearbyError,
  onFindNearby,
  onFindKeywords,
  onRefresh,
  onRetry,
}: {
  suggested: LocationKeywordGroup
  origins: Record<string, LocationKeywordSuggestionSource[]>
  brandCount: number
  nonBrandCount: number
  status: ListsStatus
  errorText: string
  canManage: boolean
  canFindKeywords: boolean
  disabled: boolean
  watching: boolean
  findingNearby: boolean
  nearbyError: string
  onFindNearby: () => void
  onFindKeywords: () => void
  onRefresh: () => void
  onRetry: () => void
}) {
  const [tab, setTab] = useState<LocationKeywordKind>("brand")
  const rows = locationKeywordKindPhrases(suggested, tab)

  return (
    <Card className={keywordCardClass}>
      <KeywordCardHeader
        brandCount={brandCount}
        nonBrandCount={nonBrandCount}
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
          <KeywordListToolbar>
            <span className="ml-auto flex items-center gap-1.5">
              <Button
                disabled={disabled}
                onClick={onRefresh}
                size="xs"
                type="button"
                variant="ghost"
              >
                <RefreshCwIcon aria-hidden="true" />
                Refresh
              </Button>
              {canFindKeywords && rows.length > 0 ? (
                <Button
                  disabled={watching}
                  onClick={onFindKeywords}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  {watching ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <SparklesIcon aria-hidden="true" />
                  )}
                  {watching ? "Finding…" : "Find keywords"}
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  disabled={disabled || findingNearby}
                  onClick={onFindNearby}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  {findingNearby ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <MapPinIcon aria-hidden="true" />
                  )}
                  {findingNearby
                    ? "Looking up nearby…"
                    : "Find nearby keywords"}
                </Button>
              ) : null}
            </span>
          </KeywordListToolbar>
          {rows.length === 0 && canFindKeywords ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50">
                <TagsIcon
                  aria-hidden="true"
                  className="size-5 text-violet-400"
                />
              </div>
              <p className="text-sm font-medium text-foreground">
                No suggested keywords
              </p>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                Let Revbot suggest localized keywords from this location's saved
                services, geography and landmarks.
              </p>
              <Button
                className="mt-2"
                disabled={watching}
                onClick={onFindKeywords}
                size="sm"
                type="button"
              >
                {watching ? (
                  <>
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    Finding…
                  </>
                ) : (
                  <>
                    <SparklesIcon aria-hidden="true" />
                    Find keywords
                  </>
                )}
              </Button>
            </div>
          ) : (
            <KeywordCardList
              emptyMessage="No suggested keywords from the saved services, localities or landmarks."
              getKey={(phrase) => phrase}
              getPhrase={(phrase) => phrase}
              items={rows}
              trailing={(phrase) => (
                <SuggestionSourceBadges
                  sources={origins[normalizeLocationKeywordKey(phrase)] ?? []}
                />
              )}
            />
          )}
          {nearbyError ? (
            <p className="shrink-0 border-t border-border/40 px-4 py-2.5 text-xs text-destructive" role="alert">
              {nearbyError}
            </p>
          ) : null}
        </>
      )}
    </Card>
  )
}

const UNION_ORIGIN_LABELS: Record<LocationSelectedUnionRow["origin"], string> = {
  user: "Yours",
  suggested: "Suggested",
  "selected-only": "Selected",
}

function SelectedKeywordsCard({
  rows,
  selected,
  origins,
  status,
  errorText,
  disabled,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onRetry,
}: {
  rows: LocationSelectedUnionRow[]
  selected: LocationKeywordGroup
  origins: Record<string, LocationKeywordSuggestionSource[]>
  status: ListsStatus
  errorText: string
  disabled: boolean
  onToggle: (row: LocationSelectedUnionRow) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onRetry: () => void
}) {
  const selectedCount = rows.filter((row) =>
    isLocationSelectedUnionRowChecked(selected, row)
  ).length

  return (
    <Card className={keywordCardClass}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3 className="font-heading text-base font-semibold tracking-tight">
          Selected keywords
        </h3>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {selectedCount} of {rows.length} selected
        </span>
      </div>
      <Separator />
      {status === "loading" ? (
        <KeywordCardSkeleton />
      ) : status === "error" ? (
        <KeywordCardError message={errorText} onRetry={onRetry} />
      ) : (
        <>
          <KeywordListToolbar>
            <BulkKeywordButton
              disabled={disabled || rows.length === 0}
              label="Select all"
              onClick={onSelectAll}
            />
            <BulkKeywordButton
              disabled={disabled || selectedCount === 0}
              label="Deselect all"
              onClick={onDeselectAll}
            />
          </KeywordListToolbar>
          <KeywordCardList
            emptyMessage="No keyword candidates yet. Add your own keywords or run Find keywords to choose from."
            getKey={(row) => row.key}
            getPhrase={(row) => row.phrase}
            items={rows}
            leading={(row) => (
              <KeywordSelectionCheckbox
                checked={isLocationSelectedUnionRowChecked(selected, row)}
                disabled={disabled}
                onToggle={() => onToggle(row)}
                phrase={row.phrase}
              />
            )}
            trailing={(row) => (
              <span className="flex shrink-0 flex-wrap items-center gap-1">
                <Badge className="text-[0.65rem]" variant="secondary">
                  {KEYWORD_KIND_LABELS[row.kind]}
                </Badge>
                <Badge className="text-[0.65rem]" variant="outline">
                  {UNION_ORIGIN_LABELS[row.origin]}
                </Badge>
                {row.origin === "suggested" ? (
                  <SuggestionSourceBadges
                    sources={origins[row.key] ?? []}
                  />
                ) : null}
              </span>
            )}
          />
          <div className="flex shrink-0 items-center gap-2 border-t border-border/40 px-5 py-2.5 text-xs text-muted-foreground">
            <TagsIcon aria-hidden="true" className="size-3.5 shrink-0" />
            Only checked keywords persist as selected and feed future Maps runs.
          </div>
        </>
      )}
    </Card>
  )
}
