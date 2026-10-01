"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useQuery } from "@tanstack/react-query"
import { ExternalLinkIcon, TagsIcon, TriangleAlertIcon } from "lucide-react"

import { ApiError, clientApiFetch } from "~/lib/api"
import type {
  KeywordCoverageField,
  KeywordCoverageState,
  ProjectKeywordsResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
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

type Props = {
  projectId: string | null
}

type KeywordCoverageSeed = ProjectKeywordsResponse["seeds"][number]

type FilterState = "all" | KeywordCoverageState

type Page = { url: string; fields: KeywordCoverageField[] }


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
    advice: "Several pages compete for the same keyword. Keep one and settle the rest.",
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
    label: "Targeted",
    advice: "One page targets each of these. This is the healthy state.",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    spine: "bg-emerald-500/80 dark:bg-emerald-400/80",
  },
]

const STATE_BY_ID = new Map(STATE_GROUPS.map((group) => [group.state, group]))

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

function CoverageSplit({ counts }: { counts: Record<KeywordCoverageState, number> }) {
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

function CoverageFilter({
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
            <span
              className={cn("size-1.5 shrink-0 rounded-full", group.dot)}
            />
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

function KeywordRow({ seed }: { seed: KeywordCoverageSeed }) {
  const group = STATE_BY_ID.get(seed.state)
  const pages = useMemo(() => groupMatchesByPage(seed), [seed])
  const [open, setOpen] = useState(false)
  const single = pages.length === 1 ? pages[0] : null

  return (
    <li className="flex gap-3 py-1.5">
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
}: {
  group: (typeof STATE_GROUPS)[number]
  seeds: KeywordCoverageSeed[]
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
          <KeywordRow key={`${seed.keyword}-${seed.geo ? "geo" : "kw"}`} seed={seed} />
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

export function KeywordsCoverage({ projectId }: Props) {
  const query = useQuery({
    ...keywordsQueryOptions(projectId!),
    enabled: Boolean(projectId),
    placeholderData: (previous) => previous,
  })

  const [filter, setFilter] = useState<FilterState>("all")
  const listRef = useRef<HTMLDivElement>(null)
  const listOverflows = useListOverflows(listRef)

  const seeds = useMemo(() => query.data?.seeds ?? [], [query.data])
  const counts = useMemo(() => countByState(seeds), [seeds])
  const grouped = useMemo(() => {
    const visible: Record<KeywordCoverageState, KeywordCoverageSeed[]> = {
      cannibalized: [],
      no_landing_page: [],
      likely_targeted: [],
    }
    for (const seed of seeds) visible[seed.state].push(seed)
    return visible
  }, [seeds])

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

  if (seeds.length === 0) {
    return (
      <CoverageEmpty
        description="Add keywords in the cards above, or let Revbot suggest them from Search Console."
        icon={<TagsIcon aria-hidden="true" />}
        title="No keywords yet"
      />
    )
  }

  return (
    <Card className={cardClass}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h3 className="font-heading text-base font-semibold tracking-tight">
          Keyword coverage
        </h3>
        <CoverageFilter
          counts={counts}
          filter={filter}
          onFilter={setFilter}
          total={seeds.length}
        />
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
              seeds={grouped[group.state]}
            />
          ))
        ) : (
          <CoverageGroup
            group={STATE_BY_ID.get(filter)!}
            seeds={grouped[filter]}
          />
        )}
        {listOverflows ? (
          <div className="pointer-events-none sticky bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
        ) : null}
      </div>
    </Card>
  )
}
