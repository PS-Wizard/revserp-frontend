"use client"

import type { ReactNode } from "react"

import { Card } from "~/components/ui/card"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"

export const COMPETITOR_COVER_GRADIENTS = [
  {
    background:
      "linear-gradient(145deg, rgb(225 29 72 / 0.24) 0%, rgb(127 29 29 / 0.14) 42%, transparent 74%)",
    monogram: "rgb(225 29 72 / 0.3)",
  },
  {
    background:
      "linear-gradient(145deg, rgb(20 184 166 / 0.24) 0%, rgb(15 118 110 / 0.14) 42%, transparent 74%)",
    monogram: "rgb(20 184 166 / 0.3)",
  },
  {
    background:
      "linear-gradient(145deg, rgb(99 102 241 / 0.24) 0%, rgb(67 56 202 / 0.14) 42%, transparent 74%)",
    monogram: "rgb(99 102 241 / 0.3)",
  },
] as const

export function competitorCoverGradient(index: number) {
  return COMPETITOR_COVER_GRADIENTS[index % COMPETITOR_COVER_GRADIENTS.length]
}

export const competitorCardActionClass =
  "flex size-8 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/60 text-muted-foreground transition-colors"

export function describeCompetitorAveragePosition(
  average: number | null
): string {
  if (typeof average === "number" && Number.isFinite(average) && average > 0) {
    return `Avg. position ${Number.isInteger(average) ? average : average.toFixed(1)}`
  }
  return "No observed position"
}

export function CompetitorCardShell({
  title,
  index,
  body,
  footerBadge,
  footerActions,
  interactive = false,
  onActivate,
}: {
  title: string
  index: number
  body: ReactNode
  footerBadge: ReactNode
  footerActions?: ReactNode
  interactive?: boolean
  onActivate?: () => void
}) {
  const cover = competitorCoverGradient(index)
  const monogram = title.charAt(0).toUpperCase() || "?"
  return (
    <Card
      className={cn(
        "relative flex min-h-44 w-full flex-col gap-0 self-start overflow-hidden bg-card py-0",
        interactive &&
          "cursor-pointer transition-colors hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03]"
      )}
      onClick={interactive ? onActivate : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onActivate?.()
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: cover.background }}
      />
      <div className="relative flex items-start justify-between gap-3 px-4 pt-4">
        <span className="min-w-0 truncate pr-2 text-sm font-medium">{title}</span>
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/50 text-micro font-semibold uppercase"
          style={{ backgroundColor: cover.monogram }}
        >
          {monogram}
        </span>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 py-5 text-center">
        {body}
      </div>
      <div className="relative flex items-center justify-between gap-2 px-4 pb-4">
        {footerBadge}
        {footerActions ? (
          <div className="flex items-center gap-1.5">{footerActions}</div>
        ) : null}
      </div>
    </Card>
  )
}

export function CompetitorCardSkeleton() {
  return (
    <Card className="flex min-h-44 flex-col gap-0 py-0">
      <div className="flex items-start justify-between px-4 pt-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="size-6 rounded-md" />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-5">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex items-center justify-between px-4 pb-4">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="size-8 rounded-full" />
      </div>
    </Card>
  )
}
