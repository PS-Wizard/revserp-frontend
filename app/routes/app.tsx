import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
} from "react-router"
import { redirect } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import type { DashboardView } from "~/components/app-navbar/types"
import type { AuditTab } from "~/components/app-navbar/types"
import { revbotHashTarget } from "~/components/app-navbar/types"
import { usePdfExport } from "~/components/pdf-export/use-pdf-export"
import { PdfPrintSections } from "~/components/pdf-export/pdf-print-sections"
import { IssueWorkspacePanelProvider } from "~/components/summary/issue-workspace-floating-panel"
import { OverviewScoreHistoryChart } from "~/components/overview-score-history-chart"
import { OverviewWorkFixesCards } from "~/components/overview-work-fixes-cards"
import { OverviewSecondaryCards } from "~/components/overview-secondary-cards"
import { ThinkingOrb } from "thinking-orbs"
import {
  PillarAuditView,
  type CrawlBreakdown,
  type CrawlBreakdownScores,
} from "~/components/pillar-audit-view"
import { CompareView } from "~/components/compare/compare-view"
import { RevserpVisibilityView } from "~/components/revserp-visibility-view"
import { WorkspaceShellPreview } from "~/components/workspace-shell-preview"
import { SearchConsoleView } from "~/components/search-console-view"
import { FeaturesProvider } from "~/lib/features"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Tabs, TabsContent } from "~/components/ui/tabs"

import { useCrawlTracking } from "~/hooks/use-crawl-tracking"
import { useSessionRenewal } from "~/hooks/use-session-renewal"
import { ApiError, clientApiFetch, serverApiFetch } from "~/lib/api"
import { isAccountSuspended } from "~/lib/auth.server"
import type {
  AppBootstrapResponse,
  CrawlResponse,
  MeResponse,
  ProjectBucketTrendsResponse,
  ProjectResponse,
  ScoreBreakdownResponse,
} from "~/lib/api.types"

// Lazy so d3-force and the canvas renderer stay out of the main bundle
// until the Site-Graph tab is opened.
const SiteGraphView = lazy(() =>
  import("~/components/site-graph/site-graph-view").then((module) => ({
    default: module.SiteGraphView,
  }))
)

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
    session_expires_at: sessionExpiresAt,
    session_renew_after: sessionRenewAfter,
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
    sessionExpiresAt,
    sessionRenewAfter,
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
  sessionExpiresAt: string
  sessionRenewAfter: string
}

const PILLAR_TABS: ReadonlyArray<{
  tab: AuditTab
  pillarId: string
  title: string
}> = [
  { tab: "seo", pillarId: "seo", title: "SEO" },
  { tab: "aeo", pillarId: "aeo", title: "AEO" },
  { tab: "pagespeed", pillarId: "pagespeed", title: "PageSpeed" },
]

