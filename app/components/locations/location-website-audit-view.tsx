"use client"

import { useMemo } from "react"
import { GlobeIcon, Loader2Icon } from "lucide-react"

import type { AuditTab } from "~/components/app-navbar/types"
import { PillarAuditView } from "~/components/pillar-audit-view"
import { OverviewPillarScoresSection } from "~/components/overview-pillar-scores-section"
import {
  OverviewScoreHistoryChart,
  type ScoreHistoryPoint,
} from "~/components/overview-score-history-chart"
import { ApiError } from "~/lib/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import {
  buildScopedCrawlBreakdown,
  createScopedIssueUrlsFetcher,
  useLocationWebsiteAuditBreakdown,
  useLocationWebsiteAuditHistory,
  type LocationScopedPage,
  type LocationWebsiteAuditBreakdownResponse,
} from "~/components/locations/location-website-audit-api"
import { LocationWebsiteAuditPages } from "~/components/locations/location-website-audit-pages"
import { LocationWebsiteScopeSettingsButton } from "~/components/locations/location-website-scope-settings"

const PILLAR_TITLES: Record<string, string> = {
  seo: "SEO",
  aeo: "AEO",
  pagespeed: "PageSpeed",
}

/**
 * Branch website audit panels for one location. The outer navbar selects
 * the panel through auditTab; this component renders no tab row, no
 * location heading, and no scope chrome. Scope management lives in the
 * website scope settings dialog. A derived read-only view over matching
 * stored parent pages: no location crawl, no parent totals, and no score
 * when nothing is in scope. Root passes the shared parent crawl id; never
 * any parent score breakdowns.
 */
