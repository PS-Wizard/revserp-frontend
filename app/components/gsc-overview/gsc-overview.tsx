"use client"

import { useMemo, useRef, useState } from "react"

import { ApiError, clientApiPost } from "~/lib/api"
import type {
  ProjectGSCOverviewResponse,
  ProjectGSCStatusResponse,
} from "~/lib/api.types"

import { GSCHeaderCard } from "./header-card"
import { GSCMetricGrid } from "./metric-grid"
import { GSCPerformanceChart } from "./performance-chart"
import { GSCTableSection } from "./table-section"
import { filterTableRows, nextTableSortState, sortTableRows, type TableSortState } from "./table"
import {
  buildChartSeries,
  buildMetricSummary,
  toTableRows,
  type GSCDimensionTab,
  type GSCMetricKey,
  type MetricConfig,
} from "./types"
import { capitalize, dateTimestamp, formatCountryLabel } from "./formatters"

const chartMetricOrder: GSCMetricKey[] = ["impressions", "clicks", "ctr", "position"]
const metricConfig: Record<GSCMetricKey, MetricConfig> = {
  clicks: { label: "Clicks", color: "#7dd3fc", seriesName: "Clicks" },
  impressions: { label: "Impressions", color: "#c084fc", seriesName: "Impressions" },
  ctr: { label: "CTR", color: "#34d399", seriesName: "CTR" },
  position: { label: "Position", color: "#fbbf24", seriesName: "Position" },
}
const dayInMilliseconds = 24 * 60 * 60 * 1000

