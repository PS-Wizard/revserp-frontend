import { useMemo } from "react"
import { SummaryScoreHistoryChart } from "~/components/summary-score-history-chart"
import { SectionCards } from "~/components/section-cards"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  TrendBadge,
  TrendSparkline,
  formatScore,
  getRoundedDelta,
  getTrendLabel,
  getTrendSummary,
} from "~/components/trend-sparkline"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { formatBucketLabel } from "~/lib/utils"
import type { CrawlBreakdown } from "~/components/pillar-audit-view"
import type { CrawlResponse, ScoreBreakdownResponse } from "~/lib/api.types"

type PdfPrintSectionsProps = {
  overallRef: React.RefObject<HTMLDivElement | null>
  seoRef: React.RefObject<HTMLDivElement | null>
  aeoRef: React.RefObject<HTMLDivElement | null>
  pagespeedRef: React.RefObject<HTMLDivElement | null>
  crawlBreakdowns: CrawlBreakdown[]
  recentCrawls: CrawlResponse[]
  currentCrawl: CrawlResponse | null
  previousCrawl: CrawlResponse | null
  currentBreakdown: ScoreBreakdownResponse | null
  activeProjectName?: string
}

export function PdfPrintSections({
  overallRef,
  seoRef,
  aeoRef,
  pagespeedRef,
  crawlBreakdowns,
  recentCrawls,
  currentCrawl,
  previousCrawl,
  currentBreakdown,
  activeProjectName,
}: PdfPrintSectionsProps) {
  const scoreSegments = useMemo(
    () => [
      {
        key: "seo",
        label: "SEO",
        value: currentCrawl?.seo_score,
        color: getPillarChartColor("seo", 0),
      },
      {
        key: "aeo",
        label: "AEO",
        value: currentCrawl?.aeo_score,
        color: getPillarChartColor("aeo", 0),
      },
      {
        key: "pagespeed",
        label: "PageSpeed",
        value: currentCrawl?.pagespeed_score,
        color: getPillarChartColor("pagespeed", 0),
      },
    ],
    [currentCrawl]
  )

  const sortedCrawls = useMemo(
    () => [...recentCrawls].sort((a, b) => {
      const aTime = new Date(a.completed_at ?? a.started_at ?? a.created_at).getTime()
      const bTime = new Date(b.completed_at ?? b.started_at ?? b.created_at).getTime()
      return bTime - aTime
    }),
    [recentCrawls]
  )

  return (
    <div
      className="@container/main"
      style={{
        position: "fixed",
        left: "-9999px",
        top: 0,
        width: "1440px",
        background: "#09090b",
        zIndex: -1,
      }}
    >
      {/* Overall section */}
      <div ref={overallRef} style={{ background: "#09090b", padding: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "0.3fr 0.7fr", gap: "16px", marginBottom: "16px" }}>
          <PrintDonutChart
            title="Overall Score"
            description="Current crawl pillar scores"
            centerValue={currentCrawl?.overall_score}
            segments={scoreSegments}
          />
          <SummaryScoreHistoryChart
            activeProjectName={activeProjectName}
            crawls={sortedCrawls}
          />
        </div>
        <SectionCards
          crawls={sortedCrawls}
          currentCrawl={currentCrawl}
          previousCrawl={previousCrawl}
        />
      </div>

      {/* SEO section */}
      <div ref={seoRef} style={{ background: "#09090b", padding: "16px" }}>
        <PillarSection
          crawlBreakdowns={crawlBreakdowns}
          pillarId="seo"
          title="SEO"
          currentBreakdown={currentBreakdown}
        />
      </div>

      {/* AEO section */}
      <div ref={aeoRef} style={{ background: "#09090b", padding: "16px" }}>
        <PillarSection
          crawlBreakdowns={crawlBreakdowns}
          pillarId="aeo"
          title="AEO"
          currentBreakdown={currentBreakdown}
        />
      </div>

      {/* PageSpeed section */}
      <div ref={pagespeedRef} style={{ background: "#09090b", padding: "16px" }}>
        <PillarSection
          crawlBreakdowns={crawlBreakdowns}
          pillarId="pagespeed"
          title="PageSpeed"
          currentBreakdown={currentBreakdown}
        />
      </div>
    </div>
  )
}

type DonutSegment = { key: string; label: string; value?: number | null; color?: string }