export function LocationWebsiteAuditView({
  projectId,
  locationId,
  auditTab,
  currentCrawlId,
  onAuditTabChange,
  onOpenPage,
}: {
  projectId: string
  locationId: string
  auditTab: AuditTab
  currentCrawlId: string | null
  onAuditTabChange?: (tab: AuditTab) => void
  onOpenPage?: (page: LocationScopedPage) => void
}) {
  const workspace = useOptionalLocationWorkspace()

  const scope = workspace?.websiteScope ?? null
  const hasScope =
    scope !== null && scope.match !== "none" && (scope.url ?? "") !== ""
  const scopeRevision = scope?.revision ?? null

  const breakdownQuery = useLocationWebsiteAuditBreakdown(
    projectId,
    locationId,
    {
      crawlId: currentCrawlId,
      scopeRevision,
      enabled: hasScope && scopeRevision !== null,
    }
  )
  const historyQuery = useLocationWebsiteAuditHistory(projectId, locationId, {
    scopeRevision,
    limit: 20,
    enabled: hasScope && scopeRevision !== null,
  })

  const issueUrlsFetcher = useMemo(
    () =>
      createScopedIssueUrlsFetcher(projectId, locationId, {
        crawlId: currentCrawlId,
        scopeRevision,
      }),
    [projectId, locationId, currentCrawlId, scopeRevision]
  )
  const scopeKey = `${currentCrawlId ?? "latest"}::rev${scopeRevision ?? "none"}`

  const breakdown = breakdownQuery.data ?? null
  const historyEntries = historyQuery.data?.crawls ?? []
  const displayCrawlId =
    (breakdown?.crawl_id || undefined) ??
    currentCrawlId ??
    historyEntries[0]?.crawl_id ??
    null
  const displayCompletedAt = historyEntries.find(
    (entry) => entry.crawl_id === displayCrawlId
  )?.completed_at

  const crawlBreakdowns = useMemo(() => {
    if (!breakdown?.breakdown || !displayCrawlId || !displayCompletedAt) {
      return []
    }
    return [
      buildScopedCrawlBreakdown(
        displayCrawlId,
        displayCompletedAt,
        breakdown.breakdown
      ),
    ]
  }, [breakdown, displayCrawlId, displayCompletedAt])

  const unsupported = useMemo(
    () => new Set(breakdown?.unsupported_buckets ?? []),
    [breakdown]
  )
  /**
   * Pillars with no measurable buckets left (today PageSpeed when only
   * psi_cwv remains) leave the overview section: their derived score would
   * read as a real headline. The pillar tab and scope settings explain why.
   */
  const overviewBreakdowns = useMemo(
    () =>
      crawlBreakdowns.map((entry) => ({
        crawl: entry.crawl,
        breakdown: {
          ...entry.breakdown,
          pillars: entry.breakdown.pillars.filter(
            (pillar) =>
              pillar.buckets.length === 0 ||
              pillar.buckets.some((bucket) => !unsupported.has(bucket.id))
          ),
        },
      })),
    [crawlBreakdowns, unsupported]
  )

  const historyPoints: ScoreHistoryPoint[] = useMemo(
    () =>
      historyEntries.map((entry) => ({
        id: entry.crawl_id,
        timestamp: new Date(entry.completed_at).getTime(),
        overall: entry.scores?.overall ?? null,
        seo: entry.scores?.seo ?? null,
        aeo: entry.scores?.aeo ?? null,
        pagespeed: entry.scores?.pagespeed ?? null,
      })),
    [historyEntries]
  )

  if (!workspace) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GlobeIcon aria-hidden="true" className="size-8" />
          </EmptyMedia>
          <EmptyTitle>Location unavailable</EmptyTitle>
          <EmptyDescription>
            Open this location from the parent Locations list.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!hasScope) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GlobeIcon aria-hidden="true" className="size-8" />
          </EmptyMedia>
          <EmptyTitle>No branch website scope yet</EmptyTitle>
          <EmptyDescription>
            Assign parent-site pages to this location to derive its audit
            from stored crawl evidence.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {workspace.canManage ? (
            <LocationWebsiteScopeSettingsButton
              projectId={projectId}
              locationId={locationId}
              workspace={workspace}
              label="Set branch scope"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Only managers can set the branch scope.
            </p>
          )}
        </EmptyContent>
      </Empty>
    )
  }

  if (auditTab === "pages") {
    return (
      <LocationWebsiteAuditPages
        projectId={projectId}
        locationId={locationId}
        crawlId={currentCrawlId}
        parentCrawlId={displayCrawlId}
        scopeRevision={scopeRevision}
        breakdown={breakdown?.breakdown ?? null}
        enabled={scopeRevision !== null}
        onOpenPage={onOpenPage}
      />
    )
  }

  // Site graph never arrives through the location nav (hidden there, normalized
  // to overview at dispatch), but a direct site-graph tab still renders the
  // overview panel rather than a dead whole-site placeholder.
  if (auditTab === "overview" || auditTab === "site-graph") {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <DerivedStatusSection
          breakdown={breakdown}
          isPending={breakdownQuery.isPending}
          isError={breakdownQuery.isError}
          error={breakdownQuery.error}
        />
        {breakdown?.scope_status === "ready" && (
          <OverviewPillarScoresSection
            crawlBreakdowns={overviewBreakdowns}
            currentCrawlId={displayCrawlId ?? undefined}
            onSelectPillar={
              onAuditTabChange
                ? (pillarId) => onAuditTabChange(pillarId as AuditTab)
                : undefined
            }
          />
        )}
        {historyQuery.isPending ? (
          <HistoryLoading />
        ) : historyQuery.isError ? (
          <HistoryError error={historyQuery.error} />
        ) : (
          <OverviewScoreHistoryChart
            points={historyPoints}
            caption={`Rev ${scopeRevision} · derived per-crawl scores`}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <DerivedStatusSection
        breakdown={breakdown}
        isPending={breakdownQuery.isPending}
        isError={breakdownQuery.isError}
        error={breakdownQuery.error}
      />
      {breakdown?.scope_status === "ready" && breakdown.breakdown && (
        <PillarAuditView
          crawlBreakdowns={crawlBreakdowns}
          currentBreakdown={breakdown.breakdown}
          currentCrawlId={displayCrawlId ?? undefined}
          pillarId={auditTab}
          title={PILLAR_TITLES[auditTab] ?? auditTab}
          unsupportedBucketIds={breakdown.unsupported_buckets}
          scopedIssueUrls={{
            fetchPage: issueUrlsFetcher,
            pageCrawlId: displayCrawlId ?? undefined,
            scopeKey,
            hideWorkActions: true,
          }}
        />
      )}
    </div>
  )
}

function DerivedStatusSection({
  breakdown,
  isPending,
  isError,
  error,
}: {
  breakdown: LocationWebsiteAuditBreakdownResponse | null
  isPending: boolean
  isError: boolean
  error: unknown
}) {
  if (isPending) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2Icon aria-hidden="true" className="animate-spin" />
          Deriving branch scores from stored parent pages…
        </CardContent>
      </Card>
    )
  }
  if (isError) {
    const message =
      error instanceof ApiError ? error.message : "Could not load the branch audit."
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branch audit unavailable</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  if (!breakdown || breakdown.scope_status === "unconfigured") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No branch scope</CardTitle>
          <CardDescription>
            Set an exact page or page subtree to derive this audit. Parent
            scores are never substituted.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  if (breakdown.scope_status === "no_matching_pages") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No matching pages</CardTitle>
          <CardDescription>
            No stored pages match this scope for the selected crawl
            {breakdown.matched_pages > 0
              ? ` (${breakdown.matched_pages} matched, none scoreable)`
              : ""}
            , so there is no score — not 0 or 100.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return (
    <p className="text-xs text-muted-foreground">
      Scoped to Rev {breakdown.scope_revision} · {breakdown.matched_pages}{" "}
      matching stored {breakdown.matched_pages === 1 ? "page" : "pages"} (
      {breakdown.eligible_pages} scoreable).
    </p>
  )
}

function HistoryLoading() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon aria-hidden="true" className="animate-spin" />
      Loading derived history…
    </p>
  )
}

function HistoryError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError ? error.message : "Could not load history."
  return <p className="text-sm text-destructive">{message}</p>
}
