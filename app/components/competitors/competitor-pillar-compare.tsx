"use client"

import { memo, useMemo } from "react"
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { PAINT_A, PILLAR_IDS, PILLAR_LABEL } from "~/components/compare/helpers"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { cn, formatBucketLabel } from "~/lib/utils"

// "Us" takes the pillar's own color, as on the Overview cards. Them stays
// neutral, so green/red only mean "who leads".
function ourColor(id: string) {
  return id === "overall" ? PAINT_A.color : getPillarChartColor(id, 0)
}
const THEM_COLOR = "oklch(0.62 0.01 250)"
const RING_SIZE = 200

type CompareRow = { id: string; label: string; you: number | null; them: number | null }
type CompareCardModel = {
  id: string
  title: string
  you: number | null
  them: number | null
  rows: CompareRow[]
}

function roundScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null
}

function scoreDelta(you: number | null, them: number | null) {
  return you === null || them === null ? null : you - them
}

function buildCompareCards(
  you: ScoreBreakdownResponse | null | undefined,
  them: ScoreBreakdownResponse | null | undefined
): CompareCardModel[] {
  const pillarOf = (breakdown: typeof you, id: string) =>
    breakdown?.pillars.find((pillar) => pillar.id === id)

  const overall: CompareCardModel = {
    id: "overall",
    title: "Overall",
    you: roundScore(you?.overall_score),
    them: roundScore(them?.overall_score),
    rows: PILLAR_IDS.map((id) => ({
      id,
      label: PILLAR_LABEL[id],
      you: roundScore(pillarOf(you, id)?.score),
      them: roundScore(pillarOf(them, id)?.score),
    })),
  }

  const pillars = PILLAR_IDS.map((id): CompareCardModel => {
    const yourPillar = pillarOf(you, id)
    const theirPillar = pillarOf(them, id)
    // Your bucket order first; buckets only the competitor has go last.
    const buckets = [...(yourPillar?.buckets ?? [])]
    for (const bucket of theirPillar?.buckets ?? []) {
      if (!buckets.some((item) => item.id === bucket.id)) buckets.push(bucket)
    }
    return {
      id,
      title: PILLAR_LABEL[id],
      you: roundScore(yourPillar?.score),
      them: roundScore(theirPillar?.score),
      rows: buckets.map((bucket) => ({
        id: bucket.id,
        label: formatBucketLabel(bucket.id, bucket.label),
        you: roundScore(yourPillar?.buckets.find((item) => item.id === bucket.id)?.score),
        them: roundScore(theirPillar?.buckets.find((item) => item.id === bucket.id)?.score),
      })),
    }
  })

  return [overall, ...pillars]
}

export const CompetitorPillarCompare = memo(function CompetitorPillarCompare({
  you,
  them,
  youLabel,
  themLabel,
}: {
  you?: ScoreBreakdownResponse | null
  them?: ScoreBreakdownResponse | null
  youLabel: string
  themLabel: string
}) {
  const cards = useMemo(() => buildCompareCards(you, them), [you, them])

  return (
    <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <CompareCard
          card={card}
          key={card.id}
          themLabel={themLabel}
          youLabel={youLabel}
        />
      ))}
    </div>
  )
})

function CompareCard({
  card,
  youLabel,
  themLabel,
}: {
  card: CompareCardModel
  youLabel: string
  themLabel: string
}) {
  const segments = useMemo(
    () => [
      { key: "you", label: youLabel, value: card.you, color: ourColor(card.id) },
      { key: "them", label: themLabel, value: card.them, color: THEM_COLOR },
    ],
    [card.id, card.you, card.them, themLabel, youLabel]
  )

  return (
    <Card className="flex h-full flex-col bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardTitle>{card.title} Score</CardTitle>
        <CardAction>
          <DeltaBadge delta={scoreDelta(card.you, card.them)} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ScoreRadialChart
          centerValue={card.you}
          chartSize={RING_SIZE}
          embed
          segments={segments}
          title={`${card.title} Score`}
        />
        <div className="mt-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 pl-0 text-xs text-muted-foreground">
                  {card.id === "overall" ? "Pillar" : "Bucket"}
                </TableHead>
                <TableHead className="h-8 text-right text-xs text-muted-foreground">Us</TableHead>
                <TableHead className="h-8 text-right text-xs text-muted-foreground">Them</TableHead>
                <TableHead className="h-8 pr-0 text-right text-xs text-muted-foreground">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {card.rows.map((row) => (
                <CompareRowLine key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null
  return (
    <Badge
      className={cn(
        delta > 0 && "border-emerald-400/40 text-emerald-400",
        delta < 0 && "border-rose-400/40 text-rose-400"
      )}
      variant="outline"
    >
      {delta > 0 ? <TrendingUpIcon /> : delta < 0 ? <TrendingDownIcon /> : <MinusIcon />}
      {delta > 0 ? "+" : ""}
      {delta} pts
    </Badge>
  )
}

function CompareRowLine({ row }: { row: CompareRow }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="max-w-0 truncate py-2.5 pl-0 text-muted-foreground">
        {row.label}
      </TableCell>
      <TableCell
        className="w-14 py-2.5 text-right font-mono font-medium tabular-nums"
        style={{ color: row.you === null ? undefined : PAINT_A.color }}
      >
        {row.you === null ? "—" : `${row.you}%`}
      </TableCell>
      <TableCell className="w-14 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
        {row.them === null ? "—" : `${row.them}%`}
      </TableCell>
      <TableCell className="w-24 py-2.5 pr-0 text-right">
        <DeltaBadge delta={scoreDelta(row.you, row.them)} />
      </TableCell>
    </TableRow>
  )
}
