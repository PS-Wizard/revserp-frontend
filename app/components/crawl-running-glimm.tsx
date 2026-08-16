"use client"

import { useEffect, useRef } from "react"

import {
  ACCENTS,
  accentChain,
  createShader,
  playSweep,
  type ShaderController,
} from "glimm"

/** Azure-forward palette with cyan/indigo/violet accents for a modern sweep. */
const CRAWL_GLIIMM_PALETTE = accentChain([
  ACCENTS.cyan,
  ACCENTS.blue,
  ACCENTS.indigo,
  ACCENTS.purple,
  ACCENTS.teal,
])

const SWEEP_INTERVAL_MS = 3000

const SWEEP_OPTIONS = {
  palette: CRAWL_GLIIMM_PALETTE,
  direction: "ttb" as const,
  easing: "snap" as const,
  sweepMs: 1400,
  outroMs: 450,
  peakAlpha: 0.42,
  bandTight: 11,
  brightness: 0.82,
  rippleAmount: 1,
  waveSpeed: 0.85,
  swellAmount: 0.35,
}

/**
 * Full-bleed glimm sweep for the crawl-in-progress overlay.
 * Mount only while `isViewingRunningCrawl` — unmount cleans up shader + interval.
 */
export function CrawlRunningGlimm() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shaderRef = useRef<ShaderController | null>(null)
  const sweepRef = useRef<ReturnType<typeof playSweep> | null>(null)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resizeCanvas = () => {
      const { width, height } = container.getBoundingClientRect()
      const w = Math.max(1, Math.round(width))
      const h = Math.max(1, Math.round(height))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(container)

    const shader = createShader({
      canvas,
      palette: CRAWL_GLIIMM_PALETTE,
      direction: "ttb",
      bandTight: SWEEP_OPTIONS.bandTight,
      brightness: SWEEP_OPTIONS.brightness,
      swellAmount: SWEEP_OPTIONS.swellAmount,
      rippleAmount: SWEEP_OPTIONS.rippleAmount,
      waveSpeed: SWEEP_OPTIONS.waveSpeed,
    })
    if (!shader) {
      observer.disconnect()
      return
    }
    shaderRef.current = shader

    const runSweep = () => {
      sweepRef.current?.cancel()
      sweepRef.current = playSweep(shader, SWEEP_OPTIONS)
    }

    runSweep()
    intervalRef.current = window.setInterval(runSweep, SWEEP_INTERVAL_MS)

    return () => {
      observer.disconnect()
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      sweepRef.current?.cancel()
      sweepRef.current = null
      shader.destroy()
      shaderRef.current = null
    }
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[15] overflow-hidden"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
