import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueURLsResponse,
} from "~/lib/api.types"

export type BucketScope = {
  key: string
  pillarId: string
  pillarLabel: string
  bucketId: string
  bucketLabel: string
  bucket: ScoreBreakdownBucketResponse
}

/** A single fix request scoped to one pillar (the AI message API is per-pillar). */
export type FixSelection = {
  pillarId: string
  pillarLabel: string
  bucketIds: string[]
  bucketLabels: string[]
  issueTypeIds: string[]
  urls: string[]
}

export type MergedIssueUrlRow =
  ScoreBreakdownIssueURLsResponse["urls"][number] & {
    source: string
    pillarId: string
    pillarLabel: string
    bucketId: string
    bucketLabel: string
    issueTypeId: string
    issueTypeLabel: string
  }
