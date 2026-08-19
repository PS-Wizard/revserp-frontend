"use client"

import { memo } from "react"

import type {
  ScorePotentialOpportunity,
  ScorePotentialScores,
} from "~/lib/api.types"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
} from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import { TrendBadge } from "~/components/trend-sparkline"
import { cn, formatBucketLabel } from "~/lib/utils"

const PILLAR_LABELS: Record<string, string> = {
  seo: "SEO",
  aeo: "AEO",
  pagespeed: "PageSpeed",
}

function pillarLabel(id: string) {
  return PILLAR_LABELS[id] ?? id.replace(/^bucket_/, "").toUpperCase()
}

function humanizeBucket(id: string) {
  return id
    .replace(/^bucket_/, "")
    .replace(/(^|_)([a-z])/g, (_, __, char: string) => ` ${char.toUpperCase()}`)
    .trim()
}

export const OpportunityCards = memo(function OpportunityCards({
  opportunities,
  current,
  selected,
  onToggle,
  labels,
}: {
  opportunities: ScorePotentialOpportunity[]
  current: ScorePotentialScores
  selected: ReadonlySet<string>
  onToggle: (bucketId: string) => void
  labels: Record<string, string>
}) {
  return (
    <div className="@container/cards w-full min-w-0 px-4 lg:px-6">
      <div className="grid auto-rows-fr grid-cols-1 gap-4 @min-[30rem]/cards:grid-cols-2 @min-[58rem]/cards:grid-cols-3">
        {opportunities.map((opportunity) => {
          const label =
            labels[opportunity.bucket] ??
            formatBucketLabel(
              opportunity.bucket,
              humanizeBucket(opportunity.bucket)
            )
          const projected = opportunity.scores_if_fixed
          const delta = opportunity.delta.overall
          const isSelected = selected.has(opportunity.bucket)

          return (
            <Card
              key={opportunity.bucket}
              onClick={() => onToggle(opportunity.bucket)}
              className={cn(
                "relative flex cursor-pointer flex-col bg-gradient-to-br from-card via-card to-muted/30 transition-colors duration-150",
                "hover:border-primary/25 focus-visible:outline-none",
                isSelected && "border-primary/45"
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CardDescription className="truncate">
                    {label}
                  </CardDescription>
                  <span className="shrink-0 rounded border border-border/70 px-1.5 py-px text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    {pillarLabel(opportunity.pillar)}
                  </span>
                </div>
                <span
                  className="shrink-0"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggle(opportunity.bucket)}
                    aria-label={`Toggle ${label}`}
                  />
                </span>
              </CardHeader>
              <div className="flex flex-1 items-baseline justify-center gap-1.5 px-6 py-4">
                <span className="font-heading text-4xl leading-none font-semibold tabular-nums">
                  {projected.overall}
                </span>
                <span className="text-sm font-light text-muted-foreground">
                  overall
                </span>
              </div>
              <CardFooter className="flex items-end justify-between gap-4 text-sm">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="font-medium tabular-nums">
                    {current.overall}% → {projected.overall}%
                  </div>
                  <div className="text-muted-foreground">
                    Fixing {label.toLowerCase()} moves your overall score
                  </div>
                </div>
                <TrendBadge delta={delta} />
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
})
