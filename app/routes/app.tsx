import {
  Suspense,
  lazy,
  useCallback,
  useDeferredValue,
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
import { toast } from "sonner"

import { AppNavbar, type DashboardView } from "~/components/app-navbar"
import type { AuditTab } from "~/components/app-navbar/types"
import { usePdfExport } from "~/components/pdf-export/use-pdf-export"
import { PdfPrintSections } from "~/components/pdf-export/pdf-print-sections"
import { SummaryScoreHistoryChart } from "~/components/summary-score-history-chart"
import { ThinkingOrb } from "thinking-orbs"
import { IssueExplorer } from "~/components/issue-explorer"
import { IssueTreemap } from "~/components/issue-treemap"
import {
  PillarAuditView,
  type CrawlBreakdown,
  type CrawlBreakdownScores,
} from "~/components/pillar-audit-view"
import { CompareView } from "~/components/compare/compare-view"
import { SectionCards } from "~/components/section-cards"
import { ScoreRadialChart } from "~/components/score-radial-chart"
import type {
  AIExportAction,
  AINavigationDestination,
} from "~/components/ai-dock/use-ai-chat"
import {
  downloadBlob,
  formatCrawlDate,
  getExportFilename,
  getProjectFilenameSegment,
  readExportError,
} from "~/components/app-navbar/utils"
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
import { Tabs, TabsContent } from "~/components/ui/tabs"

import { useCrawlTracking } from "~/hooks/use-crawl-tracking"
import {
  ApiError,
  buildApiUrl,
  clientApiFetch,
  serverApiFetch,
} from "~/lib/api"
import { isAccountSuspended } from "~/lib/auth.server"
import { getPillarChartColor } from "~/lib/pillar-colors"
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
  } = useLoaderData() as AppLoaderData
  const revalidator = useRevalidator()
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView] = useState<DashboardView>("revserp-audit")
  const [auditTab, setAuditTab] = useState<AuditTab>("summary")
  const deferredView = useDeferredValue(view)
  const deferredAuditTab = useDeferredValue(auditTab)
  const [isStartingCrawl, setIsStartingCrawl] = useState(false)
  // The other side of an open comparison. The near side is always the current
  // project/crawl selection, so a project switch closes the comparison rather
  // than silently re-pointing it.
  const [compareTarget, setCompareTarget] = useState<{
    crawl: CrawlResponse
    projectName: string
    baseUrl: string
  } | null>(null)
  const [aiOpenRequest, setAiOpenRequest] = useState<{
    prompt: string
    token: number
  } | null>(null)
  const aiOpenTokenRef = useRef(0)
  // Bumped when the AI agent configures auto-crawl, so the navbar re-fetches.
  const [autoCrawlRefresh, setAutoCrawlRefresh] = useState(0)
  const handleAIAutoCrawlConfigured = useCallback(() => {
    setAutoCrawlRefresh((token) => token + 1)
  }, [])

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

  const handleSeedAIChat = useCallback((prompt: string) => {
    aiOpenTokenRef.current += 1
    setAiOpenRequest({ prompt, token: aiOpenTokenRef.current })
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

  // --- Global AI dock wiring ---
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects])

  const handleAINavigate = useCallback(
    (destination: AINavigationDestination) => {
      switch (destination) {
        case "audit_summary":
          setView("revserp-audit")
          setAuditTab("summary")
          break
        case "audit_seo":
          setView("revserp-audit")
          setAuditTab("seo")
          break
        case "audit_aeo":
          setView("revserp-audit")
          setAuditTab("aeo")
          break
        case "audit_pagespeed":
          setView("revserp-audit")
          setAuditTab("pagespeed")
          break
        case "site_graph":
          setView("revserp-audit")
          setAuditTab("site-graph")
          break
        case "search_console":
          setView("search-console")
          break
        case "visibility":
          setView("revserp-visibility")
          break
      }
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    []
  )

  const handleAIProjectSwitched = useCallback(
    (switchedProjectId: string) => {
      if (!projects.some((project) => project.id === switchedProjectId)) return
      goToCrawl(switchedProjectId)
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [projects, goToCrawl]
  )

  const handleAITrackCrawl = useCallback(
    (id: string) => {
      setIsStartingCrawl(true)
      trackCrawl(id)
    },
    [trackCrawl]
  )

  const handleAIExport = useCallback(
    (action: AIExportAction) => {
      if (action.kind === "audit" && action.format === "pdf") {
        void exportPdfRef.current()
        return
      }
      if (
        action.kind === "crawl" &&
        action.crawl_id &&
        (action.format === "csv" || action.format === "xlsx")
      ) {
        const crawl = recentCrawls.find((c) => c.id === action.crawl_id)
        if (crawl) void exportCrawlIssues(crawl, action.format, projects)
      }
    },
    [recentCrawls, projects]
  )

  const issuesRef = useRef<HTMLDivElement>(null)
  const issueFocusTokenRef = useRef(0)
  const [issueFocus, setIssueFocus] = useState<{
    pillarId?: string
    bucketId: string
    issueTypeId?: string
    autoSelect?: number
    token: number
  } | null>(null)
  const handleSelectBucket = useCallback(
    (pillarId: string, bucketId: string, issueTypeId?: string) => {
      issueFocusTokenRef.current += 1
      setIssueFocus({
        pillarId,
        bucketId,
        issueTypeId,
        autoSelect: 20,
        token: issueFocusTokenRef.current,
      })
      issuesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    },
    []
  )

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
    <main className="min-h-svh overflow-x-clip bg-background pb-36 text-foreground">
      {cancelDialog}
      <AppNavbar
        activeProjectId={activeProject?.id}
        currentCrawl={currentCrawl}
        projectCrawls={projectCrawls}
        isCrawlRunning={isCrawlRunning}
        crawlStatusLabel={crawlStatusLabel}
        onCrawlStart={handleCrawlStart}
        onCompareCrawl={handleCompareCrawl}
        compareLabel={compareSides ? `vs ${compareSides.b.projectName}` : null}
        onViewChange={setView}
        onExportAudit={handleExportAudit}
        isExportingAudit={isExporting}
        organizationId={me.active_org_id}
        projects={projects}
        organizations={me.organizations}
        userEmail={me.user.email}
        userName={me.user.name}
        view={view}
        auditTab={auditTab}
        onAuditTabChange={setAuditTab}
        isPlatformAdmin={me.is_platform_admin}
        autoCrawlRefreshToken={autoCrawlRefresh}
        projectIds={projectIds}
        trackCrawl={handleAITrackCrawl}
        onNavigate={handleAINavigate}
        onProjectSwitched={handleAIProjectSwitched}
        onExport={handleAIExport}
        onAutoCrawlConfigured={handleAIAutoCrawlConfigured}
        externalOpen={aiOpenRequest}
      />

      {deferredView === "revserp-audit" ? (
        <div className="@container/main relative flex flex-1 flex-col gap-4 py-6 md:gap-6 md:py-6">
          <div
            className={
              isViewingRunningCrawl
                ? "pointer-events-none blur-sm transition duration-200"
                : "transition duration-200"
            }
          >
            <Tabs value={deferredAuditTab} className="gap-6">
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
                  <IssueTreemap
                    breakdown={stableCurrentBreakdown}
                    onSelectBucket={handleSelectBucket}
                  />
                </div>
                <div className="px-4 lg:px-6">
                  <Separator />
                </div>
                <div className="scroll-mt-4" ref={issuesRef}>
                  <IssueExplorer
                    breakdown={stableCurrentBreakdown}
                    focusRequest={issueFocus}
                    onSeedAIChat={handleSeedAIChat}
                    projectId={activeProject?.id}
                  />
                </div>
              </TabsContent>

              {PILLAR_TABS.map(({ tab, pillarId, title }) => (
                <TabsContent key={tab} value={tab}>
                  <PillarAuditView
                    activeProjectName={activeProject?.name}
                    crawlBreakdowns={stableCrawlBreakdowns}
                    currentCrawlId={stableCurrentCrawl?.id}
                    currentBreakdown={stableCurrentBreakdown}
                    onSeedAIChat={handleSeedAIChat}
                    pillarId={pillarId}
                    projectId={activeProject?.id}
                    title={title}
                  />
                </TabsContent>
              ))}

              <TabsContent value="site-graph">
                {deferredAuditTab === "site-graph" ? (
                  <Suspense fallback={null}>
                    <SiteGraphView currentCrawlId={stableCurrentCrawl?.id} />
                  </Suspense>
                ) : null}
              </TabsContent>
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
                      {crawlStatusLabel}. Scores will refresh automatically when
                      the crawl finishes.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      ) : deferredView === "compare" && compareSides ? (
        <CompareView
          a={compareSides.a}
          b={compareSides.b}
          onExit={handleExitCompare}
        />
      ) : deferredView === "revserp-visibility" ? (
        <RevserpVisibilityView
          activeProject={activeProject}
          currentCrawl={stableCurrentCrawl}
        />
      ) : deferredView === "search-console" ? (
        <SearchConsoleView
          activeProject={activeProject}
          completedCrawls={stableSortedCompletedCrawls}
          isOrganizationOwner={isOrganizationOwner}
        />
      ) : (
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>{viewLabels[deferredView]}</CardTitle>
              <CardDescription>
                Placeholder app view for the protected dashboard shell.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>Current section: {viewLabels[deferredView]}</p>
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
    </main>
  )
}

// Crawl-issues export used by the AI dock's `export{kind:'crawl'}` action.
// Mirrors the existing navbar crawl export (use-project-actions handleExportCrawl)
// minus the reducer bookkeeping, reusing the same endpoint and filename utils.
async function exportCrawlIssues(
  crawl: CrawlResponse,
  format: "csv" | "xlsx",
  projects: ProjectResponse[]
) {
  if (crawl.status !== "completed") {
    toast.error("Only completed crawls can be exported.")
    return
  }
  try {
    const response = await fetch(
      buildApiUrl(`/crawls/${crawl.id}/score-breakdown/export.${format}`),
      { credentials: "include" }
    )
    if (!response.ok) {
      throw new Error(await readExportError(response))
    }
    const blob = await response.blob()
    const project = projects.find((item) => item.id === crawl.project_id)
    const filename = getExportFilename(
      response.headers.get("content-disposition"),
      `${getProjectFilenameSegment(project)}-${formatCrawlDate(crawl)}-issues.${format}`
    )
    downloadBlob(blob, filename)
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Unable to export crawl issues."
    )
  }
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
