"use client"

import { useMemo, useState } from "react"
import {
  EChartsSankeyChart,
  type ChartConfig,
} from "~/components/evilcharts/charts/echarts-sankey-chart"
import {
  PILLAR_IDS,
  PILLAR_LABEL,
  type PillarId,
} from "~/components/compare/helpers"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import type { ScoreBreakdownResponse } from "~/lib/api.types"

type Props = {
  you: ScoreBreakdownResponse | undefined
  them: ScoreBreakdownResponse | undefined
  youLabel: string
  themLabel: string
}

type SitePalette = {
  /** Source node — the site identity hue, used straight (no soft variant). */
  source: { light: string; dark: string }
  /** One hue per pillar column, so pillar nodes stay distinct. */
  pillars: Array<{ light: string; dark: string }>
  /** Bucket end-nodes — a wider family, cycled in bucket order. */
  buckets: Array<{ light: string; dark: string }>
}

// Us = blue family (cools as the flow descends), competitors = red family
// (warms as it descends). The two stacked charts read as cold vs hot — the same
// blue/red identity the You-vs-Them heading row already uses.
const YOU_PALETTE: SitePalette = {
  source: { light: "#1d4ed8", dark: "#3b82f6" },
  pillars: [
    { light: "#2563eb", dark: "#60a5fa" },
    { light: "#4338ca", dark: "#6366f1" },
    { light: "#6d28d9", dark: "#8b5cf6" },
  ],
  buckets: [
    { light: "#3b82f6", dark: "#93c5fd" },
    { light: "#4f46e5", dark: "#818cf8" },
    { light: "#7c3aed", dark: "#a78bfa" },
    { light: "#1e40af", dark: "#60a5fa" },
    { light: "#6366f1", dark: "#a5b4fc" },
  ],
}

const THEM_PALETTE: SitePalette = {
  source: { light: "#b91c1c", dark: "#ef4444" },
  pillars: [
    { light: "#be123c", dark: "#fb7185" },
    { light: "#c2410c", dark: "#fb923c" },
    { light: "#9f1239", dark: "#f472b6" },
  ],
  buckets: [
    { light: "#dc2626", dark: "#fca5a5" },
    { light: "#ea580c", dark: "#fdba74" },
    { light: "#e11d48", dark: "#fda4af" },
    { light: "#a21caf", dark: "#e879f9" },
    { light: "#c2410c", dark: "#fdba74" },
  ],
}

type PillarLoss = {
  loss: number
  // ALL buckets with their raw weighted losses — pruning happens later, and
  // conservation needs the full set as the rescale denominator.
  buckets: Array<{ label: string; loss: number }>
}

/** Raw weighted points a pillar costs its site: (100 − score) × weight. */
function pillarLoss(
  breakdown: ScoreBreakdownResponse | undefined,
  pillarId: PillarId
): PillarLoss | null {
  const pillar = breakdown?.pillars.find((entry) => entry.id === pillarId)
  if (!pillar) return null
  return {
    loss: Math.max(0, (100 - pillar.score) * pillar.weight),
    buckets: pillar.buckets
      .map((bucket) => ({
        label: bucket.label,
        loss: Math.max(0, (100 - bucket.score) * bucket.weight),
      }))
      .sort((a, b) => b.loss - a.loss),
  }
}

type SankeyModel = {
  nodes: Array<{ name: string }>
  links: Array<{ source: number; target: number; value: number }>
  config: ChartConfig
  rootLoss: number
}
/**
 * One site's penalty flow: site → pillars → buckets.
 * Ribbons are weighted points lost, conserved at every node, anchored to the
 * headline score gap (100 − overall).
 */
