"use client"

import { Maximize2Icon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Skeleton } from "~/components/ui/skeleton"

import {
  WorkFixesEmptyState,
  type WorkFixesEmptyVariant,
} from "./work-fixes-empty-state"

export function FixCard({
  children,
  count,
  empty,
  emptyVariant,
  footer,
  isError,
  isLoading,
  onMaximize,
  onRetry,
  title,
}: {
  children: React.ReactNode
  count: number
  empty?: React.ReactNode
  emptyVariant?: WorkFixesEmptyVariant
  footer?: React.ReactNode
  isError?: boolean
  isLoading?: boolean
  onMaximize?: () => void
  onRetry?: () => void
  title: string
}) {
  return (
    <Card
      aria-label={title}
      className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0"
      role="region"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3 className="truncate font-heading text-base font-semibold tracking-tight">
          {title}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {onMaximize ? (
            <Button
              aria-label={`Expand ${title}`}
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={onMaximize}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Maximize2Icon aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
          <span className="rounded-full bg-muted px-2 py-0.5 text-micro font-semibold text-muted-foreground tabular-nums">
            {isLoading ? "…" : isError ? "—" : count}
          </span>
        </div>
      </div>
      <hr className="mx-5 shrink-0 border-0 border-t border-border/60" />
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-full flex-col px-3 py-4">
          {isLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-4/5" />
            </div>
          ) : isError ? (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Could not load this section.
              </p>
              {onRetry ? (
                <Button
                  className="mt-3"
                  onClick={onRetry}
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  Retry
                </Button>
              ) : null}
            </div>
          ) : count > 0 ? (
            <ul className="divide-y divide-border/50">{children}</ul>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              {empty ??
                (emptyVariant ? (
                  <WorkFixesEmptyState size="sm" variant={emptyVariant} />
                ) : null)}
            </div>
          )}
        </div>
      </ScrollArea>
      {footer ? (
        <div className="shrink-0 border-t border-border/60 px-5 py-3">
          {footer}
        </div>
      ) : null}
    </Card>
  )
}
