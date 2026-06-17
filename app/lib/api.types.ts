export type MeResponse = {
  user: {
    id: string
    email: string
    name?: string
  }
  organizations: Array<{
    id: string
    name: string
    role: string
  }>
  active_org_id: string
}

export type SignupCompletedWithoutSessionResponse = {
  email: string
  signup_completed_without_session: true
}

export type ProjectResponse = {
  id: string
  organization_id: string
  name: string
  base_url: string
}

export type ProjectsResponse = {
  projects: ProjectResponse[]
}

export type CrawlResponse = {
  id: string
  project_id: string
  status: string
  config_snapshot?: unknown
  urls_discovered: number
  urls_crawled: number
  max_depth_reached: number
  google_psi_results?: unknown
  has_llms_txt?: boolean
  seo_score?: number
  aeo_score?: number
  pagespeed_score?: number
  overall_score?: number
  started_at?: string
  completed_at?: string
  created_at: string
}

export type PaginationResponse = {
  limit: number
  offset: number
  count: number
  total: number
}

export type CrawlsResponse = {
  crawls: CrawlResponse[]
  pagination?: PaginationResponse
}

export type ScoreBreakdownIssueTypeResponse = {
  id: string
  label: string
  severity: string
  base_penalty: number
  severity_multiplier: number
  coverage: number
  final_penalty: number
  issue_row_count: number
  affected_url_count: number
  message: string
  details_preview: string
}

export type ScoreBreakdownBucketResponse = {
  id: string
  label: string
  score: number
  weight: number
  weighted_contribution: number
  total_penalty: number
  issue_type_count: number
  issue_row_count: number
  affected_url_count: number
  issues: ScoreBreakdownIssueTypeResponse[]
}

export type ScoreBreakdownPillarResponse = {
  id: string
  label: string
  score: number
  weight: number
  weighted_contribution: number
  total_penalty: number
  bucket_count: number
  issue_type_count: number
  issue_row_count: number
  affected_url_count: number
  buckets: ScoreBreakdownBucketResponse[]
}

export type ScoreBreakdownResponse = {
  crawl_id: string
  scoring_version: string
  coverage_scale: number
  total_scored_pages: number
  overall_score: number
  pillars: ScoreBreakdownPillarResponse[]
}

export type ScoreBreakdownIssueURLResponse = {
  url: string
  crawl_page_id?: string
  severity: string
  message: string
  details: string
}

export type ScoreBreakdownIssueURLsResponse = {
  urls: ScoreBreakdownIssueURLResponse[]
  pagination: PaginationResponse
}
