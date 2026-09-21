"use client"

import { useMemo, useReducer, useRef, useState } from "react"
import { ApiError, clientApiPost } from "~/lib/api"
import type {
  ProjectAnalyticsOverviewResponse,
  ProjectAnalyticsStatusResponse,
} from "~/lib/api.types"
import { DataLoadingState } from "~/components/data-loading-state"

import { AnalyticsHeaderCard } from "./header-card"
import { AnalyticsMetricGrid } from "./metric-grid"
import { AnalyticsPerformanceChart } from "./performance-chart"
import { AnalyticsTableSection, filterAndSortRows } from "./table-section"
import {
  chartSeriesFor,
  metricOrder,
  type AnalyticsDimensionTab,
  type AnalyticsMetricKey,
  type AnalyticsSort,
} from "./types"

type State = {
  activeTab: AnalyticsDimensionTab
  search: string
  sort: AnalyticsSort
  visibleMetrics: Record<AnalyticsMetricKey, boolean>
}
type Action =
  | { type: "tab"; value: AnalyticsDimensionTab }
  | { type: "search"; value: string }
  | { type: "sort"; value: AnalyticsSort["column"] }
  | { type: "metric"; value: AnalyticsMetricKey }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "tab":
      return { ...state, activeTab: action.value, search: "" }
    case "search":
      return { ...state, search: action.value }
    case "sort":
      return {
        ...state,
        sort:
          state.sort.column === action.value
            ? {
                column: action.value,
                direction: state.sort.direction === "desc" ? "asc" : "desc",
              }
            : {
                column: action.value,
                direction: action.value === "label" ? "asc" : "desc",
              },
      }
    case "metric": {
      if (
        state.visibleMetrics[action.value] &&
        Object.values(state.visibleMetrics).filter(Boolean).length === 1
      )
        return state
      return {
        ...state,
        visibleMetrics: {
          ...state.visibleMetrics,
          [action.value]: !state.visibleMetrics[action.value],
        },
      }
    }
  }
}

const initialState: State = {
  activeTab: "landing_pages",
  search: "",
  sort: { column: "sessions", direction: "desc" },
  visibleMetrics: {
    active_users: true,
    sessions: true,
    engagement_rate: true,
    key_events: true,
  },
}

export function AnalyticsOverview({
  activeProjectId,
  status,
  overviewResponse,
  realtimeActiveUsers,
  overviewErrorMessage,
  isLoading,
  isOrganizationOwner,
  onRefreshOverview,
}: {
  activeProjectId: string
  status: ProjectAnalyticsStatusResponse
  overviewResponse: ProjectAnalyticsOverviewResponse | null
  realtimeActiveUsers?: number
  overviewErrorMessage: string
  isLoading: boolean
  isOrganizationOwner: boolean
  onRefreshOverview: () => Promise<void>
}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectionError, setSelectionError] = useState("")
  const latestPropertyRef = useRef<string | null>(null)
  const overview = overviewResponse?.overview ?? null
  const trend = overview?.trend ?? []
  // One day of hits is not a trend, and GA omits days without hits, so a new
  // or untagged property returns zero or one row.
  const hasTrend = trend.length > 1
  const summary = useMemo(() => {
    const result = {} as Record<
      AnalyticsMetricKey,
      { current: number; previous: number }
    >
    for (const metric of metricOrder) {
      result[metric] = overview?.summary[metric] ?? { current: 0, previous: 0 }
    }
    return result
  }, [overview])
  const sourceRows = overview?.[state.activeTab] ?? []
  const rows = useMemo(
    () => filterAndSortRows(sourceRows, state.search, state.sort),
    [sourceRows, state.search, state.sort]
  )

  async function refresh() {
    setIsRefreshing(true)
    try {
      await onRefreshOverview()
    } finally {
      setIsRefreshing(false)
    }
  }
  async function selectProperty(propertyId: string) {
    if (propertyId === status.selected_property?.property_id) return
    latestPropertyRef.current = propertyId
    setSelectionError("")
    setIsSaving(true)
    try {
      await clientApiPost<{ ok: boolean }>(
        `/projects/${activeProjectId}/analytics/select-property`,
        { property_id: propertyId }
      )
      if (latestPropertyRef.current === propertyId) await onRefreshOverview()
    } catch (error) {
      if (latestPropertyRef.current === propertyId)
        setSelectionError(
          error instanceof ApiError
            ? error.message
            : "Unable to switch the Google Analytics property."
        )
    } finally {
      if (latestPropertyRef.current === propertyId) setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 py-6">
      <AnalyticsHeaderCard
        accountEmail={status.google_account_email}
        accountName={status.selected_property?.account_display_name}
        activeNow={realtimeActiveUsers}
        errorMessage={selectionError || overviewErrorMessage}
        isOwner={isOrganizationOwner}
        isRefreshing={isRefreshing}
        isSaving={isSaving}
        onPropertyChange={selectProperty}
        onRefresh={refresh}
        properties={status.available_properties}
        selectedProperty={status.selected_property ?? null}
        selectedPropertyId={status.selected_property?.property_id ?? ""}
      />
      {isLoading ? (
        <DataLoadingState label="Loading Analytics data..." />
      ) : overview ? (
        <>
          {hasTrend ? (
            <AnalyticsMetricGrid
              onToggle={(metric) => dispatch({ type: "metric", value: metric })}
              summary={summary}
              visibleMetrics={state.visibleMetrics}
            />
          ) : null}
          <AnalyticsPerformanceChart
            chartSeries={chartSeriesFor(trend)}
            hasTrend={hasTrend}
            trend={trend}
            visibleMetrics={state.visibleMetrics}
          />
          <AnalyticsTableSection
            activeTab={state.activeTab}
            onSearchChange={(value) => dispatch({ type: "search", value })}
            onSort={(value) => dispatch({ type: "sort", value })}
            onTabChange={(value) => dispatch({ type: "tab", value })}
            rows={rows}
            search={state.search}
            sort={state.sort}
          />
        </>
      ) : (
        <div className="mx-4 rounded-xl border border-border/50 bg-card px-8 py-10 text-sm text-muted-foreground sm:mx-6 lg:mx-4">
          No Google Analytics overview data is available yet.
        </div>
      )}
    </div>
  )
}
