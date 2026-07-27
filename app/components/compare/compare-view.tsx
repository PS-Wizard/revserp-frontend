"use client"

import { memo, useMemo, useState } from "react"
import { XIcon } from "lucide-react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Separator } from "~/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import type { CrawlResponse } from "~/lib/api.types"

import {
  BucketBars,
  BucketRadar,
  CompareLegend,
  HealthRidge,
  ScoreBars,
  ScoreRing,
  SpreadBars,
} from "./charts"
import {
  PAINT_A,
  PAINT_B,
  PILLAR_IDS,
  PILLAR_LABEL,
  bucketRows,
  healthShares,
  pillarScore,
  spreadRows,
  spreadSummary,
  type PillarId,
  type SpreadFilter,
} from "./helpers"
import { useCompareData } from "./use-compare-data"

// Rows past this point overflow the 22rem cap, so the list starts scrolling.
const SPREAD_SCROLL_AFTER = 7

export type CompareSide = {
  projectName: string
  baseUrl: string
  crawl: CrawlResponse
}

type CompareViewProps = {
  a: CompareSide
  b: CompareSide
  onExit: () => void
}

export const CompareView = memo(function CompareView({
  a,
  b,
  onExit,
}: CompareViewProps) {
  const [pillar, setPillar] = useState<PillarId>("seo")
  const [spreadFilter, setSpreadFilter] = useState<SpreadFilter>("all")
  const { breakdownA, breakdownB, healthA, healthB, isPending, error } =
    useCompareData(a.crawl.id, b.crawl.id)

  const scores = useMemo(
    () => [
      {
        metric: "Overall",
        a: breakdownA?.overall_score ?? null,
        b: breakdownB?.overall_score ?? null,
      },
      ...PILLAR_IDS.map((id) => ({
        metric: PILLAR_LABEL[id],
        a: pillarScore(breakdownA, id),
        b: pillarScore(breakdownB, id),
      })),
    ],
    [breakdownA, breakdownB]
  )
  const buckets = useMemo(
    () => bucketRows(breakdownA, breakdownB, pillar),
    [breakdownA, breakdownB, pillar]
  )
  const radarRows = useMemo(
    () => buckets.map((row) => ({ label: row.label, a: row.a ?? 0, b: row.b ?? 0 })),
    [buckets]
  )
  const summary = useMemo(
    () => spreadSummary(breakdownA, breakdownB, spreadFilter),
    [breakdownA, breakdownB, spreadFilter]
  )
  const spread = useMemo(
    () => spreadRows(breakdownA, breakdownB, spreadFilter),
    [breakdownA, breakdownB, spreadFilter]
  )
  const sharesA = healthShares(healthA)
  const sharesB = healthShares(healthB)

  const legend = {
    nameA: a.projectName,
    nameB: b.projectName,
    paintA: PAINT_A,
    paintB: PAINT_B,
  }

  if (error) {
    return (
      <Shell a={a} b={b} onExit={onExit}>
        <div className="px-4 lg:px-6">
          <Card>
            <CardContent className="py-12 text-center text-sm">
              Could not load one of these crawls.
            </CardContent>
          </Card>
        </div>
      </Shell>
    )
  }

  if (isPending || !breakdownA || !breakdownB) {
    return (
      <Shell a={a} b={b} onExit={onExit}>
        <div className="grid gap-6 px-4 lg:grid-cols-2 lg:px-6">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-xl border border-border/50 bg-card/40"
            />
          ))}
        </div>
      </Shell>
    )
  }

  return (
    <Shell a={a} b={b} onExit={onExit}>
      {/* headline scores — two tiles plus one grouped bar chart */}
      <div className="grid gap-6 px-4 lg:grid-cols-[minmax(0,0.32fr)_minmax(0,1fr)] lg:px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
          <ScoreTile side={b} paint={PAINT_B} against={breakdownA.overall_score} />
          <ScoreTile side={a} paint={PAINT_A} against={breakdownB.overall_score} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Scores</CardTitle>
            <CardDescription>Overall and pillar scores, side by side</CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreBars rows={scores} {...legend} />
            <CompareLegend {...legend} className="mt-4 justify-center" />
          </CardContent>
        </Card>
      </div>

      {/* buckets — profile and ranked gaps, two cards like the audit summary */}
      <div className="grid gap-6 px-4 lg:grid-cols-[minmax(280px,0.32fr)_minmax(0,0.68fr)] lg:px-6">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>{PILLAR_LABEL[pillar]} profile</CardTitle>
            <CardDescription>Bucket scores for both sites</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-center gap-4">
            {buckets.length < 3 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Needs at least three buckets to plot.
              </p>
            ) : (
              <BucketRadar rows={radarRows} {...legend} />
            )}
            <CompareLegend {...legend} className="justify-center" />
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Bucket comparison</CardTitle>
            <CardDescription>
              Both bars run to the real score. The brighter tip is the lead.
            </CardDescription>
            <CardAction>
              <Tabs
                value={pillar}
                onValueChange={(value) => setPillar(value as PillarId)}
              >
                <TabsList>
                  {PILLAR_IDS.map((id) => (
                    <TabsTrigger key={id} value={id}>
                      {PILLAR_LABEL[id]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-center">
            {buckets.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No buckets scored for this pillar.
              </p>
            ) : (
              <>
                <BucketBars rows={buckets} {...legend} />
                <CompareLegend {...legend} className="mt-4 justify-center" />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* prevalence — balance panel beside the ranked spread */}
      <div className="grid gap-6 px-4 lg:grid-cols-[minmax(280px,0.32fr)_minmax(0,0.68fr)] lg:px-6">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Issue balance</CardTitle>
            <CardDescription>Lower share of pages wins the issue</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <div>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-5xl font-medium tabular-nums"
                  style={{ color: PAINT_A.color }}
                >
                  {summary.ahead}
                </span>
                <span className="text-2xl text-muted-foreground tabular-nums">
                  / {summary.total}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                issues where {a.projectName} affects a smaller share of its
                pages
              </p>

              <div className="mt-5 flex h-2.5 gap-1 overflow-hidden">
                {[
                  { key: "ahead", n: summary.ahead, color: PAINT_A.color },
                  { key: "behind", n: summary.behind, color: PAINT_B.color },
                  { key: "level", n: summary.level, color: "var(--muted)" },
                ]
                  .filter((part) => part.n > 0)
                  .map((part) => (
                    <span
                      key={part.key}
                      className="rounded-full"
                      style={{
                        flexGrow: part.n,
                        backgroundColor: part.color,
                      }}
                    />
                  ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                <Tally n={summary.ahead} label="ahead" color={PAINT_A.color} />
                <Tally n={summary.behind} label="behind" color={PAINT_B.color} />
                <Tally n={summary.level} label="level" color="var(--muted-foreground)" />
              </div>
            </div>

            <dl className="mt-auto flex flex-col gap-4">
              <BalanceRow
                paint={PAINT_A}
                label="Widest lead"
                detail={summary.lead?.label ?? "None"}
                value={summary.lead ? `${Math.round(summary.lead.gap)} pts` : "—"}
              />
              <BalanceRow
                paint={PAINT_B}
                label="Widest deficit"
                detail={summary.deficit?.label ?? "None"}
                value={
                  summary.deficit ? `${Math.round(summary.deficit.gap)} pts` : "—"
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Issue spread</CardTitle>
            <CardDescription>
              Share of each site&rsquo;s own pages affected — shorter is better
            </CardDescription>
            <CardAction>
              <Tabs
                value={spreadFilter}
                onValueChange={(value) => setSpreadFilter(value as SpreadFilter)}
              >
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  {PILLAR_IDS.map((id) => (
                    <TabsTrigger key={id} value={id}>
                      {PILLAR_LABEL[id]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-center">
            {spread.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No issues recorded for this pillar.
              </p>
            ) : (
              <>
                {spread.length > SPREAD_SCROLL_AFTER ? (
                  <ScrollArea className="h-[22rem]">
                    <SpreadBars rows={spread} {...legend} />
                  </ScrollArea>
                ) : (
                  <SpreadBars rows={spread} {...legend} />
                )}
                <CompareLegend {...legend} className="mt-4 justify-center" />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* distribution */}
      {sharesA && sharesB ? (
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Page health</CardTitle>
            </CardHeader>
            <CardContent>
              <HealthRidge
                values={{ a: sharesA, b: sharesB }}
                paintA={PAINT_A}
                paintB={PAINT_B}
                nameA={a.projectName}
                nameB={b.projectName}
              />
              <Separator className="mt-10 mb-6" />
              <ul className="space-y-2.5">
                <Finding
                  name={b.projectName}
                  paint={PAINT_B}
                  clean={pct(sharesB[0])}
                  median={median(sharesB)}
                />
                <Finding
                  name={a.projectName}
                  paint={PAINT_A}
                  clean={pct(sharesA[0])}
                  median={median(sharesA)}
                />
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

    </Shell>
  )
})

function pct(share: number) {
  return `${Math.round(share * 100)}%`
}

/** Median issue count from the histogram shares. */
function median(shares: number[]) {
  let cumulative = 0
  for (let i = 0; i < shares.length; i++) {
    cumulative += shares[i]
    if (cumulative >= 0.5) return i === shares.length - 1 ? `${i}+` : `${i}`
  }
  return "0"
}

function Finding({
  name,
  paint,
  clean,
  median: medianIssues,
}: {
  name: string
  paint: typeof PAINT_A
  clean: string
  median: string
}) {
  return (
    <li className="flex items-baseline gap-2.5 text-sm">
      <span
        className="mt-1.5 size-2 shrink-0 rounded-[3px]"
        style={{ backgroundColor: paint.color }}
      />
      <span className="text-muted-foreground">
        <span className="font-medium" style={{ color: paint.color }}>
          {name}
        </span>{" "}
        keeps {clean} of its pages clean, at a median of {medianIssues} issues
        per page.
      </span>
    </li>
  )
}

/* ---------------------------------------------------------------- chrome */

function Shell({
  a,
  b,
  onExit,
  children,
}: CompareViewProps & { children: React.ReactNode }) {
  return (
    <div className="@container/main relative flex flex-1 flex-col gap-6 py-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 lg:px-6">
        <h1 className="font-heading text-lg font-medium">
          {b.projectName}{" "}
          <span className="text-muted-foreground">vs</span> {a.projectName}
        </h1>
        <button
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={onExit}
          type="button"
        >
          <XIcon className="size-4" />
          Close comparison
        </button>
      </div>
      {children}
    </div>
  )
}

function ScoreTile({
  side,
  paint,
  against,
}: {
  side: CompareSide
  paint: typeof PAINT_A
  against: number
}) {
  const score = side.crawl.overall_score
  const delta = typeof score === "number" ? score - against : null

  return (
    <Card className="justify-between gap-4">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: paint.color }}
          />
          <span className="truncate font-medium">{side.projectName}</span>
        </CardDescription>
        <CardTitle className="text-4xl tabular-nums">
          {typeof score === "number" ? `${score}%` : "—"}
        </CardTitle>
        {delta !== null && delta !== 0 ? (
          <CardAction>
            <span
              className="rounded-md border border-border px-2 py-0.5 text-sm font-medium tabular-nums"
              style={{ color: paint.color }}
            >
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-4">
        <div className="min-w-0 text-sm text-muted-foreground">
          <div className="truncate">{side.baseUrl}</div>
          <div className="tabular-nums">
            {side.crawl.urls_crawled.toLocaleString()} pages crawled
          </div>
        </div>
        <ScoreRing value={score ?? null} color={paint.color} />
      </CardContent>
    </Card>
  )
}

function BalanceRow({
  paint,
  label,
  detail,
  value,
}: {
  paint?: typeof PAINT_A
  label: string
  detail: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-1 size-2.5 shrink-0 rounded-[3px]"
        style={{ backgroundColor: paint?.color ?? "var(--muted-foreground)" }}
      />
      <div className="min-w-0 flex-1">
        <dt className="text-sm font-medium">{label}</dt>
        <dd className="truncate text-sm text-muted-foreground">{detail}</dd>
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

function Tally({
  n,
  label,
  color,
}: {
  n: number
  label: string
  color: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="size-2 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium tabular-nums">{n}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}