function PrintDonutChart({
  title,
  description,
  centerValue,
  segments,
}: {
  title: string
  description?: string
  centerValue?: number | null
  segments: DonutSegment[]
}) {
  const SIZE = 260
  const CX = SIZE / 2
  const CY = SIZE / 2
  const RING_WIDTH = 14
  const GAP = 4
  const MAX_RINGS = segments.length
  // outermost ring first, shrinking inward
  const outerRadius = CX - 10
  const rings = segments.map((seg, i) => {
    const r = outerRadius - i * (RING_WIDTH + GAP)
    const c = 2 * Math.PI * r
    const pct = Math.max(0, Math.min(100, seg.value ?? 0)) / 100
    const dash = pct * c
    const gap = c - dash
    return { seg, r, dash, gap }
  })

  return (
    <div style={{
      background: "linear-gradient(135deg, #1c1c1e 0%, #161618 100%)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    }}>
      <div>
        <div style={{ color: "#fff", fontWeight: 600, fontSize: "15px" }}>{title}</div>
        {description && <div style={{ color: "#888", fontSize: "12px", marginTop: "2px" }}>{description}</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow: "visible" }}>
          {rings.map(({ seg, r, dash, gap }) => (
            <g key={seg.key}>
              {/* track */}
              <circle
                cx={CX} cy={CY} r={r}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={RING_WIDTH}
              />
              {/* value arc */}
              <circle
                cx={CX} cy={CY} r={r}
                fill="none"
                stroke={seg.color ?? "#fff"}
                strokeWidth={RING_WIDTH}
                strokeDasharray={`${dash} ${gap}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${CX} ${CY})`}
              />
            </g>
          ))}
          {/* center label */}
          {centerValue != null && (
            <>
              <circle cx={CX} cy={CY} r={outerRadius - MAX_RINGS * (RING_WIDTH + GAP) - 4} fill="#09090b" />
              <text x={CX} y={CY + 6} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700" fontFamily="system-ui, sans-serif">
                {Math.round(centerValue)}%
              </text>
            </>
          )}
        </svg>
      </div>
      {/* legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {segments.map((seg) => (
          <div key={seg.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: seg.color ?? "#fff", flexShrink: 0 }} />
              <span style={{ color: "#aaa" }}>{seg.label}</span>
            </div>
            <span style={{ color: "#fff", fontWeight: 500 }}>{seg.value != null ? `${Math.round(seg.value)}%` : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PillarSection({
  crawlBreakdowns,
  pillarId,
  title,
  currentBreakdown,
}: {
  crawlBreakdowns: CrawlBreakdown[]
  pillarId: string
  title: string
  currentBreakdown: ScoreBreakdownResponse | null
}) {
  const currentPillar = currentBreakdown?.pillars.find((p) => p.id === pillarId)
  const radialSegments =
    currentPillar?.buckets.map((bucket, index) => ({
      key: bucket.id,
      label: formatBucketLabel(bucket.id, bucket.label),
      value: bucket.score,
      color: getPillarChartColor(pillarId, index),
    })) ?? []

  const buckets = crawlBreakdowns[0]?.breakdown.pillars.find((p) => p.id === pillarId)?.buckets ?? []
  const previousPillar = crawlBreakdowns[1]?.breakdown.pillars.find((p) => p.id === pillarId)
  const chronologicalBreakdowns = useMemo(
    () => [...crawlBreakdowns].reverse(),
    [crawlBreakdowns]
  )

  return (
    <div style={{ display: "grid", gridTemplateColumns: "0.3fr 0.7fr", gap: "16px" }}>
      <PrintDonutChart
        title={`${title} Score`}
        description="Current crawl bucket scores"
        centerValue={currentPillar?.score}
        segments={radialSegments}
      />
      {buckets.length === 0 ? (
        <Card className="border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
          <CardHeader>
            <CardTitle>No bucket scores yet</CardTitle>
            <CardDescription>Run a completed crawl to populate this view.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {buckets.map((bucket) => {
            const previousBucket = previousPillar?.buckets.find((b) => b.id === bucket.id)
            const series = chronologicalBreakdowns.map(
              ({ breakdown }) =>
                breakdown.pillars
                  .find((p) => p.id === pillarId)
                  ?.buckets.find((b) => b.id === bucket.id)?.score
            )
            const delta = getRoundedDelta(bucket.score, previousBucket?.score)

            return (
              <Card
                key={bucket.id}
                className="@container/card flex flex-col border-border/50 bg-gradient-to-br from-card via-card to-muted/30"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardDescription>
                    {bucket.id === "psi_cwv" ? "Google PSI" : bucket.label}
                  </CardDescription>
                  {delta !== null && <TrendBadge delta={delta} />}
                </CardHeader>
                <div className="flex flex-1 items-center justify-center px-6 py-4">
                  <CardTitle className="text-3xl font-semibold tabular-nums">
                    {formatScore(bucket.score)}
                  </CardTitle>
                </div>
                <CardFooter className="flex items-end justify-between gap-4 text-sm">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="font-medium">{getTrendLabel(delta)}</div>
                    <div className="text-muted-foreground">
                      {getTrendSummary(previousBucket?.score, bucket.score)}
                    </div>
                  </div>
                  <TrendSparkline values={series} trend={delta} />
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
