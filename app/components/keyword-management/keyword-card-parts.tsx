"use client"

import type { ReactNode } from "react"

import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { ApiError } from "~/lib/api"
import { cn } from "~/lib/utils"

/** The two keyword kinds shared by project and location keyword cards. */
export type KeywordKind = "brand" | "non_brand"

export const KEYWORD_KIND_LABELS: Record<KeywordKind, string> = {
  brand: "Brand",
  non_brand: "Non-brand",
}

export const keywordCardClass =
  "flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0"

export function keywordErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function KeywordKindTabs({
  tab,
  onTab,
  brandCount,
  nonBrandCount,
}: {
  tab: KeywordKind
  onTab: (next: KeywordKind) => void
  brandCount: number
  nonBrandCount: number
}) {
  return (
    <Tabs onValueChange={(value) => onTab(value as KeywordKind)} value={tab}>
      <TabsList className="h-auto shrink-0 gap-1 rounded-lg bg-muted/50 p-1">
        <TabsTrigger className="px-2.5 py-1 text-xs" value="brand">
          Brand
          <span className="text-muted-foreground tabular-nums">
            {brandCount}
          </span>
        </TabsTrigger>
        <TabsTrigger className="px-2.5 py-1 text-xs" value="non_brand">
          Non-brand
          <span className="text-muted-foreground tabular-nums">
            {nonBrandCount}
          </span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

export function KeywordText({ keyword }: { keyword: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="min-w-0 flex-1 basis-32 truncate text-sm leading-snug font-medium text-foreground/90"
            tabIndex={0}
          />
        }
      >
        {keyword}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs break-words">
        {keyword}
      </TooltipContent>
    </Tooltip>
  )
}

export function KeywordSelectionCheckbox({
  phrase,
  checked,
  disabled,
  onToggle,
}: {
  phrase: string
  checked: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <Checkbox
      aria-label={`Select keyword ${phrase}`}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onToggle}
    />
  )
}

export function KeywordCardHeader({
  title,
  tab,
  onTab,
  brandCount,
  nonBrandCount,
}: {
  title: string
  tab: KeywordKind
  onTab: (next: KeywordKind) => void
  brandCount: number
  nonBrandCount: number
}) {
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3 className="font-heading text-base font-semibold tracking-tight">
          {title}
        </h3>
        <KeywordKindTabs
          brandCount={brandCount}
          nonBrandCount={nonBrandCount}
          onTab={onTab}
          tab={tab}
        />
      </div>
      <Separator />
    </>
  )
}

export function KeywordCardSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-5">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-4/5" />
      <Skeleton className="h-10 w-3/5" />
    </div>
  )
}

export function KeywordCardError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-5 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">
        Try again
      </Button>
    </div>
  )
}

export function KeywordCardEmpty({ message }: { message: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

/**
 * Scrollable keyword rows with optional leading (checkbox) and trailing
 * (remove button, source badges) slots. Empty rows read as one centered line,
 * matching every keyword card.
 */
export function KeywordCardList<Item>({
  items,
  getKey,
  getPhrase,
  emptyMessage,
  rowClassName,
  leading,
  trailing,
  renderEditor,
}: {
  items: Item[]
  getKey: (item: Item) => string
  getPhrase: (item: Item) => string
  emptyMessage: string
  rowClassName?: string
  leading?: (item: Item) => ReactNode
  trailing?: (item: Item) => ReactNode
  /** When it returns a node for a row, that editor replaces the row body. */
  renderEditor?: (item: Item) => ReactNode | null
}) {
  return (
    <ScrollArea className="min-h-0 flex-1 overflow-hidden">
      <div className="flex flex-col px-3 py-4">
        {items.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          items.map((item, index) => {
            const editor = renderEditor ? renderEditor(item) : null
            return (
              <div
                className={cn(
                  "flex min-h-12 px-2 py-2",
                  rowClassName ?? "items-center gap-2",
                  index !== items.length - 1 && "border-b border-border/40"
                )}
                key={getKey(item)}
              >
                {leading ? leading(item) : null}
                {editor ?? (
                  <>
                    <KeywordText keyword={getPhrase(item)} />
                    {trailing ? trailing(item) : null}
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </ScrollArea>
  )
}

export function KeywordCloudCard({ children }: { children: ReactNode }) {
  return (
    <Card className={keywordCardClass}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3 className="truncate font-heading text-base font-semibold tracking-tight">
          Keyword cloud
        </h3>
        <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-yellow-700 dark:bg-yellow-400" />
            Brand
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-600 dark:bg-blue-400" />
            Non-brand
          </span>
        </div>
      </div>
      <Separator />
      {children}
    </Card>
  )
}

export function KeywordCloudMessage({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center px-5 py-8 text-sm text-muted-foreground">
      {text}
    </div>
  )
}

export function KeywordCloudSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-8">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-6 w-1/2" />
    </div>
  )
}
