import {
  formatMetricDelta,
  formatMetricValue,
  metricDeltaTone,
} from "./formatters"
import type { GSCMetricKey, MetricConfig, MetricSummary } from "./types"

export function GSCMetricGrid({
  metricConfig,
  visibleMetrics,
  derivedMetricSummary,
  onToggleMetric,
}: {
  metricConfig: Record<GSCMetricKey, MetricConfig>
  visibleMetrics: Record<GSCMetricKey, boolean>
  derivedMetricSummary: Record<GSCMetricKey, MetricSummary>
  onToggleMetric: (metricKey: GSCMetricKey) => void
}) {
  return (
    <div className="grid gap-px border-y border-border/50 bg-border/50 md:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(metricConfig) as GSCMetricKey[]).map((metricKey) => {
        const summary = derivedMetricSummary[metricKey]
        const delta = summary.hasPreviousWindow
          ? formatMetricDelta(metricKey, summary.current, summary.previous)
          : ""

        return (
          <button
            className={`bg-card px-8 py-6 text-left transition hover:bg-muted/40 ${
              visibleMetrics[metricKey] ? "bg-primary/6" : "opacity-60"
            }`}
            key={metricKey}
            onClick={() => onToggleMetric(metricKey)}
            type="button"
          >
            <p className="text-sm text-muted-foreground">
              {metricConfig[metricKey].label}
            </p>
            <p className="pt-3 text-3xl font-medium tracking-[-0.05em] text-foreground">
              {formatMetricValue(metricKey, summary.current)}
            </p>
            {delta ? (
              <p
                className={`pt-2 text-sm ${metricDeltaTone(metricKey, summary.current, summary.previous)}`}
              >
                {delta}
              </p>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
