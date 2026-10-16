import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownPillarResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

/**
 * Historical issue navigation. The current score snapshot only contains
 * detected issue types, so fully resolved issue types, buckets, and pillars
 * would vanish. This builds the current/previous catalog union: baseline-only
 * entries are appended with zeroed current counts and scores (absent from the
 * current crawl means zero, never baseline numbers presented as current) while
 * keeping baseline labels so the entries stay readable and drillable.
 */
export type IssueTypeDiffHistory = {
  pillars: ScoreBreakdownPillarResponse[]
  historicalPillarIds: ReadonlySet<string>
  /** Scoped as `pillarId::bucketId`. */
  historicalBucketKeys: ReadonlySet<string>
  /** Scoped as `pillarId::bucketId::issueTypeId`. */
  historicalIssueTypeKeys: ReadonlySet<string>
}

const EMPTY_HISTORY: IssueTypeDiffHistory = {
  pillars: [],
  historicalPillarIds: new Set(),
  historicalBucketKeys: new Set(),
  historicalIssueTypeKeys: new Set(),
}

export function buildIssueTypeDiffHistory(
  current: ScoreBreakdownResponse | null,
  baseline: ScoreBreakdownResponse | null
): IssueTypeDiffHistory {
  const currentPillars = current?.pillars ?? []
  if (!baseline) {
    return {
      pillars: currentPillars,
      historicalPillarIds: new Set(),
      historicalBucketKeys: new Set(),
      historicalIssueTypeKeys: new Set(),
    }
  }
  if (!current) return EMPTY_HISTORY

  const historicalPillarIds = new Set<string>()
  const historicalBucketKeys = new Set<string>()
  const historicalIssueTypeKeys = new Set<string>()
  const keys = {
    historicalPillarIds,
    historicalBucketKeys,
    historicalIssueTypeKeys,
  }

  const pillars = [...currentPillars]
  const pillarIndex = new Map(currentPillars.map((pillar) => [pillar.id, pillar]))
  for (const baselinePillar of baseline.pillars ?? []) {
    const currentPillar = pillarIndex.get(baselinePillar.id)
    if (!currentPillar) {
      pillars.push(zeroedHistoricalPillar(baselinePillar, keys))
      continue
    }
    if (currentPillar.issue_row_count === 0 && baselinePillar.issue_row_count > 0) {
      historicalPillarIds.add(currentPillar.id)
    }
    const merged = mergeHistoricalBuckets(currentPillar, baselinePillar, keys)
    if (merged !== currentPillar) {
      pillars[pillars.indexOf(currentPillar)] = merged
    }
  }

  return {
    pillars,
    historicalPillarIds,
    historicalBucketKeys,
    historicalIssueTypeKeys,
  }
}

type HistoryKeys = {
  historicalPillarIds: Set<string>
  historicalBucketKeys: Set<string>
  historicalIssueTypeKeys: Set<string>
}

function bucketKey(pillarId: string, bucketId: string): string {
  return `${pillarId}::${bucketId}`
}

function issueTypeKey(
  pillarId: string,
  bucketId: string,
  issueTypeId: string
): string {
  return `${pillarId}::${bucketId}::${issueTypeId}`
}

function mergeHistoricalBuckets(
  currentPillar: ScoreBreakdownPillarResponse,
  baselinePillar: ScoreBreakdownPillarResponse,
  keys: HistoryKeys
): ScoreBreakdownPillarResponse {
  let buckets: ScoreBreakdownBucketResponse[] | null = null
  const bucketIndex = new Map(
    currentPillar.buckets.map((bucket) => [bucket.id, bucket])
  )
  for (const baselineBucket of baselinePillar.buckets ?? []) {
    const currentBucket = bucketIndex.get(baselineBucket.id)
    if (!currentBucket) {
      buckets ??= [...currentPillar.buckets]
      buckets.push(
        zeroedHistoricalBucket(currentPillar.id, baselineBucket, keys)
      )
      continue
    }
    if (currentBucket.issue_row_count === 0 && baselineBucket.issue_row_count > 0) {
      keys.historicalBucketKeys.add(bucketKey(currentPillar.id, currentBucket.id))
    }
    const merged = mergeHistoricalIssueTypes(
      currentPillar.id,
      currentBucket,
      baselineBucket,
      keys
    )
    if (merged !== currentBucket) {
      buckets ??= [...currentPillar.buckets]
      buckets[buckets.indexOf(currentBucket)] = merged
    }
  }
  if (!buckets) return currentPillar
  return { ...currentPillar, buckets }
}

