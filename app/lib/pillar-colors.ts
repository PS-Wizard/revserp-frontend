type ColorStop = { h: number; s: number; l: number }

// Three distinct, elegant families on a dark background:
//   SEO       → cool blue (trustworthy, crisp)
//   AEO       → muted coral/terracotta (warm, approachable)
//   PageSpeed → emerald/teal (organic, lush) — the one that already felt right
const PALETTES: Record<string, ColorStop[]> = {
  seo: [
    { h: 210, s: 65, l: 60 },
    { h: 220, s: 62, l: 62 },
    { h: 200, s: 68, l: 58 },
    { h: 228, s: 60, l: 63 },
    { h: 194, s: 65, l: 57 },
    { h: 236, s: 58, l: 64 },
    { h: 186, s: 62, l: 56 },
  ],
  aeo: [
    { h: 16, s: 62, l: 58 },
    { h: 22, s: 60, l: 56 },
    { h: 10, s: 64, l: 56 },
    { h: 28, s: 58, l: 57 },
    { h: 6,  s: 62, l: 55 },
    { h: 34, s: 56, l: 57 },
    { h: 2,  s: 60, l: 54 },
  ],
  pagespeed: [
    { h: 162, s: 52, l: 47 },
    { h: 174, s: 49, l: 44 },
    { h: 150, s: 50, l: 45 },
    { h: 185, s: 50, l: 45 },
    { h: 138, s: 46, l: 42 },
    { h: 196, s: 54, l: 46 },
    { h: 128, s: 44, l: 42 },
  ],
}

function hsl({ h, s, l }: ColorStop): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

function stop(pillarId: string, index: number): ColorStop | null {
  const palette = PALETTES[pillarId]
  if (!palette) return null
  return palette[index % palette.length]
}

/** Full-opacity chart color for a bucket within a pillar. */
export function getPillarChartColor(pillarId: string, index: number): string {
  const s = stop(pillarId, index)
  return s ? hsl(s) : `var(--chart-${(index % 5) + 1})`
}

/** Array of chart colors for all buckets in a pillar. */
export function getPillarColors(pillarId: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => getPillarChartColor(pillarId, i))
}
