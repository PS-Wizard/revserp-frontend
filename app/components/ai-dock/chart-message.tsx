import { useId, useRef } from "react"
import { DownloadIcon, ImageIcon } from "lucide-react"
import { toast } from "sonner"
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

import { downloadBlob } from "~/components/app-navbar/utils"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type { ChartSpec } from "~/lib/ai-conversation"

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
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
  // Gradient <defs> ids must be unique per chart instance — several charts can
  // share a message, and duplicate ids would make them all use the first fill.
  const gradientId = useId().replace(/:/g, "")
  const figureRef = useRef<HTMLElement>(null)

  const downloadChart = async (format: "png" | "jpg") => {
    const figure = figureRef.current
    if (!figure) return

    try {
      const { toJpeg, toPng } = await import("html-to-image")
      const options = {
        backgroundColor: getComputedStyle(figure).backgroundColor,
        cacheBust: true,
        filter: (node: Node) =>
          !(
            node instanceof HTMLElement &&
            node.dataset.chartExportControl !== undefined
          ),
        pixelRatio: 2,
        quality: 0.92,
      }
      const dataUrl =
        format === "png"
          ? await toPng(figure, options)
          : await toJpeg(figure, options)
      const blob = await fetch(dataUrl).then((response) => response.blob())
      const filename =
        spec.title
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "chart"
      downloadBlob(blob, `${filename}.${format}`)
      toast.success(`Chart downloaded as ${format.toUpperCase()}`)
    } catch {
      toast.error("Unable to download chart")
    }
  }

  return (
    <figure
      className="my-1 w-full min-w-0 rounded-xl border border-border bg-card p-3"
      ref={figureRef}
    >
      <figcaption className="flex items-center justify-between gap-2 pb-2 text-xs font-medium text-muted-foreground">
        <span>{spec.title}</span>
        <div data-chart-export-control>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button aria-label="Download chart" size="xs" variant="ghost" />
              }
            >
              <DownloadIcon data-icon="inline-start" />
              Download
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => void downloadChart("png")}>
                  <ImageIcon />
                  Download PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void downloadChart("jpg")}>
                  <ImageIcon />
                  Download JPG
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </figcaption>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(spec, data, showLegend, gradientId)}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

function renderChart(
  spec: ChartSpec,
  data: Record<string, unknown>[],
  showLegend: boolean,
  gradientId: string
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
            >
              {/* With one series the bars are categories, not a trend, so a
                  single fill makes every bar identical. Colour per category
                  instead — the x-axis labels already carry the meaning, which
                  is why no legend is shown in this case. */}
              {spec.series.length === 1
                ? data.map((_, cellIndex) => (
                    <Cell key={cellIndex} fill={seriesColor(cellIndex)} />
                  ))
                : null}
            </Bar>
          ))}
        </BarChart>
      )
    case "area":
      return (
        <AreaChart data={data}>
          {/* Vertical fade under each line, matching the GSC performance
              chart's gradient fill. A flat low-opacity wash reads as haze. */}
          <defs>
            {spec.series.map((series, index) => (
              <linearGradient
                key={series.key}
                id={`${gradientId}-${index}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={seriesColor(index)}
                  stopOpacity={0.45}
                />
                <stop
                  offset="100%"
                  stopColor={seriesColor(index)}
                  stopOpacity={0.02}
                />
              </linearGradient>
            ))}
          </defs>
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
              fill={`url(#${gradientId}-${index})`}
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
            // recharts defaults every sector to stroke="#fff", which draws a
            // white outline around each slice. paddingAngle already separates
            // them, so the outline is pure noise on a dark surface.
            stroke="none"
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
