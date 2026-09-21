import {
  deltaTone,
  formatDelta,
  formatMetricValue,
  metricConfig,
  metricOrder,
  type AnalyticsMetricKey,
} from "./types"

export function AnalyticsMetricGrid({
  summary,
  visibleMetrics,
  onToggle,
}: {
  summary: Record<AnalyticsMetricKey, { current: number; previous: number }>
  visibleMetrics: Record<AnalyticsMetricKey, boolean>
  onToggle: (metric: AnalyticsMetricKey) => void
}) {
  return (
    <div className="grid gap-px border-y border-border/50 bg-border/50 md:grid-cols-2 xl:grid-cols-4">
      {metricOrder.map((metric) => {
        const values = summary[metric]
        const delta = formatDelta(values.current, values.previous)
        return (
          <button
            aria-pressed={visibleMetrics[metric]}
            className={`bg-card px-8 py-6 text-left transition hover:bg-muted/40 ${visibleMetrics[metric] ? "bg-primary/6" : "opacity-60"}`}
            key={metric}
            onClick={() => onToggle(metric)}
            type="button"
          >
            <p className="text-sm text-muted-foreground">
              {metricConfig[metric].label}
            </p>
            <p className="pt-3 text-3xl font-medium tracking-[-0.05em] text-foreground">
              {formatMetricValue(metric, values.current)}
            </p>
            {delta ? (
              <p
                className={`pt-2 text-sm ${deltaTone(values.current, values.previous)}`}
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
