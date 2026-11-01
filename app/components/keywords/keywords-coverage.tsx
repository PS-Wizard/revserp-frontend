"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ExternalLinkIcon,
  PenLineIcon,
  TagsIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useLocation, useNavigate } from "react-router"

import { ApiError, clientApiFetch } from "~/lib/api"
import type {
  KeywordCoverageField,
  KeywordCoverageSeed,
  KeywordCoverageState,
  ProjectKeywordsResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Card } from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  getProjectIdFromLocationsPath,
  isLocationsPath,
} from "~/components/app-navbar/utils"
import {
  fetchLocationKeywordCoverage,
  locationKeywordCoverageQueryKey,
} from "~/lib/location-keywords-api"
import {
  mergeCompetitorSelectionsIntoSeeds,
  useCompetitorKeywordSelections,
} from "~/lib/competitor-keyword-selections"

type Props = {
  projectId: string | null
  /**
   * Location workspace mode: coverage runs over the whole parent website using
   * this location's selected keywords, not the branch website scope.
   */
  locationId?: string | null
  /** Shown under the card title so the reader knows which site was measured. */
  scopeNotice?: string
  /** Overrides the no-keywords advice, which differs for local selected lists. */
  emptyDescription?: string
}

export type KeywordCoverageCardProps = {
  seeds: KeywordCoverageSeed[]
  title?: string
  scopeNotice?: string
  emptyDescription?: string
  /** Optional per-keyword action rendered beside the write-content button. */
  rowAction?: (keyword: string) => ReactNode
}

export type FilterState = "all" | KeywordCoverageState

type Page = { url: string; fields: KeywordCoverageField[] }

type CoverageData = { seeds?: KeywordCoverageSeed[] }

const FIELD_LABELS: Record<KeywordCoverageField, string> = {
  title: "Title",
  h1: "H1",
  url: "URL",
}

const FIELD_ORDER: Record<KeywordCoverageField, number> = {
  title: 0,
  h1: 1,
  url: 2,
}

const STATE_GROUPS: Array<{
  state: KeywordCoverageState
  label: string
  /** What the reader should do about every keyword in this group. */
  advice: string
  dot: string
  spine: string
}> = [
  {
    state: "cannibalized",
    label: "Cannibalized",
    advice:
      "Several pages compete for the same keyword. Keep one and settle the rest.",
    dot: "bg-rose-500 dark:bg-rose-400",
    spine: "bg-rose-500/80 dark:bg-rose-400/80",
  },
  {
    state: "no_landing_page",
    label: "Gaps",
    advice: "No crawled page targets these. Each one needs a page of its own.",
    dot: "bg-amber-500 dark:bg-amber-400",
    spine: "bg-amber-500/80 dark:bg-amber-400/80",
  },
  {
    state: "likely_targeted",
    label: "Covered",
    advice: "One page covers each of these. This is the healthy state.",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    spine: "bg-emerald-500/80 dark:bg-emerald-400/80",
  },
]

const STATE_BY_ID = new Map(STATE_GROUPS.map((group) => [group.state, group]))

/** Search param the Content tab reads to pre-fill its prompt box (never auto-sent). */
export const CONTENT_PROMPT_PARAM = "contentPrompt"

export function buildContentPrompt(keyword: string) {
  return `Help me write a blog post about "${keyword}"`
}

/** Max keywords folded into one bulk content prompt. */
export const MAX_BULK_CONTENT_KEYWORDS = 20

export function buildBulkContentPrompt(keywords: string[]): string {
  const capped = keywords.slice(0, MAX_BULK_CONTENT_KEYWORDS)
  const quoted = capped.map((keyword) => `"${keyword}"`).join(", ")
  if (capped.length <= 1) {
    return `Help me write content encapsulating ${quoted}. Also help me decide if it is the best primary focus keyword for this content.`
  }
  return `Help me write content encapsulating ${quoted}. Also help me decide which one is the best primary focus keyword for this content.`
}

