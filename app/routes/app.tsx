import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
} from "react-router"
import { redirect } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { AppNavbar, type DashboardView } from "~/components/app-navbar"
import { usePdfExport } from "~/components/pdf-export/use-pdf-export"
import { PdfPrintSections } from "~/components/pdf-export/pdf-print-sections"
import { SummaryScoreHistoryChart } from "~/components/summary-score-history-chart"
import { CompileLoader } from "~/components/compile-loader"
import { IssueExplorer } from "~/components/issue-explorer"
import {
  PillarAuditView,
  type CrawlBreakdown,
  type CrawlBreakdownScores,
} from "~/components/pillar-audit-view"
import { SectionCards } from "~/components/section-cards"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import { RevserpAIView } from "~/components/revserp-ai-view"
import { RevserpVisibilityView } from "~/components/revserp-visibility-view"
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

import { useCrawlTracking } from "~/hooks/use-crawl-tracking"
import { ApiError, clientApiFetch, serverApiFetch } from "~/lib/api"
import { isAccountSuspended } from "~/lib/auth.server"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { type AIScopeState } from "~/lib/ai-conversation"
import type {
  AIAuditListResponse,
  AIAuditResponse,
  AppBootstrapResponse,
  CrawlResponse,
  MeResponse,
  ProjectBucketTrendsResponse,
  ProjectResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

export async function loader({ request }: { request: Request }) {
  const requestUrl = new URL(request.url)
  const requestedProjectId = requestUrl.searchParams.get("project")
  const requestedCrawlId = requestUrl.searchParams.get("crawl")

  const qs = new URLSearchParams()
  if (requestedProjectId) qs.set("project", requestedProjectId)
  if (requestedCrawlId) qs.set("crawl", requestedCrawlId)
  const qsStr = qs.toString()

  let bootstrap: AppBootstrapResponse
  try {
    bootstrap = await serverApiFetch<AppBootstrapResponse>(
      `/app-bootstrap${qsStr ? `?${qsStr}` : ""}`,
      request
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const nextPath = `${requestUrl.pathname}${requestUrl.search}`
      throw redirect(`/login?next=${encodeURIComponent(nextPath)}`)
    }
    if (isAccountSuspended(error)) {
      throw redirect("/account-suspended")
    }
    throw error
  }

  const {
    me,
    projects,
    active_project: activeProject,
    crawls,
    selected_crawl_id,
    breakdown,
  } = bootstrap

  const recentCrawls: CrawlResponse[] = crawls ?? []
  const projectCrawls: Record<string, CrawlResponse[]> = activeProject
    ? { [activeProject.id]: recentCrawls }
    : {}

  let currentBreakdown: ScoreBreakdownResponse | null = breakdown ?? null
  let crawlBreakdowns: CrawlBreakdown[] = []

  if (currentBreakdown && selected_crawl_id) {
    const selectedCrawl =
      recentCrawls.find((c) => c.id === selected_crawl_id) ?? null
    if (selectedCrawl) {
      crawlBreakdowns = [{ crawl: selectedCrawl, breakdown: currentBreakdown }]
    }
  } else if (currentBreakdown) {
    // breakdown present but no selected_crawl_id — find the most recent completed crawl
    const sortedCompleted = [...recentCrawls]
      .filter((c) => c.status === "completed")
      .sort((a, b) => getCrawlTimestamp(b) - getCrawlTimestamp(a))
    if (sortedCompleted[0]) {
      crawlBreakdowns = [
        { crawl: sortedCompleted[0], breakdown: currentBreakdown },
      ]
    }
  }

  return {
    me,
    projects,
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
  "revserp-visibility": "Revserp Visibility",
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  const [isNewChat, setIsNewChat] = useState(false)

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

  // Memoize selectedCrawlId (parse once per location.search change).
  const selectedCrawlId = useMemo(
    () => new URLSearchParams(location.search).get("crawl"),
    [location.search]
  )
  // Memoize currentCrawl.
  const currentCrawl = useMemo(
    () =>
      sortedCrawls.find((crawl) => crawl.id === selectedCrawlId) ??
      sortedCompletedCrawls[0] ??
      null,
    [sortedCrawls, sortedCompletedCrawls, selectedCrawlId]
  )

  // Org-wide "is any crawl in flight" signal — gates the poll.
  const hasActiveCrawlAnywhere = useMemo(
    () =>
      Object.values(projectCrawls).some((crawls) =>
        crawls.some(
          (crawl) => crawl.status === "queued" || crawl.status === "running"
        )
      ),
    [projectCrawls]
  )

  const pollEnabled = hasActiveCrawlAnywhere || isStartingCrawl

  // Stable revalidate ref so the tracking hook's poll never depends on the
  // revalidator object and thus never tears down on revalidation.
  const revalidateRef = useRef(revalidator.revalidate)
  revalidateRef.current = revalidator.revalidate
  const revalidatorStateRef = useRef(revalidator.state)
  revalidatorStateRef.current = revalidator.state

  const revalidateIfIdle = useCallback(() => {
    if (revalidatorStateRef.current === "idle") {
      revalidateRef.current()
    }
  }, [])

  const handleOpenAIConversation = useCallback(
    (conversationId: string, scope?: AIScopeState) => {
      if (activeProject?.id) {
        queryClient.invalidateQueries({
          queryKey: ["ai-conversations", activeProject.id],
        })
      }
      setOpenAIConversationId(conversationId)
      setIsNewChat(false)
      setPendingAIScope(scope ?? null)
      setView("revserp-ai")
    },
    [queryClient, activeProject?.id]
  )

  const handleNewAIChat = useCallback(() => {
    setOpenAIConversationId(null)
    setIsNewChat(true)
    setPendingAIScope(null)
    setView("revserp-ai")
  }, [])

  const goToCrawl = useCallback(
    (projectId: string, crawlId?: string) => {
      const params = new URLSearchParams(location.search)
      params.set("project", projectId)
      if (crawlId) {
        params.set("crawl", crawlId)
      } else {
        params.delete("crawl")
      }
      void navigate(`${location.pathname}?${params.toString()}`)
    },
    [navigate, location.pathname, location.search]
  )

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects) {
      map.set(project.id, project.name)
    }
    return map
  }, [projects])

  const { trackCrawl, cancelDialog } = useCrawlTracking({
    orgId: me.active_org_id,
    enabled: pollEnabled,
    projectNameById,
    goToCrawl,
    revalidate: revalidateIfIdle,
  })

  // Fetch compact per-crawl bucket-score history for the full crawl history,
  // ungated by tab so SEO/AEO/PageSpeed tabs get real trend data too (not
  // just the current crawl). One request per project via the dedicated
  // bucket-trends endpoint, joined with sortedCompletedCrawls (source of
  // truth for the full CrawlResponse fields like google_psi_results).
  const bucketTrendsQuery = useQuery({
    queryKey: ["bucket-trends", activeProject?.id],
    queryFn: () =>
      clientApiFetch<ProjectBucketTrendsResponse>(
        `/projects/${activeProject!.id}/bucket-trends?limit=50`
      ),
    enabled: view === "revserp-audit" && !!activeProject?.id,
    staleTime: 60_000,
  })

  const trendCrawlBreakdowns = useMemo(() => {
    const snapshots = bucketTrendsQuery.data?.crawls ?? []
    const crawlById = new Map(sortedCompletedCrawls.map((c) => [c.id, c]))
    const result: CrawlBreakdown[] = []
    for (const snap of snapshots) {
      const crawl = crawlById.get(snap.crawl_id)
      if (!crawl) continue
      result.push({
        crawl,
        breakdown: {
          overall_score: snap.overall_score,
          pillars: (snap.pillars ?? []).map((p) => ({
            id: p.id,
            label: p.label,
            score: p.score,
            buckets: (p.buckets ?? []).map((b) => ({
              id: b.id,
              label: b.label,
              score: b.score,
            })),
          })),
        },
      })
    }
    return result
  }, [bucketTrendsQuery.data, sortedCompletedCrawls])

  const allCrawlBreakdowns = useMemo(() => {
    const seen = new Set(crawlBreakdowns.map(({ crawl }) => crawl.id))
    const extras = trendCrawlBreakdowns.filter(
      ({ crawl }) => !seen.has(crawl.id)
    )
    return [...crawlBreakdowns, ...extras].sort(
      (a, b) => getCrawlTimestamp(b.crawl) - getCrawlTimestamp(a.crawl)
    )
  }, [crawlBreakdowns, trendCrawlBreakdowns])

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

  // The blocking overlay + AI-tab lock should appear ONLY when the crawl the
  // user currently has selected is the one in flight. A crawl running in the
  // background (while the user views an already-completed crawl) must not block
  // the UI — that data already exists. We only auto-switch to a running crawl
  // once it completes, so normally this stays false during a background crawl.
  const isViewingRunningCrawl =
    currentCrawl?.status === "running" || currentCrawl?.status === "queued"

  useEffect(() => {
    if (activeRunningCrawl) {
      setIsStartingCrawl(false)
    }
  }, [activeRunningCrawl])

  useEffect(() => {
    if (isViewingRunningCrawl && view === "revserp-ai") {
      setView("revserp-audit")
    }
  }, [isViewingRunningCrawl, view])

  // Lock page scrolling only while viewing the running crawl (overlay is up).
  useEffect(() => {
    if (!isViewingRunningCrawl) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isViewingRunningCrawl])

  // Stabilize chart props so polling doesn't re-render charts when data is unchanged.
  // Kept because chart components receive arrays by reference; even after the poll
  // teardown fix the loader still returns new array references on each navigation.
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

  const breakdownKey = allCrawlBreakdowns.map(getBreakdownChartKey).join(",")
  if (breakdownKey !== chartCacheRef.current.breakdownsKey) {
    chartCacheRef.current.breakdownsKey = breakdownKey
    chartCacheRef.current.breakdowns = allCrawlBreakdowns
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

  const { data: visibilityAuditsList } = useQuery({
    queryKey: activeProject?.id
      ? ["ai-audits-list", activeProject.id]
      : ["ai-audits-list-disabled"],
    queryFn: () =>
      clientApiFetch<AIAuditListResponse>(
        `/projects/${activeProject!.id}/ai-audits?limit=50&offset=0`
      ),
    enabled: Boolean(activeProject?.id),
  })

  const visibilityAuditId = visibilityAuditsList?.ai_audits.find(
    (a) => a.crawl_id === stableCurrentCrawl?.id
  )?.id

  const { data: visibilityAudit } = useQuery({
    queryKey: visibilityAuditId
      ? ["ai-audit", visibilityAuditId]
      : ["ai-audit-disabled"],
    queryFn: () =>
      clientApiFetch<AIAuditResponse>(`/ai-audits/${visibilityAuditId!}`),
    enabled: Boolean(visibilityAuditId),
  })

  const visibilitySuccessRuns = (visibilityAudit?.runs ?? []).filter(
    (r) => r.status === "success"
  )
  const hasVisibility = visibilitySuccessRuns.length > 0
  const currentVisibilityRate = hasVisibility
    ? Math.round(
        (visibilitySuccessRuns.filter((r) => r.mentioned_target).length /
          visibilitySuccessRuns.length) *
          100
      )
    : undefined

  // Render the backend-computed overall score (honors org-configurable
  // overall_weights and the backend min-score clamp) rather than a
  // client-side blend, so the dashboard matches crawl history/exports.
  const currentOverall = stableCurrentCrawl?.overall_score ?? null
  const previousOverall = stablePreviousCrawl?.overall_score ?? null

  const currentBlendWeights = useMemo(
    () =>
      getNormalizedBlendWeights({
        seo: stableCurrentCrawl?.seo_score,
        aeo: stableCurrentCrawl?.aeo_score,
        pagespeed: stableCurrentCrawl?.pagespeed_score,
        visibility: currentVisibilityRate,
      }),
    [
      stableCurrentCrawl?.seo_score,
      stableCurrentCrawl?.aeo_score,
      stableCurrentCrawl?.pagespeed_score,
      currentVisibilityRate,
    ]
  )

  const scoreSegments = useMemo(
    () => [
      // First entry renders as the innermost ring in recharts RadialBarChart.
      ...(hasVisibility
        ? [
            {
              key: "visibility",
              label: "Visibility",
              value: currentVisibilityRate,
              color: "hsl(265, 60%, 62%)",
              contribution: computeContribution(
                currentBlendWeights.visibility,
                currentVisibilityRate
              ),
            },
          ]
        : []),
      {
        key: "seo",
        label: "SEO",
        value: stableCurrentCrawl?.seo_score,
        color: getPillarChartColor("seo", 0),
        contribution: computeContribution(
          currentBlendWeights.seo,
          stableCurrentCrawl?.seo_score
        ),
      },
      {
        key: "aeo",
        label: "AEO",
        value: stableCurrentCrawl?.aeo_score,
        color: getPillarChartColor("aeo", 0),
        contribution: computeContribution(
          currentBlendWeights.aeo,
          stableCurrentCrawl?.aeo_score
        ),
      },
      {
        key: "pagespeed",
        label: "PageSpeed",
        value: stableCurrentCrawl?.pagespeed_score,
        color: getPillarChartColor("pagespeed", 0),
        contribution: computeContribution(
          currentBlendWeights.pagespeed,
          stableCurrentCrawl?.pagespeed_score
        ),
      },
    ],
    [
      stableCurrentCrawl?.seo_score,
      stableCurrentCrawl?.aeo_score,
      stableCurrentCrawl?.pagespeed_score,
      hasVisibility,
      currentVisibilityRate,
      currentBlendWeights,
    ]
  )

  const overallRef = useRef<HTMLDivElement>(null)
  const seoRef = useRef<HTMLDivElement>(null)
  const aeoRef = useRef<HTMLDivElement>(null)
  const pagespeedRef = useRef<HTMLDivElement>(null)
  const [showPrintSections, setShowPrintSections] = useState(false)

  const { exportPdf, isExporting } = usePdfExport({
    crawlId: currentCrawl?.id ?? null,
    projectName: activeProject?.name ?? "audit",
    currentCrawl: stableCurrentCrawl,
    overallRef,
    seoRef,
    aeoRef,
    pagespeedRef,
    onSectionsReady: () => setShowPrintSections(true),
    onDone: () => setShowPrintSections(false),
  })

  const handleCrawlStart = useCallback(
    (crawl: CrawlResponse) => {
      setIsStartingCrawl(true)
      trackCrawl(crawl.id)
    },
    [trackCrawl]
  )

  // exportPdf is redefined on every render by usePdfExport; route through a
  // ref so onExportAudit keeps a stable identity for AppNavbar's React.memo.
  const exportPdfRef = useRef(exportPdf)
  exportPdfRef.current = exportPdf
  const handleExportAudit = useCallback(() => {
    void exportPdfRef.current()
  }, [])

  return (
    <main className="min-h-svh overflow-x-clip bg-background text-foreground">
      {cancelDialog}
      <AppNavbar
        activeProjectId={activeProject?.id}
        currentCrawl={currentCrawl}
        projectCrawls={projectCrawls}
        isCrawlRunning={isCrawlRunning}
        isViewingRunningCrawl={isViewingRunningCrawl}
        crawlStatusLabel={crawlStatusLabel}
        onCrawlStart={handleCrawlStart}
        onViewChange={setView}
        onSelectConversation={handleOpenAIConversation}
        onNewChat={handleNewAIChat}
        onExportAudit={handleExportAudit}
        isExportingAudit={isExporting}
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
              isViewingRunningCrawl
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
                    centerValue={currentOverall}
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
                  overallValue={currentOverall}
                  overallPreviousValue={previousOverall}
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
                  currentCrawlId={stableCurrentCrawl?.id}
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
                  currentCrawlId={stableCurrentCrawl?.id}
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
                  currentCrawlId={stableCurrentCrawl?.id}
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

          {isViewingRunningCrawl ? (
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
      ) : view === "revserp-visibility" ? (
        <RevserpVisibilityView
          activeProject={activeProject}
          currentCrawl={stableCurrentCrawl}
        />
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
          forceNewConversation={isNewChat}
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
      {showPrintSections && (
        <PdfPrintSections
          overallRef={overallRef}
          seoRef={seoRef}
          aeoRef={aeoRef}
          pagespeedRef={pagespeedRef}
          crawlBreakdowns={stableCrawlBreakdowns}
          recentCrawls={stableSortedCompletedCrawls}
          currentCrawl={stableCurrentCrawl}
          previousCrawl={stablePreviousCrawl}
          currentBreakdown={stableCurrentBreakdown}
          activeProjectName={activeProject?.name}
        />
      )}
    </main>
  )
}

const OVERALL_BLEND_WEIGHTS = {
  seo: 0.55,
  aeo: 0.2,
  pagespeed: 0.15,
  visibility: 0.1,
}

type BlendScores = {
  seo?: number | null
  aeo?: number | null
  pagespeed?: number | null
  visibility?: number | null
}

function getNormalizedBlendWeights(scores: BlendScores) {
  const weights: Record<keyof BlendScores, number> = {
    seo: 0,
    aeo: 0,
    pagespeed: 0,
    visibility: 0,
  }
  let weightSum = 0
  for (const key of Object.keys(OVERALL_BLEND_WEIGHTS) as Array<
    keyof BlendScores
  >) {
    const score = scores[key]
    if (typeof score === "number" && Number.isFinite(score)) {
      weightSum += OVERALL_BLEND_WEIGHTS[key]
    }
  }
  if (weightSum === 0) return weights
  for (const key of Object.keys(OVERALL_BLEND_WEIGHTS) as Array<
    keyof BlendScores
  >) {
    const score = scores[key]
    if (typeof score === "number" && Number.isFinite(score)) {
      weights[key] = OVERALL_BLEND_WEIGHTS[key] / weightSum
    }
  }
  return weights
}

function computeContribution(
  normalizedWeight: number,
  score?: number | null
): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null
  return Math.round(normalizedWeight * score)
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

function getScoreBreakdownChartKey(breakdown: CrawlBreakdownScores) {
  return [
    breakdown.overall_score ?? "",
    ...breakdown.pillars.flatMap((pillar) => [
      pillar.id,
      pillar.score ?? "",
      ...pillar.buckets.flatMap((bucket) => [bucket.id, bucket.score ?? ""]),
    ]),
  ].join(":")
}
