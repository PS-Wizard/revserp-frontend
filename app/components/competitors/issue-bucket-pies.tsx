"use client"

import { memo, useMemo, useState } from "react"

import {
  EChartsPieChart,
  type ChartConfig,
} from "~/components/evilcharts/charts/echarts-pie-chart"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { ScoreBreakdownResponse } from "~/lib/api.types"
import { getPillarChartColor } from "~/lib/pillar-colors"
import { cn, formatBucketLabel } from "~/lib/utils"

const START_ANGLE = 210
const CHART_SIZE = 300
const LEGEND_ROW = 24

type MixSlice = {
  id: string
  label: string
  value: number
  color: string
}

function allBuckets(
  breakdown: ScoreBreakdownResponse | null | undefined
): MixSlice[] {
  const slices: MixSlice[] = []
  for (const pillar of breakdown?.pillars ?? []) {
    pillar.buckets.forEach((bucket, index) => {
      slices.push({
        id: bucket.id,
        label: formatBucketLabel(bucket.id, bucket.label),
        value: bucket.issue_row_count,
        color: getPillarChartColor(pillar.id, index),
      })
    })
  }
  return slices
}

function mixConfig(slices: MixSlice[]) {
  const config: ChartConfig = {}
  for (const slice of slices) {
    config[slice.id] = {
      label: slice.label,
      colors: { light: [slice.color], dark: [slice.color] },
    }
  }
  return config
}

export const IssueBucketPies = memo(function IssueBucketPies({
  them,
  themLabel,
  you,
  youLabel,
}: {
  them?: ScoreBreakdownResponse | null
  themLabel: string
  you?: ScoreBreakdownResponse | null
  youLabel: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const youSlices = useMemo(() => allBuckets(you), [you])
  const themSlices = useMemo(() => allBuckets(them), [them])
  const config = useMemo(
    () => mixConfig([...youSlices, ...themSlices]),
    [themSlices, youSlices]
  )

  if (youSlices.length === 0 && themSlices.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader>
          <CardTitle>No issue mix yet</CardTitle>
          <CardDescription>
            Run a completed crawl to populate this view.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <BucketMixCard
        config={config}
        description="Issue count by bucket"
        onSelect={setSelectedId}
        selectedId={selectedId}
        slices={youSlices}
        title={youLabel}
      />
      <BucketMixCard
        config={config}
        description="Issue count by bucket"
        onSelect={setSelectedId}
        selectedId={selectedId}
        slices={themSlices}
        title={themLabel}
      />
    </div>
  )
})

const BucketMixCard = memo(function BucketMixCard({
  config,
  description,
  onSelect,
  selectedId,
  slices,
  title,
}: {
  config: ChartConfig
  description: string
  onSelect: (id: string | null) => void
  selectedId: string | null
  slices: MixSlice[]
  title: string
}) {
  const pieData = useMemo(
    () => slices.filter((slice) => slice.value > 0),
    [slices]
  )
  const total = useMemo(
    () => pieData.reduce((sum, slice) => sum + slice.value, 0),
    [pieData]
  )
  const active = slices.find((slice) => slice.id === selectedId) ?? null
  const selectedOnThisPie =
    selectedId && pieData.some((slice) => slice.id === selectedId)
      ? selectedId
      : null
  const centerValue = active ? active.value : total
  const legendMaxHeight = Math.max(LEGEND_ROW, slices.length * LEGEND_ROW * 0.8)

  return (
    <Card
      className="flex h-full flex-col bg-gradient-to-br from-card via-card to-muted/30"
      onMouseLeave={() => onSelect(null)}
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        {pieData.length === 0 ? (
          <div
            className="relative mx-auto flex shrink-0 items-center justify-center"
            style={{ height: CHART_SIZE, width: CHART_SIZE }}
          >
            <span className="text-sm text-muted-foreground">
              No issues yet.
            </span>
          </div>
        ) : (
          <div
            className="relative mx-auto shrink-0"
            style={{ height: CHART_SIZE, width: CHART_SIZE }}
          >
            <EChartsPieChart
              className="h-full w-full"
              config={config}
              data={pieData}
              dataKey="value"
              nameKey="id"
              onSelectionChange={(selection) =>
                onSelect(selection?.dataKey ?? null)
              }
              selectedSector={selectedOnThisPie}
            >
              <EChartsPieChart.Pie
                cornerRadius={10}
                endAngle={START_ANGLE}
                innerRadius="74%"
                outerRadius="94%"
                paddingAngle={6}
                selectOnHover
                startAngle={-30}
              />
              <EChartsPieChart.Tooltip />
            </EChartsPieChart>
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 text-muted-foreground/50"
              viewBox="0 0 100 100"
            >
              <path
                d="M 23.15 65.5 A 31 31 0 1 1 76.85 65.5"
                fill="none"
                stroke="currentColor"
                strokeDasharray="0.1 5"
                strokeLinecap="round"
                strokeWidth="1"
              />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex size-24 flex-col items-center justify-center rounded-full border border-border/50 bg-background/70 text-center shadow-sm backdrop-blur-sm">
                <span className="font-mono text-3xl leading-none font-semibold tabular-nums">
                  {centerValue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
        <div className="-mt-6 text-center">
          <p className="text-xs font-medium sm:text-sm">
            {active
              ? active.label
              : total === 1
                ? "1 issue"
                : `${total.toLocaleString()} issues`}
          </p>
        </div>
        {pieData.length > 0 ? (
          <MixScale onSelect={onSelect} slices={pieData} total={total} />
        ) : null}
        <div
          className="mt-auto min-h-0 overflow-y-auto"
          style={{ maxHeight: legendMaxHeight }}
        >
          <div className="grid gap-1.5 text-sm">
            {slices.map((slice) => {
              const lit = selectedId === null || selectedId === slice.id
              return (
                <button
                  className={cn(
                    "flex h-6 w-full items-center justify-between gap-3 text-left transition-opacity",
                    !lit && "opacity-30"
                  )}
                  key={slice.id}
                  onClick={() => onSelect(slice.id)}
                  onMouseEnter={() => onSelect(slice.id)}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="truncate">{slice.label}</span>
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {slice.value.toLocaleString()}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

function MixScale({
  onSelect,
  slices,
  total,
}: {
  onSelect: (id: string | null) => void
  slices: MixSlice[]
  total: number
}) {
  let from = 0
  const ticks = slices.map((slice) => {
    const tick = from
    from += slice.value
    return {
      id: slice.id,
      label: slice.label,
      from: tick,
      value: slice.value,
      color: slice.color,
    }
  })

  return (
    <div className="shrink-0">
      <div className="flex text-[10px] text-muted-foreground">
        {ticks.map((tick) => (
          <span key={tick.id} style={{ flexGrow: tick.value, flexBasis: 0 }}>
            {tick.from.toLocaleString()}
          </span>
        ))}
        <span>{total.toLocaleString()}</span>
      </div>
      <div className="mt-1 flex gap-1">
        {ticks.map((tick) => (
          <Tooltip key={tick.id}>
            <TooltipTrigger
              className="flex h-3 min-w-0 cursor-pointer items-center p-0"
              onMouseEnter={() => onSelect(tick.id)}
              style={{ flexGrow: tick.value, flexBasis: 0 }}
              type="button"
            >
              <span
                className="h-1.5 w-full rounded-full"
                style={{ backgroundColor: tick.color }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {tick.label} · {tick.value.toLocaleString()}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
