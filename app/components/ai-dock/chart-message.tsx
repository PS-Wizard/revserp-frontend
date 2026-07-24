import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { ChartSpec } from "~/lib/ai-conversation"

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

function seriesColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length]
}

const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

const tooltipContentStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const

// AI-authored chart rendered inline in an assistant message. The spec is
// already validated by normalizeChartSpec; this only maps it onto recharts.
export function ChartMessage({ spec }: { spec: ChartSpec }) {
  const data = spec.data as Record<string, unknown>[]
  const showLegend = spec.series.length > 1 || spec.type === "pie"

  return (
    <figure className="my-1 w-full min-w-0 rounded-xl border border-border bg-card p-3">
      <figcaption className="pb-2 text-xs font-medium text-muted-foreground">
        {spec.title}
      </figcaption>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(spec, data, showLegend)}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

function renderChart(
  spec: ChartSpec,
  data: Record<string, unknown>[],
  showLegend: boolean
) {
  switch (spec.type) {
    case "bar":
      return (
        <BarChart data={data}>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis dataKey={spec.x_key} {...axisProps} />
          <YAxis width={40} {...axisProps} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            cursor={{ fill: "var(--muted)" }}
          />
          {showLegend ? <Legend /> : null}
          {spec.series.map((series, index) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              fill={seriesColor(index)}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      )
    case "area":
      return (
        <AreaChart data={data}>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis dataKey={spec.x_key} {...axisProps} />
          <YAxis width={40} {...axisProps} />
          <Tooltip contentStyle={tooltipContentStyle} />
          {showLegend ? <Legend /> : null}
          {spec.series.map((series, index) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={seriesColor(index)}
              fill={seriesColor(index)}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      )
    case "pie":
      return (
        <PieChart>
          <Tooltip contentStyle={tooltipContentStyle} />
          <Legend />
          <Pie
            data={data}
            dataKey={spec.series[0].key}
            nameKey={spec.x_key}
            outerRadius={90}
            innerRadius={45}
            paddingAngle={2}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={seriesColor(index)} />
            ))}
          </Pie>
        </PieChart>
      )
    case "line":
    default:
      return (
        <LineChart data={data}>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis dataKey={spec.x_key} {...axisProps} />
          <YAxis width={40} {...axisProps} />
          <Tooltip contentStyle={tooltipContentStyle} />
          {showLegend ? <Legend /> : null}
          {spec.series.map((series, index) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={seriesColor(index)}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      )
  }
}
