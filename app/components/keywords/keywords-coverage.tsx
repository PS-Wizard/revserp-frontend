"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { MapPinIcon, TagsIcon, TriangleAlertIcon } from "lucide-react"

import { ApiError, clientApiFetch } from "~/lib/api"
import type {
  KeywordCoverageField,
  KeywordCoverageState,
  ProjectKeywordsResponse,
} from "~/lib/api.types"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "~/components/ui/progress"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"

type Props = {
  projectId: string | null
}

type KeywordCoverageSeed = ProjectKeywordsResponse["seeds"][number]
type KeywordCoverageMatch = KeywordCoverageSeed["matches"][number]

type FilterState =
  "all" | "likely_targeted" | "no_landing_page" | "cannibalized"

const FIELD_LABELS: Record<KeywordCoverageField, string> = {
  title: "Title",
  h1: "H1",
  url: "URL",
}

const STATE_BADGES: Record<
  KeywordCoverageState,
  { label: string; variant: "secondary" | "destructive" | "outline" }
> = {
  likely_targeted: { label: "Targeted", variant: "secondary" },
  no_landing_page: { label: "No page", variant: "outline" },
  cannibalized: { label: "Cannibalized", variant: "destructive" },
}

const STATE_ORDER: Record<KeywordCoverageState, number> = {
  cannibalized: 0,
  no_landing_page: 1,
  likely_targeted: 2,
}

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
    // The matrix is recomputed server-side on every request; never serve a
    // cached copy client-side.
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

function TabCount({ value }: { value: number }) {
  if (value <= 0) return null
  return <span className="text-muted-foreground tabular-nums">{value}</span>
}

function StateBadge({ state }: { state: KeywordCoverageState }) {
  const badge = STATE_BADGES[state]
  return <Badge variant={badge.variant}>{badge.label}</Badge>
}

function Evidence({ matches }: { matches: KeywordCoverageMatch[] }) {
  if (matches.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  const visible = matches.slice(0, 2)

  return (
    <div className="flex flex-col gap-1">
      {visible.map((match, index) => (
        <div
          className="flex items-center gap-1.5"
          key={`${match.url}-${index}`}
        >
          <Badge variant="outline">{FIELD_LABELS[match.field]}</Badge>
          <a
            className="max-w-[22rem] truncate text-sm text-muted-foreground hover:text-foreground"
            href={match.url}
            onClick={(event) => event.stopPropagation()}
            rel="noopener noreferrer"
            target="_blank"
          >
            {matchLabel(match.url)}
          </a>
        </div>
      ))}
      {matches.length > 2 ? (
        <span className="text-xs text-muted-foreground">
          +{matches.length - 2} more
        </span>
      ) : null}
    </div>
  )
}

function StateMixBar({
  counts,
  total,
}: {
  counts: Record<KeywordCoverageState, number>
  total: number
}) {
  if (total === 0) return null

  const parts: Array<{ key: KeywordCoverageState; className: string }> = [
    { key: "likely_targeted", className: "bg-primary" },
    { key: "no_landing_page", className: "bg-muted-foreground/30" },
    { key: "cannibalized", className: "bg-destructive/40" },
  ]

  return (
    <div className="flex h-1 overflow-hidden bg-muted">
      {parts.map((part) => {
        const width = (counts[part.key] / total) * 100
        if (width <= 0) return null
        return (
          <div
            className={part.className}
            key={part.key}
            style={{ width: `${width}%` }}
          />
        )
      })}
    </div>
  )
}

function TargetedCard({
  counts,
  total,
}: {
  counts: Record<KeywordCoverageState, number>
  total: number
}) {
  const percent = total === 0 ? 0 : (counts.likely_targeted / total) * 100

  return (
    <Card className="@container/card bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardDescription>Targeted</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {counts.likely_targeted}
        </CardTitle>
      </CardHeader>
      <CardFooter>
        <Progress className="w-full" value={percent}>
          <ProgressLabel>Coverage</ProgressLabel>
          <ProgressValue />
        </Progress>
      </CardFooter>
    </Card>
  )
}

function CountCard({ label, count }: { label: string; count: number }) {
  return (
    <Card className="@container/card bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {count}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
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
    <Empty className="min-h-64 border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
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
      <div className="px-4 lg:px-6">
        <CoverageEmpty
          description="Select a project to see keyword coverage."
          icon={<TagsIcon aria-hidden="true" />}
          title="No project selected"
        />
      </div>
    )
  }

  if (query.isLoading && !query.data) {
    return (
      <div className="px-4 lg:px-6">
        <LoadingSkeleton />
      </div>
    )
  }

  if (query.isError) {
    const isMissing =
      query.error instanceof ApiError && query.error.status === 404
    return (
      <div className="px-4 lg:px-6">
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
      </div>
    )
  }

  if (seeds.length === 0) {
    return (
      <div className="px-4 lg:px-6">
        <CoverageEmpty
          description="Add phrases in Target keywords below, or let Revbot pull them from Search Console."
          icon={<TagsIcon aria-hidden="true" />}
          title="No target keywords"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <TargetedCard counts={counts} total={seeds.length} />
        <CountCard count={counts.no_landing_page} label="No landing page" />
        <CountCard count={counts.cannibalized} label="Cannibalized" />
      </div>

      <Card className="gap-0 overflow-hidden bg-gradient-to-br from-card via-card to-muted/30 py-0">
        <CardHeader className="border-b">
          <Tabs
            onValueChange={(value) => setFilter(value as FilterState)}
            value={filter}
          >
            <TabsList>
              <TabsTrigger value="all">
                All
                <TabCount value={seeds.length} />
              </TabsTrigger>
              <TabsTrigger value="likely_targeted">
                Targeted
                <TabCount value={counts.likely_targeted} />
              </TabsTrigger>
              <TabsTrigger value="no_landing_page">
                Gaps
                <TabCount value={counts.no_landing_page} />
              </TabsTrigger>
              <TabsTrigger value="cannibalized">
                Cannibalized
                <TabCount value={counts.cannibalized} />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <StateMixBar counts={counts} total={seeds.length} />
        <CardContent className="px-0">
          {filtered.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-muted-foreground">
              No keywords in this filter.
            </p>
          ) : (
            <Table className="[&_td]:px-4 [&_th]:px-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Pages</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((seed) => (
                  <TableRow key={`${seed.keyword}-${seed.geo ? "geo" : "kw"}`}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-56 truncate font-medium">
                          {seed.keyword}
                        </span>
                        {seed.geo ? (
                          <Badge variant="outline">
                            <MapPinIcon data-icon="inline-start" />
                            Location
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StateBadge state={seed.state} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <Evidence matches={seed.matches} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {query.data?.crawl_id ? null : (
        <p className="text-xs text-muted-foreground">
          No completed crawl yet. Coverage will fill in after the next crawl.
        </p>
      )}
    </div>
  )
}
