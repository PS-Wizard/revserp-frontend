"use client"

import { memo } from "react"

import type { LocationWebsiteScopeRevision } from "~/lib/location-workspace"
import { Badge } from "~/components/ui/badge"
import { normalizeLocationWebsiteScopeUrl } from "~/components/locations/location-website-scope"

function revisionKey(revision: LocationWebsiteScopeRevision): string {
  return `${revision.match}::${normalizeLocationWebsiteScopeUrl(revision.url ?? "") ?? ""}`
}

function formatRevisionDate(createdAt: string): string {
  const time = new Date(createdAt).getTime()
  if (Number.isNaN(time)) return createdAt
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(time))
}

/**
 * Revision history for the branch website scope. Graphs must not silently
 * mix revisions, so scope changes render as explicit dividers and only the
 * newest revision carries the Current marker.
 */
export const LocationWebsiteScopeHistory = memo(
  function LocationWebsiteScopeHistory({
    revisions,
  }: {
    revisions: LocationWebsiteScopeRevision[]
  }) {
    if (revisions.length === 0) return null
    const sorted = [...revisions].sort((a, b) => b.revision - a.revision)
    return (
      <ol className="flex flex-col gap-2">
        {sorted.map((revision, index) => {
          const next = sorted[index + 1]
          const scopeChanged =
            next !== undefined && revisionKey(revision) !== revisionKey(next)
          return (
            <li key={revision.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium tabular-nums">
                  Rev {revision.revision}
                </span>
                <Badge variant={revision.match === "none" ? "outline" : "secondary"}>
                  {revision.match === "none"
                    ? "Removed"
                    : revision.match === "exact"
                      ? "Exact page"
                      : "Subtree"}
                </Badge>
                {index === 0 && <Badge>Current</Badge>}
                {revision.url && (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {revision.url}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatRevisionDate(revision.created_at)}
                </span>
              </div>
              {scopeChanged && (
                <p className="text-xs text-muted-foreground">
                  Scope changed — scores above and below this line cover
                  different pages.
                </p>
              )}
            </li>
          )
        })}
      </ol>
    )
  }
)
