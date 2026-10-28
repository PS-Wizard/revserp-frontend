"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  MapPinIcon,
  RefreshCwIcon,
  SparklesIcon,
  TagsIcon,
} from "lucide-react"

import {
  KEYWORD_KIND_LABELS,
  KeywordCardEmpty,
  KeywordCardError,
  KeywordCardSkeleton,
  KeywordCloudCard,
  KeywordCloudMessage,
  keywordCardClass,
  keywordErrorMessage,
} from "~/components/keyword-management/keyword-card-parts"
import {
  CombinedKeywordsCard,
  SuggestedKeywordsCard,
  UserKeywordsCard,
  type KeywordCardStatus,
} from "~/components/keyword-management/project-keyword-cards"
import { KeywordEstimatesTable } from "~/components/keywords/keyword-estimates-table"
import {
  KeywordsCoverage,
  useKeywordCoverageQuery,
} from "~/components/keywords/keywords-coverage"
import { OverviewKeywordCloud } from "~/components/overview-keyword-cloud"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import {
  LOCATION_KEYWORD_MAX_PHRASE_RUNES,
  buildLocationCombinedRows,
  deselectLocationKeywords,
  locationKeywordCoverageQueryKey,
  locationKeywordKindPhrases,
  locationKeywordListsQueryKey,
  locationKeywordListsQueryOptions,
  normalizeLocationKeywordKey,
  normalizeLocationKeywordLists,
  putLocationKeywordLists,
  renameLocationKeyword,
  setLocationKeywordKindPhrases,
  type LocationKeywordKind,
  type LocationKeywordListsWrite,
  type LocationKeywordSuggestionSource,
} from "~/lib/location-keywords-api"
import { refreshLocalSeoLandmarks } from "~/lib/local-seo-api"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import type { CombinedProjectKeyword } from "~/lib/project-keywords-query"
import {
  locationKeywordAnalysisQueryKey,
  locationKeywordAnalysisQueryOptions,
} from "~/lib/keyword-analysis-api"
import { cn } from "~/lib/utils"
import { buildLocationFindKeywordsPrompt } from "~/components/locations/location-keywords-revbot-prompt"
import { useRevbotStartPrompt } from "~/components/revbot/revbot-start-prompt-context"
import { useOrganizationEventsListener } from "~/hooks/use-organization-events"
import { useFeatures } from "~/lib/features"

type Props = {
  projectId: string | null
  locationId: string | null
}

const SUGGESTION_SOURCE_LABELS: Record<
  LocationKeywordSuggestionSource,
  string
> = {
  service: "Service",
  locality: "Locality",
  landmark: "Landmark",
}

