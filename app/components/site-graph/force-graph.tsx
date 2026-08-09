"use client"

import { memo, useEffect, useRef } from "react"
import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force"
import type { SiteGraphNode } from "~/lib/api.types"

type SimNode = {
  index: number
  url: string
  label: string
  title: string
  status: number
  inCount: number
  outCount: number
  degree: number
  depth: number
  broken: boolean
  brokenReason: string
  appearDelay: number
  // Per-node show/hide animation, reusing the intro ease. `vis` is the live
  // 0..1 scale eased from `visFrom` toward `visTarget`, gated by
  // `now - visStart - visDelay` over INTRO_NODE_MS.
  vis: number
  visTarget: number
  visFrom: number
  visStart: number
  visDelay: number
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

export type SiteGraphFilter = {
  query: string
  maxHops: number | null
  showOrphans: boolean
  brokenOnly: boolean
}

type SimLink = {
  source: SimNode
  target: SimNode
}

type Transform = { x: number; y: number; k: number }

type ForceGraphProps = {
  nodes: SiteGraphNode[]
  edges: Array<[number, number]>
  className?: string
  filter?: SiteGraphFilter
}

const MIN_ZOOM = 0.15
const MAX_ZOOM = 10
const NODE_RADIUS = 2
const INTRO_TOTAL_MS = 1700
const INTRO_NODE_MS = 450
// The scene buffer extends this factor beyond the viewport on each axis, so
// panning can blit cached pixels instead of exposing blank margins.
const SCENE_MARGIN = 1.3
// How long after the last pan/zoom before the scene re-renders sharp.
const SCENE_SETTLE_MS = 80

// Sequential single-hue ramp for click depth: the homepage is the most vivid
// and pages fade toward neutral as they get further from it. Lightness falls
// monotonically so the ordering survives color-vision deficiencies; broken
// pages use the reserved destructive red instead.
export const DEPTH_COLORS = [
  "oklch(0.79 0.16 60)", // home
  "oklch(0.74 0.12 60)", // 1 click
  "oklch(0.70 0.085 60)", // 2 clicks
  "oklch(0.65 0.055 60)", // 3 clicks
  "oklch(0.60 0.03 60)", // 4+ clicks
]
export const ORPHAN_COLOR = "oklch(0.45 0 0)"

export function depthColor(depth: number) {
  if (depth < 0) return ORPHAN_COLOR
  return DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)]
}

function easeOutCubic(t: number) {
  const inverted = 1 - t
  return 1 - inverted * inverted * inverted
}

function pathnameLabel(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname
  } catch {
    return url
  }
}

function resolveThemeColors(element: HTMLElement) {
  const style = getComputedStyle(element)
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback
  return {
    nodeHighlight: read("--primary", "oklch(0.92 0 0)"),
    edge: read("--muted-foreground", "oklch(0.55 0 0)"),
    broken: read("--destructive", "oklch(0.6 0.2 25)"),
    label: read("--muted-foreground", "oklch(0.7 0 0)"),
    labelHighlight: read("--foreground", "oklch(0.98 0 0)"),
  }
}

/**
 * Shortest-click-path depths from the site root via BFS over the directed link
 * graph. Returns per-node `depth` (clicks from home; -1 for pages unreachable
 * from it) and `parent` (the node index each page was first reached through;
 * -1 for the root and true orphans). Pages the root can't reach are adopted
 * through any real inbound link from a reached page; true orphans stay
 * disconnected. The parent edges form the spanning tree used for layout.
 */
function computeDepths(
  nodes: SiteGraphNode[],
  edges: Array<[number, number]>
): { depth: number[]; parent: number[] } {
  const n = nodes.length
  const depth = new Array<number>(n).fill(-1)
  const parent = new Array<number>(n).fill(-1)
  if (n === 0) return { depth, parent }

  const outAdjacency: number[][] = nodes.map(() => [])
  for (const [sourceIndex, targetIndex] of edges) {
    outAdjacency[sourceIndex].push(targetIndex)
  }

  let root = 0
  let rootScore = -1
  for (let i = 0; i < n; i++) {
    // Prefer the homepage (pathnameLabel returns the hostname for "/"),
    // otherwise the most linked-to page.
    const label = pathnameLabel(nodes[i].url)
    const score = label.includes("/") ? nodes[i].in : Infinity
    if (score > rootScore) {
      rootScore = score
      root = i
    }
  }

  depth[root] = 0
  const queue = [root]
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    for (const targetIndex of outAdjacency[current]) {
      if (depth[targetIndex] >= 0) continue
      depth[targetIndex] = depth[current] + 1
      parent[targetIndex] = current
      queue.push(targetIndex)
    }
  }

  // Adopt pages the root can't reach through any real inbound link from a
  // reached page (repeat until stable). Their depth keeps counting clicks
  // along that path.
  let adopted = true
  while (adopted) {
    adopted = false
    for (const [sourceIndex, targetIndex] of edges) {
      if (depth[sourceIndex] >= 0 && depth[targetIndex] < 0) {
        depth[targetIndex] = depth[sourceIndex] + 1
        parent[targetIndex] = sourceIndex
        adopted = true
      }
    }
  }

  return { depth, parent }
}

