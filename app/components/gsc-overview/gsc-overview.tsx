"use client"

import { useMemo, useReducer, useRef } from "react"

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

type OverviewState = {
  selectedGSCSiteURL: string
  isSavingGSCProjectSelection: boolean
  isRefreshingOverview: boolean
  gscProjectSelectionErrorMessage: string
  activeDimensionTab: GSCDimensionTab
  tableSearch: string
  tableSort: TableSortState
  visibleMetrics: Record<GSCMetricKey, boolean>
}

type Action =
  | { type: "SET_SELECTED_SITE_URL"; value: string }
  | { type: "SET_SAVING"; value: boolean }
  | { type: "SET_REFRESHING"; value: boolean }
  | { type: "SET_SELECTION_ERROR"; value: string }
  | { type: "SET_DIMENSION_TAB"; value: GSCDimensionTab }
  | { type: "SET_TABLE_SEARCH"; value: string }
  | { type: "SET_TABLE_SORT"; value: TableSortState["column"] }
  | { type: "TOGGLE_METRIC"; value: GSCMetricKey }
  | { type: "RESET_TABLE" }

function overviewReducer(state: OverviewState, action: Action): OverviewState {
  switch (action.type) {
    case "SET_SELECTED_SITE_URL":
      return { ...state, selectedGSCSiteURL: action.value }
    case "SET_SAVING":
      return { ...state, isSavingGSCProjectSelection: action.value }
    case "SET_REFRESHING":
      return { ...state, isRefreshingOverview: action.value }
    case "SET_SELECTION_ERROR":
      return { ...state, gscProjectSelectionErrorMessage: action.value }
    case "SET_DIMENSION_TAB":
      return { ...state, activeDimensionTab: action.value }
    case "SET_TABLE_SEARCH":
      return { ...state, tableSearch: action.value }
    case "SET_TABLE_SORT":
      return { ...state, tableSort: nextTableSortState(state.tableSort, action.value) }
    case "TOGGLE_METRIC": {
      const metricKey = action.value
      if (state.visibleMetrics[metricKey] && Object.values(state.visibleMetrics).filter(Boolean).length === 1) {
        return state
      }
      return {
        ...state,
        visibleMetrics: { ...state.visibleMetrics, [metricKey]: !state.visibleMetrics[metricKey] },
      }
    }
    case "RESET_TABLE":
      return {
        ...state,
        tableSearch: "",
        activeDimensionTab: "queries" as GSCDimensionTab,
        tableSort: { column: "clicks", direction: "desc" },
      }
    default:
      return state
  }
}

