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

export type CreateOrganizationInviteResponse = {
  id: string
  organization_id: string
  token: string
  expires_at: string
  max_uses: number
  used_count: number
  revoked_at?: string
  created_at: string
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

export type ProjectBusinessProfileResponse = {
  id: string
  project_id: string
  brand_name: string
  website_url: string
  primary_category?: string
  primary_location?: string
  business_description?: string
  seed_prompts: string[]
  created_at: string
  updated_at: string
}

export type ProjectBusinessProfileStatusResponse = {
  has_profile: boolean
  can_manage_profile: boolean
  business_profile?: ProjectBusinessProfileResponse
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
  google_psi_results?: GooglePSIResults
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

export type ProjectGSCSiteResponse = {
  site_url: string
  permission_level?: string
  match_score?: number
}

export type ProjectGSCStatusResponse = {
  has_google_connection: boolean
  google_connection_id?: string
  google_account_email?: string
  google_status?: string
  needs_reconnect: boolean
  can_manage_connection: boolean
  connected: boolean
  selected_site?: ProjectGSCSiteResponse
  available_sites: ProjectGSCSiteResponse[]
  token_error?: string
}

export type GSCMetricSummaryResponse = {
  current: number
  previous: number
}

export type GSCOverviewSummaryResponse = {
  clicks: GSCMetricSummaryResponse
  impressions: GSCMetricSummaryResponse
  ctr: GSCMetricSummaryResponse
  position: GSCMetricSummaryResponse
}

export type GSCSearchAnalyticsRowResponse = {
  date?: string
  query?: string
  page?: string
  country?: string
  device?: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type GSCOverviewWindowResponse = {
  range: {
    current_start: string
    current_end: string
    previous_start: string
    previous_end: string
  }
  summary: GSCOverviewSummaryResponse
  trend: GSCSearchAnalyticsRowResponse[]
  top_queries: GSCSearchAnalyticsRowResponse[]
  top_pages: GSCSearchAnalyticsRowResponse[]
  country_breakdown: GSCSearchAnalyticsRowResponse[]
  device_breakdown: GSCSearchAnalyticsRowResponse[]
  opportunities: {
    low_ctr_queries: GSCSearchAnalyticsRowResponse[]
    striking_distance_queries: GSCSearchAnalyticsRowResponse[]
    question_queries: GSCSearchAnalyticsRowResponse[]
  }
}

export type ProjectGSCOverviewResponse = {
  project_id: string
  site_url: string
  permission_level?: string
  google_connection: string
  overview: {
    history_days: number
    windows: Record<string, GSCOverviewWindowResponse>
  }
}

export type PillarScoringConfig = {
  label: string
  weight: number
  minimum_issue_coverage?: number
  bucket_weights: Record<string, number>
  issue_penalty_by_type: Record<string, number>
}

export type ScoringConfig = {
  version: string
  minimum_overall_score: number
  coverage_scale: number
  volume_pressure_scale: number
  maximum_volume_pressure: number
  severity_multipliers: Record<string, number>
  overall_weights: Record<string, number>
  pillars: Record<string, PillarScoringConfig>
}

export type ScoringConfigResponse = {
  config: ScoringConfig
  default: ScoringConfig
  updated_at?: string
  updated_by_user_id?: string
}

export type ScoringPreviewResponse = {
  breakdown: ScoreBreakdownResponse
  scores: {
    seo_score: number
    aeo_score: number
    pagespeed_score: number
    overall_score: number
  }
}

export type GooglePSIMetric = {
  first_contentful_paint?: number
  largest_contentful_paint?: number
  cumulative_layout_shift?: number
  first_input_delay?: number
  speed_index?: number
  time_to_interactive?: number
}

export type GooglePSIDeviceResult = {
  success: boolean
  performance_score?: number
  strategy: string
  metrics?: GooglePSIMetric
  error?: string
}

export type GooglePSIStoredResult = {
  url: string
  mobile: GooglePSIDeviceResult
  analysis_date: string
}

export type GooglePSIResults = GooglePSIStoredResult[]

export type AIConversationResponse = {
  id: string
  project_id: string
  crawl_id?: string
  created_by_user_id: string
  title?: string
  message_count: number
  created_at: string
  updated_at: string
}

export type AIMessageResponse = {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content: string
  crawl_id?: string
  scope?: unknown
  model?: string
  created_at: string
}

export type AIConversationsResponse = {
  conversations: AIConversationResponse[]
}

export type AIConversationDetailResponse = {
  conversation: AIConversationResponse
  messages: AIMessageResponse[]
}

export type CreateAIConversationResponse = {
  conversation: AIConversationResponse
}

export type CreateAIConversationMessageResponse = {
  conversation: AIConversationResponse
  user_message: AIMessageResponse
  assistant_message: AIMessageResponse
  scope: {
    pillar_label: string
    bucket_label: string
    issue_count: number
    url_count: number
  }
}