/** Content-tab target for several coverage keywords drafted as one piece. */
export function contentBulkWriteTarget(
  location: { pathname: string; search: string },
  keywords: string[]
) {
  const params = new URLSearchParams(location.search)
  params.set(CONTENT_PROMPT_PARAM, buildBulkContentPrompt(keywords))
  params.delete("draft")
  if (isLocationsPath(location.pathname)) {
    const projectId = getProjectIdFromLocationsPath(location.pathname)
    if (projectId) params.set("project", projectId)
    return `/app?${params.toString()}#content`
  }
  const search = params.toString()
  return `${location.pathname}${search ? `?${search}` : ""}#content`
}

/** Content-tab target for a coverage keyword, from any shell or locations route. */
export function contentWriteTarget(
  location: { pathname: string; search: string },
  keyword: string
) {
  const params = new URLSearchParams(location.search)
  params.set(CONTENT_PROMPT_PARAM, buildContentPrompt(keyword))
  params.delete("draft")
  if (isLocationsPath(location.pathname)) {
    const projectId = getProjectIdFromLocationsPath(location.pathname)
    if (projectId) params.set("project", projectId)
    return `/app?${params.toString()}#content`
  }
  const search = params.toString()
  return `${location.pathname}${search ? `?${search}` : ""}#content`
}

const cardClass =
  "flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0"

function keywordsQueryKey(projectId: string) {
  return ["project-keywords", projectId] as const
}

export function keywordsQueryOptions(projectId: string) {
  return {
    queryKey: keywordsQueryKey(projectId),
    queryFn: () =>
      clientApiFetch<ProjectKeywordsResponse>(
        `/projects/${projectId}/keywords`
      ),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    enabled: Boolean(projectId),
  }
}

function countByState(seeds: KeywordCoverageSeed[]) {
  const counts: Record<KeywordCoverageState, number> = {
    likely_targeted: 0,
    no_landing_page: 0,
    cannibalized: 0,
  }
  for (const seed of seeds) {
    counts[seed.state] += 1
  }
  return counts
}

function matchLabel(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname
  } catch {
    return url
  }
}

/** Collapses the flat match list into one entry per page, fields in reading order. */
function groupMatchesByPage(seed: KeywordCoverageSeed): Page[] {
  const byURL = new Map<string, Set<KeywordCoverageField>>()
  for (const match of seed.matches) {
    const fields = byURL.get(match.url)
    if (fields) {
      fields.add(match.field)
    } else {
      byURL.set(match.url, new Set([match.field]))
    }
  }
  return [...byURL.entries()].map(([url, fields]) => ({
    url,
    fields: [...fields].sort((a, b) => FIELD_ORDER[a] - FIELD_ORDER[b]),
  }))
}

/** True while the list is taller than its box, so the scroll edge needs a hint. */
function useListOverflows(ref: React.RefObject<HTMLDivElement | null>) {
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const check = () =>
      setOverflows(element.scrollHeight - element.clientHeight > 4)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    return () => observer.disconnect()
  }, [ref])

  return overflows
}

function CoverageSplit({
  counts,
}: {
  counts: Record<KeywordCoverageState, number>
}) {
  const segments = STATE_GROUPS.map((group) => ({
    group,
    value: counts[group.state],
  })).filter((segment) => segment.value > 0)

  return (
    <div
      aria-hidden="true"
      className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full"
    >
      {segments.map((segment) => (
        <span
          className={cn("h-full min-w-1 rounded-full", segment.group.dot)}
          key={segment.group.state}
          style={{ flexGrow: segment.value, flexBasis: 0 }}
        />
      ))}
    </div>
  )
}