function createInitialState(status: ProjectGSCStatusResponse): OverviewState {
  return {
    selectedGSCSiteURL: status.selected_site?.site_url ?? "",
    isSavingGSCProjectSelection: false,
    isRefreshingOverview: false,
    gscProjectSelectionErrorMessage: "",
    activeDimensionTab: "queries",
    tableSearch: "",
    tableSort: { column: "clicks", direction: "desc" },
    visibleMetrics: {
      clicks: true,
      impressions: true,
      ctr: true,
      position: true,
    },
  }
}
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
  const [state, dispatch] = useReducer(overviewReducer, status, createInitialState)


  const countryDisplayNames = useMemo(
    () =>
      typeof Intl !== "undefined" && "DisplayNames" in Intl
        ? new Intl.DisplayNames(["en"], { type: "region" })
        : null,
    []
  )
  const selectedSite =
    status.available_sites.find((site) => site.site_url === state.selectedGSCSiteURL) ??
    status.selected_site ??
    null
  const overview = overviewResponse?.overview ?? null
  const selectedWindowOverview = overview?.windows["180"] ?? null
  const trendRows = useMemo(() => selectedWindowOverview?.trend ?? [], [selectedWindowOverview])
  // Reset table state when overview data changes (replaces useEffect sync)
  const prevOverviewRef = useRef(selectedWindowOverview)
  if (selectedWindowOverview !== prevOverviewRef.current) {
    prevOverviewRef.current = selectedWindowOverview
    dispatch({ type: "RESET_TABLE" })
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


  const derivedMetricSummary = useMemo(() => ({
    clicks: buildMetricSummary("clicks", currentVisibleTrendRows, previousVisibleTrendRows),
    impressions: buildMetricSummary("impressions", currentVisibleTrendRows, previousVisibleTrendRows),
    ctr: buildMetricSummary("ctr", currentVisibleTrendRows, previousVisibleTrendRows),
    position: buildMetricSummary("position", currentVisibleTrendRows, previousVisibleTrendRows),
  }), [currentVisibleTrendRows, previousVisibleTrendRows])

  const queryRows = toTableRows(selectedWindowOverview?.top_queries ?? [], (row) => row.query ?? "")
  const pageRows = toTableRows(selectedWindowOverview?.top_pages ?? [], (row) => row.page ?? "")
  const countryRows = toTableRows(selectedWindowOverview?.country_breakdown ?? [], (row) =>
    formatCountryLabel(row.country ?? "", countryDisplayNames)
  )
  const deviceRows = toTableRows(selectedWindowOverview?.device_breakdown ?? [], (row) =>
    capitalize(row.device ?? "")
  )
  const activeTableSourceRows =
    state.activeDimensionTab === "queries"
      ? queryRows
      : state.activeDimensionTab === "pages"
        ? pageRows
        : state.activeDimensionTab === "countries"
          ? countryRows
          : deviceRows
  const activeTableRows = sortTableRows(filterTableRows(activeTableSourceRows, state.tableSearch), state.tableSort)
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
    dispatch({ type: "SET_REFRESHING", value: true })
    try {
      await onRefreshOverview()
    } finally {
      dispatch({ type: "SET_REFRESHING", value: false })
    }
  }

  const handleSelectedSiteChange = async (nextSiteURL: string) => {
    dispatch({ type: "SET_SELECTED_SITE_URL", value: nextSiteURL })
    if (
      !isOrganizationOwner ||
      !activeProjectID ||
      !nextSiteURL ||
      nextSiteURL === status.selected_site?.site_url
    ) {
      return
    }

    dispatch({ type: "SET_SELECTION_ERROR", value: "" })
    dispatch({ type: "SET_SAVING", value: true })
    try {
      await clientApiPost<{ ok: boolean }>(`/projects/${activeProjectID}/gsc/select-site`, {
        site_url: nextSiteURL,
      })
      await onRefreshOverview()
    } catch (error) {
      dispatch({
        type: "SET_SELECTION_ERROR",
        value: error instanceof ApiError ? error.message : "Unable to switch the Search Console property.",
      })
    } finally {
      dispatch({ type: "SET_SAVING", value: false })
    }
  }

  const toggleMetric = (metricKey: GSCMetricKey) => {
    if (state.visibleMetrics[metricKey] && Object.values(state.visibleMetrics).filter(Boolean).length === 1) {
      return
    }
    dispatch({ type: "TOGGLE_METRIC", value: metricKey })
  }

  return (
    <div className="space-y-4 py-6">
      <GSCHeaderCard
        availableSites={status.available_sites}
        gscProjectSelectionErrorMessage={state.gscProjectSelectionErrorMessage}
        isOrganizationOwner={isOrganizationOwner}
        isRefreshingOverview={state.isRefreshingOverview}
        isSavingGSCProjectSelection={state.isSavingGSCProjectSelection}
        onRefreshOverview={handleRefreshOverview}
        onSelectedSiteChange={handleSelectedSiteChange}
        overviewErrorMessage={overviewErrorMessage}
        selectedGSCSiteURL={state.selectedGSCSiteURL}
        selectedSite={selectedSite}
      />

      {selectedWindowOverview ? (
        <>
          <GSCMetricGrid
            derivedMetricSummary={derivedMetricSummary}
            metricConfig={metricConfig}
            onToggleMetric={toggleMetric}
            visibleMetrics={state.visibleMetrics}
          />
          <GSCPerformanceChart
            chartMetricOrder={chartMetricOrder}
            chartSeries={chartSeries}
            metricConfig={metricConfig}
            visibleMetrics={state.visibleMetrics}
            windowOverview={selectedWindowOverview}
          />
          <GSCTableSection
            activeDimensionTab={state.activeDimensionTab}
            activeTableRows={activeTableRows}
            onDimensionTabChange={(value) => dispatch({ type: "SET_DIMENSION_TAB", value: value as GSCDimensionTab })}
            onTableSearchChange={(value) => dispatch({ type: "SET_TABLE_SEARCH", value })}
            onToggleTableSort={(column) => dispatch({ type: "SET_TABLE_SORT", value: column })}
            tableSearch={state.tableSearch}
            tableSort={state.tableSort}
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

