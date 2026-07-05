import { isNumber } from "~/components/trend-sparkline"

export function getScoreRange(
  rows: Array<Record<string, number | null>>,
  keys: readonly string[]
) {
  const values: number[] = []
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key]
      if (isNumber(value)) {
        values.push(value)
      }
    }
  }

  if (!values.length) {
    return { min: 0, max: 100 }
  }

  const min = Math.max(0, Math.floor(Math.min(...values) - 8))
  const max = Math.min(100, Math.ceil(Math.max(...values) + 8))

  if (max - min < 18) {
    const midpoint = (min + max) / 2
    return {
      min: Math.max(0, Math.floor(midpoint - 9)),
      max: Math.min(100, Math.ceil(midpoint + 9)),
    }
  }

  return { min, max }
}

const tooltipDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function formatTooltipDateTime(value: number) {
  return tooltipDateTimeFormatter.format(new Date(value))
}
