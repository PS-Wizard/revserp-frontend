import type {
  ScoreBreakdownIssueTypeResponse,
  ScoreBreakdownIssueURLsResponse,
} from "~/lib/api.types"

export type BucketScope = {
  key: string
  pillarId: string
  pillarLabel: string
  bucketId: string
  bucketLabel: string
}

export type IssueScope = {
  key: string
  pillarId: string
  pillarLabel: string
  bucketId: string
  bucketLabel: string
  issueTypeId: string
  issueTypeLabel: string
  issueType: ScoreBreakdownIssueTypeResponse
}

export type MergedIssueUrlRow = ScoreBreakdownIssueURLsResponse["urls"][number] & {
  source: string
}
