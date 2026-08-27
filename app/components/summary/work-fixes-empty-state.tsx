"use client"

import {
  CircleHelpIcon,
  ClockIcon,
  SquareCheckIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "~/lib/utils"

export type WorkFixesEmptyVariant = "unlogged" | "verified" | "awaiting"

const EMPTY_CONFIG: Record<
  WorkFixesEmptyVariant,
  {
    description: string
    icon: LucideIcon
    iconClassName: string
    title: string
  }
> = {
  unlogged: {
    icon: CircleHelpIcon,
    iconClassName: "text-amber-400",
    title: "Nothing unlogged",
    description:
      "Issues that disappear without recorded work will show up here after the next crawl.",
  },
  verified: {
    icon: SquareCheckIcon,
    iconClassName: "text-emerald-400",
    title: "No verified fixes yet",
    description:
      "Fixes confirmed on a follow-up crawl will appear here once they're verified.",
  },
  awaiting: {
    icon: ClockIcon,
    iconClassName: "text-sky-400",
    title: "Nothing awaiting verification",
    description:
      "Work you mark done will wait here until the next crawl checks whether the fix held.",
  },
}

export function WorkFixesEmptyState({
  className,
  size = "md",
  variant,
}: {
  className?: string
  size?: "sm" | "md"
  variant: WorkFixesEmptyVariant
}) {
  const config = EMPTY_CONFIG[variant]
  const Icon = config.icon
  const compact = size === "sm"

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center text-center",
        compact ? "px-3 py-8" : "px-6 py-16",
        className
      )}
    >
      <div
        className={cn(
          "mb-3 flex shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50",
          compact ? "size-9" : "size-11"
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(config.iconClassName, compact ? "size-4" : "size-5")}
        />
      </div>
      <p
        className={cn(
          "font-medium text-foreground",
          compact ? "text-sm" : "text-base"
        )}
      >
        {config.title}
      </p>
      <p
        className={cn(
          "mt-1.5 text-muted-foreground",
          compact
            ? "max-w-[15rem] text-xs leading-relaxed"
            : "max-w-sm text-sm leading-relaxed"
        )}
      >
        {config.description}
      </p>
    </div>
  )
}
