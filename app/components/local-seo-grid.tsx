import { useMemo, useState } from "react"

import type {
  LocalSeoCell,
  LocalSeoSector,
} from "~/lib/local-seo-api"
import {
  formatLocalSeoEmptyMeanRank,
  formatLocalSeoMeanRank,
  summarizeLocalSeoGridCells,
} from "~/lib/local-seo-directional"
import type { LocalSeoDirectionComparison } from "~/lib/local-seo-directional"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { cn } from "~/lib/utils"

const LOCAL_SEO_BOARD_ORDER: LocalSeoSector[] = [
  "NW",
  "N",
  "NE",
  "W",
  "centre",
  "E",
  "SW",
  "S",
  "SE",
]

const LOCAL_SEO_SECTOR_NAMES: Record<LocalSeoSector, string> = {
  centre: "Business centre",
  N: "North",
  NE: "North-east",
  E: "East",
  SE: "South-east",
  S: "South",
  SW: "South-west",
  W: "West",
  NW: "North-west",
}

function describeLocalSeoCounts(
  foundCount: number,
  absentCount: number,
  unknownCount: number,
) {
  return `${foundCount} found, ${absentCount} absent, ${unknownCount} unknown`
}

function describeLocalSeoDirectionNames(sectors: LocalSeoSector[]): string {
  const names = sectors.map((sector) => LOCAL_SEO_SECTOR_NAMES[sector])
  if (names.length === 0) return "none"
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

function describeLocalSeoExtremeDirections(
  label: "Strongest" | "Weakest",
  directions: LocalSeoSector[],
  meanRank: number | null,
): string {
  return (
    `${label} sampled direction (found-only mean): ` +
    `${describeLocalSeoDirectionNames(directions)} — ${formatLocalSeoMeanRank(meanRank)}.`
  )
}

function describeLocalSeoRankComparison(
  comparison: LocalSeoDirectionComparison,
  meanBySector: Map<LocalSeoSector, number | null>,
): string[] {
  switch (comparison.kind) {
    case "none":
      return ["No sampled direction has a found rank yet."]
    case "single":
      return [
        `${describeLocalSeoDirectionNames([comparison.direction])} is the only ` +
          `sampled direction with a found rank (found-only mean ` +
          `${formatLocalSeoMeanRank(comparison.meanRank)}); no comparison.`,
      ]
    case "tie":
      return [
        `${describeLocalSeoDirectionNames(comparison.directions)} tie at ` +
          `found-only mean ${formatLocalSeoMeanRank(comparison.meanRank)}; ` +
          `no strongest or weakest direction.`,
      ]
    case "different":
      return [
        describeLocalSeoExtremeDirections(
          "Strongest",
          comparison.strongest,
          meanBySector.get(comparison.strongest[0]) ?? null,
        ),
        describeLocalSeoExtremeDirections(
          "Weakest",
          comparison.weakest,
          meanBySector.get(comparison.weakest[0]) ?? null,
        ),
      ]
  }
}

export function LocalSeoGrid({
  cells,
  queries,
}: {
  cells: LocalSeoCell[]
  queries: string[]
}) {
  const [selectedQuery, setSelectedQuery] = useState("all")
  const selectedQueryIndex =
    selectedQuery === "all" ? null : Number.parseInt(selectedQuery, 10)

  const summary = useMemo(
    () =>
      summarizeLocalSeoGridCells(
        cells,
        Number.isNaN(selectedQueryIndex) ? null : selectedQueryIndex,
      ),
    [cells, selectedQueryIndex],
  )

  if (cells.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No grid samples yet</EmptyTitle>
          <EmptyDescription>
            Run a grid check to sample the saved queries at nine points around
            this location.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const pointBySector = new Map(
    summary.points.map((point) => [point.sector, point]),
  )
  const centrePoint = summary.points.find(
    (point) => point.sector === "centre",
  )
  const centerHeadline =
    summary.centerMeanRank !== null
      ? `mean ${formatLocalSeoMeanRank(summary.centerMeanRank)}`
      : (centrePoint
        ? formatLocalSeoEmptyMeanRank(
            centrePoint.absentCount,
            centrePoint.unknownCount,
          )
        : "—")
  const sectorMeanRank = new Map(
    summary.sectors.map((entry) => [entry.sector, entry.meanRank]),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          aria-label="Select query scope"
          onValueChange={(values) => {
            if (values[0] !== undefined) setSelectedQuery(values[0])
          }}
          size="sm"
          value={[selectedQuery]}
          variant="outline"
        >
          <ToggleGroupItem aria-label="All queries" value="all">
            All
          </ToggleGroupItem>
          {queries.map((query, index) => (
            <ToggleGroupItem
              key={`${index}-${query}`}
              aria-label={`Query ${index + 1}: ${query}`}
              title={query}
              value={String(index)}
            >
              Q{index + 1}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {selectedQueryIndex !== null && !Number.isNaN(selectedQueryIndex) ? (
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            Showing {queries[selectedQueryIndex] ?? `query ${selectedQueryIndex + 1}`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Means aggregate the saved queries over each point.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visibility board</CardTitle>
          <CardDescription>
            Nine sampled points around the business. Means use found ranks
            only; absent and unknown samples never move the mean.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul
            aria-label="Nine-point visibility board"
            className="grid grid-cols-3 gap-2 sm:gap-3"
          >
            {LOCAL_SEO_BOARD_ORDER.map((sector) => {
              const point = pointBySector.get(sector)
              const isCentre = sector === "centre"
              const isAllScope =
                selectedQueryIndex === null ||
                Number.isNaN(selectedQueryIndex)
              const headline = !point
                ? "—"
                : isAllScope
                  ? point.meanRank !== null
                    ? formatLocalSeoMeanRank(point.meanRank)
                    : formatLocalSeoEmptyMeanRank(
                        point.absentCount,
                        point.unknownCount,
                      )
                  : point.focusedRank !== null &&
                      point.focusedRank !== undefined
                    ? `#${point.focusedRank}`
                    : point.focusedMatchStatus === "absent"
                      ? "Absent"
                      : "—"
              return (
                <li
                  key={sector}
                  aria-label={
                    point
                      ? `${LOCAL_SEO_SECTOR_NAMES[sector]} sampled point: ` +
                        (isAllScope
                          ? `mean rank ${headline}, ${describeLocalSeoCounts(point.foundCount, point.absentCount, point.unknownCount)}`
                          : `rank ${headline}, match ${point.focusedMatchStatus ?? "unknown"}`)
                      : `${LOCAL_SEO_SECTOR_NAMES[sector]}: not sampled`
                  }
                  className={cn(
                    "flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-border px-2 py-3 text-center sm:min-h-28",
                    isCentre && "border-primary/40 bg-muted/60",
                  )}
                >
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {isCentre ? "Business" : sector}
                  </span>
                  <span className="text-2xl font-semibold tabular-nums sm:text-3xl">
                    {headline}
                  </span>
                  {point ? (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {isAllScope
                        ? describeLocalSeoCounts(
                            point.foundCount,
                            point.absentCount,
                            point.unknownCount,
                          )
                        : `match: ${point.focusedMatchStatus ?? "unknown"}`}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      not sampled
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Centre {centerHeadline}</Badge>
            <span className="text-xs text-muted-foreground">
              Centre rank is reported separately from the surrounding ring.
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ring means</CardTitle>
            <CardDescription>
              Centre, edge midpoints, and corners.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Ring</TableHead>
                  <TableHead scope="col" className="text-right">
                    Mean rank
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Found
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Absent
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Unknown
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rings.map((ring) => (
                  <TableRow key={ring.ring}>
                    <TableCell className="font-medium">{ring.ring}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ring.meanRank !== null
                        ? formatLocalSeoMeanRank(ring.meanRank)
                        : formatLocalSeoEmptyMeanRank(
                            ring.absentCount,
                            ring.unknownCount,
                          )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ring.foundCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ring.absentCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ring.unknownCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compass sectors</CardTitle>
            <CardDescription>
              The eight sampled directions around the business.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Sector</TableHead>
                  <TableHead scope="col" className="text-right">
                    Mean rank
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Found
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Absent
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Unknown
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.sectors.map((sector) => (
                  <TableRow key={sector.sector}>
                    <TableCell className="font-medium">
                      {sector.sector}
                      <span className="sr-only">
                        {" "}
                        {LOCAL_SEO_SECTOR_NAMES[sector.sector]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sector.meanRank !== null
                        ? formatLocalSeoMeanRank(sector.meanRank)
                        : formatLocalSeoEmptyMeanRank(
                            sector.absentCount,
                            sector.unknownCount,
                          )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sector.foundCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sector.absentCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sector.unknownCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sampled direction notes</CardTitle>
          <CardDescription>
            Found-only means over the eight sampled points.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            {`Present in ${summary.directionCounts.present} of 8 sampled directions; ` +
              `absent in ${summary.directionCounts.absent}; unresolved or not ` +
              `sampled in ${summary.directionCounts.unknown}.`}
          </p>
          {describeLocalSeoRankComparison(
            summary.rankComparison,
            sectorMeanRank,
          ).map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
          <p className="text-xs text-muted-foreground">
            Directions describe the sampled points only, not wider areas.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
