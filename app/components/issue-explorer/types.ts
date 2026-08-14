import type {
  ScoreBreakdownBucketResponse,
  ScoreBreakdownIssueURLsResponse,
  ScoreBreakdownPillarResponse,
} from "~/lib/api.types"

export type PillarScope = {
  key: string
  pillarLabel: string
  pillar: ScoreBreakdownPillarResponse
}

export type BucketScope = {
  key: string
  pillarId: string
  pillarLabel: string
  bucketId: string
  bucketLabel: string
  bucket: ScoreBreakdownBucketResponse
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