export function GSCOverview({
  activeProjectID,
  status,
  overviewResponse,
  overviewErrorMessage,
  isOrganizationOwner,
  onRefreshOverview,
}: {
  activeProjectID: string
  status: ProjectGSCStatusResponse
  overviewResponse: ProjectGSCOverviewResponse | null
  overviewErrorMessage: string
  isOrganizationOwner: boolean
  onRefreshOverview: () => Promise<void>
}) {
  const [selectedGSCSiteURL, setSelectedGSCSiteURL] = useState(status.selected_site?.site_url ?? "")
  const [isSavingGSCProjectSelection, setIsSavingGSCProjectSelection] = useState(false)
  const [isRefreshingOverview, setIsRefreshingOverview] = useState(false)
  const [gscProjectSelectionErrorMessage, setGSCProjectSelectionErrorMessage] = useState("")
  const [activeDimensionTab, setActiveDimensionTab] = useState<GSCDimensionTab>("queries")
  const [tableSearch, setTableSearch] = useState("")
  const [tableSort, setTableSort] = useState<TableSortState>({ column: "clicks", direction: "desc" })
  const [visibleMetrics, setVisibleMetrics] = useState<Record<GSCMetricKey, boolean>>({
    clicks: true,
    impressions: true,
    ctr: true,
    position: true,
  })

  const countryDisplayNames = useMemo(
    () =>
      typeof Intl !== "undefined" && "DisplayNames" in Intl
        ? new Intl.DisplayNames(["en"], { type: "region" })
        : null,
    []
  )
  const selectedSite =
    status.available_sites.find((site) => site.site_url === selectedGSCSiteURL) ??
    status.selected_site ??
    null
  const overview = overviewResponse?.overview ?? null
  const selectedWindowOverview = overview?.windows["180"] ?? null
  const trendRows = useMemo(() => selectedWindowOverview?.trend ?? [], [selectedWindowOverview])
  const selectedSiteURLFromStatus = status.selected_site?.site_url ?? ""
  const previousSelectedSiteURLFromStatusRef = useRef(selectedSiteURLFromStatus)
  if (previousSelectedSiteURLFromStatusRef.current !== selectedSiteURLFromStatus) {
    previousSelectedSiteURLFromStatusRef.current = selectedSiteURLFromStatus
    setSelectedGSCSiteURL(selectedSiteURLFromStatus)
    setGSCProjectSelectionErrorMessage("")
  }
  const previousSelectedWindowOverviewRef = useRef(selectedWindowOverview)
  if (previousSelectedWindowOverviewRef.current !== selectedWindowOverview) {
    previousSelectedWindowOverviewRef.current = selectedWindowOverview
    setTableSearch("")
    setActiveDimensionTab("queries")
    setTableSort({ column: "clicks", direction: "desc" })
  }

  const currentVisibleTrendRows = useMemo(() => {
    if (!trendRows.length) return []
    return trendRows.slice(-7)
  }, [trendRows])

  const previousVisibleTrendRows = useMemo(() => {
    if (!trendRows.length || !currentVisibleTrendRows.length) return []
    const currentStartTimestamp = dateTimestamp(currentVisibleTrendRows[0]?.date)
    const previousEndTimestamp = currentStartTimestamp - dayInMilliseconds
    const previousStartTimestamp =
      previousEndTimestamp - (Math.max(1, currentVisibleTrendRows.length) - 1) * dayInMilliseconds

    return trendRows.filter((row) => {
      const timestamp = dateTimestamp(row.date)
      return timestamp >= previousStartTimestamp && timestamp <= previousEndTimestamp
    })
  }, [currentVisibleTrendRows, trendRows])


  const derivedMetricSummary = {
    clicks: buildMetricSummary("clicks", currentVisibleTrendRows, previousVisibleTrendRows),
    impressions: buildMetricSummary("impressions", currentVisibleTrendRows, previousVisibleTrendRows),
    ctr: buildMetricSummary("ctr", currentVisibleTrendRows, previousVisibleTrendRows),
    position: buildMetricSummary("position", currentVisibleTrendRows, previousVisibleTrendRows),
  }

  const queryRows = toTableRows(selectedWindowOverview?.top_queries ?? [], (row) => row.query ?? "")
  const pageRows = toTableRows(selectedWindowOverview?.top_pages ?? [], (row) => row.page ?? "")
  const countryRows = toTableRows(selectedWindowOverview?.country_breakdown ?? [], (row) =>
    formatCountryLabel(row.country ?? "", countryDisplayNames)
  )
  const deviceRows = toTableRows(selectedWindowOverview?.device_breakdown ?? [], (row) =>
    capitalize(row.device ?? "")
  )
  const activeTableSourceRows =
    activeDimensionTab === "queries"
      ? queryRows
      : activeDimensionTab === "pages"
        ? pageRows
        : activeDimensionTab === "countries"
          ? countryRows
          : deviceRows
  const activeTableRows = sortTableRows(filterTableRows(activeTableSourceRows, tableSearch), tableSort)
  const chartSeries = useMemo(
    () =>
      buildChartSeries(
        selectedWindowOverview,
        chartMetricOrder,
        metricConfig,
        dateTimestamp
      ),
    [selectedWindowOverview]
  )


  const handleRefreshOverview = async () => {
    setIsRefreshingOverview(true)
    try {
      await onRefreshOverview()
    } finally {
      setIsRefreshingOverview(false)
    }
  }

  const handleSelectedSiteChange = async (nextSiteURL: string) => {
    setSelectedGSCSiteURL(nextSiteURL)
    if (
      !isOrganizationOwner ||
      !activeProjectID ||
      !nextSiteURL ||
      nextSiteURL === status.selected_site?.site_url
    ) {
      return
    }

    setGSCProjectSelectionErrorMessage("")
    setIsSavingGSCProjectSelection(true)
    try {
      await clientApiPost<{ ok: boolean }>(`/projects/${activeProjectID}/gsc/select-site`, {
        site_url: nextSiteURL,
      })
      await onRefreshOverview()
    } catch (error) {
      setGSCProjectSelectionErrorMessage(
        error instanceof ApiError ? error.message : "Unable to switch the Search Console property."
      )
    } finally {
      setIsSavingGSCProjectSelection(false)
    }
  }

  const toggleMetric = (metricKey: GSCMetricKey) => {
    if (visibleMetrics[metricKey] && Object.values(visibleMetrics).filter(Boolean).length === 1) {
      return
    }
    setVisibleMetrics((current) => ({ ...current, [metricKey]: !current[metricKey] }))
  }

  return (
    <div className="space-y-4 py-6">
      <GSCHeaderCard
        availableSites={status.available_sites}
        gscProjectSelectionErrorMessage={gscProjectSelectionErrorMessage}
        isOrganizationOwner={isOrganizationOwner}
        isRefreshingOverview={isRefreshingOverview}
        isSavingGSCProjectSelection={isSavingGSCProjectSelection}
        onRefreshOverview={handleRefreshOverview}
        onSelectedSiteChange={handleSelectedSiteChange}
        overviewErrorMessage={overviewErrorMessage}
        selectedGSCSiteURL={selectedGSCSiteURL}
        selectedSite={selectedSite}
      />

      {selectedWindowOverview ? (
        <>
          <GSCMetricGrid
            derivedMetricSummary={derivedMetricSummary}
            metricConfig={metricConfig}
            onToggleMetric={toggleMetric}
            visibleMetrics={visibleMetrics}
          />
          <GSCPerformanceChart
            chartMetricOrder={chartMetricOrder}
            chartSeries={chartSeries}
            metricConfig={metricConfig}
            visibleMetrics={visibleMetrics}
            windowOverview={selectedWindowOverview}
          />
          <GSCTableSection
            activeDimensionTab={activeDimensionTab}
            activeTableRows={activeTableRows}
            onDimensionTabChange={(value) => setActiveDimensionTab(value as GSCDimensionTab)}
            onTableSearchChange={setTableSearch}
            onToggleTableSort={(column) => setTableSort((current) => nextTableSortState(current, column))}
            tableSearch={tableSearch}
            tableSort={tableSort}
          />
        </>
      ) : (
        <div className="mx-4 rounded-xl border border-border/50 bg-card px-8 py-10 text-sm text-muted-foreground sm:mx-6 lg:mx-4">
          No Search Console overview data is available yet.
        </div>
      )}
    </div>
  )
}

