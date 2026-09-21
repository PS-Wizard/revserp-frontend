import type {
  CrawlResponse,
  MeResponse,
  ProjectResponse,
} from "~/lib/api.types"

export type DashboardView =
  | "revserp-audit"
  | "revserp-visibility"
  | "keywords"
  | "competitors"
  | "search-console"
  | "analytics"
  | "compare"
export type AuditTab = "overview" | "seo" | "aeo" | "pagespeed" | "site-graph"
export type ExportFormat = "csv" | "xlsx"

/**
 * Maps a revbot markdown hash link (e.g. `#seo-tab`, `#search-console`) to a
 * workspace view and, for audit sections, the target audit tab. Accepts the
 * canonical `-tab` suffix as well as the bare tab name.
 */
export function revbotHashTarget(
  hash: string
):
  | { view: "revserp-audit"; tab: AuditTab }
  | { view: "search-console" }
  | { view: "analytics" }
  | { view: "competitors" }
  | { view: "keywords" }
  | null {
  switch (hash.replace(/-tab$/, "")) {
    case "summary":
      return { view: "revserp-audit", tab: "overview" }
    case "overview":
    case "seo":
    case "aeo":
    case "pagespeed":
    case "site-graph":
      return {
        view: "revserp-audit",
        tab: hash.replace(/-tab$/, "") as AuditTab,
      }
    case "search-console":
      return { view: "search-console" }
    case "analytics":
      return { view: "analytics" }
    case "competitors":
      return { view: "competitors" }
    case "keywords":
      return { view: "keywords" }
    default:
      return null
  }
}
export type AppNavbarProps = {
  activeProjectId?: string | null
  currentCrawl: CrawlResponse | null
  projectCrawls: Record<string, CrawlResponse[]>
  isCrawlRunning: boolean
  crawlStatusLabel: string
  onCrawlStart: (crawl: CrawlResponse) => void
  onCompareCrawl: (crawl: CrawlResponse) => void
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
}
