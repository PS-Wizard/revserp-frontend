import { useEffect, useMemo, useState } from "react"
import { useLoaderData, useLocation, useRevalidator } from "react-router"

import { AppNavbar, type DashboardView } from "~/components/app-navbar"
import { SummaryScoreHistoryChart } from "~/components/summary-score-history-chart"
import { CompileLoader } from "~/components/compile-loader"
import { IssueExplorer } from "~/components/issue-explorer"
import type { PendingAIFixRequest } from "~/components/issue-explorer/types"
import {
  PillarAuditView,
  type CrawlBreakdown,
} from "~/components/pillar-audit-view"
import { SectionCards } from "~/components/section-cards"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import { RevserpAIView } from "~/components/revserp-ai-view"
import { SearchConsoleView } from "~/components/search-console-view"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { serverApiFetch } from "~/lib/api"
import type {
  CrawlResponse,
  CrawlsResponse,
  MeResponse,
  ProjectResponse,
  ProjectsResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"
import { requireAuthenticatedUser } from "~/lib/auth.server"

export async function loader({ request }: { request: Request }) {
  const me = await requireAuthenticatedUser(request)
  const projectsResponse = await serverApiFetch<ProjectsResponse>(
    `/organizations/${me.active_org_id}/projects`,
    request
  )

  const requestUrl = new URL(request.url)
  const requestedProjectId = requestUrl.searchParams.get("project")
  const requestedCrawlId = requestUrl.searchParams.get("crawl")
  const activeProject =
    projectsResponse.projects.find((project) => project.id === requestedProjectId) ??
    projectsResponse.projects[0] ??
    null

  let projectCrawls: Record<string, CrawlResponse[]> = {}
  let recentCrawls: CrawlResponse[] = []
  let currentBreakdown: ScoreBreakdownResponse | null = null
  let crawlBreakdowns: CrawlBreakdown[] = []

  if (projectsResponse.projects.length > 0) {
    const projectCrawlResults = await Promise.allSettled(
      projectsResponse.projects.map(async (project) => {
        const crawlsResponse = await serverApiFetch<CrawlsResponse>(
          `/projects/${project.id}/crawls?limit=50&offset=0`,
          request
        )

        return [project.id, crawlsResponse.crawls] as const
      })
    )

    projectCrawls = Object.fromEntries(
      projectCrawlResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      )
    )
  }

  if (activeProject) {
    recentCrawls = projectCrawls[activeProject.id] ?? []

    const sortedCompletedCrawls = [...recentCrawls]
      .filter((crawl) => crawl.status === "completed")
      .sort((left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left))
    const selectedCompletedCrawl =
      sortedCompletedCrawls.find((crawl) => crawl.id === requestedCrawlId) ??
      sortedCompletedCrawls[0] ??
      null
    const breakdownSourceCrawls = selectedCompletedCrawl
      ? [
          selectedCompletedCrawl,
          ...sortedCompletedCrawls.filter((crawl) => crawl.id !== selectedCompletedCrawl.id),
        ]
      : sortedCompletedCrawls

    const breakdownResults = await Promise.allSettled(
      breakdownSourceCrawls.map(async (crawl) => ({
        crawl,
        breakdown: await serverApiFetch<ScoreBreakdownResponse>(
          `/crawls/${crawl.id}/score-breakdown`,
          request
        ),
      }))
    )

    crawlBreakdowns = breakdownResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    )
    currentBreakdown =
      crawlBreakdowns.find((item) => item.crawl.id === selectedCompletedCrawl?.id)
        ?.breakdown ?? null
  }

  return {
    me,
    projects: projectsResponse.projects,
    activeProject,
    recentCrawls,
    projectCrawls,
    currentBreakdown,
    crawlBreakdowns,
  }
}

type AppLoaderData = {
  me: MeResponse
  projects: ProjectResponse[]
  activeProject: ProjectResponse | null
  recentCrawls: CrawlResponse[]
  projectCrawls: Record<string, CrawlResponse[]>
  currentBreakdown: ScoreBreakdownResponse | null
  crawlBreakdowns: CrawlBreakdown[]
}

const viewLabels: Record<DashboardView, string> = {
  "revserp-audit": "Revserp Audit",
  "search-console": "Search Console",
  "revserp-ai": "Revserp AI",
}

