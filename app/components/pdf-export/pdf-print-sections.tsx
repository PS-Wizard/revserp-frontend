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
  coverRef: React.RefObject<HTMLDivElement | null>
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
  coverRef,
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
      {/* Cover page */}
      <div ref={coverRef}>
        <PrintCover
          projectName={activeProjectName ?? "audit"}
          currentCrawl={currentCrawl}
        />
      </div>

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

const COVER = {
  bg: "#09090b",
  card: "#1c1c1e",
  fg: "#fafafa",
  muted: "#a1a1a1",
  border: "rgba(255,255,255,0.1)",
  radius: 10,
  font: "'Geist Variable', system-ui, sans-serif",
}

function coverScore(value?: number | null): string {
  return value == null ? "N/A" : String(Math.round(value))
}

function PrintCover({
  projectName,
  currentCrawl,
}: {
  projectName: string
  currentCrawl: CrawlResponse | null
}) {
  const now = new Date()
  const dateStr = `${String(now.getDate()).padStart(2, "0")} ${now.toLocaleString("en-US", { month: "short" })} ${now.getFullYear()}`
  const quarterStr = `Q${Math.floor(now.getMonth() / 3) + 1} · ${now.getFullYear()}`
  const pagesCrawled =
    currentCrawl?.urls_crawled != null
      ? currentCrawl.urls_crawled.toLocaleString()
      : "N/A"

  const cellBase: React.CSSProperties = {
    padding: "22px 24px",
    display: "flex",
    flexDirection: "column",
    background: COVER.card,
    border: `1px solid ${COVER.border}`,
    borderRadius: COVER.radius,
    boxSizing: "border-box",
  }
  const capStyle: React.CSSProperties = {
    fontSize: 15,
    letterSpacing: "0.04em",
    color: COVER.muted,
  }
  const valStyle: React.CSSProperties = {
    marginTop: "auto",
    fontWeight: 600,
    letterSpacing: "-0.03em",
    lineHeight: 0.85,
    color: COVER.fg,
    fontVariantNumeric: "tabular-nums",
  }

  return (
    <div
      style={{
        width: 1440,
        height: 1018,
        background: COVER.bg,
        color: COVER.fg,
        fontFamily: COVER.font,
        padding: 64,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 25, fontWeight: 600, letterSpacing: "-0.01em" }}>Revserp.ai</div>
          <div style={{ fontSize: 15, color: COVER.muted, marginTop: 2 }}>a Revketer LLC product</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>
          {quarterStr}
        </div>
      </div>

      {/* title */}
      <div style={{ marginTop: 56 }}>
        <h1 style={{ margin: 0, fontSize: 92, lineHeight: 0.92, fontWeight: 600, letterSpacing: "-0.035em", maxWidth: "64%" }}>
          Site Audit Report
        </h1>
        <p style={{ marginTop: 20, fontSize: 22, color: COVER.muted, maxWidth: "52%", lineHeight: 1.4 }}>
          A complete assessment of search, answer-engine, and performance health for the crawled property.
        </p>
      </div>

      <div style={{ flex: 1 }} />

      {/* bento score grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.55fr 1fr 1fr 0.6fr",
          gridTemplateRows: "1fr 1fr",
          gap: 12,
          height: 430,
        }}
      >
        <div style={{ ...cellBase, gridColumn: 1, gridRow: "1 / 3", background: "linear-gradient(155deg, #242426 0%, #1c1c1e 60%)" }}>
          <div style={{ ...capStyle, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600 }}>Overall</div>
          <div style={{ ...valStyle, fontSize: 158 }}>
            {coverScore(currentCrawl?.overall_score)}
            {currentCrawl?.overall_score != null && (
              <span style={{ fontSize: 46, fontWeight: 500, marginLeft: 4, color: COVER.muted }}>%</span>
            )}
          </div>
          <div style={{ fontSize: 17, color: COVER.muted, marginTop: 10 }}>Weighted across all three pillars</div>
        </div>

        <div style={{ ...cellBase, gridColumn: 2, gridRow: 1 }}>
          <div style={capStyle}>SEO</div>
          <div style={{ ...valStyle, fontSize: 63 }}>{coverScore(currentCrawl?.seo_score)}</div>
        </div>

        <div style={{ ...cellBase, gridColumn: 3, gridRow: 1 }}>
          <div style={capStyle}>AEO</div>
          <div style={{ ...valStyle, fontSize: 63 }}>{coverScore(currentCrawl?.aeo_score)}</div>
        </div>

        <div
          style={{
            ...cellBase,
            gridColumn: "2 / 4",
            gridRow: 2,
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 8 }}>
            <span style={capStyle}>PageSpeed</span>
            <span style={{ fontSize: 15, color: COVER.muted }}>Google PSI · mobile</span>
          </div>
          <div style={{ ...valStyle, marginTop: 0, fontSize: 63 }}>{coverScore(currentCrawl?.pagespeed_score)}</div>
        </div>

        <div
          style={{
            gridColumn: 4,
            gridRow: "1 / 3",
            borderRadius: COVER.radius,
            border: `1px solid ${COVER.border}`,
            overflow: "hidden",
            position: "relative",
            background: "linear-gradient(180deg, #fafafa 0%, #8f8f8f 40%, #4d4d4d 72%, #1c1c1e 100%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 15px)",
            }}
          />
        </div>
      </div>

      {/* footer meta */}
      <div style={{ marginTop: 28, display: "flex", justifyContent: "space-between", gap: 28 }}>
        {[
          { k: "Prepared for", v: projectName, right: false },
          { k: "Generated", v: dateStr, right: false },
          { k: "Pages crawled", v: pagesCrawled, right: false },
          { k: "Presented by", v: "Revketer LLC", right: true },
        ].map((col) => (
          <div key={col.k} style={{ textAlign: col.right ? "right" : "left" }}>
            <div style={{ color: COVER.muted, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 13 }}>{col.k}</div>
            <div style={{ marginTop: 4, color: COVER.fg, fontWeight: 500, fontSize: 16 }}>{col.v}</div>
          </div>
        ))}
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
  const GAP = 4
  const HOLE = 46 // reserved center hole so the score label never overlaps rings
  const outerRadius = CX - 10
  const ringCount = Math.max(1, segments.length)
  // distribute rings between the outer edge and the reserved hole so they
  // always fit regardless of how many buckets a pillar has
  const step = (outerRadius - HOLE) / ringCount
  const RING_WIDTH = Math.max(6, step - GAP)
  // outermost ring first, shrinking inward
  const rings = segments.map((seg, i) => {
    const r = outerRadius - RING_WIDTH / 2 - i * step
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
            <text x={CX} y={CY + 7} textAnchor="middle" fill="#fff" fontSize="30" fontWeight="700" fontFamily="'Geist Variable', system-ui, sans-serif">
              {Math.round(centerValue)}%
            </text>
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
            <span style={{ color: "#fff", fontWeight: 500 }}>{seg.value != null ? `${Math.round(seg.value)}%` : "N/A"}</span>
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
