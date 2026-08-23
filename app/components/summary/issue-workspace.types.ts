export type IssueChangeType =
  | "fixed"
  | "new"
  | "still_open"
  | "not_verified"
  | "no_longer_detected"

export interface IssueWorkspaceIssue {
  url: string
  pillar: string
  bucket: string
  issue_type: string
  severity: string
  message: string
  details?: string | null
  baseline_issue_id?: string | null
  current_issue_id?: string | null
  change_type: IssueChangeType
}

export interface IssueWorkspaceWorkItem {
  work_item_id: string
  attempt_id: string
  url: string
  subject_kind: string
  pillar: string
  bucket: string
  issue_type: string
  status: string
  verification_crawl_id?: string | null
  contributors: string[]
}

export interface WorkspacePageCounts {
  url: string
  fixed_count: number
  new_count: number
  open_count: number
  no_longer_detected_count: number
  not_verified_count: number
}

export interface IssueWorkspaceSummary {
  baseline_crawl: unknown
  current_crawl: unknown
  counts: {
    fixed: number
    new: number
    still_open: number
    not_verified: number
    no_longer_detected: number
  }
  work_counts: Record<string, number>
  pages: WorkspacePageCounts[]
  work_items: IssueWorkspaceWorkItem[]
}

export interface IssueWorkspacePageSearchResultPage {
  url: string
  title: string | null
}

export interface IssueWorkspacePageSearchResponse {
  pages: IssueWorkspacePageSearchResultPage[]
  pagination: {
    limit: number
    offset: number
    count: number
    total: number
  }
}

export interface IssueWorkspacePageDetail {
  page: {
    url: string
    current_crawl_id: string
  }
  issues: IssueWorkspaceIssue[]
  current_issues: IssueWorkspaceIssue[]
  work_items: IssueWorkspaceWorkItem[]
}

export type IssueWorkspaceChangeStatus =
  | "fixed"
  | "no_longer_detected"
  | "awaiting_verification"
  | "new"

export interface IssueWorkspaceChangesResponse {
  items: Array<IssueWorkspaceIssue | IssueWorkspaceWorkItem>
  pagination: {
    limit: number
    offset: number
    count: number
    total: number
  }
}

export interface IssueWorkStateResponse {
  work_item_id?: string
  attempt_id: string
  status: string
  locked: boolean
  contributors: Array<{
    user_id: string
    marked_done_at: string
  }>
}