function mergeHistoricalIssueTypes(
  pillarId: string,
  currentBucket: ScoreBreakdownBucketResponse,
  baselineBucket: ScoreBreakdownBucketResponse,
  keys: HistoryKeys
): ScoreBreakdownBucketResponse {
  const issueIds = new Set(currentBucket.issues.map((issue) => issue.id))
  const missing = (baselineBucket.issues ?? []).filter(
    (issue) => !issueIds.has(issue.id)
  )
  if (!missing.length) return currentBucket
  return {
    ...currentBucket,
    issues: [
      ...currentBucket.issues,
      ...missing.map((issue) =>
        zeroedHistoricalIssueType(pillarId, currentBucket.id, issue, keys)
      ),
    ],
  }
}

function zeroedHistoricalPillar(
  baselinePillar: ScoreBreakdownPillarResponse,
  keys: HistoryKeys
): ScoreBreakdownPillarResponse {
  keys.historicalPillarIds.add(baselinePillar.id)
  return {
    ...baselinePillar,
    score: 0,
    weighted_contribution: 0,
    total_penalty: 0,
    bucket_count: 0,
    issue_type_count: 0,
    issue_row_count: 0,
    affected_url_count: 0,
    buckets: (baselinePillar.buckets ?? []).map((bucket) =>
      zeroedHistoricalBucket(baselinePillar.id, bucket, keys)
    ),
  }
}

function zeroedHistoricalBucket(
  pillarId: string,
  baselineBucket: ScoreBreakdownBucketResponse,
  keys: HistoryKeys
): ScoreBreakdownBucketResponse {
  keys.historicalBucketKeys.add(bucketKey(pillarId, baselineBucket.id))
  return {
    ...baselineBucket,
    score: 0,
    weighted_contribution: 0,
    total_penalty: 0,
    issue_type_count: 0,
    issue_row_count: 0,
    affected_url_count: 0,
    issues: (baselineBucket.issues ?? []).map((issue) =>
      zeroedHistoricalIssueType(pillarId, baselineBucket.id, issue, keys)
    ),
  }
}

function zeroedHistoricalIssueType(
  pillarId: string,
  bucketId: string,
  baselineIssue: ScoreBreakdownIssueTypeResponse,
  keys: HistoryKeys
): ScoreBreakdownIssueTypeResponse {
  keys.historicalIssueTypeKeys.add(
    issueTypeKey(pillarId, bucketId, baselineIssue.id)
  )
  return {
    ...baselineIssue,
    final_penalty: 0,
    issue_row_count: 0,
    affected_url_count: 0,
  }
}

/**
 * Bare issue-type ids historically resolved within one pillar/bucket scope.
 * The issue type table renders a single bucket at a time, so scoped keys are
 * narrowed here instead of leaking scope prefixes into the table.
 */
export function historicalIssueTypeIdsFor(
  history: IssueTypeDiffHistory,
  pillarId: string,
  bucketId: string
): ReadonlySet<string> {
  const prefix = `${issueTypeKey(pillarId, bucketId, "")}`
  const ids = new Set<string>()
  for (const key of history.historicalIssueTypeKeys) {
    if (key.startsWith(prefix)) ids.add(key.slice(prefix.length))
  }
  return ids
}