function LocationSuggestionSourceBadges({
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

  const status: KeywordCardStatus = listsQuery.isError
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

  const combinedRows = useMemo(
    () =>
      buildLocationCombinedRows(
        lists.user_defined,
        lists.revserp_suggested,
        lists.selected
      ),
    [lists.user_defined, lists.revserp_suggested, lists.selected]
  )

  const userKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const phrase of [...lists.user_defined.branded, ...lists.user_defined.non_branded])
      keys.add(normalizeLocationKeywordKey(phrase))
    return keys
  }, [lists.user_defined])
  const suggestedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const phrase of [...lists.revserp_suggested.branded, ...lists.revserp_suggested.non_branded])
      keys.add(normalizeLocationKeywordKey(phrase))
    return keys
  }, [lists.revserp_suggested])
  const cloudItems = useMemo(() => {
    const items: CombinedProjectKeyword[] = []
    for (const row of combinedRows) {
      items.push({ keyword: row.phrase, kind: row.kind, sources: [] })
    }
    return items
  }, [combinedRows])

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


  function addUserKeywords(kind: LocationKeywordKind, phrases: string[]) {
    if (disabled) return
    const current = locationKeywordKindPhrases(lists.user_defined, kind)
    const keys = new Set(current.map(normalizeLocationKeywordKey))
    const merged = [...current]
    for (const rawPhrase of phrases) {
      const phrase = rawPhrase.trim()
      if (!phrase) continue
      const key = normalizeLocationKeywordKey(phrase)
      if (keys.has(key)) continue
      keys.add(key)
      merged.push(phrase)
    }
    if (merged.length === current.length) return
    // One batched save through the existing lists path.
    void saveLists({
      user_defined: setLocationKeywordKindPhrases(lists.user_defined, kind, merged),
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
      selected: deselectLocationKeywords(
        deselectLocationKeywords(lists.selected, "brand", [phrase]),
        "non_brand",
        [phrase]
      ),
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
            title="Your keywords"
            brandPhrases={locationKeywordKindPhrases(lists.user_defined, "brand")}
            nonBrandPhrases={locationKeywordKindPhrases(lists.user_defined, "non_brand")}
            status={status}
            errorText={loadErrorMessage}
            onRetry={() => void listsQuery.refetch()}
            canManage={canManage}
            disabled={disabled}
            onAdd={addUserKeywords}
            onRemove={removeUserKeyword}
            onRename={renameUserKeyword}
            renameMaxLength={LOCATION_KEYWORD_MAX_PHRASE_RUNES}
          />
        </div>
        <div className="min-h-0">
          <SuggestedKeywordsCard
            key={`suggested-${cardKey}`}
            brandPhrases={locationKeywordKindPhrases(lists.revserp_suggested, "brand")}
            nonBrandPhrases={locationKeywordKindPhrases(lists.revserp_suggested, "non_brand")}
            status={status}
            errorText={loadErrorMessage}
            onRetry={() => void listsQuery.refetch()}
            toolbar={(_tab, rows) => (
              <span className="ml-auto flex items-center gap-1.5">
                <Button
                  disabled={disabled}
                  onClick={() => void listsQuery.refetch()}
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
                    onClick={findKeywords}
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
                    onClick={() => void findNearbyKeywords()}
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
                    {findingNearby ? "Looking up nearby…" : "Find nearby keywords"}
                  </Button>
                ) : null}
              </span>
            )}
            emptyState={
              canFindKeywords ? (
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
                    onClick={findKeywords}
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
              ) : undefined
            }
            emptyMessage="No suggested keywords from the saved services, localities or landmarks."
            getTrailing={(phrase) => (
              <LocationSuggestionSourceBadges
                sources={lists.suggested_origins[normalizeLocationKeywordKey(phrase)] ?? []}
              />
            )}
            belowList={
              nearbyError ? (
                <p className="shrink-0 border-t border-border/40 px-4 py-2.5 text-xs text-destructive" role="alert">
                  {nearbyError}
                </p>
              ) : null
            }
          />
        </div>
        <div className="min-h-0">
          <CombinedKeywordsCard
            key={`combined-${cardKey}`}
            brandItems={combinedRows
              .filter((row) => row.kind === "brand")
              .map((row) => ({ key: row.key, phrase: row.phrase }))}
            nonBrandItems={combinedRows
              .filter((row) => row.kind === "non_brand")
              .map((row) => ({ key: row.key, phrase: row.phrase }))}
            status={status}
            errorText={loadErrorMessage}
            onRetry={() => void listsQuery.refetch()}
            emptyMessage={(kind) =>
              `No ${KEYWORD_KIND_LABELS[kind].toLowerCase()} keywords yet. Add your own keywords or run Find keywords.`
            }
            getTrailing={(row) => (
              <span className="flex shrink-0 flex-wrap items-center gap-1">
                {userKeys.has(row.key) ? (
                  <Badge className="text-[0.65rem]" variant="secondary">
                    User-defined
                  </Badge>
                ) : null}
                {suggestedKeys.has(row.key) ? (
                  <Badge className="text-[0.65rem]" variant="outline">
                    Revserp suggested
                  </Badge>
                ) : null}
                {suggestedKeys.has(row.key) ? (
                  <LocationSuggestionSourceBadges sources={lists.suggested_origins[row.key] ?? []} />
                ) : null}
              </span>
            )}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-5 max-lg:auto-rows-[30rem] lg:h-[44rem] lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-h-0">
          <KeywordsCoverage
            emptyDescription="Save keywords in the cards above to measure whole-site coverage."
            key={`coverage-${cardKey}`}
            locationId={locationId}
            projectId={projectId}
            scopeNotice="Measured across the whole parent website using this location's combined keywords."
          />
        </div>
        <div className="min-h-0">
          <KeywordCloudCard>
            {cloudItems.length === 0 ? (
              <KeywordCloudMessage text="Save keywords above to see them here." />
            ) : (
              <OverviewKeywordCloud items={cloudItems} />
            )}
          </KeywordCloudCard>
        </div>
      </div>

      <div className="min-h-0">
        <LocationKeywordEstimatesCard
          key={`estimates-${cardKey}`}
          canManage={canManage}
          locationId={locationId}
          projectId={projectId}
        />
      </div>
    </div>
  )
}