/**
 * Pure filter predicate shared by the renderer and the panel's live count so
 * the two can never drift. Returns a per-node boolean of whether the node
 * survives all active constraints in `filter`; with no filter (or the default
 * all-visible filter) every node passes. The broken-pages filter also keeps
 * each direct inbound source so users can see which pages link to the failure.
 */
export function computeVisible(
  nodes: SiteGraphNode[],
  edges: Array<[number, number]>,
  filter?: SiteGraphFilter
): boolean[] {
  const n = nodes.length
  const result = new Array<boolean>(n).fill(true)
  if (!filter) return result

  const query = filter.query.trim().toLowerCase()
  const needDepth = filter.maxHops != null || !filter.showOrphans
  const depth = needDepth ? computeDepths(nodes, edges).depth : null
  const brokenContext = filter.brokenOnly ? new Set<number>() : null
  if (brokenContext) {
    for (let i = 0; i < n; i++) {
      if (nodes[i].broken) brokenContext.add(i)
    }
    for (const [sourceIndex, targetIndex] of edges) {
      if (!nodes[targetIndex]?.broken) continue
      brokenContext.add(sourceIndex)
    }
  }

  for (let i = 0; i < n; i++) {
    if (brokenContext && !brokenContext.has(i)) {
      result[i] = false
      continue
    }
    if (depth) {
      const d = depth[i]
      if (!filter.showOrphans && d < 0) {
        result[i] = false
        continue
      }
      if (filter.maxHops != null && (d < 0 || d > filter.maxHops)) {
        result[i] = false
        continue
      }
    }
    if (query && !nodes[i].url.toLowerCase().includes(query)) {
      result[i] = false
      continue
    }
  }
  return result
}

/**
 * Canvas-rendered force-directed graph of the site's link structure. Layout
 * and the base render use the shortest-click-path tree; hovering a node
 * reveals its full real neighborhood from the complete edge list. The base
 * scene renders into an offscreen buffer with viewport culling; pan/zoom
 * frames blit that buffer with a delta transform, and hover dims the blit
 * and draws only the neighborhood on top — so neither gesture cost nor hover
 * cost scales with edge count.
 */