export function CoverageFilter({
  counts,
  filter,
  onFilter,
  total,
}: {
  counts: Record<KeywordCoverageState, number>
  filter: FilterState
  onFilter: (next: FilterState) => void
  total: number
}) {
  return (
    <Tabs
      onValueChange={(value) => onFilter(value as FilterState)}
      value={filter}
    >
      <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-lg bg-muted/50 p-1">
        <TabsTrigger className="px-2.5 py-1 text-xs" value="all">
          All
          <span className="text-muted-foreground tabular-nums">{total}</span>
        </TabsTrigger>
        {STATE_GROUPS.map((group) => (
          <TabsTrigger
            className="gap-1.5 px-2.5 py-1 text-xs"
            key={group.state}
            value={group.state}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", group.dot)} />
            {group.label}
            <span className="text-muted-foreground tabular-nums">
              {counts[group.state]}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function FieldNote({ fields }: { fields: KeywordCoverageField[] }) {
  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {fields.map((field) => FIELD_LABELS[field]).join(" · ")}
    </span>
  )
}

function PageLink({ url, fields }: Page) {
  return (
    <a
      className="group flex min-w-0 items-baseline gap-2 text-sm"
      href={url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="min-w-0 truncate text-foreground/85 group-hover:underline group-hover:underline-offset-4">
        {matchLabel(url)}
      </span>
      <FieldNote fields={fields} />
      <ExternalLinkIcon
        aria-hidden="true"
        className="size-3 shrink-0 self-center opacity-0 transition-opacity group-hover:opacity-100"
      />
    </a>
  )
}

function WriteContentButton({ keyword }: { keyword: string }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={`Write content about "${keyword}"`}
            className="shrink-0 self-center rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              void navigate(contentWriteTarget(location, keyword))
            }}
            type="button"
          />
        }
      >
        <PenLineIcon aria-hidden="true" className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>Write content</TooltipContent>
    </Tooltip>
  )
}

function KeywordRow({
  seed,
  rowAction,
  selected,
  onToggle,
}: {
  seed: KeywordCoverageSeed
  rowAction?: (keyword: string) => ReactNode
  selected?: boolean
  onToggle?: () => void
}) {
  const group = STATE_BY_ID.get(seed.state)
  const pages = useMemo(() => groupMatchesByPage(seed), [seed])
  const [open, setOpen] = useState(false)
  const single = pages.length === 1 ? pages[0] : null

  return (
    <li className="group flex gap-3 py-1.5">
      {onToggle ? (
        <span
          className="flex shrink-0 self-start pt-1"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            aria-label={`Select keyword "${seed.keyword}"`}
            checked={selected ?? false}
            onCheckedChange={onToggle}
          />
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className={cn("w-0.5 shrink-0 self-stretch rounded-full", group?.spine)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          {single ? (
            <a
              className="group flex min-w-0 items-baseline gap-2"
              href={single.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="truncate text-sm font-medium group-hover:underline group-hover:underline-offset-4">
                {seed.keyword}
              </span>
              <FieldNote fields={single.fields} />
              <ExternalLinkIcon
                aria-hidden="true"
                className="size-3 shrink-0 self-center opacity-0 transition-opacity group-hover:opacity-100"
              />
            </a>
          ) : (
            <span className="min-w-0 truncate text-sm font-medium">
              {seed.keyword}
            </span>
          )}
          {pages.length > 1 ? (
            <button
              aria-expanded={open}
              className="shrink-0 text-xs text-muted-foreground tabular-nums hover:text-foreground"
              onClick={() => setOpen((value) => !value)}
              type="button"
            >
              {pages.length} pages
            </button>
          ) : null}
          <WriteContentButton keyword={seed.keyword} />
          {rowAction?.(seed.keyword)}
          <span className="sr-only">{group?.label}</span>
        </div>

        {open && pages.length > 1 ? (
          <ul className="mt-1.5 flex flex-col gap-1.5 pl-1">
            {pages.map((page) => (
              <li key={page.url}>
                <PageLink {...page} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  )
}

function CoverageGroup({
  group,
  seeds,
  rowAction,
  selected,
  onToggleKeyword,
}: {
  group: (typeof STATE_GROUPS)[number]
  seeds: KeywordCoverageSeed[]
  rowAction?: (keyword: string) => ReactNode
  /** Keywords ticked for one bulk content draft; keyed by keyword text. */
  selected?: ReadonlySet<string>
  onToggleKeyword?: (keyword: string) => void
}) {
  if (seeds.length === 0) return null

  const ordered = useMemo(
    () => [...seeds].sort((a, b) => a.keyword.localeCompare(b.keyword)),
    [seeds]
  )

  return (
    <section className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border/40 pb-2">
        <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground uppercase">
          <span className={cn("size-1.5 rounded-full", group.dot)} />
          {group.label}
          <span className="text-muted-foreground tabular-nums">
            {seeds.length}
          </span>
        </h4>
        <p className="text-xs text-pretty text-muted-foreground/80">
          {group.advice}
        </p>
      </div>
      <ul className="mt-2 flex flex-col gap-0.5">
        {ordered.map((seed) => (
          <KeywordRow
            key={`${seed.keyword}-${seed.geo ? "geo" : "kw"}`}
            onToggle={
              onToggleKeyword ? () => onToggleKeyword(seed.keyword) : undefined
            }
            rowAction={rowAction}
            seed={seed}
            selected={selected?.has(seed.keyword)}
          />
        ))}
      </ul>
    </section>
  )
}

function CoverageHeadline({
  counts,
  total,
}: {
  counts: Record<KeywordCoverageState, number>
  total: number
}) {
  const gaps = counts.no_landing_page
  const split = counts.cannibalized
  const headline =
    gaps > 0
      ? {
          value: gaps,
          text: gaps === 1 ? "keyword has" : "keywords have",
          tail: "no page on this crawl",
        }
      : split > 0
        ? {
            value: split,
            text: split === 1 ? "keyword is" : "keywords are",
            tail: "split across competing pages",
          }
        : {
            value: total,
            text: "keywords",
            tail: "each have exactly one home page",
          }

  return (
    <div className="shrink-0 px-5 pt-4 pb-3">
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-heading text-3xl leading-none font-semibold tracking-tight tabular-nums">
          {headline.value}
        </span>
        <span className="text-sm text-pretty text-muted-foreground">
          {headline.text} {headline.tail}
        </span>
      </p>
      <div className="mt-3">
        <CoverageSplit counts={counts} />
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <Card className={cardClass}>
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-8 w-full max-w-md rounded-lg" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </Card>
  )
}

function CoverageEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Card className={cardClass}>
      <Empty className="min-h-64 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {action}
      </Empty>
    </Card>
  )
}

/** Coverage seeds for the project, or a location's keywords over the parent site. Shared query, so other cards reuse the cache. */
export function useKeywordCoverageQuery(
  projectId: string | null,
  locationId: string | null = null
) {
  const scoped = Boolean(projectId && locationId)
  return useQuery<CoverageData>({
    queryKey: scoped
      ? locationKeywordCoverageQueryKey(projectId!, locationId!)
      : keywordsQueryKey(projectId!),
    queryFn: async (): Promise<CoverageData> =>
      scoped
        ? await fetchLocationKeywordCoverage(projectId!, locationId!)
        : await keywordsQueryOptions(projectId!).queryFn(),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    enabled: Boolean(projectId),
    placeholderData: (previous) => previous,
  })
}

export function KeywordsCoverage({
  projectId,
  locationId = null,
  scopeNotice,
  emptyDescription = "Add keywords in the cards above, or let Revbot suggest them from Search Console.",
}: Props) {
  const query = useKeywordCoverageQuery(projectId, locationId)
  // Location scopes measure the parent site with the location's own
  // selected list; competitor checks only extend the project matrix.
  const { selected } = useCompetitorKeywordSelections(
    locationId ? null : projectId
  )
  const seeds = useMemo(
    () =>
      locationId
        ? (query.data?.seeds ?? [])
        : mergeCompetitorSelectionsIntoSeeds(query.data?.seeds ?? [], selected),
    [locationId, query.data, selected]
  )

  if (!projectId) {
    return (
      <CoverageEmpty
        description="Select a project to see keyword coverage."
        icon={<TagsIcon aria-hidden="true" />}
        title="No project selected"
      />
    )
  }

  if (query.isLoading && !query.data) {
    return <LoadingSkeleton />
  }

  if (query.isError) {
    const isMissing =
      query.error instanceof ApiError && query.error.status === 404
    return (
      <CoverageEmpty
        action={
          <Button
            onClick={() => void query.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        }
        description={
          query.error instanceof ApiError && !isMissing
            ? query.error.message
            : "The coverage matrix is not ready for this project yet."
        }
        icon={<TriangleAlertIcon aria-hidden="true" />}
        title={
          isMissing
            ? "Coverage not available yet"
            : "Could not load keyword coverage"
        }
      />
    )
  }

  return (
    <KeywordCoverageCard
      emptyDescription={emptyDescription}
      scopeNotice={scopeNotice}
      seeds={seeds}
    />
  )
}

export function KeywordCoverageCard({
  seeds,
  title = "Keyword coverage",
  scopeNotice,
  emptyDescription = "Add keywords in the cards above, or let Revbot suggest them from Search Console.",
  rowAction,
}: KeywordCoverageCardProps) {
  const [filter, setFilter] = useState<FilterState>("all")
  const location = useLocation()
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)
  const listOverflows = useListOverflows(listRef)
  const counts = useMemo(() => countByState(seeds), [seeds])
  /** Bulk selection keyed by keyword text: one tick covers every geo row
  // with the same text. Lives here so it survives filter switches. */
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const seedsSignature = seeds
    .map((seed) => seed.keyword)
    .sort()
    .join("\0")
  useEffect(() => {
    setSelected((previous) => {
      if (previous.size === 0) return previous
      const valid = new Set(seedsSignature ? seedsSignature.split("\0") : [])
      let dropped = false
      const next = new Set<string>()
      for (const keyword of previous) {
        if (valid.has(keyword)) next.add(keyword)
        else dropped = true
      }
      return dropped ? next : previous
    })
  }, [seedsSignature])
  const toggleKeyword = (keyword: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(keyword)) next.delete(keyword)
      else next.add(keyword)
      return next
    })
  }
  /** Selection in seed order, de-duplicated across geo rows. */
  const selectedKeywords = useMemo(() => {
    if (selected.size === 0) return []
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const seed of seeds) {
      if (selected.has(seed.keyword) && !seen.has(seed.keyword)) {
        seen.add(seed.keyword)
        ordered.push(seed.keyword)
      }
    }
    return ordered
  }, [seeds, selected])
  const grouped = useMemo(() => {
    const visible: Record<KeywordCoverageState, KeywordCoverageSeed[]> = {
      cannibalized: [],
      no_landing_page: [],
      likely_targeted: [],
    }
    for (const seed of seeds) visible[seed.state].push(seed)
    return visible
  }, [seeds])

  if (seeds.length === 0) {
    if (title === "Keyword coverage" && !scopeNotice) {
      return (
        <CoverageEmpty
          description={emptyDescription}
          icon={<TagsIcon aria-hidden="true" />}
          title="No keywords yet"
        />
      )
    }
    return (
      <Card className={cardClass}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="font-heading text-base font-semibold tracking-tight">
              {title}
            </h3>
            {scopeNotice ? (
              <p className="text-xs text-pretty text-muted-foreground">
                {scopeNotice}
              </p>
            ) : null}
          </div>
        </div>
        <Empty className="min-h-64 border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TagsIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No keywords yet</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    )
  }

  return (
    <Card className={cardClass}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-heading text-base font-semibold tracking-tight">
            {title}
          </h3>
          {scopeNotice ? (
            <p className="text-xs text-pretty text-muted-foreground">
              {scopeNotice}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CoverageFilter
            counts={counts}
            filter={filter}
            onFilter={setFilter}
            total={seeds.length}
          />
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button
                disabled={selectedKeywords.length === 0}
                onClick={() =>
                  void navigate(
                    contentBulkWriteTarget(location, selectedKeywords)
                  )
                }
                size="sm"
                type="button"
              >
                Write content ({selectedKeywords.length})
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Select multiple keywords to draft one piece of content.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <CoverageHeadline counts={counts} total={seeds.length} />

      <div
        className="relative min-h-0 flex-1 overflow-y-auto border-t border-border/40"
        ref={listRef}
      >
        {filter === "all" ? (
          STATE_GROUPS.map((group) => (
            <CoverageGroup
              group={group}
              key={group.state}
              onToggleKeyword={toggleKeyword}
              rowAction={rowAction}
              seeds={grouped[group.state]}
              selected={selected}
            />
          ))
        ) : (
          <CoverageGroup
            group={STATE_BY_ID.get(filter)!}
            onToggleKeyword={toggleKeyword}
            rowAction={rowAction}
            seeds={grouped[filter]}
            selected={selected}
          />
        )}
        {listOverflows ? (
          <div className="pointer-events-none sticky bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
        ) : null}
      </div>
    </Card>
  )
}