const ESTIMATES_POLL_MS = 5000
const ESTIMATES_TIMEOUT_MS = 5 * 60_000
const estimatesCardClass = cn(keywordCardClass, "h-[32rem] min-w-0")

function locationAnalyzeKeywordsPrompt() {
  return [
    "Estimate keyword metrics for this location with the Revserp keyword tools.",
    "",
    "1. Start by calling get_project_keywords AND get_business_profile so you know this location's saved brand and non-brand keywords plus the brand, offering, and audience. Ground every estimate in this location's market (locality), crawled page content (titles, headings, body text) and Search Console data when connected. Do not use web search.",
    "2. For EVERY saved keyword (brand and non-brand), estimate ALL five metrics as numbers: rank (1-100), traffic, volume, kd (0-100), cpc. Every metric must be a best-effort educated guess even without measured data — never null, never omitted, never \"--\".",
    "3. Save the complete list with set_keyword_analysis, never passing competitor_id so the estimates attach to the current location.",
  ].join("\n")
}


function LocationKeywordEstimatesCard({
  projectId,
  locationId,
  canManage,
}: {
  projectId: string
  locationId: string
  canManage: boolean
}) {
  const revbotPrompt = useRevbotStartPrompt()
  const startPrompt = revbotPrompt?.startPrompt
  const queryClient = useQueryClient()
  const [watching, setWatching] = useState(false)
  const baselineRef = useRef<string | null>(null)

  const query = useQuery({
    ...locationKeywordAnalysisQueryOptions(projectId, locationId),
    refetchInterval: watching ? ESTIMATES_POLL_MS : false,
  })
  const keywords = useMemo(() => query.data?.keywords ?? [], [query.data])
  const coverageQuery = useKeywordCoverageQuery(projectId, locationId)
  const signature = JSON.stringify(query.data?.keywords ?? null)

  useEffect(() => {
    setWatching(false)
    baselineRef.current = null
  }, [projectId, locationId])

  useEffect(() => {
    if (!watching || baselineRef.current === null) return
    if (signature !== baselineRef.current) setWatching(false)
  }, [watching, signature])

  useEffect(() => {
    if (!watching) return
    const timeout = window.setTimeout(() => setWatching(false), ESTIMATES_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [watching])

  useOrganizationEventsListener((event) => {
    if (event.type !== "keyword_analysis.updated") return
    if ((event.project_id ?? null) !== projectId) return
    if (
      typeof event.payload?.location_id !== "string" ||
      event.payload.location_id !== locationId
    )
      return
    void queryClient.invalidateQueries({
      queryKey: locationKeywordAnalysisQueryKey(projectId, locationId),
    })
  })

  const canGenerate = Boolean(startPrompt && canManage && !watching)
  const showAnalyzeButton = Boolean(canManage && startPrompt)

  function openAnalysisChat() {
    if (!startPrompt) return
    baselineRef.current = signature
    setWatching(true)
    startPrompt(locationAnalyzeKeywordsPrompt(), { keepDocked: true })
  }

  if (query.isLoading && !query.data) {
    return (
      <Card className={estimatesCardClass}>
        <KeywordCardSkeleton />
      </Card>
    )
  }

  if (query.isError) {
    return (
      <Card className={estimatesCardClass}>
        <KeywordCardError
          message={keywordErrorMessage(query.error, "Could not load estimates.")}
          onRetry={() => void query.refetch()}
        />
      </Card>
    )
  }

  const headerAction = watching ? (
    <Button disabled size="xs" type="button" variant="ghost">
      <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      Working
    </Button>
  ) : keywords.length > 0 && showAnalyzeButton ? (
    <Button
      disabled={!canGenerate}
      onClick={openAnalysisChat}
      size="xs"
      type="button"
      variant="ghost"
    >
      <RefreshCwIcon aria-hidden="true" />
      Refresh estimates
    </Button>
  ) : null

  const emptyAction = showAnalyzeButton ? (
    <>
      <Button
        className="mt-2"
        disabled={watching || !canGenerate}
        onClick={openAnalysisChat}
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
          "Analyze Keywords"
        )}
      </Button>
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
    </>
  ) : null

  return (
    <Card className={estimatesCardClass}>
      <KeywordEstimatesTable
        action={headerAction}
        coverage={coverageQuery.data?.seeds}
        description="Brand and non-brand estimates for this location's keywords."
        emptyAction={emptyAction}
        footerNote={watching && keywords.length > 0 ? "Waiting for new estimates…" : undefined}
        rows={keywords}
        title="Keyword estimates"
      />
    </Card>
  )
}

