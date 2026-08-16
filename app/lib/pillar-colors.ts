type ColorStop = { h: number; s: number; l: number }

// Three distinct families on a dark background — muted saturation/lightness so
// overlapping bucket fills don't muddy (PageSpeed was the reference).
const PALETTES: Record<string, ColorStop[]> = {
  seo: [
    { h: 210, s: 50, l: 48 },
    { h: 220, s: 48, l: 46 },
    { h: 200, s: 52, l: 47 },
    { h: 228, s: 46, l: 49 },
    { h: 194, s: 50, l: 45 },
    { h: 236, s: 44, l: 50 },
    { h: 186, s: 48, l: 44 },
  ],
  aeo: [
    { h: 16, s: 48, l: 46 },
    { h: 22, s: 46, l: 45 },
    { h: 10, s: 50, l: 44 },
    { h: 28, s: 44, l: 46 },
    { h: 6, s: 48, l: 43 },
    { h: 34, s: 42, l: 45 },
    { h: 2, s: 46, l: 42 },
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
  return Array.from({ length: count }, (_, i) =>
    getPillarChartColor(pillarId, i)
  )
}
