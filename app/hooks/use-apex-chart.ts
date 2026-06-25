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
  }, [chartContainerRef, chartOptions, enabled, series])

  useEffect(() => {
    if (!enabled || !chartInstanceRef.current) return

    if (series !== lastSeriesRef.current) {
      lastSeriesRef.current = series
      void chartInstanceRef.current.updateSeries(series, false)
    }
    if (chartOptions !== lastOptionsRef.current) {
      lastOptionsRef.current = chartOptions
      void chartInstanceRef.current.updateOptions(
        chartOptions,
        false,
        false,
        false
      )
    }
  }, [chartOptions, enabled, series])
}
