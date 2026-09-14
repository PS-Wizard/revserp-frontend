"use client"

import {
  resolveTooltipPosition,
  tooltipRow,
  tooltipShell,
  type TooltipPosition,
  type TooltipRoundness,
  type TooltipVariant,
} from "~/components/evilcharts/ui/echarts-tooltip"
import {
  DEFAULT_ECHARTS_RENDERER,
  buildChartCss,
  resolveColors,
  withAlpha,
  type ChartConfig,
  type EChartsRenderer,
  type ResolvedColors,
} from "~/components/evilcharts/ui/echarts-chart"
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type FC,
  type ReactNode,
} from "react"
import {
  TooltipComponent,
  type TooltipComponentOption,
} from "echarts/components"
import { SankeyChart, type SankeySeriesOption } from "echarts/charts"
import { motion, useReducedMotion } from "motion/react"
import type { ComposeOption } from "echarts/core"
import * as echarts from "echarts/core"

export type {
  ChartConfig,
  EChartsRenderer,
  TooltipPosition,
  TooltipRoundness,
  TooltipVariant,
}

// Modular registration keeps the bundle lean — only the pieces this chart needs.
// A sankey has no coordinate system, so there is no GridComponent and no axes;
// the tooltip is item-triggered (nodes and links both report).
echarts.use([SankeyChart, TooltipComponent])

type EChartsInstance = ReturnType<typeof echarts.init>

// The exact option surface this chart uses — a sankey series plus the tooltip
// component. Narrower than echarts' full EChartsOption, so a misspelled key
// fails the compile instead of silently reaching setOption.
type EChartsOption = ComposeOption<SankeySeriesOption | TooltipComponentOption>

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const REVEAL_DURATION = 1000 // intro draw-in length, in milliseconds (ECharts' default)
const FALLBACK_COLOR = "rgba(120, 120, 120, 1)"

const DEFAULT_NODE_WIDTH = 10
const DEFAULT_NODE_PADDING = 18
const DEFAULT_LINK_CURVATURE = 0.55
const DEFAULT_NODE_RADIUS = 4

const DEFAULT_LINK_OPACITY = 0.45
// Gradient links get a slightly higher base opacity than solid ones — the
// per-edge source→target interpolation already fades the ends, so the extra
// opacity keeps thin ribbons visible against the card.
const DEFAULT_GRADIENT_LINK_OPACITY = 0.55

export type SankeyNodeData = { name: string }
export type SankeyLinkData = {
  /** Node index into `data.nodes` (preferred) or the node name directly. */
  source: number | string
  target: number | string
  value: number
}

export interface SankeyChartProps {
  data: { nodes: SankeyNodeData[]; links: SankeyLinkData[] }
  config: ChartConfig
  className?: string
  renderer?: EChartsRenderer
  nodeWidth?: number // width of each node rectangle, px
  nodePadding?: number // vertical gap between node rectangles, px
  linkCurvature?: number // ribbon bend amount, 0 = straight, 1 = maximum
  isLoading?: boolean
  animation?: boolean
  chartOptions?: Record<string, unknown> // untyped escape hatch, merged last
  /** Cross-chart hover: the node another sibling sankey is currently hovering. */
  hoverNode?: string | null
  /** Fires on local node/ribbon hover so a parent can mirror it to sibling charts. */
  onNodeHover?: (node: string | null) => void
  /** The site root node — ribbon hovers highlight the shared non-site endpoint. */
  rootNode?: string
  children?: ReactNode // <Tooltip/> <Link/> <Node> composition
}

export interface SankeyTooltipProps {
  variant?: TooltipVariant // visual style of the tooltip surface
  roundness?: TooltipRoundness // border-radius of the tooltip
  position?: TooltipPosition // "variable" follows the pointer; "fixed" pins it near the top
  rowLabel?: string // label for the value row in the tooltip (e.g. "Points lost")
}

/** Presence enables the hover tooltip (nodes AND links). Renders nothing. */
const Tooltip: FC<SankeyTooltipProps> = () => null

export interface SankeyLinkProps {
  variant?: "solid" | "gradient" // solid = flat source color; gradient = source→target interpolation
  opacity?: number // ribbon opacity; gradients default higher (they fade at the ends)
}

/** Declares the ribbons. Renders nothing. */
const Link: FC<SankeyLinkProps> = () => null

