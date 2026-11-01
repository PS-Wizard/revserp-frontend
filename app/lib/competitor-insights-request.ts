/**
 * Opens one competitor's insights from outside the Competitors view (the
 * navbar's Compare menu). The view may not be mounted yet when the request is
 * made, so the id is kept as pending until the view takes it.
 */
export const COMPETITOR_INSIGHTS_EVENT = "revserp:competitor-insights"

let pendingCompetitorId: string | null = null

export function requestCompetitorInsights(competitorId: string): void {
  pendingCompetitorId = competitorId
  window.dispatchEvent(new CustomEvent(COMPETITOR_INSIGHTS_EVENT))
}

/** Returns the pending competitor id once, then clears it. */
export function takePendingCompetitorInsights(): string | null {
  const competitorId = pendingCompetitorId
  pendingCompetitorId = null
  return competitorId
}
