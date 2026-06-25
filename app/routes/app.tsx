import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLoaderData, useLocation, useRevalidator } from "react-router"

import { AppNavbar, type DashboardView } from "~/components/app-navbar"
import { SummaryScoreHistoryChart } from "~/components/summary-score-history-chart"
import { CompileLoader } from "~/components/compile-loader"
import { IssueExplorer } from "~/components/issue-explorer"
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
import { getPillarChartColor } from "~/lib/pillar-colors"
import { type AIScopeState } from "~/lib/ai-conversation"
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
    projectsResponse.projects.find(
      (project) => project.id === requestedProjectId
    ) ??
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
          ...sortedCompletedCrawls.filter(
            (crawl) => crawl.id !== selectedCompletedCrawl.id
          ),
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
      crawlBreakdowns.find(
        (item) => item.crawl.id === selectedCompletedCrawl?.id
      )?.breakdown ?? null
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
  const {
    me,
    projects,
    activeProject,
    projectCrawls,
    recentCrawls,
    currentBreakdown,
    crawlBreakdowns,
  } = useLoaderData() as AppLoaderData
  const revalidator = useRevalidator()
  const location = useLocation()
  const [view, setView] = useState<DashboardView>("revserp-audit")
  const [auditTab, setAuditTab] = useState<
    "summary" | "seo" | "aeo" | "pagespeed"
  >("summary")
  const [isStartingCrawl, setIsStartingCrawl] = useState(false)
  const [openAIConversationId, setOpenAIConversationId] = useState<
    string | null
  >(null)
  const [pendingAIScope, setPendingAIScope] = useState<AIScopeState | null>(
    null
  )

  const handleOpenAIConversation = useCallback(
    (conversationId: string, scope?: AIScopeState) => {
      setOpenAIConversationId(conversationId)
      setPendingAIScope(scope ?? null)
      setView("revserp-ai")
    },
    []
  )

  const sortedCrawls = useMemo(
    () =>
      [...recentCrawls].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      ),
    [recentCrawls]
  )
  const sortedCompletedCrawls = useMemo(
    () => sortedCrawls.filter((crawl) => crawl.status === "completed"),
    [sortedCrawls]
  )
  const selectedCrawlId = new URLSearchParams(location.search).get("crawl")
  const currentCrawl =
    sortedCrawls.find((crawl) => crawl.id === selectedCrawlId) ??
    sortedCompletedCrawls[0] ??
    null
  const previousCrawl = useMemo(() => {
    const idx = sortedCompletedCrawls.findIndex(
      (crawl) => crawl.id === currentCrawl?.id
    )
    return idx >= 0 ? (sortedCompletedCrawls[idx + 1] ?? null) : null
  }, [currentCrawl, sortedCompletedCrawls])
  const activeOrganization = me.organizations.find(
    (organization) => organization.id === me.active_org_id
  )
  const isOrganizationOwner = activeOrganization?.role === "owner"

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

  // Lock page scrolling while a crawl is in progress so the centered overlay
  // stays put; the navbar remains interactive (it sits outside the dimmer).
  useEffect(() => {
    if (!isCrawlRunning) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isCrawlRunning])
  // Stabilize chart props so polling doesn't re-render charts when data is unchanged
  const chartCacheRef = useRef({
    crawlsKey: "",
    breakdownsKey: "",
    currentId: "",
    crawls: [] as CrawlResponse[],
    breakdowns: [] as CrawlBreakdown[],
    current: null as ScoreBreakdownResponse | null,
  })

  const completedCrawlsKey = sortedCompletedCrawls
    .map(getCrawlChartKey)
    .join(",")
  if (completedCrawlsKey !== chartCacheRef.current.crawlsKey) {
    chartCacheRef.current.crawlsKey = completedCrawlsKey
    chartCacheRef.current.crawls = sortedCompletedCrawls
  }

  const breakdownKey = crawlBreakdowns.map(getBreakdownChartKey).join(",")
  if (breakdownKey !== chartCacheRef.current.breakdownsKey) {
    chartCacheRef.current.breakdownsKey = breakdownKey
    chartCacheRef.current.breakdowns = crawlBreakdowns
  }

  const currentKey = currentBreakdown
    ? getScoreBreakdownChartKey(currentBreakdown)
    : ""
  if (currentKey !== chartCacheRef.current.currentId) {
    chartCacheRef.current.currentId = currentKey
    chartCacheRef.current.current = currentBreakdown
  }

  const stableSortedCompletedCrawls = chartCacheRef.current.crawls
  const stableCrawlBreakdowns = chartCacheRef.current.breakdowns
  const stableCurrentBreakdown = chartCacheRef.current.current
  const stableCurrentCrawl =
    stableSortedCompletedCrawls.find(
      (crawl) => crawl.id === currentCrawl?.id
    ) ?? currentCrawl
  const stablePreviousCrawl =
    stableSortedCompletedCrawls.find(
      (crawl) => crawl.id === previousCrawl?.id
    ) ?? previousCrawl
  const scoreSegments = useMemo(
    () => [
      {
        key: "seo",
        label: "SEO",
        value: stableCurrentCrawl?.seo_score,
        color: getPillarChartColor("seo", 0),
      },
      {
        key: "aeo",
        label: "AEO",
        value: stableCurrentCrawl?.aeo_score,
        color: getPillarChartColor("aeo", 0),
      },
      {
        key: "pagespeed",
        label: "PageSpeed",
        value: stableCurrentCrawl?.pagespeed_score,
        color: getPillarChartColor("pagespeed", 0),
      },
    ],
    [
      stableCurrentCrawl?.seo_score,
      stableCurrentCrawl?.aeo_score,
      stableCurrentCrawl?.pagespeed_score,
    ]
  )

  return (
    <main className="min-h-svh bg-background text-foreground">
      <AppNavbar
        activeProjectId={activeProject?.id}
        currentCrawl={currentCrawl}
        projectCrawls={projectCrawls}
        isCrawlRunning={isCrawlRunning}
        crawlStatusLabel={crawlStatusLabel}
        onCrawlStart={() => setIsStartingCrawl(true)}
        onViewChange={setView}
        onSelectConversation={handleOpenAIConversation}
        organizationId={me.active_org_id}
        projects={projects}
        organizations={me.organizations}
        userEmail={me.user.email}
        userName={me.user.name}
        view={view}
        isPlatformAdmin={me.is_platform_admin}
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
              <TabsContent
                value="summary"
                className="flex flex-col gap-4 md:gap-6"
              >
                <div className="grid gap-4 px-4 lg:grid-cols-[minmax(260px,0.3fr)_minmax(0,0.7fr)] lg:px-6">
                  <ScoreRadialChart
                    centerLabel="Overall"
                    centerValue={stableCurrentCrawl?.overall_score}
                    description="Current crawl pillar scores"
                    segments={scoreSegments}
                    title="Overall Score"
                  />
                  <SummaryScoreHistoryChart
                    activeProjectName={activeProject?.name}
                    crawls={stableSortedCompletedCrawls}
                  />
                </div>
                <SectionCards
                  crawls={stableSortedCompletedCrawls}
                  currentCrawl={stableCurrentCrawl}
                  previousCrawl={stablePreviousCrawl}
                />
                <div className="px-4 lg:px-6">
                  <Separator />
                </div>
                <IssueExplorer
                  breakdown={stableCurrentBreakdown}
                  onOpenAIConversation={handleOpenAIConversation}
                  projectId={activeProject?.id}
                />
              </TabsContent>

              <TabsContent value="seo">
                <PillarAuditView
                  activeProjectName={activeProject?.name}
                  crawlBreakdowns={stableCrawlBreakdowns}
                  currentBreakdown={stableCurrentBreakdown}
                  onOpenAIConversation={handleOpenAIConversation}
                  pillarId="seo"
                  projectId={activeProject?.id}
                  title="SEO"
                />
              </TabsContent>

              <TabsContent value="aeo">
                <PillarAuditView
                  activeProjectName={activeProject?.name}
                  crawlBreakdowns={stableCrawlBreakdowns}
                  currentBreakdown={stableCurrentBreakdown}
                  onOpenAIConversation={handleOpenAIConversation}
                  pillarId="aeo"
                  projectId={activeProject?.id}
                  title="AEO"
                />
              </TabsContent>

              <TabsContent value="pagespeed">
                <PillarAuditView
                  activeProjectName={activeProject?.name}
                  crawlBreakdowns={stableCrawlBreakdowns}
                  currentBreakdown={stableCurrentBreakdown}
                  onOpenAIConversation={handleOpenAIConversation}
                  pillarId="pagespeed"
                  projectId={activeProject?.id}
                  title="PageSpeed"
                />
              </TabsContent>

              <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 justify-center px-4">
                <TabsList className="h-11 w-fit border border-foreground/20 bg-muted/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-md">
                  <TabsTrigger className="px-4 text-sm" value="summary">
                    Summary
                  </TabsTrigger>
                  <TabsTrigger className="px-4 text-sm" value="seo">
                    SEO
                  </TabsTrigger>
                  <TabsTrigger className="px-4 text-sm" value="aeo">
                    AEO
                  </TabsTrigger>
                  <TabsTrigger className="px-4 text-sm" value="pagespeed">
                    PageSpeed
                  </TabsTrigger>
                </TabsList>
              </div>
            </Tabs>
          </div>

          {isCrawlRunning ? (
            <>
              {/* Dimmer covers the content region only (below the navbar), so the
                  navbar stays interactive while a crawl runs. */}
              <div className="absolute inset-0 z-10 bg-black/20 backdrop-blur-md" />
              {/* Card is fixed to the viewport center (~50vh) so it's visible without
                  scrolling regardless of page height. */}
              <Card className="fixed top-1/2 left-1/2 z-20 w-full max-w-md -translate-x-1/2 -translate-y-1/2 border-border/50 bg-gradient-to-br from-card via-card to-muted/30 shadow-xl">
                <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                  <CompileLoader className="text-foreground" size={56} />
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-medium">
                      {crawlStatusLabel === "queued"
                        ? "Queued"
                        : "Crawl in progress"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {activeProject?.name || "This project"} is currently{" "}
                      {crawlStatusLabel}. Scores will refresh automatically when
                      the crawl finishes.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      ) : view === "search-console" ? (
        <SearchConsoleView
          activeProject={activeProject}
          isOrganizationOwner={isOrganizationOwner}
        />
      ) : view === "revserp-ai" ? (
        <RevserpAIView
          breakdown={stableCurrentBreakdown}
          initialScope={pendingAIScope}
          openConversationId={openAIConversationId}
          projectId={activeProject?.id}
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
  return new Date(
    crawl.completed_at ?? crawl.started_at ?? crawl.created_at
  ).getTime()
}

function getCrawlChartKey(crawl: CrawlResponse) {
  return [
    crawl.id,
    crawl.status,
    crawl.completed_at ?? "",
    crawl.overall_score ?? "",
    crawl.seo_score ?? "",
    crawl.aeo_score ?? "",
    crawl.pagespeed_score ?? "",
  ].join(":")
}

function getBreakdownChartKey(crawlBreakdown: CrawlBreakdown) {
  return `${getCrawlChartKey(crawlBreakdown.crawl)}:${getScoreBreakdownChartKey(crawlBreakdown.breakdown)}`
}

function getScoreBreakdownChartKey(breakdown: ScoreBreakdownResponse) {
  return [
    breakdown.crawl_id,
    ...breakdown.pillars.flatMap((pillar) => [
      pillar.id,
      pillar.score ?? "",
      ...pillar.buckets.flatMap((bucket) => [
        bucket.id,
        bucket.score ?? "",
        bucket.affected_url_count,
      ]),
    ]),
  ].join(":")
}
