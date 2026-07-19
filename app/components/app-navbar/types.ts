import type {
  CrawlResponse,
  MeResponse,
  ProjectResponse,
} from "~/lib/api.types"

export type DashboardView = "revserp-audit" | "revserp-visibility" | "search-console"
export type ExportFormat = "csv" | "xlsx"

export type AppNavbarProps = {
  activeProjectId?: string | null
  currentCrawl: CrawlResponse | null
  projectCrawls: Record<string, CrawlResponse[]>
  isCrawlRunning: boolean
  crawlStatusLabel: string
  onCrawlStart: (crawl: CrawlResponse) => void
  organizationId: string
  organizations: MeResponse["organizations"]
  projects: ProjectResponse[]
  userEmail: string
  userName?: string
  view: DashboardView
  onViewChange: (value: DashboardView) => void
  isPlatformAdmin: boolean
  onExportAudit: () => void
  isExportingAudit: boolean
}
