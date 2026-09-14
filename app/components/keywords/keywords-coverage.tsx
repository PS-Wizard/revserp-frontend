"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { ExternalLinkIcon, TagsIcon, TriangleAlertIcon } from "lucide-react"

import {
  EChartsPieChart,
  type ChartConfig,
} from "~/components/evilcharts/charts/echarts-pie-chart"
import { ApiError, clientApiFetch } from "~/lib/api"
import type {
  KeywordCoverageField,
  KeywordCoverageState,
  ProjectKeywordsResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"
import { Badge } from "~/components/ui/badge"
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

type FilterState =
  "all" | "likely_targeted" | "no_landing_page" | "cannibalized"

const START_ANGLE = 210

const STATE_ORDER: Record<KeywordCoverageState, number> = {
  cannibalized: 0,
  no_landing_page: 1,
  likely_targeted: 2,
}

const STATE_BADGES: Record<
  KeywordCoverageState,
  { label: string; variant: "secondary" | "destructive" | "outline" }
> = {
  likely_targeted: { label: "Targeted", variant: "secondary" },
  no_landing_page: { label: "No landing page", variant: "outline" },
  cannibalized: { label: "Cannibalized", variant: "destructive" },
}

const FIELD_LABELS: Record<KeywordCoverageField, string> = {
  title: "Title",
  h1: "H1",
  url: "URL",
}

const SLICE_META: Array<{
  id: KeywordCoverageState
  label: string
  shortLabel: string
  color: string
  bar: string
}> = [
  {
    id: "likely_targeted",
    label: "Targeted",
    shortLabel: "Targeted",
    color: "#34d399",
    bar: "bg-emerald-500 dark:bg-emerald-400",
  },
  {
    id: "no_landing_page",
    label: "No landing page",
    shortLabel: "Gaps",
    color: "#fbbf24",
    bar: "bg-amber-500 dark:bg-amber-400",
  },
  {
    id: "cannibalized",
    label: "Cannibalized",
    shortLabel: "Cannibalized",
    color: "#fb7185",
    bar: "bg-rose-500 dark:bg-rose-400",
  },
]

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

function sortSeeds(seeds: KeywordCoverageSeed[]) {
  return [...seeds].sort((a, b) => {
    if (a.state !== b.state) {
      return STATE_ORDER[a.state] - STATE_ORDER[b.state]
    }
    return a.keyword.localeCompare(b.keyword)
  })
}

function matchLabel(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname
  } catch {
    return url
  }
}

function StateBadge({ state }: { state: KeywordCoverageState }) {
  const badge = STATE_BADGES[state]
  return <Badge variant={badge.variant}>{badge.label}</Badge>
}

