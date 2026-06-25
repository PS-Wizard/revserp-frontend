import type { GSCMetricKey } from "./types"

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

export function formatNumber(value: number) {
  return numberFormatter.format(value)
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

export function formatPercentFromWholeNumber(value: number) {
  return `${value.toFixed(2)}%`
}

export function formatPosition(value: number) {
  return value.toFixed(1)
}

export function formatMetricValue(metricKey: GSCMetricKey, value: number) {
  if (metricKey === "ctr") return formatPercent(value)
  if (metricKey === "position") return formatPosition(value)
  return formatNumber(value)
}

export function formatMetricDelta(
  metricKey: GSCMetricKey,
  currentValue: number,
  previousValue: number
) {
  if (previousValue === 0) return ""

  if (metricKey === "position") {
    const delta = previousValue - currentValue
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} vs previous window`
  }

  const delta = ((currentValue - previousValue) / previousValue) * 100
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs previous window`
}

export function metricDeltaTone(
  metricKey: GSCMetricKey,
  currentValue: number,
  previousValue: number
) {
  if (currentValue === previousValue) return "text-muted-foreground"
  if (metricKey === "position")
    return currentValue < previousValue ? "text-emerald-300" : "text-rose-300"
  return currentValue > previousValue ? "text-emerald-300" : "text-rose-300"
}

export function formatCountryLabel(
  countryCode: string,
  countryDisplayNames: Intl.DisplayNames | null
) {
  const normalizedCode = countryCode.trim().toUpperCase()
  if (normalizedCode.length === 2 && countryDisplayNames) {
    return countryDisplayNames.of(normalizedCode) ?? normalizedCode
  }
  return normalizedCode || "Unknown"
}

export function capitalize(value: string) {
  if (!value) return "Unknown"
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function dateTimestamp(value: string | undefined) {
  return value ? new Date(`${value}T00:00:00`).getTime() : 0
}