const viewLabels: Record<DashboardView, string> = {
  "revserp-audit": "Revserp Audit",
  "revserp-visibility": "Revserp Visibility",
  "search-console": "Search Console",
  compare: "Compare",
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
    sessionExpiresAt,
    sessionRenewAfter,
  } = useLoaderData() as AppLoaderData
  const revalidator = useRevalidator()
  const location = useLocation()
  const navigate = useNavigate()
  useSessionRenewal(sessionExpiresAt, sessionRenewAfter)
  const [view, setView] = useState<DashboardView>("revserp-audit")
  const [auditTab, setAuditTab] = useState<AuditTab>("overview")
  const shouldReduceMotion = useReducedMotion() ?? false
  const [isStartingCrawl, setIsStartingCrawl] = useState(false)
  // The other side of an open comparison. The near side is always the current
  // project/crawl selection, so a project switch closes the comparison rather
  // than silently re-pointing it.
  const [compareTarget, setCompareTarget] = useState<{
    crawl: CrawlResponse
    projectName: string
    baseUrl: string
  } | null>(null)

  // Hash-based workspace navigation: `/#seo-tab`, `/#aeo-tab`, … and
  // `/#search-console` switch the workspace. The app also mirrors the current
  // tab back into the hash so these URLs are shareable.
  const lastWrittenHashRef = useRef("")

  useEffect(() => {
    if (location.hash === lastWrittenHashRef.current) return
    const target = revbotHashTarget(location.hash.replace(/^#/, ""))
    if (!target) return
    if (
      target.view === "search-console" &&
      me.features?.gsc_connector === false
    )
      return
    setView(target.view)
    if ("tab" in target) setAuditTab(target.tab)
  }, [location.hash, me.features?.gsc_connector])

  useEffect(() => {
    const desired =
      view === "revserp-audit"
        ? `#${auditTab}-tab`
        : view === "search-console"
          ? "#search-console"
          : ""
    if (location.hash === desired) return
    lastWrittenHashRef.current = desired
    void navigate(
      { pathname: location.pathname, search: location.search, hash: desired },
      { replace: true }
    )
  }, [view, auditTab, location.hash, navigate])

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
  const revbotConversationId = useMemo(
    () => new URLSearchParams(location.search).get("revbotConversation"),
    [location.search]
  )
  const handleRevbotConversationChange = useCallback(
    (conversationId: string | null) => {
      const params = new URLSearchParams(location.search)
      if (params.get("revbotConversation") === conversationId) return
      if (conversationId) {
        params.set("revbotConversation", conversationId)
      } else {
        params.delete("revbotConversation")
      }
      void navigate(`${location.pathname}?${params.toString()}`, {
        replace: true,
      })
    },
    [location.pathname, location.search, navigate]
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

  const goToCrawl = useCallback(
    (projectId: string, crawlId?: string) => {
      const params = new URLSearchParams(location.search)
      params.set("project", projectId)
      if (projectId !== activeProject?.id) {
        params.delete("revbotConversation")
      }
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

  // The blocking overlay should appear ONLY when the crawl the
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

  const coverRef = useRef<HTMLDivElement>(null)
  const overallRef = useRef<HTMLDivElement>(null)
  const seoRef = useRef<HTMLDivElement>(null)
  const aeoRef = useRef<HTMLDivElement>(null)
  const pagespeedRef = useRef<HTMLDivElement>(null)
  const [showPrintSections, setShowPrintSections] = useState(false)

  const { exportPdf, isExporting } = usePdfExport({
    crawlId: currentCrawl?.id ?? null,
    projectName: activeProject?.name ?? "audit",
    currentCrawl: stableCurrentCrawl,
    coverRef,
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

  // A comparison needs a scored crawl on both sides. The near side follows the
  // current selection, so switching project or crawl invalidates it.
  const compareSides = useMemo(() => {
    if (!compareTarget || !stableCurrentCrawl || !activeProject) return null
    if (stableCurrentCrawl.status !== "completed") return null
    if (compareTarget.crawl.project_id === activeProject.id) return null
    return {
      a: {
        projectName: activeProject.name,
        baseUrl: activeProject.base_url,
        crawl: stableCurrentCrawl,
      },
      b: compareTarget,
    }
  }, [compareTarget, stableCurrentCrawl, activeProject])

  const handleCompareCrawl = useCallback(
    (crawl: CrawlResponse) => {
      const project = projects.find((entry) => entry.id === crawl.project_id)
      if (!project) return
      setCompareTarget({
        crawl,
        projectName: project.name,
        baseUrl: project.base_url,
      })
      setView("compare")
    },
    [projects]
  )

  const handleExitCompare = useCallback(() => {
    setCompareTarget(null)
    setView("revserp-audit")
  }, [])

  // Drop a stale comparison rather than leaving an empty tab selected.
  useEffect(() => {
    if (compareTarget && !compareSides) {
      setCompareTarget(null)
      setView((current) => (current === "compare" ? "revserp-audit" : current))
    }
  }, [compareTarget, compareSides])

  return (
    <FeaturesProvider features={me.features}>
      <IssueWorkspacePanelProvider
        crawlId={
          stableCurrentCrawl?.status === "completed"
            ? stableCurrentCrawl.id
            : null
        }
        currentUserId={me.user.id}
      >
        <WorkspaceShellPreview
          activeProjectId={activeProject?.id}
          auditTab={auditTab}
          compareLabel={
            compareSides ? `vs ${compareSides.b.projectName}` : null
          }
          crawlStatusLabel={crawlStatusLabel}
          currentCrawl={currentCrawl}
          isCrawlRunning={isCrawlRunning}
          isExportingAudit={isExporting}
          isPlatformAdmin={me.is_platform_admin}
          onAuditTabChange={setAuditTab}
          onCompareCrawl={handleCompareCrawl}
          onCrawlStart={handleCrawlStart}
          onExportAudit={handleExportAudit}
          onRevbotConversationChange={handleRevbotConversationChange}
          onViewChange={setView}
          organizationId={me.active_org_id}
          organizations={me.organizations}
          projectCrawls={projectCrawls}
          projects={projects}
          revbotConversationId={revbotConversationId}
          userEmail={me.user.email}
          userName={me.user.name}
          view={view}
        >
          {cancelDialog}

          {view === "revserp-audit" ? (
            <div className="@container/main relative flex flex-1 flex-col gap-4 py-6 md:gap-6 md:py-6">
              <div
                className={
                  isViewingRunningCrawl
                    ? "pointer-events-none blur-sm transition duration-200"
                    : "transition duration-200"
                }
              >
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key={auditTab}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.15,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <Tabs value={auditTab} className="gap-6">
                      <TabsContent
                        value="overview"
                        className="flex flex-col gap-4 md:gap-6"
                      >
                        <OverviewScoreHistoryChart
                          crawls={stableSortedCompletedCrawls}
                        />
                        <OverviewWorkFixesCards
                          crawlId={
                            stableCurrentCrawl?.status === "completed"
                              ? stableCurrentCrawl.id
                              : null
                          }
                          currentUserId={me.user.id}
                        />
                        <OverviewSecondaryCards
                          projectId={activeProject?.id ?? null}
                        />
                      </TabsContent>

                      {PILLAR_TABS.map(({ tab, pillarId, title }) => (
                        <TabsContent key={tab} value={tab}>
                          <PillarAuditView
                            activeProjectName={activeProject?.name}
                            crawlBreakdowns={stableCrawlBreakdowns}
                            currentCrawlId={stableCurrentCrawl?.id}
                            currentBreakdown={stableCurrentBreakdown}
                            pillarId={pillarId}
                            title={title}
                          />
                        </TabsContent>
                      ))}

                      <TabsContent value="site-graph">
                        {auditTab === "site-graph" ? (
                          <Suspense fallback={null}>
                            <SiteGraphView
                              currentCrawlId={stableCurrentCrawl?.id}
                            />
                          </Suspense>
                        ) : null}
                      </TabsContent>
                    </Tabs>
                  </motion.div>
                </AnimatePresence>
              </div>

              {isViewingRunningCrawl ? (
                <>
                  {/* Dimmer covers the content region only (below the navbar), so the
                  navbar stays interactive while a crawl runs. */}
                  <div className="absolute inset-0 z-10 bg-black/20 backdrop-blur-md" />
                  {/* Card is fixed to the viewport center (~50vh) so it's visible without
                  scrolling regardless of page height. */}
                  <Card className="fixed top-1/2 left-1/2 z-20 w-full max-w-md -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-card via-card to-muted/30 shadow-xl">
                    <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                      <ThinkingOrb
                        aria-hidden="true"
                        className="shrink-0"
                        size={64}
                        state="working"
                      />
                      <div className="flex flex-col gap-1">
                        <h2 className="text-lg font-medium">
                          {crawlStatusLabel === "queued"
                            ? "Queued"
                            : "Crawl in progress"}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {activeProject?.name || "This project"} is currently{" "}
                          {crawlStatusLabel}. Scores will refresh automatically
                          when the crawl finishes.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>
          ) : view === "compare" && compareSides ? (
            <CompareView
              a={compareSides.a}
              b={compareSides.b}
              onExit={handleExitCompare}
            />
          ) : view === "revserp-visibility" ? (
            <RevserpVisibilityView
              activeProject={activeProject}
              currentCrawl={stableCurrentCrawl}
            />
          ) : view === "search-console" &&
            me.features?.gsc_connector !== false ? (
            <SearchConsoleView
              activeProject={activeProject}
              completedCrawls={stableSortedCompletedCrawls}
              isOrganizationOwner={isOrganizationOwner}
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
              coverRef={coverRef}
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
        </WorkspaceShellPreview>
      </IssueWorkspacePanelProvider>
    </FeaturesProvider>
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
