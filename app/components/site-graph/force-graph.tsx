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
  appearDelay: number
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
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
 * Shortest-click-path spanning tree from the site root via BFS over the
 * directed link graph, mutating each node's `depth` (clicks from home; -1 for
 * pages unreachable from it). Every returned edge is a real link; pages the
 * root can't reach are adopted through any real inbound link from a reached
 * page, and true orphans stay disconnected.
 */
function buildTree(
  simNodes: SimNode[],
  edges: Array<[number, number]>
): Array<[number, number]> {
  if (simNodes.length === 0) return []

  const outAdjacency: number[][] = simNodes.map(() => [])
  for (const [sourceIndex, targetIndex] of edges) {
    outAdjacency[sourceIndex].push(targetIndex)
  }

  let root = 0
  let rootScore = -1
  for (const node of simNodes) {
    // Prefer the homepage (pathnameLabel returns the hostname for "/"),
    // otherwise the most linked-to page.
    const score = node.label.includes("/") ? node.inCount : Infinity
    if (score > rootScore) {
      rootScore = score
      root = node.index
    }
  }

  const treeEdges: Array<[number, number]> = []
  simNodes[root].depth = 0
  const queue = [root]
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]
    for (const targetIndex of outAdjacency[current]) {
      if (simNodes[targetIndex].depth >= 0) continue
      simNodes[targetIndex].depth = simNodes[current].depth + 1
      treeEdges.push([current, targetIndex])
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
      if (simNodes[sourceIndex].depth >= 0 && simNodes[targetIndex].depth < 0) {
        simNodes[targetIndex].depth = simNodes[sourceIndex].depth + 1
        treeEdges.push([sourceIndex, targetIndex])
        adopted = true
      }
    }
  }

  return treeEdges
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
}: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

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
        broken: node.status >= 400,
        appearDelay: 0,
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

    // Layout/base-render edges: the spanning tree (also assigns depths).
    // Hover reveals the full neighborhood from the complete edge list.
    const layoutEdges = buildTree(simNodes, edges)
    const simLinks: SimLink[] = layoutEdges.map(
      ([sourceIndex, targetIndex]) => ({
        source: simNodes[sourceIndex],
        target: simNodes[targetIndex],
      })
    )

    // Hover highlights outgoing links only — incoming sets can be huge
    // (every page linking a nav target) and matter less when inspecting a
    // page; the tooltip still reports both counts.
    const neighbors: Array<Set<number>> = simNodes.map(() => new Set())
    for (const [sourceIndex, targetIndex] of edges) {
      neighbors[sourceIndex].add(targetIndex)
    }

    const nodeFill = (node: SimNode) =>
      node.broken ? colors.broken : depthColor(node.depth)

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

    if (reduceMotion) {
      simulation.stop()
      simulation.tick(160)
    }

    const introDone = () =>
      introStart === -Infinity ||
      performance.now() - introStart > INTRO_TOTAL_MS + INTRO_NODE_MS

    const nodeScale = (node: SimNode, now: number) => {
      if (introStart === -Infinity) return 1
      const elapsed = now - introStart - node.appearDelay
      if (elapsed <= 0) return 0
      if (elapsed >= INTRO_NODE_MS) return 1
      return easeOutCubic(elapsed / INTRO_NODE_MS)
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

      // Edges: one batched path, culled to the viewport.
      sceneContext.lineWidth = 1 / transform.k
      sceneContext.strokeStyle = colors.edge
      sceneContext.beginPath()
      for (const link of simLinks) {
        if (scales[link.source.index] <= 0 || scales[link.target.index] <= 0) {
          continue
        }
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
        sceneContext.moveTo(sx, sy)
        sceneContext.lineTo(tx, ty)
      }
      sceneContext.globalAlpha = 0.3
      sceneContext.stroke()

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
        context.beginPath()
        context.arc(neighbor.x, neighbor.y, NODE_RADIUS + 2.5, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1
      for (const neighborIndex of hoveredNeighbors) {
        const neighbor = simNodes[neighborIndex]
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
    const fitToView = (lerp: number) => {
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const node of simNodes) {
        if (node.x < minX) minX = node.x
        if (node.x > maxX) maxX = node.x
        if (node.y < minY) minY = node.y
        if (node.y > maxY) maxY = node.y
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
      hoveredNeighbors = node ? neighbors[node.index] : null
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
          brokenLine.textContent = `Broken — HTTP ${node.status}`
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
    let lastPointerX = 0
    let lastPointerY = 0

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      userInteracted = true
      canvas.setPointerCapture(event.pointerId)
      const point = toGraphPoint(event)
      const node = findNode(point.x, point.y)
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

    const onPointerUp = (event: PointerEvent) => {
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
    }

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
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("dblclick", onDoubleClick)

    return () => {
      disposed = true
      cancelAnimationFrame(introRaf)
      cancelAnimationFrame(hoverRaf)
      window.clearTimeout(sceneSettleTimer)
      simulation.stop()
      resizeObserver.disconnect()
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("dblclick", onDoubleClick)
    }
  }, [nodes, edges])

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