export default function AppPage() {
  const { me, projects, activeProject, projectCrawls, recentCrawls, currentBreakdown, crawlBreakdowns } =
    useLoaderData() as AppLoaderData
  const revalidator = useRevalidator()
  const location = useLocation()
  const [view, setView] = useState<DashboardView>("revserp-audit")
  const [auditTab, setAuditTab] = useState<"summary" | "seo" | "aeo" | "pagespeed">(
    "summary"
  )
  const [isStartingCrawl, setIsStartingCrawl] = useState(false)
  const [openAIConversationId, setOpenAIConversationId] = useState<string | null>(null)
  const [pendingAIFixRequest, setPendingAIFixRequest] = useState<PendingAIFixRequest | null>(null)

  const handleGenerateAIFixesNow = (request: PendingAIFixRequest) => {
    setOpenAIConversationId(null)
    setPendingAIFixRequest(request)
    setView("revserp-ai")
  }

  const crawlsDataKey = useMemo(
    () =>
      recentCrawls
        .map(
          (c) => `${c.id}:${c.status}:${c.overall_score ?? ""}:${c.seo_score ?? ""}:${c.aeo_score ?? ""}:${c.pagespeed_score ?? ""}`
        )
        .join("|"),
    [recentCrawls]
  )
  const sortedCrawls = useMemo(
    () =>
      [...recentCrawls].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [crawlsDataKey]
  )
  const sortedCompletedCrawls = useMemo(
    () => sortedCrawls.filter((crawl) => crawl.status === "completed"),
    [sortedCrawls]
  )
  const breakdownsDataKey = useMemo(
    () =>
      crawlBreakdowns
        .map(
          (item) => `${item.crawl.id}:${item.breakdown.overall_score ?? ""}:${item.breakdown.pillars.map((p) => `${p.id}:${p.score}`).join(",")}`
        )
        .join("|"),
    [crawlBreakdowns]
  )
  const selectedCrawlId = new URLSearchParams(location.search).get("crawl")
  const currentCrawl =
    sortedCrawls.find((crawl) => crawl.id === selectedCrawlId) ??
    sortedCompletedCrawls[0] ??
    null
  const currentCompletedIndex = sortedCompletedCrawls.findIndex(
    (crawl) => crawl.id === currentCrawl?.id
  )
  const previousCrawl =
    currentCompletedIndex >= 0 ? sortedCompletedCrawls[currentCompletedIndex + 1] ?? null : null
  const activeOrganization = me.organizations.find(
    (organization) => organization.id === me.active_org_id
  )
  const isOrganizationOwner = activeOrganization?.role === "owner"

  const stableCrawlBreakdowns = useMemo(
    () => crawlBreakdowns,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breakdownsDataKey]
  )
  const stableBreakdown = useMemo(
    () => currentBreakdown,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breakdownsDataKey]
  )

  const activeRunningCrawl =
    sortedCrawls.find(
      (crawl) => crawl.status === "queued" || crawl.status === "running"
    ) ?? null
  const isCrawlRunning = activeRunningCrawl !== null || isStartingCrawl
  const crawlStatusLabel = activeRunningCrawl?.status ?? "starting"

  useEffect(() => {
    if (!isCrawlRunning) {
      return
    }

    const interval = window.setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate()
      }
    }, 3000)

    return () => {
      window.clearInterval(interval)
    }
  }, [isCrawlRunning, revalidator])

  useEffect(() => {
    if (activeRunningCrawl) {
      setIsStartingCrawl(false)
    }
  }, [activeRunningCrawl])

  return (
    <main className="min-h-svh bg-background text-foreground">
      <AppNavbar
        activeProjectId={activeProject?.id}
        currentCrawl={currentCrawl}
        projectCrawls={projectCrawls}
        isCrawlRunning={isCrawlRunning}
        onCrawlStart={() => setIsStartingCrawl(true)}
        onViewChange={setView}
        organizationId={me.active_org_id}
        projects={projects}
        organizations={me.organizations}
        userEmail={me.user.email}
        userName={me.user.name}
        view={view}
      />

      {view === "revserp-audit" ? (
        <div className="@container/main relative flex flex-1 flex-col gap-4 py-6 md:gap-6 md:py-6">
          <div
            className={
              isCrawlRunning
                ? "pointer-events-none blur-sm transition duration-200"
                : "transition duration-200"
            }
          >
            <Tabs
              value={auditTab}
              onValueChange={(value) =>
                setAuditTab(value as "summary" | "seo" | "aeo" | "pagespeed")
              }
              className="gap-6"
            >
              <TabsContent value="summary" className="flex flex-col gap-4 md:gap-6">
                <div className="grid gap-4 px-4 lg:grid-cols-[minmax(260px,0.3fr)_minmax(0,0.7fr)] lg:px-6">
                  <ScoreRadialChart
                    centerLabel="Overall"
                    centerValue={currentCrawl?.overall_score}
                    description="Current crawl pillar scores"
                    segments={[
                      { key: "seo", label: "SEO", value: currentCrawl?.seo_score },
                      { key: "aeo", label: "AEO", value: currentCrawl?.aeo_score },
                      { key: "pagespeed", label: "PageSpeed", value: currentCrawl?.pagespeed_score },
                    ]}
                    title="Overall Score"
                  />
                  <SummaryScoreHistoryChart
                    activeProjectName={activeProject?.name}
                    crawls={sortedCompletedCrawls}
                  />
                </div>
                <SectionCards
                  crawls={sortedCompletedCrawls}
                  currentCrawl={currentCrawl}
                  previousCrawl={previousCrawl}
                />
                <div className="px-4 lg:px-6">
                  <Separator />
                </div>
                <IssueExplorer
                  breakdown={stableBreakdown}
                  onGenerateAIFixesNow={handleGenerateAIFixesNow}
                  projectId={activeProject?.id}
                />
              </TabsContent>

              <TabsContent value="seo">
                <PillarAuditView
                  activeProjectName={activeProject?.name}
                  crawlBreakdowns={stableCrawlBreakdowns}
                  currentBreakdown={stableBreakdown}
                  onGenerateAIFixesNow={handleGenerateAIFixesNow}
                  pillarId="seo"
                  projectId={activeProject?.id}
                  title="SEO"
                />
              </TabsContent>

              <TabsContent value="aeo">
                <PillarAuditView
                  activeProjectName={activeProject?.name}
                  crawlBreakdowns={stableCrawlBreakdowns}
                  currentBreakdown={stableBreakdown}
                  onGenerateAIFixesNow={handleGenerateAIFixesNow}
                  pillarId="aeo"
                  projectId={activeProject?.id}
                  title="AEO"
                />
              </TabsContent>

              <TabsContent value="pagespeed">
                <PillarAuditView
                  activeProjectName={activeProject?.name}
                  crawlBreakdowns={stableCrawlBreakdowns}
                  currentBreakdown={stableBreakdown}
                  onGenerateAIFixesNow={handleGenerateAIFixesNow}
                  pillarId="pagespeed"
                  projectId={activeProject?.id}
                  title="PageSpeed"
                />
              </TabsContent>

              <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 justify-center px-4">
                <TabsList className="h-11 w-fit border border-foreground/20 bg-muted/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-md">
                  <TabsTrigger className="px-4 text-sm" value="summary">Summary</TabsTrigger>
                  <TabsTrigger className="px-4 text-sm" value="seo">SEO</TabsTrigger>
                  <TabsTrigger className="px-4 text-sm" value="aeo">AEO</TabsTrigger>
                  <TabsTrigger className="px-4 text-sm" value="pagespeed">PageSpeed</TabsTrigger>
                </TabsList>
              </div>
            </Tabs>
          </div>

          {isCrawlRunning ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-md">
              <Card className="w-full max-w-md border-border/50 bg-gradient-to-br from-card via-card to-muted/30 shadow-xl">
                <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                  <CompileLoader className="text-foreground" size={56} />
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-medium">Crawl in progress</h2>
                    <p className="text-sm text-muted-foreground">
                      {activeProject?.name || "This project"} is currently {crawlStatusLabel}.
                      Scores will refresh automatically when the crawl finishes.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      ) : view === "search-console" ? (
        <SearchConsoleView
          activeProject={activeProject}
          isOrganizationOwner={isOrganizationOwner}
        />
      ) : view === "revserp-ai" ? (
        <RevserpAIView
          breakdown={stableBreakdown}
          openConversationId={openAIConversationId}
          projectId={activeProject?.id}
          pendingAIFixRequest={pendingAIFixRequest}
          onPendingAIFixRequestSettled={(requestId) => {
            setPendingAIFixRequest((current) =>
              current?.requestId === requestId ? null : current
            )
          }}
        />
      ) : (
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>{viewLabels[view]}</CardTitle>
              <CardDescription>
                Placeholder app view for the protected dashboard shell.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>Current section: {viewLabels[view]}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

function getCrawlTimestamp(crawl: CrawlResponse) {
  return new Date(crawl.completed_at ?? crawl.started_at ?? crawl.created_at).getTime()
}
