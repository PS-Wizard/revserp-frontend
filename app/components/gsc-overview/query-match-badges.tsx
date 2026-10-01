import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

import type { ProjectKeywordQueryMatch } from "./keyword-query-matching"

/** Brand matches take priority over non-brand matches when coloring a row. */
export function queryMatchRowClassName(
  match: ProjectKeywordQueryMatch | undefined
): string {
  if (match?.brand) return "bg-yellow-400/[0.08] hover:bg-yellow-400/[0.14]"
  if (match?.nonBrand) return "bg-blue-400/[0.08] hover:bg-blue-400/[0.14]"
  return ""
}

export function QueryMatchBadges({
  match,
  ready,
  hideNoMatch = false,
  className,
}: {
  match: ProjectKeywordQueryMatch | undefined
  ready: boolean
  hideNoMatch?: boolean
  className?: string
}) {
  if (!ready) return null
  if (!match?.brand && !match?.nonBrand) {
    if (hideNoMatch) return null
    return (
      <Badge
        variant="outline"
        className={cn("font-normal text-muted-foreground", className)}
      >
        No match
      </Badge>
    )
  }
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {match.brand ? (
        <Badge
          variant="outline"
          className="border-yellow-500/40 bg-yellow-400/15 text-yellow-800 dark:text-yellow-200"
        >
          Brand match
        </Badge>
      ) : null}
      {match.nonBrand ? (
        <Badge
          variant="outline"
          className="border-blue-500/40 bg-blue-400/15 text-blue-800 dark:text-blue-200"
        >
          Non-brand match
        </Badge>
      ) : null}
    </span>
  )
}
