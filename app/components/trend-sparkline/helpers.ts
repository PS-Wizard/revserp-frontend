export function getTrendLabel(delta: number | null) {
  if (delta === null || delta === 0) {
    return "Flat since last crawl"
  }

  return delta > 0 ? "Trending up since last crawl" : "Trending down since last crawl"
}

export function getTrendSummary(
  previousValue: number | undefined,
  currentValue: number | undefined,
) {
  if (currentValue === undefined) {
    return "Waiting for crawl data."
  }

  if (previousValue === undefined) {
    return formatScore(currentValue)
  }

  return `${formatScore(previousValue)} → ${formatScore(currentValue)}`
}

export function getRoundedDelta(value: number | undefined, previousValue: number | undefined) {
  if (value === undefined || previousValue === undefined) {
    return null
  }

  return Math.round(value) - Math.round(previousValue)
}

export function formatScore(value: number | undefined) {
  return value === undefined ? "\u2014" : `${Math.round(value)}%`
}

export function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
