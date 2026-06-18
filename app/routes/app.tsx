import { useEffect, useMemo, useState } from "react"
import { Link, useLoaderData, useRevalidator } from "react-router"

import { AppNavbar, type DashboardView } from "~/components/app-navbar"
import { ChartAreaInteractive } from "~/components/chart-area-interactive"
import { CompileLoader } from "~/components/compile-loader"
import { IssueExplorer } from "~/components/issue-explorer"
import {
  PillarAuditView,
  type CrawlBreakdown,
} from "~/components/pillar-audit-view"
import { SectionCards } from "~/components/section-cards"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
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
  const activeProject =
    projectsResponse.projects.find((project) => project.id === requestedProjectId) ??
    projectsResponse.projects[0] ??
    null

  let recentCrawls: CrawlResponse[] = []
  let currentBreakdown: ScoreBreakdownResponse | null = null
  let crawlBreakdowns: CrawlBreakdown[] = []

  if (activeProject) {
    const crawlsResponse = await serverApiFetch<CrawlsResponse>(
      `/projects/${activeProject.id}/crawls?limit=20&offset=0`,
      request
    )
    recentCrawls = crawlsResponse.crawls

    const sortedCompletedCrawls = [...recentCrawls]
      .filter((crawl) => crawl.status === "completed")
      .sort((left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left))
    const breakdownResults = await Promise.allSettled(
      sortedCompletedCrawls.map(async (crawl) => ({
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
    currentBreakdown = crawlBreakdowns[0]?.breakdown ?? null
  }

  return {
    me,
    projects: projectsResponse.projects,
    activeProject,
    recentCrawls,
    currentBreakdown,
    crawlBreakdowns,
  }
}

type AppLoaderData = {
  me: MeResponse
  projects: ProjectResponse[]
  activeProject: ProjectResponse | null
  recentCrawls: CrawlResponse[]
  currentBreakdown: ScoreBreakdownResponse | null
  crawlBreakdowns: CrawlBreakdown[]
}

const viewLabels: Record<DashboardView, string> = {
  "revserp-audit": "Revserp Audit",
  "search-console": "Search Console",
  "revserp-ai": "Revserp AI",
}

export default function AppPage() {
  const { me, projects, activeProject, recentCrawls, currentBreakdown, crawlBreakdowns } =
    useLoaderData() as AppLoaderData
  const revalidator = useRevalidator()
  const [view, setView] = useState<DashboardView>("revserp-audit")
  const [auditTab, setAuditTab] = useState<"summary" | "seo" | "aeo" | "pagespeed">(
    "summary"
  )
  const [isStartingCrawl, setIsStartingCrawl] = useState(false)

  const sortedCrawls = useMemo(
    () =>
      [...recentCrawls].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      ),
    [recentCrawls]
  )
  const activeRunningCrawl =
    sortedCrawls.find(
      (crawl) => crawl.status === "queued" || crawl.status === "running"
    ) ?? null
  const isCrawlRunning = activeRunningCrawl !== null || isStartingCrawl
  const crawlStatusLabel = activeRunningCrawl?.status ?? "starting"
  const sortedCompletedCrawls = sortedCrawls.filter(
    (crawl) => crawl.status === "completed"
  )
  const currentCrawl = sortedCompletedCrawls[0] ?? null
  const previousCrawl = sortedCompletedCrawls[1] ?? null

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
        isCrawlRunning={isCrawlRunning}
        onCrawlStart={() => setIsStartingCrawl(true)}
        onViewChange={setView}
        organizationId={me.active_org_id}
        projects={projects}
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
                <div className="px-4 lg:px-6">
                  <ChartAreaInteractive
                    activeProjectName={activeProject?.name}
                    crawls={sortedCompletedCrawls}
                  />
                </div>
                <SectionCards
                  crawls={sortedCompletedCrawls}
                  currentCrawl={currentCrawl}
                  previousCrawl={previousCrawl}
                />
                <IssueExplorer breakdown={currentBreakdown} />
              </TabsContent>

              <TabsContent value="seo">
                <PillarAuditView
                  activeProjectName={activeProject?.name}
                  crawlBreakdowns={crawlBreakdowns}
                  currentBreakdown={currentBreakdown}
                  pillarId="seo"
                  title="SEO"
                />
              </TabsContent>

              <TabsContent value="aeo">
                <PillarAuditView
                  activeProjectName={activeProject?.name}
                  crawlBreakdowns={crawlBreakdowns}
                  currentBreakdown={currentBreakdown}
                  pillarId="aeo"
                  title="AEO"
                />
              </TabsContent>

              <TabsContent value="pagespeed">
                <PillarAuditView
                  activeProjectName={activeProject?.name}
                  crawlBreakdowns={crawlBreakdowns}
                  currentBreakdown={currentBreakdown}
                  pillarId="pagespeed"
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
              <p>
                Signed in as <span className="font-medium text-foreground">{me.user.email}</span>
              </p>
              <p>Current section: {viewLabels[view]}</p>
              <Link className="underline underline-offset-4" to="/">
                Back home
              </Link>
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
