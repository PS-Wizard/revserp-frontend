"use client"

import { memo, useMemo, useRef, useState } from "react"
import type { ApexOptions } from "apexcharts"

import type { ScoreBreakdownResponse } from "~/lib/api.types"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { useApexChart } from "~/hooks/use-apex-chart"
import { cn, formatBucketLabel } from "~/lib/utils"
import { getPillarChartColor } from "~/lib/pillar-colors"

type Mode = "pillars" | "groups" | "types"

type BoxMeta = {
  kind: Mode
  pillarId: string
  pillarLabel: string
  bucketId?: string
  issueTypeId?: string
}

type Selection = {
  pillarId: string
  bucketId?: string
  issueTypeId?: string
}

export const IssueTreemap = memo(function IssueTreemap({
  breakdown,
  pillarId,
  onSelect,
}: {
  breakdown: ScoreBreakdownResponse | null
  pillarId?: string
  onSelect?: (selection: Selection) => void
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<Mode>(pillarId ? "groups" : "pillars")
  const [selectedPillarId, setSelectedPillarId] = useState<string>()
  const [selectedBucket, setSelectedBucket] = useState<{
    pillarId: string
    bucketId: string
  }>()

  const { data, meta, colors, total, legendItems } = useMemo(() => {
    const meta: BoxMeta[] = []
    const colors: string[] = []
    const data: Array<{ x: string; y: number }> = []
    let total = 0
    const pillars = breakdown?.pillars ?? []
    const scopedPillarId = pillarId ?? selectedPillarId
    const scopedBucket =
      selectedBucket && (!pillarId || selectedBucket.pillarId === pillarId)
        ? selectedBucket
        : undefined

    for (const pillar of pillars) {
      if (pillarId && pillar.id !== pillarId) continue

      if (mode === "pillars") {
        if (pillar.affected_url_count <= 0) continue
        meta.push({
          kind: "pillars",
          pillarId: pillar.id,
          pillarLabel: pillar.label,
        })
        colors.push(getPillarChartColor(pillar.id, 0))
        data.push({ x: pillar.label, y: pillar.affected_url_count })
        total += pillar.affected_url_count
        continue
      }

      if (mode === "groups") {
        if (scopedPillarId && pillar.id !== scopedPillarId) continue
        pillar.buckets.forEach((bucket, index) => {
          if (bucket.affected_url_count <= 0) return
          meta.push({
            kind: "groups",
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
        continue
      }

      if (scopedBucket) {
        if (
          pillar.id !== scopedBucket.pillarId ||
          !pillar.buckets.some((bucket) => bucket.id === scopedBucket.bucketId)
        ) {
          continue
        }
      } else if (scopedPillarId && pillar.id !== scopedPillarId) {
        continue
      }

      let typeIndex = 0
      for (const bucket of pillar.buckets) {
        if (scopedBucket && bucket.id !== scopedBucket.bucketId) continue
        for (const issue of bucket.issues) {
          const color = getPillarChartColor(pillar.id, typeIndex)
          typeIndex += 1
          if (issue.affected_url_count <= 0) continue
          meta.push({
            kind: "types",
            pillarId: pillar.id,
            pillarLabel: pillar.label,
            bucketId: bucket.id,
            issueTypeId: issue.id,
          })
          colors.push(color)
          data.push({ x: issue.label, y: issue.affected_url_count })
          total += issue.affected_url_count
        }
      }
    }

    const representedPillarIds = new Set(meta.map((item) => item.pillarId))
    const legendItems = pillars
      .filter((pillar) => representedPillarIds.has(pillar.id))
      .map((pillar) => ({
        id: pillar.id,
        label: pillar.label,
        color: getPillarChartColor(pillar.id, 0),
      }))

    return { data, meta, colors, total, legendItems }
  }, [breakdown, mode, pillarId, selectedBucket, selectedPillarId])

  // Refs keep chart handlers current without new options for callback changes.
  const metaRef = useRef(meta)
  metaRef.current = meta
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

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
            if (!entry) return
            if (entry.kind === "pillars") {
              setSelectedPillarId(entry.pillarId)
              setSelectedBucket(undefined)
              setMode("groups")
              onSelectRef.current?.({ pillarId: entry.pillarId })
              return
            }
            if (entry.kind === "groups" && entry.bucketId) {
              setSelectedPillarId(entry.pillarId)
              setSelectedBucket({
                pillarId: entry.pillarId,
                bucketId: entry.bucketId,
              })
              setMode("types")
              onSelectRef.current?.({
                pillarId: entry.pillarId,
                bucketId: entry.bucketId,
              })
              return
            }
            if (entry.bucketId && entry.issueTypeId) {
              onSelectRef.current?.({
                pillarId: entry.pillarId,
                bucketId: entry.bucketId,
                issueTypeId: entry.issueTypeId,
              })
            }
          },
        },
      },
      colors,
      legend: { show: false },
      dataLabels: {
        enabled: true,
        formatter: (label, options) => {
          if (mode === "types" || !options) return label
          const currentSeries = options.w.config.series?.[
            options.seriesIndex
          ] as { data?: Array<{ y?: number }> } | undefined
          const value = currentSeries?.data?.[options.dataPointIndex]?.y ?? 0
          return [String(label), `${value} issue${value === 1 ? "" : "s"}`]
        },
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
            { data?: Array<{ x?: string; y?: number }> } | undefined
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
    [colors, mode]
  )

  useApexChart(
    chartContainerRef,
    chartOptions,
    series,
    data.length > 0 && total > 0
  )

  const hasData = data.length > 0 && total > 0
  const description =
    mode === "pillars"
      ? "Affected URLs by pillar — click a box to explore issue groups below"
      : mode === "groups"
        ? "Affected URLs by issue group — click a box to explore issue types below"
        : "Affected URLs by issue type — click a box to explore it below"

  return (
    <section className="@container/card flex flex-col gap-6">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>
            {mode === "pillars"
              ? "Pillars"
              : mode === "groups"
                ? "Issue Groups"
                : "Issue Types"}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="inline-flex shrink-0 items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs">
          {(["pillars", "groups", "types"] as const).map((value) => (
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
              {value === "pillars"
                ? "Pillars"
                : value === "groups"
                  ? "Issue Groups"
                  : "Issue Types"}
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
    </section>
  )
})
