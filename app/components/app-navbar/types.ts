import type {
  CrawlResponse,
  MeResponse,
  ProjectResponse,
} from "~/lib/api.types"

export type DashboardView = "revserp-audit" | "revserp-visibility" | "search-console" | "revserp-ai"
export type ExportFormat = "csv" | "xlsx"

export type AppNavbarProps = {
  activeProjectId?: string | null
  currentCrawl: CrawlResponse | null
  projectCrawls: Record<string, CrawlResponse[]>
  isCrawlRunning: boolean
  // True only when the currently-selected crawl is the one in flight. Locks the
  // Revserp AI tab; isCrawlRunning still drives the Run Crawl button.
  isViewingRunningCrawl: boolean
  crawlStatusLabel: string
  onCrawlStart: () => void
  organizationId: string
  organizations: MeResponse["organizations"]
  projects: ProjectResponse[]
  userEmail: string
  userName?: string
  view: DashboardView
  onViewChange: (value: DashboardView) => void
  onSelectConversation?: (conversationId: string) => void
  onDeleteConversation?: (conversationId: string) => void
  onNewChat?: () => void
  isPlatformAdmin: boolean
  onExportAudit: () => void
  isExportingAudit: boolean
}