export interface SankeyNodeProps {
  radius?: number // border-radius of each node rectangle, px
  children?: ReactNode // optional <NodeLabel> composition
}

/**
 * Declares node paint (theme-config colors) + corner rounding, and hosts an
 * optional <NodeLabel>. Renders nothing.
 */
const Node: FC<SankeyNodeProps> = () => null

export type SankeyLabelPosition = "outside" | "left" | "inside"

export interface SankeyNodeLabelProps {
  position?: SankeyLabelPosition // outside = right of the node (default), left = other column edge, inside = on the node
  showValues?: boolean // appends the formatted node value after the name
  valueFormatter?: (value: number) => string // formats the value for both the label and the tooltip
  color?: string // CSS color override; defaults to the theme foreground token
}

/** Declares node labels for the enclosing <Node>. Renders nothing. */
const NodeLabel: FC<SankeyNodeLabelProps> = () => null

// ─────────────────────────────────────────────────────────────────────────────
// Children collection — walk the declarative config into plain objects the
// option builder consumes.
// ─────────────────────────────────────────────────────────────────────────────

type TooltipSlot = {
  present: boolean
  variant: TooltipVariant
  roundness: TooltipRoundness
  position: TooltipPosition
  rowLabel?: string
}

type LinkSlot = {
  variant: "solid" | "gradient"
  opacity: number
}

type LabelSlot = {
  position: SankeyLabelPosition
  showValues: boolean
  valueFormatter?: (value: number) => string
  color?: string
}

type NodeSlot = {
  radius: number
  label: LabelSlot | null
}

type CollectedConfig = {
  tooltip: TooltipSlot
  link: LinkSlot
  node: NodeSlot
}

function collectConfig(children: ReactNode): CollectedConfig {
  const collected: CollectedConfig = {
    tooltip: {
      present: false,
      variant: "default",
      roundness: "lg",
      position: "variable",
    },
    link: { variant: "gradient", opacity: DEFAULT_GRADIENT_LINK_OPACITY },
    node: { radius: DEFAULT_NODE_RADIUS, label: null },
  }

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return

    if (child.type === Tooltip) {
      const props = child.props as SankeyTooltipProps
      collected.tooltip = {
        present: true,
        variant: props.variant ?? "default",
        roundness: props.roundness ?? "lg",
        position: props.position ?? "variable",
        rowLabel: props.rowLabel,
      }
      return
    }

    if (child.type === Link) {
      const props = child.props as SankeyLinkProps
      collected.link = {
        variant: props.variant ?? "gradient",
        opacity:
          props.opacity ??
          ((props.variant ?? "gradient") === "gradient"
            ? DEFAULT_GRADIENT_LINK_OPACITY
            : DEFAULT_LINK_OPACITY),
      }
      return
    }

    if (child.type === Node) {
      const props = child.props as SankeyNodeProps
      const node: NodeSlot = {
        radius: props.radius ?? DEFAULT_NODE_RADIUS,
        label: null,
      }
      Children.forEach(props.children, (labelChild) => {
        if (!isValidElement(labelChild) || labelChild.type !== NodeLabel) return
        const labelProps = labelChild.props as SankeyNodeLabelProps
        node.label = {
          position: labelProps.position ?? "outside",
          showValues: labelProps.showValues ?? false,
          valueFormatter: labelProps.valueFormatter,
          color: labelProps.color,
        }
      })
      collected.node = node
      return
    }
  })

  return collected
}

// ─────────────────────────────────────────────────────────────────────────────
// Option builders
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_POSITION: Record<
  SankeyLabelPosition,
  "right" | "left" | "insideRight"
> = {
  outside: "right",
  left: "left",
  inside: "insideRight",
}

function nodeTooltipHtml(params: {
  name: string
  value: number
  color: string
  valueFormatter?: (value: number) => string
  rowLabel?: string
}): string {
  const format =
    params.valueFormatter ?? ((value: number) => value.toLocaleString())
  return tooltipShell({
    label: params.name,
    body: tooltipRow({
      indicatorHtml: `<div class="h-2.5 w-2.5 shrink-0 rounded-[2px]" style="background:${params.color}"></div>`,
      labelText: params.rowLabel ?? "Total",
      valueText: format(params.value),
      dimmed: "",
    }),
    roundness: "lg",
    variant: "frosted-glass",
  })
}

