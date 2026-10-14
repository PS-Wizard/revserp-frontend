/** Onboarding tour progress — named checkpoints the backend persists for resume. */

export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "skipped"
  | "completed"

export type OnboardingCheckpoint =
  | "new_project"
  | "project_details"
  | "waiting_for_results"
  | "overview"
  | "score_cards"
  | "audit_navigation"
  | "bucket_scores"
  | "issue_table"
  | "issue_details"
  | "revbot"
  | "revbot_input"
  | "revbot_history"
  | "business_profile"
  | "integrations"
  | "finish"

/** Server-owned tour state. completed_at is read-only: never sent on writes. */
export type OnboardingState = {
  version: 1
  status: OnboardingStatus
  checkpoint: OnboardingCheckpoint
  project_id?: string
  crawl_id?: string
  completed_at?: string
}

/** Backend write body: canonical state minus the server-owned completed_at. */
export type OnboardingWrite = {
  version: 1
  status: OnboardingStatus
  checkpoint: OnboardingCheckpoint
  project_id?: string
  crawl_id?: string
}

export const ONBOARDING_CHECKPOINTS: readonly OnboardingCheckpoint[] = [
  "new_project",
  "project_details",
  "waiting_for_results",
  "overview",
  "score_cards",
  "audit_navigation",
  "bucket_scores",
  "issue_table",
  "issue_details",
  "revbot",
  "revbot_input",
  "revbot_history",
  "business_profile",
  "integrations",
  "finish",
]

const CHECKPOINT_INDEX: Record<OnboardingCheckpoint, number> = Object.fromEntries(
  ONBOARDING_CHECKPOINTS.map((checkpoint, index) => [checkpoint, index]),
) as Record<OnboardingCheckpoint, number>

/** Tour overlay stays hidden while the backend runs project initialization. */
export function isOnboardingSetupRunning(status: string | null | undefined) {
  return (
    status === "crawling" ||
    status === "profile_generation" ||
    status === "prompt_generation" ||
    status === "visibility"
  )
}

/** Results are ready when a completed crawl produced pillar scores. */
export function isOnboardingResultsReady({
  hasCompletedCrawl,
  hasPillarScores,
}: {
  hasCompletedCrawl: boolean
  hasPillarScores: boolean
}) {
  return hasCompletedCrawl && hasPillarScores
}

export type OnboardingAvailability = {
  hasProjects: boolean
  resultsReady: boolean
  revbotAvailable: boolean
  businessProfileAvailable: boolean
  integrationsAvailable: boolean
  bucketCount: number
}

/**
 * Map a saved checkpoint to the step the tour shows on reload. A checkpoint
 * alone carries no bucket/issue ids and transient UI is gone, so issue
 * steps resume at bucket_scores and Revbot steps at the launcher.
 */
export function resolveOnboardingResumeCheckpoint(
  saved: OnboardingCheckpoint,
): OnboardingCheckpoint {
  if (saved === "issue_table" || saved === "issue_details") {
    return "bucket_scores"
  }
  if (saved === "revbot_input" || saved === "revbot_history") {
    return "revbot"
  }
  return saved
}

/** Furthest checkpoint wins; stale resolutions never move it backwards. */
export function mergeOnboardingCheckpoint(
  current: OnboardingCheckpoint,
  next: OnboardingCheckpoint,
): OnboardingCheckpoint {
  return CHECKPOINT_INDEX[next] >= CHECKPOINT_INDEX[current] ? next : current
}

/** Optional steps vanish when their feature is off; creation/results block. */
export function isOnboardingCheckpointAvailable(
  checkpoint: OnboardingCheckpoint,
  availability: OnboardingAvailability,
): boolean {
  switch (checkpoint) {
    case "new_project":
    case "project_details":
    case "waiting_for_results":
      return true
    case "overview":
    case "score_cards":
    case "audit_navigation":
      return availability.resultsReady
    case "bucket_scores":
    case "issue_table":
    case "issue_details":
      return availability.resultsReady && availability.bucketCount > 0
    case "revbot":
    case "revbot_input":
    case "revbot_history":
      return availability.resultsReady && availability.revbotAvailable
    case "business_profile":
      return availability.resultsReady && availability.businessProfileAvailable
    case "integrations":
      return availability.resultsReady && availability.integrationsAvailable
    case "finish":
      return availability.resultsReady
  }
}

/** Creation dialog exists only pre-project; setup panel only post-project. */
export function isOnboardingStepKeyAvailable(
  key: string,
  checkpoint: OnboardingCheckpoint,
  availability: OnboardingAvailability,
): boolean {
  if (!isOnboardingCheckpointAvailable(checkpoint, availability)) return false
  if (key === "create_form") return !availability.hasProjects
  if (key === "project_details") return availability.hasProjects
  return true
}

/** First checkpoint the tour can show for this workspace state. */
export function firstOnboardingCheckpoint(
  availability: OnboardingAvailability,
): OnboardingCheckpoint | null {
  if (!availability.hasProjects) return "new_project"
  if (!availability.resultsReady) return null
  return "overview"
}

/** Replay uses existing results and never creates a project. */
export function replayOnboardingCheckpoint(
  availability: OnboardingAvailability,
): OnboardingCheckpoint | null {
  if (!availability.hasProjects || !availability.resultsReady) return null
  return "overview"
}
