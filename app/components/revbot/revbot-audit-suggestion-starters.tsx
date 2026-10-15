"use client"

import { Button } from "~/components/ui/button"
import type { CrawlResponse, ScoreBreakdownResponse } from "~/lib/api.types"
import {
  buildRevbotAuditSuggestions,
  type RevbotAuditSuggestion,
} from "./revbot-audit-suggestions"

export function selectRevbotAuditSuggestions({
  breakdown,
  currentCrawl,
  activeProjectId,
  isLocationScoped,
}: {
  breakdown: ScoreBreakdownResponse | null | undefined
  currentCrawl: CrawlResponse | null | undefined
  activeProjectId: string | null | undefined
  isLocationScoped: boolean
}): RevbotAuditSuggestion[] {
  if (isLocationScoped) return []
  if (!breakdown || !currentCrawl) return []
  if (currentCrawl.status !== "completed") return []
  if (breakdown.crawl_id !== currentCrawl.id) return []
  if (!activeProjectId || currentCrawl.project_id !== activeProjectId) return []
  return buildRevbotAuditSuggestions(breakdown)
}

export function RevbotAuditSuggestionStarters({
  suggestions,
  disabled,
  onSelect,
}: {
  suggestions: RevbotAuditSuggestion[]
  disabled: boolean
  onSelect: (suggestion: RevbotAuditSuggestion) => void
}) {
  if (suggestions.length === 0) return null
  return (
    <div
      aria-label="Suggested audit fixes"
      className="flex w-full max-w-sm flex-col gap-2 px-6 pb-10"
      role="group"
    >
      {suggestions.map((suggestion) => (
        <Button
          className="h-auto flex-col items-start gap-0.5 py-2 text-left"
          disabled={disabled}
          key={suggestion.id}
          onClick={() => onSelect(suggestion)}
          size="sm"
          type="button"
          variant="outline"
        >
          <span>Help me fix {suggestion.bucketLabel}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {suggestion.pillarLabel} · {suggestion.affectedUrlCount}{" "}
            {suggestion.affectedUrlCount === 1 ? "page" : "pages"}
          </span>
        </Button>
      ))}
    </div>
  )
}
