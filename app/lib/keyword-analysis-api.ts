import { ApiError, clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  CompetitorInitializationResponse,
  ProjectKeywordAnalysisResponse,
} from "~/lib/api.types"

/** AI-generated metric estimates. Values may be inaccurate and are not verified search data. */
export const KEYWORD_ESTIMATES_TOOLTIP =
  "AI-generated estimates. Values may be inaccurate and are not verified search data."

export function projectKeywordAnalysisQueryKey(projectId: string) {
  return ["project-keyword-analysis", projectId] as const
}

export function fetchProjectKeywordAnalysis(projectId: string) {
  return clientApiFetch<ProjectKeywordAnalysisResponse>(
    `/projects/${projectId}/keyword-analysis`
  )
}

export function projectKeywordAnalysisQueryOptions(projectId: string) {
  return {
    queryKey: projectKeywordAnalysisQueryKey(projectId),
    queryFn: () => fetchProjectKeywordAnalysis(projectId),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    enabled: Boolean(projectId),
  }
}

export function competitorKeywordAnalysisQueryKey(
  projectId: string,
  competitorId: string
) {
  return ["competitor-keyword-analysis", projectId, competitorId] as const
}

export function fetchCompetitorKeywordAnalysis(
  projectId: string,
  competitorId: string
) {
  return clientApiFetch<ProjectKeywordAnalysisResponse>(
    `/projects/${projectId}/competitors/${competitorId}/keyword-analysis`
  )
}

export function competitorKeywordAnalysisQueryOptions(
  projectId: string,
  competitorId: string
) {
  return {
    queryKey: competitorKeywordAnalysisQueryKey(projectId, competitorId),
    queryFn: () => fetchCompetitorKeywordAnalysis(projectId, competitorId),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    enabled: Boolean(projectId) && Boolean(competitorId),
  }
}

export function locationKeywordAnalysisQueryKey(
  projectId: string,
  locationId: string
) {
  return ["location-keyword-analysis", projectId, locationId] as const
}

export function fetchLocationKeywordAnalysis(
  projectId: string,
  locationId: string
) {
  return clientApiFetch<ProjectKeywordAnalysisResponse>(
    `/projects/${projectId}/locations/${locationId}/keyword-analysis`
  )
}

export function locationKeywordAnalysisQueryOptions(
  projectId: string,
  locationId: string
) {
  return {
    queryKey: locationKeywordAnalysisQueryKey(projectId, locationId),
    queryFn: () => fetchLocationKeywordAnalysis(projectId, locationId),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    enabled: Boolean(projectId) && Boolean(locationId),
  }
}

export function competitorInitializationQueryKey(
  projectId: string,
  competitorId: string
) {
  return ["competitor-initialization", projectId, competitorId] as const
}

/** Backend has no initialization row yet (404) before the first start. */
export async function fetchCompetitorInitialization(
  projectId: string,
  competitorId: string
): Promise<CompetitorInitializationResponse | null> {
  try {
    return await clientApiFetch<CompetitorInitializationResponse>(
      `/projects/${projectId}/competitors/${competitorId}/initialization`
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

function competitorInitializationPath(
  projectId: string,
  competitorId: string,
  parentCrawlId?: string | null,
  retry = false
) {
  const base = `/projects/${projectId}/competitors/${competitorId}/initialization${retry ? "/retry" : ""}`
  return parentCrawlId ? `${base}?crawl=${encodeURIComponent(parentCrawlId)}` : base
}

export function startCompetitorInitialization(
  projectId: string,
  competitorId: string,
  parentCrawlId?: string | null
) {
  return clientApiPost<CompetitorInitializationResponse>(
    competitorInitializationPath(projectId, competitorId, parentCrawlId),
    {}
  )
}

export function retryCompetitorInitialization(
  projectId: string,
  competitorId: string,
  parentCrawlId?: string | null
) {
  return clientApiPost<CompetitorInitializationResponse>(
    competitorInitializationPath(projectId, competitorId, parentCrawlId, true),
    {}
  )
}

export function isCompetitorInitializationActive(
  status: CompetitorInitializationResponse["status"] | null | undefined
) {
  return status === "running"
}

export function competitorInitializationRefetchInterval(
  status: CompetitorInitializationResponse["status"] | null | undefined
): number | false {
  return status === "running" ? 2000 : false
}
