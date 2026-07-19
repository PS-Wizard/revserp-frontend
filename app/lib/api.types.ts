export type MeResponse = {
  user: {
    id: string
    email: string
    name?: string
  }
  is_platform_admin: boolean
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

export type ProjectAIQuestionsResponse = {
  questions: string[]
  generation_model: string
  generated_at: string
}

export type ProjectsResponse = {
  projects: ProjectResponse[]
}

export type CrawlStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled"

export type CrawlPhase = "crawling" | "analyzing"

export type CrawlResponse = {
  id: string
  project_id: string
  status: CrawlStatus
  phase?: CrawlPhase | null
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

export type ActiveCrawlResponse = {
  id: string
  project_id: string
  status: string
  urls_discovered: number
  urls_crawled: number
  created_at: string
}

export type ActiveCrawlsResponse = {
  crawls: ActiveCrawlResponse[]
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
  soft_sum_decay: number
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

// --- Org-scoped AI (rehaul v2, used by the global AI dock) ---

export type AIConversationSummary = {
  id: string
  org_id: string
  created_by_user_id: string
  title?: string
  message_count: number
  created_at: string
  updated_at: string
}

export type AIDockToolCall = {
  id: string
  name: string
  // Persisted as an inline JSON object by the backend; normalized to a string
  // at the mapping boundary (see messagesFromResponses / the tool_call frame).
  args?: unknown
}

export type AIDockMessage = {
  id: string
  conversation_id: string
  role: "user" | "assistant" | "tool"
  content: string
  reasoning_content?: string
  tool_calls?: AIDockToolCall[]
  tool_call_id?: string
  tool_name?: string
  model?: string
  created_at: string
}

export type AIConversationListResponse = {
  conversations: AIConversationSummary[]
}

export type AIConversationDetail = {
  conversation: AIConversationSummary
  messages: AIDockMessage[]
}

export type CreateAIConversation = {
  conversation: AIConversationSummary
}

// --- Admin types ---

export type AdminUserResponse = {
  id: string
  email: string
  name?: string
  status: string
  is_platform_admin: boolean
  created_at: string
}

export type AdminUsersResponse = {
  users: AdminUserResponse[]
}

export type AdminOrganizationResponse = {
  id: string
  name: string
}

export type AdminAIAppConfig = {
  context_prompt: string
  guidelines: string
  other_notes: string
}

export type AdminAIAppConfigResponse = {
  config: AdminAIAppConfig
  default_config: AdminAIAppConfig
  updated_at?: string
}

// --- Auto-crawl types ---

export type AutoCrawlConfigSnapshot = {
  max_depth: number
  max_pages?: number
  fetch_timeout_seconds: number
  request_delay_ms?: number
  request_jitter_ms?: number
}

export type AutoCrawlResponse = {
  enabled: boolean
  config_snapshot?: AutoCrawlConfigSnapshot | null
  last_enqueued_at?: string
  frequency_days: number
  run_at: string
  timezone: string
  next_run_at?: string
  created_at?: string
  updated_at?: string
}

export type AutoCrawlPutBody = {
  enabled: boolean
  config_snapshot?: AutoCrawlConfigSnapshot | null
  frequency_days?: number
  run_at?: string
  timezone?: string
}

export type AIAuditRunResponse = {
  id: string
  audit_id: string
  question_text: string
  display_order: number
  model_name: string
  status: "pending" | "running" | "success" | "failed"
  raw_response?: string
  mentioned_target?: boolean
  target_rank?: number
  visibility_score?: number
  error_message?: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
}

export type AIAuditResponse = {
  id: string
  project_id: string
  crawl_id?: string
  status:
    "queued" | "running" | "completed" | "completed_with_failures" | "failed"
  score?: number
  error_message?: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
  runs?: AIAuditRunResponse[]
}

export type AIAuditListResponse = {
  ai_audits: AIAuditResponse[]
  pagination: {
    limit: number
    offset: number
    count: number
    total: number
  }
}

export type BucketTrendResponse = { id: string; label: string; score: number }
export type PillarTrendResponse = {
  id: string
  label: string
  score: number
  buckets?: BucketTrendResponse[]
}
export type CrawlTrendSnapshot = {
  crawl_id: string
  completed_at: string
  overall_score: number
  seo_score: number
  aeo_score: number
  pagespeed_score: number
  pillars?: PillarTrendResponse[]
}
export type ProjectBucketTrendsResponse = { crawls: CrawlTrendSnapshot[] }

export type SiteGraphNode = {
  url: string
  title: string
  status: number
  in: number
  out: number
}

export type SiteGraphResponse = {
  nodes: SiteGraphNode[]
  edges: Array<[number, number]>
  stats: { pages: number; links: number; broken: number }
}

export type AppBootstrapResponse = {
  me: MeResponse
  projects: ProjectResponse[]
  active_project: ProjectResponse | null
  crawls: CrawlResponse[]
  selected_crawl_id?: string
  breakdown?: ScoreBreakdownResponse
}
