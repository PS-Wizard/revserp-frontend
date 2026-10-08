"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Check, ChevronDown, Loader2, RefreshCwIcon, X } from "lucide-react"

import { Card } from "~/components/ui/card"
import { ScrollArea } from "~/components/ui/scroll-area"
import { cn } from "~/lib/utils"

export type VisibilityItemStatus = "pending" | "running" | "success" | "failed"

export function VisibilityStatusIcon({ status }: { status: VisibilityItemStatus }) {
  if (status === "pending" || status === "running") {
    return (
      <Loader2
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
        strokeWidth={2.25}
      />
    )
  }
  if (status === "failed") {
    return (
      <X
        aria-hidden="true"
        className="size-3.5 shrink-0 text-destructive"
        strokeWidth={2.5}
      />
    )
  }
  return (
    <Check
      aria-hidden="true"
      className="size-3.5 shrink-0 text-emerald-500"
      strokeWidth={2.5}
    />
  )
}

export function VisibilityModelCard({
  title,
  countLabel,
  children,
}: {
  title: string
  countLabel: string
  children: ReactNode
}) {
  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
        <h3
          className="truncate font-heading text-base font-semibold tracking-tight"
          title={title}
        >
          {title}
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-micro font-semibold tabular-nums",
            "bg-muted text-muted-foreground"
          )}
        >
          {countLabel}
        </span>
      </div>
      <hr className="mx-5 shrink-0 border-0 border-t border-border/60" />
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-col px-3 py-4">{children}</div>
      </ScrollArea>
    </Card>
  )
}

export function VisibilityQueryRow({
  order,
  label,
  status,
  meta,
  ariaLabel,
  failedLabel,
  runningLabel = "Running",
  open: controlledOpen,
  onToggle,
  children,
}: {
  order?: number
  label: string
  status: VisibilityItemStatus
  meta?: ReactNode
  ariaLabel?: string
  failedLabel?: string
  runningLabel?: string
  open?: boolean
  onToggle?: () => void
  children?: ReactNode
}) {
  const expandable = Boolean(children) || status === "success" || status === "failed"
  const [uncontrolled, setUncontrolled] = useState(status === "failed" && Boolean(children))
  useEffect(() => {
    if (controlledOpen !== undefined || !children) return
    if (status === "failed") setUncontrolled(true)
    else if (status === "success") setUncontrolled(false)
  }, [status, children, controlledOpen])
  const open = controlledOpen ?? uncontrolled
  const toggle = () => {
    if (!expandable || !children) return
    if (onToggle) onToggle()
    else setUncontrolled((current) => !current)
  }
  return (
    <div className="w-full border-b border-border/40 last:border-0">
      <button
        aria-expanded={expandable ? open : undefined}
        aria-label={ariaLabel}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-4 text-left transition-colors duration-100",
          expandable && children && "hover:bg-muted/50",
          (!expandable || !children) && "cursor-default"
        )}
        disabled={!children || !expandable}
        onClick={toggle}
        type="button"
      >
        <VisibilityStatusIcon status={status} />
        <span className="min-w-0 flex-1 truncate text-sm leading-snug font-medium text-foreground/90">
          {order !== undefined ? (
            <span className="mr-1.5 text-muted-foreground">{order}.</span>
          ) : null}
          {label}
        </span>
        {status === "failed" ? (
          <span className="shrink-0 text-xs font-medium text-destructive">
            {failedLabel ?? "Failed"}
          </span>
        ) : status === "pending" || status === "running" ? (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {runningLabel}
          </span>
        ) : meta ? (
          <span className="flex shrink-0 items-center gap-2">{meta}</span>
        ) : null}
        {children && expandable ? (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-300",
              open && "rotate-180"
            )}
            strokeWidth={2.2}
          />
        ) : (
          <span aria-hidden="true" className="size-3.5 shrink-0" />
        )}
      </button>
      {children && expandable ? (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            opacity: open ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
          }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-3 px-3 pb-5 pl-10">{children}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function VisibilityRunningBanner({
  label,
  completedText,
  fraction,
}: {
  label: string
  completedText: string
  fraction: number | null
}) {
  return (
    <div className="mx-0 flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-4 @3xl/main:mx-6 @3xl/main:px-5 @5xl/main:mx-8">
      <RefreshCwIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      <div className="flex-1">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium text-muted-foreground tabular-nums">
            {completedText}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: fraction !== null ? `${Math.round(fraction * 100)}%` : "33%" }}
          />
        </div>
      </div>
    </div>
  )
}
