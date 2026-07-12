"use client"

import { memo, useMemo, useRef, useState } from "react"
import type { ApexOptions } from "apexcharts"

import type { ScoreBreakdownResponse } from "~/lib/api.types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { useApexChart } from "~/hooks/use-apex-chart"
import { cn, formatBucketLabel } from "~/lib/utils"
import { getPillarChartColor } from "~/lib/pillar-colors"

type Mode = "groups" | "types"

type BoxMeta = {
  pillarId: string
  pillarLabel: string
  bucketId: string
  issueTypeId?: string
}

export const IssueTreemap = memo(function IssueTreemap({
  breakdown,
  pillarId,
  onSelectBucket,
}: {
  breakdown: ScoreBreakdownResponse | null
  pillarId?: string
  onSelectBucket?: (
    pillarId: string,
    bucketId: string,
    issueTypeId?: string
  ) => void
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<Mode>("groups")

  const pillars = useMemo(() => {
    const all = breakdown?.pillars ?? []
    return pillarId ? all.filter((p) => p.id === pillarId) : all
  }, [breakdown, pillarId])

  const { data, meta, colors, total, legendItems } = useMemo(() => {
    const meta: BoxMeta[] = []
    const colors: string[] = []
    const data: Array<{ x: string; y: number }> = []
    let total = 0
    for (const pillar of pillars) {
      if (mode === "groups") {
        pillar.buckets.forEach((bucket, index) => {
          meta.push({
            pillarId: pillar.id,
            pillarLabel: pillar.label,
            bucketId: bucket.id,
          })
          colors.push(getPillarChartColor(pillar.id, index))
          data.push({
            x: formatBucketLabel(bucket.id, bucket.label),
            y: bucket.affected_url_count,
          })
          total += bucket.affected_url_count
        })
      } else {
        let typeIndex = 0
        for (const bucket of pillar.buckets) {
          for (const issue of bucket.issues) {
            meta.push({
              pillarId: pillar.id,
              pillarLabel: pillar.label,
              bucketId: bucket.id,
              issueTypeId: issue.id,
            })
            colors.push(getPillarChartColor(pillar.id, typeIndex))
            data.push({ x: issue.label, y: issue.affected_url_count })
            total += issue.affected_url_count
            typeIndex += 1
          }
        }
      }
    }
    const legendItems = pillars.map((pillar) => ({
      id: pillar.id,
      label: pillar.label,
      color: getPillarChartColor(pillar.id, 0),
    }))
    return { data, meta, colors, total, legendItems }
  }, [pillars, mode])

  // Refs so the chart-baked handlers always resolve the current data.
  const metaRef = useRef(meta)
  metaRef.current = meta
  const onSelectRef = useRef(onSelectBucket)
  onSelectRef.current = onSelectBucket

  const series = useMemo<NonNullable<ApexOptions["series"]>>(
    () => [{ name: "", data }],
    [data]
  )

  const chartOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "treemap",
        height: 360,
        background: "transparent",
        parentHeightOffset: 0,
        toolbar: { show: false },
        animations: {
          enabled: true,
          speed: 650,
          animateGradually: { enabled: true, delay: 120 },
          dynamicAnimation: { enabled: true, speed: 400 },
        },
        events: {
          dataPointSelection: (_event, _ctx, config) => {
            if (!config) return
            const entry = metaRef.current[config.dataPointIndex]
            if (entry)
              onSelectRef.current?.(
                entry.pillarId,
                entry.bucketId,
                entry.issueTypeId
              )
          },
        },
      },
      colors,
      legend: { show: false },
      dataLabels: {
        enabled: true,
        style: { fontSize: "12px", fontWeight: 600 },
      },
      plotOptions: {
        treemap: {
          distributed: true,
          enableShades: false,
          borderRadius: 6,
        },
      },
      stroke: { width: 3, colors: ["rgba(9,9,11,0.9)"] },
      states: { active: { filter: { type: "none" } } },
      theme: { mode: "dark" },
      tooltip: {
        theme: "dark",
        custom: ({ dataPointIndex, seriesIndex, w }) => {
          const currentSeries = w.config.series?.[seriesIndex] as
            | { data?: Array<{ x?: string; y?: number }> }
            | undefined
          const point = currentSeries?.data?.[dataPointIndex]
          const info = metaRef.current[dataPointIndex]
          const label = point?.x ?? ""
          const value = point?.y ?? 0
          const pillarName = info?.pillarLabel ?? ""
          return `<div style="padding:8px 12px">
            <div style="font-weight:600">${label}</div>
            <div style="opacity:.7;font-size:12px">${pillarName}</div>
            <div style="margin-top:2px">${value} affected URL${value === 1 ? "" : "s"}</div>
          </div>`
        },
      },
    }),
    [colors]
  )

  useApexChart(
    chartContainerRef,
    chartOptions,
    series,
    data.length > 0 && total > 0
  )

  const hasData = data.length > 0 && total > 0

  return (
    <Card className="@container/card flex h-full flex-col border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>
            {mode === "groups" ? "Issue Groups" : "Issue Types"}
          </CardTitle>
          <CardDescription>
            {mode === "groups"
              ? pillarId
                ? "Affected URLs by issue group — click a box to explore it below"
                : "Affected URLs by issue group across all pillars — click a box to explore it below"
              : pillarId
                ? "Affected URLs by issue type — click a box to explore it below"
                : "Affected URLs by issue type across all pillars — click a box to explore it below"}
          </CardDescription>
        </div>
        <div className="inline-flex shrink-0 items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
          {(["groups", "types"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                mode === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value === "groups" ? "Issue Groups" : "Issue Types"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-2 pt-2 sm:px-6">
        {!hasData ? (
          <div className="flex min-h-[360px] w-full items-center justify-center text-sm text-muted-foreground">
            No affected URLs to visualize yet.
          </div>
        ) : (
          <>
            <div
              className="min-h-[360px] w-full [&_.apexcharts-treemap-rect]:cursor-pointer"
              ref={chartContainerRef}
            />
            {legendItems.length > 1 ? (
              <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
                {legendItems.map((item) => (
                  <div className="flex items-center gap-2" key={item.id}>
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
})
