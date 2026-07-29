import type {
  AICompareTarget,
  AIExportAction,
  AINavigationDestination,
} from "~/components/ai-dock/use-ai-chat"
import type {
  CrawlResponse,
  MeResponse,
  ProjectResponse,
} from "~/lib/api.types"

export type DashboardView =
  "revserp-audit" | "revserp-visibility" | "search-console" | "compare"
export type AuditTab = "summary" | "seo" | "aeo" | "pagespeed" | "site-graph"
export type ExportFormat = "csv" | "xlsx"

export type AppNavbarProps = {
  activeProjectId?: string | null
  currentCrawl: CrawlResponse | null
  projectCrawls: Record<string, CrawlResponse[]>
  isCrawlRunning: boolean
  crawlStatusLabel: string
  onCrawlStart: (crawl: CrawlResponse) => void
  /** Start a comparison against the current crawl. */
  onCompareCrawl: (crawl: CrawlResponse) => void
  /** Set while a comparison is open, so the navbar can show its tab. */
  compareLabel: string | null
  organizationId: string
  organizations: MeResponse["organizations"]
  projects: ProjectResponse[]
  userEmail: string
  userName?: string
  view: DashboardView
  onViewChange: (value: DashboardView) => void
  auditTab: AuditTab
  onAuditTabChange: (value: AuditTab) => void
  isPlatformAdmin: boolean
  onExportAudit: () => void
  isExportingAudit: boolean
  // Bumped when the AI agent changes auto-crawl settings, so the navbar's
  // auto-crawl state re-fetches instead of showing a stale enabled/disabled.
  autoCrawlRefreshToken?: number
  // --- Revserp AI (hosted by the command dock) ---
  projectIds: string[]
  trackCrawl: (id: string) => void
  onNavigate: (destination: AINavigationDestination) => void
  onProjectSwitched: (projectId: string) => void
  onCompare: (target: AICompareTarget) => void
  onExport: (action: AIExportAction) => void
  onAutoCrawlConfigured: () => void
  externalOpen: { prompt: string; token: number } | null
}
