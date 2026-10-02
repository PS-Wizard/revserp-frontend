"use client"

import { memo, useMemo } from "react"

import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"
import type { CrawlResponse } from "~/lib/api.types"
import { getCrawlTimestamp } from "~/lib/crawl"

export type CrawlProgressDirection = "up" | "down" | "flat"

export type CrawlProgressStep = {
  at: number
  crawlId: string
  score: number
  delta: number | null
  direction: CrawlProgressDirection
}

const DIRECTION_BAR_CLASS: Record<CrawlProgressDirection, string> = {
  up: "bg-emerald-500/70",
  down: "bg-rose-500/70",
  flat: "bg-muted-foreground/35",
}

/** Completed crawls in date order, each scored against the one before it. A
 * crawl with no score is skipped so it cannot flatten a real change to zero. */
export function crawlProgressSteps(
  crawls: CrawlResponse[]
): CrawlProgressStep[] {
  const scored = crawls
    .filter(
      (crawl) => crawl.status === "completed" && crawl.overall_score !== null
    )
    .map((crawl) => ({
      at: getCrawlTimestamp(crawl),
      crawlId: crawl.id,
      score: crawl.overall_score ?? 0,
    }))
    .sort((left, right) => left.at - right.at)

  return scored.map((step, index) => {
    const previous = scored[index - 1]
    const delta = previous ? step.score - previous.score : null
    return {
      ...step,
      delta,
      direction:
        delta === null
          ? "flat"
          : delta > 0
            ? "up"
            : delta < 0
              ? "down"
              : "flat",
    }
  })
}

const stripDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function formatStripDate(timestamp: number) {
  return stripDateFormatter.format(new Date(timestamp))
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
        First crawl
      </span>
    )
  }

  const Icon =
    delta > 0 ? ArrowUpRightIcon : delta < 0 ? ArrowDownRightIcon : MinusIcon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums",
        delta > 0 &&
          "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        delta < 0 && "border-rose-500/40 text-rose-600 dark:text-rose-400",
        delta === 0 && "border-border/60 text-muted-foreground"
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {delta > 0 ? "+" : ""}
      {delta}
    </span>
  )
}

export const OverviewCrawlProgress = memo(function OverviewCrawlProgress({
  crawls,
}: {
  crawls: CrawlResponse[]
}) {
  const steps = useMemo(() => crawlProgressSteps(crawls), [crawls])
  const latest = steps.at(-1)

  if (!latest) {
    return (
      <Card className="bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader>
          <CardTitle>Crawl progress</CardTitle>
          <CardDescription>
            Score movement appears here once a crawl finishes.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardTitle>Crawl progress</CardTitle>
        <CardDescription>
          Overall score moved on{" "}
          {
            steps.filter((step) => step.delta !== null && step.delta !== 0)
              .length
          }{" "}
          of {Math.max(steps.length - 1, 1)} crawls since{" "}
          {formatStripDate(steps[0].at)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-heading text-4xl leading-none font-semibold tabular-nums">
            {latest.score}%
          </span>
          <DeltaBadge delta={latest.delta} />
          <span className="text-sm text-muted-foreground">
            vs. the previous crawl
          </span>
        </div>

        <div className="mt-5 flex h-16 items-end gap-0.5">
          {steps.map((step, index) => (
            <Tooltip key={step.crawlId}>
              <TooltipTrigger
                render={
                  <span
                    className="relative flex h-full min-w-0 flex-1 items-end"
                    tabIndex={0}
                  />
                }
              >
                <span
                  className={cn(
                    "w-full rounded-[3px] transition-[height,background-color] duration-300 motion-reduce:transition-none",
                    DIRECTION_BAR_CLASS[step.direction],
                    index === steps.length - 1 && "ring-1 ring-foreground/25"
                  )}
                  style={{ height: `${Math.max(step.score, 4)}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <span className="block font-medium">
                  {step.score}% on {formatStripDate(step.at)}
                </span>
                <span className="block text-muted-foreground">
                  {step.delta === null
                    ? "First scored crawl"
                    : step.delta === 0
                      ? "No change"
                      : `${step.delta > 0 ? "+" : ""}${step.delta} vs. previous crawl`}
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatStripDate(steps[0].at)}</span>
          <span>{steps.length} scored crawls</span>
        </div>
      </CardContent>
    </Card>
  )
})