function KeywordRow({
  seed,
  isLast,
}: {
  seed: KeywordCoverageSeed
  isLast: boolean
}) {
  return (
    <div className={cn("py-4", !isLast && "border-b border-border/40")}>
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 text-sm leading-snug font-medium">
          {seed.keyword}
        </p>
        <StateBadge state={seed.state} />
      </div>

      {seed.matches.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No matching pages on this crawl.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {seed.matches.map((match, index) => (
            <li key={`${match.url}-${match.field}-${index}`}>
              <a
                className="group inline-flex max-w-full items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                href={match.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Badge className="shrink-0" variant="outline">
                  {FIELD_LABELS[match.field]}
                </Badge>
                <span className="min-w-0 truncate">
                  {matchLabel(match.url)}
                </span>
                <ExternalLinkIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CoverageTabs({
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
      <TabsList className="h-auto w-full justify-start gap-1 rounded-lg bg-muted/50 p-1">
        <TabsTrigger className="px-3 py-1.5 text-sm" value="all">
          All
          <span className="text-muted-foreground tabular-nums">{total}</span>
        </TabsTrigger>
        {SLICE_META.map((slice) => (
          <TabsTrigger
            className="gap-1.5 px-3 py-1.5 text-sm"
            key={slice.id}
            value={slice.id}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            {slice.shortLabel}
            <span className="text-muted-foreground tabular-nums">
              {counts[slice.id]}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function CoverageChart({
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
  const selectedId = filter === "all" ? null : filter

  const slices = useMemo(
    () =>
      SLICE_META.map((entry) => ({
        ...entry,
        value: counts[entry.id],
      })),
    [counts]
  )

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {}
    for (const slice of slices) {
      config[slice.id] = {
        label: slice.label,
        colors: { light: [slice.color], dark: [slice.color] },
      }
    }
    return config
  }, [slices])

  const pieData = useMemo(
    () => slices.filter((slice) => slice.value > 0),
    [slices]
  )

  const active = slices.find((slice) => slice.id === selectedId) ?? null
  const selectedOnChart =
    selectedId && pieData.some((slice) => slice.id === selectedId)
      ? selectedId
      : null
  const centerValue = active ? active.value : total

  const ticks = useMemo(() => {
    let from = 0
    return pieData.map((slice) => {
      from += slice.value
      return { ...slice, from }
    })
  }, [pieData])

  const pickState = (id: KeywordCoverageState) => {
    onFilter(filter === id ? "all" : id)
  }

  if (pieData.length === 0) {
    return <p className="text-sm text-muted-foreground">No keywords yet.</p>
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center">
      <div className="relative aspect-square w-full">
        <EChartsPieChart
          className="h-full w-full"
          config={chartConfig}
          data={pieData}
          dataKey="value"
          nameKey="id"
          onSelectionChange={(selection) => {
            const id = selection?.dataKey as KeywordCoverageState | undefined
            onFilter(id ?? "all")
          }}
          selectedSector={selectedOnChart}
        >
          <EChartsPieChart.Pie
            cornerRadius={10}
            endAngle={START_ANGLE}
            innerRadius="74%"
            isClickable
            outerRadius="94%"
            paddingAngle={6}
            startAngle={-30}
          />
          <EChartsPieChart.Tooltip />
        </EChartsPieChart>

        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 text-muted-foreground/50"
          viewBox="0 0 100 100"
        >
          <path
            d="M 23.15 65.5 A 31 31 0 1 1 76.85 65.5"
            fill="none"
            stroke="currentColor"
            strokeDasharray="0.1 5"
            strokeLinecap="round"
            strokeWidth="1"
          />
        </svg>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-3xl font-semibold tabular-nums">
            {centerValue.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-2 w-full">
        <div className="flex text-sm text-muted-foreground">
          {ticks.map((tick) => (
            <button
              className="min-w-0 text-left transition-colors hover:text-foreground"
              key={tick.id}
              onClick={() => pickState(tick.id)}
              style={{ flexGrow: tick.value, flexBasis: 0 }}
              type="button"
            >
              {tick.from.toLocaleString()}
            </button>
          ))}
          <span>{total.toLocaleString()}</span>
        </div>
        <div className="mt-1.5 flex gap-1">
          {ticks.map((tick) => (
            <button
              className="flex h-3 min-w-0 cursor-pointer items-center p-0"
              key={tick.id}
              onClick={() => pickState(tick.id)}
              style={{ flexGrow: tick.value, flexBasis: 0 }}
              type="button"
              title={tick.label}
            >
              <span className={cn("h-1.5 w-full rounded-full", tick.bar)} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <Card className={cn(cardClass, "h-[36rem] lg:grid lg:grid-cols-3")}>
      <Skeleton className="h-full rounded-none" />
      <div className="flex flex-col gap-3 border-t border-border/40 p-5 lg:col-span-2 lg:border-t-0 lg:border-l">
        <Skeleton className="h-9 w-full max-w-lg rounded-lg" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
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

  const seeds = useMemo(() => query.data?.seeds ?? [], [query.data])
  const counts = useMemo(() => countByState(seeds), [seeds])
  const filtered = useMemo(
    () =>
      sortSeeds(
        filter === "all" ? seeds : seeds.filter((seed) => seed.state === filter)
      ),
    [seeds, filter]
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

  if (seeds.length === 0) {
    return (
      <CoverageEmpty
        description="Add phrases in Target keywords, or let Revbot pull them from Search Console."
        icon={<TagsIcon aria-hidden="true" />}
        title="No target keywords"
      />
    )
  }

  return (
    <Card className={cn(cardClass, "h-[36rem]")}>
      <div className="grid min-h-0 flex-1 lg:grid-cols-3">
        <div className="flex min-h-0 flex-col border-border/40 lg:border-r">
          <div className="shrink-0 px-5 pt-5 pb-3">
            <h3 className="font-heading text-base font-semibold tracking-tight">
              Keyword coverage
            </h3>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-5">
            <CoverageChart
              counts={counts}
              filter={filter}
              onFilter={setFilter}
              total={seeds.length}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-2">
          <div className="shrink-0 border-b border-border/40 px-5 py-4">
            <CoverageTabs
              counts={counts}
              filter={filter}
              onFilter={setFilter}
              total={seeds.length}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No keywords in this tab.
              </p>
            ) : (
              filtered.map((seed, index) => (
                <KeywordRow
                  isLast={index === filtered.length - 1}
                  key={`${seed.keyword}-${seed.geo ? "geo" : "kw"}`}
                  seed={seed}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