function sankeyModel(
  breakdown: ScoreBreakdownResponse | undefined,
  siteName: string,
  palette: SitePalette
): SankeyModel {
  const nodes: Array<{ name: string }> = [
    { name: siteName },
    ...PILLAR_IDS.map((id) => ({ name: PILLAR_LABEL[id] })),
  ]
  const links: Array<{ source: number; target: number; value: number }> = []
  const config: ChartConfig = {
    [siteName]: {
      label: siteName,
      colors: { light: [palette.source.light], dark: [palette.source.dark] },
    },
  }
  for (const [index, id] of PILLAR_IDS.entries()) {
    const hue = palette.pillars[index % palette.pillars.length]
    config[PILLAR_LABEL[id]] = {
      label: PILLAR_LABEL[id],
      colors: { light: [hue.light], dark: [hue.dark] },
    }
  }

  // ── Conservation ──────────────────────────────────────────────────────
  // The root anchor is the number the user already trusts: 100 − overall.
  // Raw weighted pillar losses rarely sum to exactly that (weights, clamps,
  // PSI overrides), so scale pillar ribbons to sum to the root, then rescale
  // each pillar's bucket ribbons to fill that pillar exactly. Every level
  // then conserves: what a node shows in equals what it shows out, and the
  // root reads the same as the headline score gap.
  const rawPillars = PILLAR_IDS.map((id) => pillarLoss(breakdown, id))
  const rawTotal = rawPillars.reduce(
    (sum, pillar) => sum + (pillar?.loss ?? 0),
    0
  )
  const overall = breakdown?.overall_score
  const targetRoot =
    overall === undefined || overall === null
      ? rawTotal
      : Math.max(0, Math.min(100, 100 - overall))
  const scale = rawTotal > 0 ? targetRoot / rawTotal : 0
  let rootLoss = 0
  let bucketHue = 0

  PILLAR_IDS.forEach((_, index) => {
    const pillar = rawPillars[index]
    if (!pillar || pillar.loss <= 0) return
    const pillarFlow = pillar.loss * scale
    rootLoss += pillarFlow
    links.push({
      source: 0,
      target: 1 + index,
      value: Math.round(pillarFlow * 10) / 10,
    })
    // Rescale buckets to the pillar's inflow so the pillar node conserves
    // (echarts shows max(in, out) as the node value — an imbalance would
    // display a third, unrelated number). The denominator is the FULL bucket
    // set, so pruning hairlines only thins ribbons, never breaks the sum.
    const bucketTotal = pillar.buckets.reduce(
      (sum, bucket) => sum + bucket.loss,
      0
    )
    if (bucketTotal <= 0) return
    let bucketHueLocal = bucketHue
    for (const bucket of pillar.buckets) {
      const visible = bucket.loss >= 1
      if (!config[bucket.label]) {
        const hue = palette.buckets[bucketHueLocal % palette.buckets.length]
        if (visible) bucketHue += 1
        config[bucket.label] = {
          label: bucket.label,
          colors: { light: [hue.light], dark: [hue.dark] },
        }
      }
      if (!visible) continue
      nodes.push({ name: bucket.label })
      links.push({
        source: 1 + index,
        target: nodes.findIndex((node) => node.name === bucket.label),
        value: Math.round((bucket.loss / bucketTotal) * pillarFlow * 10) / 10,
      })
    }
  })

  return { nodes, links, config, rootLoss: Math.round(rootLoss * 10) / 10 }
}

function SiteHeading({
  name,
  paint,
}: {
  name: string
  paint: { color: string }
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-2 shrink-0 rounded-[2px]"
        style={{ backgroundColor: paint.color }}
      />
      <span className="truncate text-sm font-medium">{name}</span>
    </div>
  )
}

function SankeyBand({
  breakdown,
  siteName,
  palette,
  dotColor,
  activeNode,
  onNodeHover,
}: {
  breakdown: ScoreBreakdownResponse | undefined
  siteName: string
  palette: SitePalette
  dotColor: string
  /** Node a sibling band is hovering — mirrored highlight lives in the chart. */
  activeNode: string | null
  onNodeHover: (node: string | null) => void
}) {
  const data = useMemo(
    () => sankeyModel(breakdown, siteName, palette),
    [breakdown, siteName, palette]
  )

  if (data.links.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
        No penalty flow recorded.
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <EChartsSankeyChart
        className="h-96 w-full"
        config={data.config}
        data={{ nodes: data.nodes, links: data.links }}
        linkCurvature={0.55}
        nodePadding={16}
        nodeWidth={12}
        hoverNode={activeNode}
        onNodeHover={onNodeHover}
        rootNode={siteName}
      >
        <EChartsSankeyChart.Tooltip
          rowLabel="Points lost"
          variant="frosted-glass"
        />
        <EChartsSankeyChart.Link opacity={0.6} variant="gradient" />
        <EChartsSankeyChart.Node radius={4}>
          <EChartsSankeyChart.NodeLabel position="outside" />
        </EChartsSankeyChart.Node>
      </EChartsSankeyChart>
      <div className="flex justify-center">
        <SiteHeading name={siteName} paint={{ color: dotColor }} />
      </div>
    </div>
  )
}

/** Where the points go: score loss flowing site → pillars → buckets, one band per site. */
export function SliceScoreSankey({ you, them, youLabel, themLabel }: Props) {
  // Cross-band hover: hovering a node (or ribbon) in either band highlights
  // the matching node in the other — the same sync the bucket pies above use.
  const [activeNode, setActiveNode] = useState<string | null>(null)
  return (
    <Card
      className="@container/card bg-gradient-to-br from-card via-card to-muted/30"
      onMouseLeave={() => setActiveNode(null)}
      size="sm"
    >
      <CardHeader>
        <CardTitle>Where the points go</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SankeyBand
          activeNode={activeNode}
          breakdown={you}
          dotColor={YOU_PALETTE.source.dark}
          onNodeHover={setActiveNode}
          palette={YOU_PALETTE}
          siteName={youLabel}
        />
        <SankeyBand
          activeNode={activeNode}
          breakdown={them}
          dotColor={THEM_PALETTE.source.dark}
          onNodeHover={setActiveNode}
          palette={THEM_PALETTE}
          siteName={themLabel}
        />
      </CardContent>
    </Card>
  )
}
