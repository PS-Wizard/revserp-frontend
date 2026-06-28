import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
} from "react-router"
import { redirect } from "react-router"
import { useQueryClient } from "@tanstack/react-query"

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
import { useActiveCrawlsPoll } from "~/hooks/use-active-crawls-poll"
import { useCrawlToasts } from "~/hooks/use-crawl-toasts"
import { ApiError, clientApiFetch, serverApiFetch } from "~/lib/api"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { type AIScopeState } from "~/lib/ai-conversation"
import type {
  ActiveCrawlResponse,
  AppBootstrapResponse,
  CrawlResponse,
  MeResponse,
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
    if (error instanceof ApiError) {
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

  const recentCrawls: CrawlResponse[] = crawls
  const projectCrawls: Record<string, CrawlResponse[]> = activeProject
    ? { [activeProject.id]: recentCrawls }
    : {}

  let currentBreakdown: ScoreBreakdownResponse | null = breakdown ?? null
  let crawlBreakdowns: CrawlBreakdown[] = []

  if (currentBreakdown && selected_crawl_id) {
    const selectedCrawl = crawls.find((c) => c.id === selected_crawl_id) ?? null
    if (selectedCrawl) {
      crawlBreakdowns = [{ crawl: selectedCrawl, breakdown: currentBreakdown }]
    }
  } else if (currentBreakdown) {
    // breakdown present but no selected_crawl_id — find the most recent completed crawl
    const sortedCompleted = [...crawls]
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
  const [extraBreakdowns, setExtraBreakdowns] = useState<CrawlBreakdown[]>([])
  // Cache fetched extra breakdowns by crawl id to avoid re-fetching on project revisit.
  const extraBreakdownCacheRef = useRef<Map<string, CrawlBreakdown>>(new Map())

  // Track the most recently settled crawl to pass into useCrawlToasts.
  const [settledCrawl, setSettledCrawl] = useState<ActiveCrawlResponse | null>(
    null
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

  // Stable revalidate ref — the poll callback uses this so the interval never
  // depends on the revalidator object and thus never tears down on revalidation.
  const revalidateRef = useRef(revalidator.revalidate)
  revalidateRef.current = revalidator.revalidate
  const revalidatorStateRef = useRef(revalidator.state)
  revalidatorStateRef.current = revalidator.state

  const handleCrawlSettled = useCallback((crawl: ActiveCrawlResponse) => {
    setSettledCrawl(crawl)
    if (revalidatorStateRef.current === "idle") {
      revalidateRef.current()
    }
  }, [])

  const { activeCrawls } = useActiveCrawlsPoll({
    orgId: me.active_org_id,
    enabled: pollEnabled,
    onCrawlSettled: handleCrawlSettled,
  })

  const handleOpenAIConversation = useCallback(
    (conversationId: string, scope?: AIScopeState) => {
      if (activeProject?.id) {
        queryClient.invalidateQueries({
          queryKey: ["ai-conversations", activeProject.id],
          exact: true,
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

  useCrawlToasts({
    activeCrawls,
    settledCrawl,
    projectNameById,
    goToCrawl,
  })

  // Fetch up to 2 extra score-breakdowns for chart history — gated to the
  // summary tab only (sole consumer). Uses an AbortController to cancel on
  // cleanup. Caches by crawl id across project revisits.
  useEffect(() => {
    if (view !== "revserp-audit" || auditTab !== "summary") return

    const alreadyFetched = new Set([
      ...crawlBreakdowns.map(({ crawl }) => crawl.id),
      ...extraBreakdownCacheRef.current.keys(),
    ])
    const toFetch = sortedCompletedCrawls
      .filter((crawl) => !alreadyFetched.has(crawl.id))
      .slice(0, 2)

    if (toFetch.length === 0) {
      // Populate from cache for this project.
      const cached = sortedCompletedCrawls
        .map((crawl) => extraBreakdownCacheRef.current.get(crawl.id))
        .filter((bd): bd is CrawlBreakdown => bd !== undefined)
      setExtraBreakdowns(cached)
      return
    }

    const controller = new AbortController()
    void Promise.allSettled(
      toFetch.map((crawl) =>
        clientApiFetch<ScoreBreakdownResponse>(
          `/crawls/${crawl.id}/score-breakdown`,
          { signal: controller.signal }
        ).then((breakdown) => ({ crawl, breakdown }))
      )
    ).then((results) => {
      if (controller.signal.aborted) return
      for (const r of results) {
        if (r.status === "fulfilled") {
          extraBreakdownCacheRef.current.set(r.value.crawl.id, r.value)
        }
      }
      const cached = sortedCompletedCrawls
        .map((crawl) => extraBreakdownCacheRef.current.get(crawl.id))
        .filter((bd): bd is CrawlBreakdown => bd !== undefined)
      setExtraBreakdowns(cached)
    })

    return () => {
      controller.abort()
    }
  }, [activeProject?.id, view, auditTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset extra breakdowns and cache on project change.
  useEffect(() => {
    setExtraBreakdowns([])
    extraBreakdownCacheRef.current = new Map()
  }, [activeProject?.id])

  const allCrawlBreakdowns = useMemo(() => {
    const seen = new Set(crawlBreakdowns.map(({ crawl }) => crawl.id))
    const extras = extraBreakdowns.filter(({ crawl }) => !seen.has(crawl.id))
    return [...crawlBreakdowns, ...extras].sort(
      (a, b) => getCrawlTimestamp(b.crawl) - getCrawlTimestamp(a.crawl)
    )
  }, [crawlBreakdowns, extraBreakdowns])

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

  const handleCrawlStart = useCallback(() => setIsStartingCrawl(true), [])

  return (
    <main className="min-h-svh bg-background text-foreground">
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
