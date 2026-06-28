import { useEffect, useRef, type RefObject } from "react"
import type { ApexOptions } from "apexcharts"

export function useApexChart(
  chartContainerRef: RefObject<HTMLDivElement | null>,
  chartOptions: ApexOptions,
  series: NonNullable<ApexOptions["series"]>,
  enabled: boolean
) {
  const chartInstanceRef = useRef<any>(null)
  const lastSeriesRef = useRef(series)
  const lastOptionsRef = useRef(chartOptions)

  useEffect(() => {
    if (!enabled) {
      chartInstanceRef.current?.destroy?.()
      chartInstanceRef.current = null
      return
    }

    const chartContainer = chartContainerRef.current
    if (!chartContainer || chartInstanceRef.current) return

    let chart: any = null
    let cancelled = false

    void (async () => {
      const ApexCharts = (await import("apexcharts")).default
      if (cancelled || chartInstanceRef.current) return

      chart = new ApexCharts(chartContainer, {
        ...chartOptions,
        series,
      })
      chartInstanceRef.current = chart
      await chart.render()
    })()

    return () => {
      cancelled = true
      chart?.destroy()
      if (chartInstanceRef.current === chart) {
        chartInstanceRef.current = null
      }
    }
  }, [chartContainerRef, enabled])

  useEffect(() => {
    if (!enabled || !chartInstanceRef.current) return

    if (series !== lastSeriesRef.current) {
      lastSeriesRef.current = series
      // animate=true so switching crawls morphs the chart in place instead of
      // snapping. The chart instance persists across data changes (the mount
      // effect no longer recreates it), so the animation is the data transition.
      void chartInstanceRef.current.updateSeries(series, true)
    }
    if (chartOptions !== lastOptionsRef.current) {
      lastOptionsRef.current = chartOptions
      // updateOptions(options, redrawPaths, animate, updateSyncedCharts)
      void chartInstanceRef.current.updateOptions(
        chartOptions,
        false,
        true,
        false
      )
    }
  }, [chartOptions, enabled, series])
}