export const ForceGraph = memo(function ForceGraph({
  nodes,
  edges,
  className,
  filter,
}: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  // Bridge the latest filter into the running simulation without adding it to
  // the main effect's deps (which would rebuild the sim and replay the intro).
  const filterRef = useRef(filter)
  filterRef.current = filter
  const applyFilterRef = useRef<((f?: SiteGraphFilter) => void) | null>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const tooltip = tooltipRef.current
    if (!container || !canvas || !tooltip || nodes.length === 0) return

    const context = canvas.getContext("2d")
    if (!context) return

    const sceneCanvas = document.createElement("canvas")
    const sceneContext = sceneCanvas.getContext("2d")
    if (!sceneContext) return

    const colors = resolveThemeColors(container)
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    // --- Build simulation data ---------------------------------------------
    const simNodes: SimNode[] = nodes.map((node, index) => {
      // Phyllotaxis seed (d3's default) — spreads nodes so the simulation
      // never starts from a single coincident point.
      const seedRadius = 10 * Math.sqrt(0.5 + index)
      const seedAngle = index * 2.399963229728653
      return {
        index,
        url: node.url,
        label: pathnameLabel(node.url),
        title: node.title,
        status: node.status,
        inCount: node.in,
        outCount: node.out,
        degree: node.in + node.out,
        depth: -1,
        broken: node.broken,
        brokenReason: node.reason ?? "",
        appearDelay: 0,
        vis: 0,
        visTarget: 1,
        visFrom: 0,
        visStart: 0,
        visDelay: 0,
        x: seedRadius * Math.cos(seedAngle),
        y: seedRadius * Math.sin(seedAngle),
      }
    })
    // Hubs pop in first; the same ordering is the label priority, so busy
    // pages win the collision grid.
    const priorityOrder = [...simNodes].sort((a, b) => b.degree - a.degree)
    priorityOrder.forEach((node, order) => {
      node.appearDelay = (order / priorityOrder.length) * INTRO_TOTAL_MS
    })

    // The normal base render uses the shortest-path tree. Broken-page mode
    // uses every real inbound edge so each failure keeps all of its sources.
    const { depth: nodeDepths, parent: nodeParents } = computeDepths(nodes, edges)
    for (let i = 0; i < simNodes.length; i++) simNodes[i].depth = nodeDepths[i]
    const layoutEdges: Array<[number, number]> = []
    for (let i = 0; i < nodeParents.length; i++) {
      if (nodeParents[i] >= 0) layoutEdges.push([nodeParents[i], i])
    }
    const simLinks: SimLink[] = layoutEdges.map(
      ([sourceIndex, targetIndex]) => ({
        source: simNodes[sourceIndex],
        target: simNodes[targetIndex],
      })
    )
    const brokenInboundLinks: SimLink[] = edges
      .filter(([, targetIndex]) => simNodes[targetIndex]?.broken)
      .map(([sourceIndex, targetIndex]) => ({
        source: simNodes[sourceIndex],
        target: simNodes[targetIndex],
      }))

    // Normal hover follows outgoing links. In broken-page mode, hovering a
    // failure instead reveals the pages that link to it.
    const outgoingNeighbors: Array<Set<number>> = simNodes.map(() => new Set())
    const incomingNeighbors: Array<Set<number>> = simNodes.map(() => new Set())
    for (const [sourceIndex, targetIndex] of edges) {
      outgoingNeighbors[sourceIndex].add(targetIndex)
      incomingNeighbors[targetIndex].add(sourceIndex)
    }

    const nodeFill = (node: SimNode) => {
      if (node.broken) return colors.broken
      return filterRef.current?.brokenOnly ? colors.edge : depthColor(node.depth)
    }

    const simulation = forceSimulation(simNodes as never[])
      .force(
        "link",
        forceLink(simLinks as never[])
          .distance(30)
          .strength((link: never) => {
            const typed = link as unknown as SimLink
            return 1 / Math.min(8, Math.max(typed.source.degree, 1))
          })
      )
      .force(
        "charge",
        forceManyBody().strength(-42).theta(0.9).distanceMax(700)
      )
      .force("x", forceX(0).strength(0.06))
      .force("y", forceY(0).strength(0.06))
      .velocityDecay(0.28)

    // --- View state ----------------------------------------------------------
    const transform: Transform = { x: 0, y: 0, k: 1 }
    const sceneTransform: Transform = { x: 0, y: 0, k: 1 }
    let width = 0
    let height = 0
    let dpr = 1
    let hovered: SimNode | null = null
    let hoveredNeighbors: Set<number> | null = null
    let userInteracted = false
    let framePending = false
    let sceneDirty = true
    let sceneSettleTimer = 0
    let introStart = reduceMotion ? -Infinity : performance.now()
    let disposed = false

    // Seed each node's visibility transition to reproduce the intro exactly:
    // easing 0 -> 1 from introStart, staggered by the hub-first appearDelay.
    for (const node of simNodes) {
      node.visStart = introStart
      node.visDelay = node.appearDelay
    }

    if (reduceMotion) {
      simulation.stop()
      simulation.tick(160)
    }

    const introDone = () =>
      introStart === -Infinity ||
      performance.now() - introStart > INTRO_TOTAL_MS + INTRO_NODE_MS

    // Effective node scale: eases visFrom -> visTarget over INTRO_NODE_MS,
    // gated by now - visStart - visDelay. With the intro seed (visFrom 0,
    // visTarget 1, visStart introStart, visDelay appearDelay) this is exactly
    // the original intro ramp. The live value is written back to node.vis so a
    // later transition can start from the true current scale.
    const nodeScale = (node: SimNode, now: number) => {
      let t: number
      if (node.visStart === -Infinity) {
        t = 1
      } else {
        const elapsed = now - node.visStart - node.visDelay
        if (elapsed <= 0) t = 0
        else if (elapsed >= INTRO_NODE_MS) t = 1
        else t = easeOutCubic(elapsed / INTRO_NODE_MS)
      }
      const value = node.visFrom + (node.visTarget - node.visFrom) * t
      node.vis = value
      return value
    }

    // --- Label collision grid ---------------------------------------------------
    // Coarse screen-space grid; labels claim cells in priority order and
    // anything that would overlap an already-drawn label is skipped.
    const labelGrid = new Set<number>()
    const GRID_X = 40
    const GRID_Y = 16

    const claimLabel = (screenX: number, screenY: number, label: string) => {
      const halfWidth = label.length * 3
      const row = Math.floor(screenY / GRID_Y)
      const firstCell = Math.floor((screenX - halfWidth) / GRID_X)
      const lastCell = Math.floor((screenX + halfWidth) / GRID_X)
      for (let cell = firstCell; cell <= lastCell; cell++) {
        if (labelGrid.has(row * 100000 + cell)) return false
      }
      for (let cell = firstCell; cell <= lastCell; cell++) {
        labelGrid.add(row * 100000 + cell)
      }
      return true
    }

    // --- Scene rendering (base layer only, no hover effects) --------------------
    const scales = new Float32Array(simNodes.length)
    // Edges whose endpoints are mid fade-in/out, drawn per-edge so their alpha
    // tracks the dimmer endpoint (reused each frame to avoid allocation).
    const fadingLinks: SimLink[] = []

    const renderScene = () => {
      const now = performance.now()
      const sceneWidth = width * SCENE_MARGIN
      const sceneHeight = height * SCENE_MARGIN

      sceneTransform.x = transform.x
      sceneTransform.y = transform.y
      sceneTransform.k = transform.k

      sceneContext.setTransform(dpr, 0, 0, dpr, 0, 0)
      sceneContext.clearRect(0, 0, sceneWidth, sceneHeight)
      sceneContext.translate(
        sceneWidth / 2 + transform.x,
        sceneHeight / 2 + transform.y
      )
      sceneContext.scale(transform.k, transform.k)

      // Scene viewport in graph coordinates, for culling.
      const viewLeft = (-sceneWidth / 2 - transform.x) / transform.k
      const viewRight = (sceneWidth / 2 - transform.x) / transform.k
      const viewTop = (-sceneHeight / 2 - transform.y) / transform.k
      const viewBottom = (sceneHeight / 2 - transform.y) / transform.k

      for (const node of simNodes) scales[node.index] = nodeScale(node, now)

      // Edges: fully-visible ones in one batched path (fast); edges with an
      // endpoint mid fade get drawn per-edge so their alpha tracks that
      // endpoint — so lines fade in/out in lockstep with their nodes.
      fadingLinks.length = 0
      sceneContext.lineWidth = 1 / transform.k
      sceneContext.strokeStyle = colors.edge
      sceneContext.beginPath()
      const renderedLinks = filterRef.current?.brokenOnly
        ? brokenInboundLinks
        : simLinks
      for (const link of renderedLinks) {
        const edgeScale = Math.min(
          scales[link.source.index],
          scales[link.target.index]
        )
        if (edgeScale <= 0) continue
        const sx = link.source.x
        const sy = link.source.y
        const tx = link.target.x
        const ty = link.target.y
        if (
          (sx < viewLeft && tx < viewLeft) ||
          (sx > viewRight && tx > viewRight) ||
          (sy < viewTop && ty < viewTop) ||
          (sy > viewBottom && ty > viewBottom)
        ) {
          continue
        }
        if (edgeScale >= 0.999) {
          sceneContext.moveTo(sx, sy)
          sceneContext.lineTo(tx, ty)
        } else {
          fadingLinks.push(link)
        }
      }
      sceneContext.globalAlpha = 0.3
      sceneContext.stroke()
      for (const link of fadingLinks) {
        const edgeScale = Math.min(
          scales[link.source.index],
          scales[link.target.index]
        )
        sceneContext.globalAlpha = 0.3 * edgeScale
        sceneContext.beginPath()
        sceneContext.moveTo(link.source.x, link.source.y)
        sceneContext.lineTo(link.target.x, link.target.y)
        sceneContext.stroke()
      }

      // Nodes.
      for (const node of simNodes) {
        const scale = scales[node.index]
        if (scale <= 0) continue
        if (
          node.x < viewLeft ||
          node.x > viewRight ||
          node.y < viewTop ||
          node.y > viewBottom
        ) {
          continue
        }
        sceneContext.globalAlpha = scale
        sceneContext.beginPath()
        sceneContext.arc(node.x, node.y, NODE_RADIUS * scale, 0, Math.PI * 2)
        sceneContext.fillStyle = nodeFill(node)
        sceneContext.fill()
      }

      // Labels fade in with zoom, in degree-priority order, collision-culled.
      const labelAlpha = Math.max(0, Math.min(1, (transform.k - 1.1) / 0.9))
      if (labelAlpha > 0) {
        labelGrid.clear()
        sceneContext.font = `${11 / transform.k}px ui-sans-serif, system-ui, sans-serif`
        sceneContext.textAlign = "center"
        sceneContext.textBaseline = "top"
        sceneContext.globalAlpha = labelAlpha * 0.8
        sceneContext.fillStyle = colors.label
        const centerX = sceneWidth / 2 + transform.x
        const centerY = sceneHeight / 2 + transform.y
        for (const node of priorityOrder) {
          if (scales[node.index] < 1) continue
          if (
            node.x < viewLeft ||
            node.x > viewRight ||
            node.y < viewTop ||
            node.y > viewBottom
          ) {
            continue
          }
          const screenX = node.x * transform.k + centerX
          const screenY = node.y * transform.k + centerY
          if (!claimLabel(screenX, screenY, node.label)) continue
          sceneContext.fillText(node.label, node.x, node.y + NODE_RADIUS + 3)
        }
      }

      sceneContext.globalAlpha = 1
      sceneDirty = false
    }

    // Blit the cached scene onto the visible canvas, mapping the transform it
    // was rendered at onto the current one. When a node is hovered the blit
    // is dimmed and only its neighborhood is drawn live on top.
    const present = () => {
      const scale = transform.k / sceneTransform.k
      const sceneCenterX = (width * SCENE_MARGIN) / 2 + sceneTransform.x
      const sceneCenterY = (height * SCENE_MARGIN) / 2 + sceneTransform.y
      const destX = width / 2 + transform.x - scale * sceneCenterX
      const destY = height / 2 + transform.y - scale * sceneCenterY

      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.globalAlpha = hovered ? 0.14 : 1
      context.drawImage(
        sceneCanvas,
        destX * dpr,
        destY * dpr,
        sceneCanvas.width * scale,
        sceneCanvas.height * scale
      )
      context.globalAlpha = 1

      if (!hovered || !hoveredNeighbors) return

      // Neighborhood overlay in graph coordinates, from the FULL edge list —
      // every real outgoing link, not just the tree.
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.translate(width / 2 + transform.x, height / 2 + transform.y)
      context.scale(transform.k, transform.k)

      // Connection lines: a quiet grey base, then a shimmer of bright dashes
      // flowing outward from the hovered node. All edges share one path, so
      // the animation is a single stroke with a moving lineDashOffset.
      context.beginPath()
      for (const neighborIndex of hoveredNeighbors) {
        const neighbor = simNodes[neighborIndex]
        if (neighbor.vis <= 0.01) continue
        context.moveTo(hovered.x, hovered.y)
        context.lineTo(neighbor.x, neighbor.y)
      }
      context.globalAlpha = 0.3
      context.strokeStyle = colors.edge
      context.lineWidth = 1 / transform.k
      context.stroke()

      if (!reduceMotion) {
        const dash = 5 / transform.k
        const gap = 16 / transform.k
        const flowOffset = ((performance.now() / 1000) * 26) / transform.k // ~26px/s on screen
        context.setLineDash([dash, gap])
        context.lineDashOffset = -flowOffset
        context.lineCap = "round"
        // Soft glow pass under a bright core pass, same dash phase.
        context.globalAlpha = 0.18
        context.strokeStyle = colors.nodeHighlight
        context.lineWidth = 4 / transform.k
        context.stroke()
        context.globalAlpha = 0.9
        context.lineWidth = 1.4 / transform.k
        context.stroke()
        context.setLineDash([])
        context.lineDashOffset = 0
        context.lineCap = "butt"
      }

      // Neighbor nodes with a faint halo so the neighborhood reads as lit up.
      context.globalAlpha = 0.15
      context.fillStyle = colors.nodeHighlight
      for (const neighborIndex of hoveredNeighbors) {
        const neighbor = simNodes[neighborIndex]
        if (neighbor.vis <= 0.01) continue
        context.beginPath()
        context.arc(neighbor.x, neighbor.y, NODE_RADIUS + 2.5, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1
      for (const neighborIndex of hoveredNeighbors) {
        const neighbor = simNodes[neighborIndex]
        if (neighbor.vis <= 0.01) continue
        context.beginPath()
        context.arc(neighbor.x, neighbor.y, NODE_RADIUS, 0, Math.PI * 2)
        context.fillStyle = nodeFill(neighbor)
        context.fill()
      }
      context.beginPath()
      context.arc(hovered.x, hovered.y, NODE_RADIUS + 1, 0, Math.PI * 2)
      context.fillStyle = nodeFill(hovered)
      context.fill()
      context.lineWidth = 1.5 / transform.k
      context.strokeStyle = colors.nodeHighlight
      context.stroke()

      // Neighborhood labels, collision-culled, hovered node first.
      labelGrid.clear()
      context.font = `${11 / transform.k}px ui-sans-serif, system-ui, sans-serif`
      context.textAlign = "center"
      context.textBaseline = "top"
      context.fillStyle = colors.labelHighlight
      const centerX = width / 2 + transform.x
      const centerY = height / 2 + transform.y
      const drawOverlayLabel = (node: SimNode, alpha: number) => {
        const screenX = node.x * transform.k + centerX
        const screenY = node.y * transform.k + centerY
        if (!claimLabel(screenX, screenY, node.label)) return
        context.globalAlpha = alpha
        context.fillText(node.label, node.x, node.y + NODE_RADIUS + 3)
      }
      drawOverlayLabel(hovered, 1)
      for (const neighborIndex of hoveredNeighbors) {
        if (simNodes[neighborIndex].vis <= 0.01) continue
        drawOverlayLabel(simNodes[neighborIndex], 0.8)
      }
      context.globalAlpha = 1
    }

    const draw = () => {
      framePending = false
      if (sceneDirty) renderScene()
      present()
    }

    const scheduleDraw = () => {
      if (framePending || disposed) return
      framePending = true
      requestAnimationFrame(draw)
    }

    const invalidateScene = () => {
      sceneDirty = true
      scheduleDraw()
    }

    // Pan/zoom frames blit immediately and re-render the scene once the
    // gesture has settled.
    const invalidateView = () => {
      scheduleDraw()
      window.clearTimeout(sceneSettleTimer)
      sceneSettleTimer = window.setTimeout(invalidateScene, SCENE_SETTLE_MS)
    }

    // --- Auto-fit during settle ------------------------------------------------
    // When visibleOnly, frame just the nodes that are (or are becoming)
    // visible, so a filter zooms to its results; falls back to all nodes when
    // nothing is visible.
    const fitToView = (lerp: number, visibleOnly = false) => {
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      let count = 0
      for (const node of simNodes) {
        if (visibleOnly && node.vis <= 0.01 && node.visTarget !== 1) continue
        if (node.x < minX) minX = node.x
        if (node.x > maxX) maxX = node.x
        if (node.y < minY) minY = node.y
        if (node.y > maxY) maxY = node.y
        count++
      }
      if (visibleOnly && count === 0) {
        for (const node of simNodes) {
          if (node.x < minX) minX = node.x
          if (node.x > maxX) maxX = node.x
          if (node.y < minY) minY = node.y
          if (node.y > maxY) maxY = node.y
        }
      }
      if (!Number.isFinite(minX) || width === 0) return
      const spanX = Math.max(maxX - minX, 1)
      const spanY = Math.max(maxY - minY, 1)
      const targetK = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, 0.85 * Math.min(width / spanX, height / spanY))
      )
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      transform.k += (targetK - transform.k) * lerp
      transform.x += (-centerX * transform.k - transform.x) * lerp
      transform.y += (-centerY * transform.k - transform.y) * lerp
    }

    // --- Frame driver ----------------------------------------------------------
    simulation.on("tick", () => {
      if (!userInteracted) fitToView(0.12)
      invalidateScene()
    })

    let introRaf = 0
    const introLoop = () => {
      if (disposed || introDone()) return
      if (!userInteracted) fitToView(0.12)
      invalidateScene()
      introRaf = requestAnimationFrame(introLoop)
    }
    if (!reduceMotion) introRaf = requestAnimationFrame(introLoop)

    // --- Filter show/hide transitions -----------------------------------------
    // Pure render-visibility over the existing layout: only the per-node vis
    // targets change, the simulation is never rebuilt or restarted.
    let filterRaf = 0
    let filterActive = false
    const filterSettled = () => {
      for (const node of simNodes) {
        if (Math.abs(node.vis - node.visTarget) >= 0.01) return false
      }
      return true
    }
    const filterLoop = () => {
      if (disposed) return
      // Zoom to the results even if the user has panned/zoomed — only for the
      // duration of the transition.
      fitToView(0.12, true)
      invalidateScene()
      if (filterSettled()) {
        // Snap to exact targets and render one final clean frame so hidden
        // nodes/edges fully vanish without needing a later pan/zoom.
        for (const node of simNodes) node.vis = node.visTarget
        invalidateScene()
        filterActive = false
        filterRaf = 0
        return
      }
      filterRaf = requestAnimationFrame(filterLoop)
    }
    const applyFilter = (f?: SiteGraphFilter) => {
      if (disposed) return
      const visible = computeVisible(nodes, edges, f)
      const now = performance.now()
      let changed = false
      for (const node of simNodes) {
        const want = visible[node.index] ? 1 : 0
        if (want === node.visTarget) continue
        changed = true
        if (reduceMotion) {
          node.visFrom = want
          node.visTarget = want
          node.vis = want
          node.visStart = -Infinity
        } else {
          node.visFrom = node.vis
          node.visTarget = want
          node.visStart = now
          // Snappier hub-first stagger, same ordering as the intro.
          node.visDelay = (node.appearDelay / INTRO_TOTAL_MS) * 250
        }
      }
      if (!changed) {
        invalidateScene()
        return
      }
      if (reduceMotion) {
        invalidateScene()
        return
      }
      if (!filterActive) {
        filterActive = true
        filterRaf = requestAnimationFrame(filterLoop)
      }
    }
    applyFilterRef.current = applyFilter

    // --- Sizing ------------------------------------------------------------------
    const resize = () => {
      const rect = container.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      sceneCanvas.width = Math.round(width * SCENE_MARGIN * dpr)
      sceneCanvas.height = Math.round(height * SCENE_MARGIN * dpr)
      invalidateScene()
    }
    resize()
    if (reduceMotion) {
      fitToView(1)
      invalidateScene()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)

    // --- Interaction ----------------------------------------------------------------
    const toGraphPoint = (event: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect()
      const screenX = event.clientX - rect.left
      const screenY = event.clientY - rect.top
      return {
        screenX,
        screenY,
        x: (screenX - width / 2 - transform.x) / transform.k,
        y: (screenY - height / 2 - transform.y) / transform.k,
      }
    }

    const findNode = (x: number, y: number): SimNode | null => {
      const searchRadius = Math.max(12 / transform.k, 5)
      let best: SimNode | null = null
      let bestDistance = searchRadius
      for (const node of simNodes) {
        if (node.vis <= 0.01) continue
        const dx = node.x - x
        const dy = node.y - y
        const distance = Math.sqrt(dx * dx + dy * dy) - NODE_RADIUS
        if (distance < bestDistance) {
          bestDistance = distance
          best = node
        }
      }
      return best
    }

    const openNode = (node: SimNode) => {
      try {
        const url = new URL(node.url)
        if (url.protocol !== "http:" && url.protocol !== "https:") return
        window.open(url.href, "_blank", "noopener,noreferrer")
      } catch {
        return
      }
    }

    const positionTooltip = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const offsetX = event.clientX - rect.left + 14
      const offsetY = event.clientY - rect.top + 14
      const maxX = rect.width - tooltip.offsetWidth - 8
      const maxY = rect.height - tooltip.offsetHeight - 8
      tooltip.style.transform = `translate(${Math.min(offsetX, maxX)}px, ${Math.min(offsetY, maxY)}px)`
    }

    const clicksLabel = (depth: number) => {
      if (depth === 0) return "Home page"
      if (depth === 1) return "1 click from home"
      if (depth > 1) return `${depth} clicks from home`
      return "Not reachable from home"
    }

    // Drives the shimmer flow on connection lines — runs only while hovering.
    let hoverRaf = 0
    const hoverLoop = () => {
      if (disposed || !hovered) return
      scheduleDraw()
      hoverRaf = requestAnimationFrame(hoverLoop)
    }

    const setHovered = (node: SimNode | null, event?: PointerEvent) => {
      if (node === hovered && node !== null && event) {
        positionTooltip(event)
        return
      }
      if (node === hovered) return
      const hadHover = hovered !== null
      hovered = node
      hoveredNeighbors = node
        ? filterRef.current?.brokenOnly && node.broken
          ? incomingNeighbors[node.index]
          : outgoingNeighbors[node.index]
        : null
      canvas.style.cursor = node ? "pointer" : "grab"
      if (node && event) {
        tooltip.innerHTML = ""
        const urlLine = document.createElement("div")
        urlLine.className = "max-w-72 truncate font-medium text-foreground"
        urlLine.textContent = node.label
        const clicksLine = document.createElement("div")
        clicksLine.className = "flex items-center gap-1.5 text-muted-foreground"
        const clicksDot = document.createElement("span")
        clicksDot.className = "size-1.5 rounded-full"
        clicksDot.style.backgroundColor = depthColor(node.depth)
        clicksLine.append(clicksDot, clicksLabel(node.depth))
        const metaLine = document.createElement("div")
        metaLine.className = "text-muted-foreground"
        metaLine.textContent = `${node.inCount} incoming · ${node.outCount} outgoing`
        tooltip.append(urlLine, clicksLine, metaLine)
        if (node.title) {
          const titleLine = document.createElement("div")
          titleLine.className = "max-w-72 truncate text-muted-foreground"
          titleLine.textContent = node.title
          tooltip.prepend(titleLine)
        }
        if (node.broken) {
          const brokenLine = document.createElement("div")
          brokenLine.className = "font-medium text-destructive"
          // The server's reason distinguishes a soft 404 and an unfetchable page
          // from a plain 4xx; HTTP status alone cannot say which.
          brokenLine.textContent =
            node.brokenReason || `Broken — HTTP ${node.status}`
          tooltip.append(brokenLine)
        }
        tooltip.style.opacity = "1"
        positionTooltip(event)
      } else {
        tooltip.style.opacity = "0"
      }
      // Hover only re-blits and draws the neighborhood — no scene re-render.
      scheduleDraw()
      if (node && !hadHover && !reduceMotion) {
        hoverRaf = requestAnimationFrame(hoverLoop)
      } else if (!node) {
        cancelAnimationFrame(hoverRaf)
      }
    }

    let panning = false
    let draggingNode: SimNode | null = null
    let pointerMoved = false
    let pointerStartX = 0
    let pointerStartY = 0
    let lastPointerX = 0
    let lastPointerY = 0

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      userInteracted = true
      canvas.setPointerCapture(event.pointerId)
      const point = toGraphPoint(event)
      const node = findNode(point.x, point.y)
      pointerMoved = false
      pointerStartX = event.clientX
      pointerStartY = event.clientY
      if (node) {
        draggingNode = node
        node.fx = point.x
        node.fy = point.y
        simulation.alphaTarget(0.3).restart()
      } else {
        panning = true
        canvas.style.cursor = "grabbing"
      }
      lastPointerX = event.clientX
      lastPointerY = event.clientY
    }

    const onPointerMove = (event: PointerEvent) => {
      if (draggingNode) {
        if (
          Math.hypot(
            event.clientX - pointerStartX,
            event.clientY - pointerStartY
          ) > 4
        ) {
          pointerMoved = true
        }
        const point = toGraphPoint(event)
        draggingNode.fx = point.x
        draggingNode.fy = point.y
        return
      }
      if (panning) {
        transform.x += event.clientX - lastPointerX
        transform.y += event.clientY - lastPointerY
        lastPointerX = event.clientX
        lastPointerY = event.clientY
        invalidateView()
        return
      }
      const point = toGraphPoint(event)
      setHovered(findNode(point.x, point.y), event)
    }

    const finishPointer = (event: PointerEvent, openClickedNode: boolean) => {
      const clickedNode = openClickedNode && !pointerMoved ? draggingNode : null
      if (draggingNode) {
        draggingNode.fx = null
        draggingNode.fy = null
        draggingNode = null
        simulation.alphaTarget(0)
      }
      if (panning) {
        panning = false
        canvas.style.cursor = hovered ? "pointer" : "grab"
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
      pointerMoved = false
      if (clickedNode) openNode(clickedNode)
    }

    const onPointerUp = (event: PointerEvent) => finishPointer(event, true)
    const onPointerCancel = (event: PointerEvent) => finishPointer(event, false)

    const onPointerLeave = () => {
      if (!panning && !draggingNode) setHovered(null)
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      userInteracted = true
      const point = toGraphPoint(event)
      const factor = Math.exp(-event.deltaY * 0.0016)
      const nextK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, transform.k * factor))
      // Keep the graph point under the cursor fixed while zooming.
      transform.x = point.screenX - width / 2 - point.x * nextK
      transform.y = point.screenY - height / 2 - point.y * nextK
      transform.k = nextK
      invalidateView()
    }

    const onDoubleClick = () => {
      userInteracted = true
      fitToView(1)
      invalidateScene()
    }

    canvas.style.cursor = "grab"
    canvas.style.touchAction = "none"
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerCancel)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("dblclick", onDoubleClick)

    // Honor a filter that was already set before this sim mounted.
    applyFilter(filterRef.current)

    return () => {
      disposed = true
      cancelAnimationFrame(introRaf)
      cancelAnimationFrame(hoverRaf)
      cancelAnimationFrame(filterRaf)
      window.clearTimeout(sceneSettleTimer)
      simulation.stop()
      resizeObserver.disconnect()
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerCancel)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("dblclick", onDoubleClick)
    }
  }, [nodes, edges])

  // Push filter changes into the running sim without rebuilding it.
  useEffect(() => {
    applyFilterRef.current?.(filterRef.current)
  }, [
    filter?.query,
    filter?.maxHops,
    filter?.showOrphans,
    filter?.brokenOnly,
  ])

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="block" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute top-0 left-0 z-10 flex flex-col gap-0.5 rounded-md border border-border/50 bg-popover/95 px-3 py-2 text-xs opacity-0 shadow-lg backdrop-blur-sm transition-opacity duration-100"
      />
    </div>
  )
})