function linkTooltipHtml(params: {
  source: string
  target: string
  value: number
  sourceColor: string
  targetColor: string
  valueFormatter?: (value: number) => string
  rowLabel?: string
}): string {
  const format =
    params.valueFormatter ?? ((value: number) => value.toLocaleString())
  return tooltipShell({
    label: `${params.source} → ${params.target}`,
    body: tooltipRow({
      indicatorHtml: `<div class="h-2.5 w-2.5 shrink-0 rounded-[2px]" style="background:linear-gradient(to right, ${params.sourceColor}, ${params.targetColor})"></div>`,
      labelText: params.rowLabel ?? "Value",
      valueText: format(params.value),
      dimmed: "",
    }),
    roundness: "lg",
    variant: "frosted-glass",
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export function EChartsSankeyChart({
  data,
  config,
  className,
  renderer = DEFAULT_ECHARTS_RENDERER,
  nodeWidth = DEFAULT_NODE_WIDTH,
  nodePadding = DEFAULT_NODE_PADDING,
  linkCurvature = DEFAULT_LINK_CURVATURE,
  isLoading = false,
  animation = true,
  chartOptions,
  hoverNode,
  onNodeHover,
  rootNode,
  children,
}: SankeyChartProps) {
  const rawId = useId()
  const chartId = `chart-${rawId.replace(/:/g, "")}`

  const containerRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const echartsRef = useRef<EChartsInstance | null>(null)

  // Single imperative surface — `resolved` lives on a ref (not state) so the
  // sync effect is the only thing that ever pushes options. Object identity is
  // stable for the component's lifetime.
  const live = useRef<{
    resolved: ResolvedColors | null
    hasRevealed: boolean
    repush: () => void
    handlers: {
      onNodeHover?: (node: string | null) => void
      rootNode?: string
    }
  }>({
    resolved: null,
    hasRevealed: false,
    repush: () => {},
    handlers: {},
  }).current

  const shouldReduceMotion = useReducedMotion()

  const collected = useMemo(() => collectConfig(children), [children])
  const { tooltip: tooltipSlot, link: linkSlot, node: nodeSlot } = collected

  const nodeNames = useMemo(
    () => data.nodes.map((node) => node.name),
    [data.nodes]
  )

  // Refresh the hover handler's snapshot of the latest callbacks every render.
  live.handlers = { onNodeHover, rootNode }
  const css = useMemo(() => buildChartCss(chartId, config), [chartId, config])

  // Links may reference nodes by index ( ergonomic for generated data) or by
  // name (hand-written data). Normalize to names once.
  const resolvedLinks = useMemo(
    () =>
      data.links.map((link) => ({
        ...link,
        source:
          typeof link.source === "number"
            ? nodeNames[link.source]
            : link.source,
        target:
          typeof link.target === "number"
            ? nodeNames[link.target]
            : link.target,
      })),
    [data.links, nodeNames]
  )

  const buildOption = useCallback((): EChartsOption => {
    const resolved = live.resolved
    if (!resolved) return {}

    const nodeColor = (name: string) =>
      resolved.series[name]?.[0] ?? FALLBACK_COLOR
    const formatLabelValue =
      nodeSlot.label?.valueFormatter ??
      ((value: number) => value.toLocaleString())
    const series: SankeySeriesOption = {
      id: "sankey",
      type: "sankey",
      left: 8,
      // Wide right gutter: outside labels are chips drawn past the node
      // column, and a tight margin clips long bucket names at the canvas edge.
      right: 150,
      top: 8,
      bottom: 8,
      nodeWidth,
      nodeGap: nodePadding,
      nodeAlign: "justify",
      data: data.nodes.map((node) => ({
        name: node.name,
        itemStyle: {
          color: nodeColor(node.name),
          borderRadius: nodeSlot.radius,
        },
      })),
      links: resolvedLinks.map((link) => ({
        source: String(link.source),
        target: String(link.target),
        value: link.value,
        ...(linkSlot.variant === "solid"
          ? {
              itemStyle: {
                color: nodeColor(String(link.source)),
                opacity: linkSlot.opacity,
              },
            }
          : {}),
      })),
      lineStyle: {
        curveness: linkCurvature,
        ...(linkSlot.variant === "gradient"
          ? { color: "gradient" as const, opacity: linkSlot.opacity }
          : {}),
      },
      itemStyle: { borderRadius: nodeSlot.radius },
      label: {
        show: true,
        position: LABEL_POSITION[nodeSlot.label?.position ?? "outside"],
        color: nodeSlot.label?.color ?? resolved.tokens.foreground,
        fontSize: 11,
        fontWeight: 600,
        // A quiet frosted chip behind the text — outside labels sit over
        // ribbons, and the raw text washed into them.
        backgroundColor: withAlpha(resolved.tokens.background, 0.78),
        padding: [3, 7],
        borderRadius: 6,
        // NOTE: no fixed width here — a declared width makes the chip
        // background stretch to the full box instead of hugging the text.
        // Oversized names rely on the reserved right gutter instead.
        formatter: (params) => {
          const name = String((params as { name?: string }).name ?? "")
          if (!nodeSlot.label?.showValues) return `{name|${name}}`
          const value = Number((params as { value?: number }).value ?? 0)
          // Name and value separated by a thin space; the value reads as a
          // quieter secondary figure inside the same chip.
          return `{name|${name}}{gap|}{value|${formatLabelValue(value)}}`
        },
        rich: {
          name: {
            color: resolved.tokens.foreground,
            fontSize: 11,
            fontWeight: 600,
          },
          gap: { width: 6 },
          value: {
            color: resolved.tokens.mutedForeground,
            fontSize: 10,
            fontWeight: 500,
          },
        },
      },
      // Trajectory highlights one flow path; adjacency was too broad on hover.
      // Programmatic highlight below mirrors the same strand on sibling charts.
      emphasis: { focus: "trajectory" },
      tooltip: undefined,
    }

    const tooltip: TooltipComponentOption = {
      show: tooltipSlot.present,
      trigger: "item",
      confine: true,
      displayTransition: false,
      backgroundColor: "transparent",
      borderWidth: 0,
      padding: 0,
      extraCssText: "box-shadow:none;",
      position: resolveTooltipPosition(tooltipSlot.position),
      formatter: (params) => {
        const p = params as {
          dataType?: string
          name?: string
          value?: number
          data?: { source?: string; target?: string; value?: number }
        }
        const format =
          nodeSlot.label?.valueFormatter ??
          ((value: number) => value.toLocaleString())
        if (p.dataType === "edge") {
          const source = String(p.data?.source ?? "")
          const target = String(p.data?.target ?? "")
          return linkTooltipHtml({
            source,
            target,
            value: Number(p.value ?? 0),
            sourceColor: nodeColor(source),
            targetColor: nodeColor(target),
            valueFormatter: format,
            rowLabel: tooltipSlot.rowLabel ?? "Points",
          })
        }
        return nodeTooltipHtml({
          name: String(p.name ?? ""),
          value: Number(p.value ?? 0),
          color: nodeColor(String(p.name ?? "")),
          valueFormatter: format,
          rowLabel: tooltipSlot.rowLabel ?? "Value",
        })
      },
    }

    return { animation: false, tooltip, series: [series] }
  }, [
    live,
    data.nodes,
    resolvedLinks,
    config,
    nodeWidth,
    nodePadding,
    linkSlot,
    nodeSlot,
    tooltipSlot,
  ])

  // ── Init + resize + theme observer (per renderer instance) ───────────────────
  useEffect(() => {
    const mount = mountRef.current
    const container = containerRef.current
    if (!mount || !container) return

    const chart = echarts.init(mount, null, { renderer })
    echartsRef.current = chart

    const resizeObserver = new ResizeObserver(() => {
      if (
        mount.clientWidth === chart.getWidth() &&
        mount.clientHeight === chart.getHeight()
      ) {
        return
      }
      chart.resize()
    })
    resizeObserver.observe(mount)

    // Light/dark flips change no React state — re-resolve and push directly.
    const themeObserver = new MutationObserver(() => {
      live.repush()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    // Cross-chart hover: report the shared node under the pointer. Nodes report
    // themselves; a ribbon reports the endpoint that is not the site root
    // (root→pillar ribbons name the pillar, pillar→bucket ribbons the bucket).
    chart.on("mouseover", (params) => {
      const { onNodeHover, rootNode } = live.handlers
      if (!onNodeHover) return
      const p = params as {
        dataType?: string
        name?: string
        data?: { source?: string; target?: string }
      }
      if (p.dataType === "node") {
        onNodeHover(String(p.name ?? ""))
        return
      }
      if (p.dataType === "edge") {
        const source = String(p.data?.source ?? "")
        const target = String(p.data?.target ?? "")
        const shared = target !== rootNode ? target : source
        onNodeHover(shared)
      }
    })
    return () => {
      resizeObserver.disconnect()
      themeObserver.disconnect()
      chart.dispose()
      echartsRef.current = null
      // The reveal guard belongs to the chart instance it guarded (StrictMode-safe).
      live.hasRevealed = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, live])

  // ── Sync ECharts with props/theme — resolve, build, push ─────────────────────
  useEffect(() => {
    const chart = echartsRef.current
    const container = containerRef.current
    if (!chart || !container) return

    // Colors come from the <style> committed just before this effect ran.
    live.resolved = resolveColors(container, config, nodeNames)

    const push = (withEntrance: boolean) => {
      const option = buildOption()
      const merged = chartOptions ? { ...option, ...chartOptions } : option
      Object.assign(merged, {
        animation: withEntrance,
        animationDuration: REVEAL_DURATION,
        animationDurationUpdate: 0,
      })
      // chartOptions is an untyped escape hatch — re-assert the option shape.
      chart.setOption(merged as EChartsOption, { notMerge: true })
    }

    // Intro reveal on the first real render only; theme flips and data updates
    // apply instantly so the layout never replays its entrance.
    if (isLoading) live.hasRevealed = false
    const shouldReveal = !live.hasRevealed && !isLoading
    if (shouldReveal) live.hasRevealed = true
    push(animation && shouldReveal && !shouldReduceMotion)

    // Theme flips re-enter here without touching React.
    live.repush = () => {
      live.resolved = resolveColors(container, config, nodeNames)
      push(false)
    }
  }, [
    live,
    buildOption,
    chartOptions,
    isLoading,
    animation,
    shouldReduceMotion,
    config,
    renderer,
    nodeNames,
  ])

  const applyHoverHighlight = useCallback(
    (chart: EChartsInstance, node: string | null) => {
      chart.dispatchAction({ type: "downplay", seriesIndex: 0 })
      if (!node) return

      // Highlight every node index with this name, then connected ribbons.
      // Together with emphasis.focus = "trajectory" this reads as one strand.
      data.nodes.forEach((entry, index) => {
        if (entry.name !== node) return
        chart.dispatchAction({
          type: "highlight",
          seriesIndex: 0,
          dataIndex: index,
        })
      })

      resolvedLinks.forEach((link, index) => {
        const source = String(link.source)
        const target = String(link.target)
        if (source !== node && target !== node) return
        chart.dispatchAction({
          type: "highlight",
          seriesIndex: 0,
          dataType: "edge",
          dataIndex: index,
        })
      })
    },
    [data.nodes, resolvedLinks]
  )

  // Shared hover state drives the same strand highlight on every chart.
  useEffect(() => {
    const chart = echartsRef.current
    if (!chart) return
    applyHoverHighlight(chart, hoverNode ?? null)
  }, [hoverNode, applyHoverHighlight])

  return (
    <div
      ref={containerRef}
      data-chart={chartId}
      className={`relative flex flex-col text-xs ${className ?? ""}`}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="relative min-h-0 w-full flex-1">
        <div ref={mountRef} className="relative h-full min-h-0 w-full" />
      </div>

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-center justify-center gap-2 rounded-md border bg-background px-2 py-0.5 text-sm text-primary"
          >
            <div className="h-3 w-3 animate-spin rounded-full border border-border border-t-primary" />
            <span>Loading</span>
          </motion.div>
        </div>
      )}
    </div>
  )
}

// Re-exported so the painted accent color of a dimmed/faded decoration (e.g. a
// link hover ring) can reuse the same alpha math as the other evilcharts.
export { withAlpha as sankeyWithAlpha }

// Compound API: every part hangs off the root as a static member, so a consumer
// writes <EChartsSankeyChart.Link/>, <EChartsSankeyChart.Node/>, … from a single
// import — no colliding named marker exports when several charts share one file.
EChartsSankeyChart.Tooltip = Tooltip
EChartsSankeyChart.Link = Link
EChartsSankeyChart.Node = Node
EChartsSankeyChart.NodeLabel = NodeLabel
