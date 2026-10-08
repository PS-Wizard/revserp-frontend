import { useEffect, useMemo, useRef, useState } from "react"
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type Query,
} from "@tanstack/react-query"
import { Marker, type Map as MapLibreMap } from "maplibre-gl"
import { useReducedMotion } from "motion/react"

import { ApiError } from "~/lib/api"
import {
  LOCAL_SEO_DEFAULT_RADIUS_M,
  fetchLocalSeoLandmarks,
  fetchLocalSeoLatestListingLookup,
  fetchLocalSeoLatestRun,
  fetchLocalSeoLocation,
  fetchLocalSeoLocationQueryRecords,
  fetchLocalSeoLocations,
  fetchLocalSeoPointDetails,
  fetchLocalSeoRun,
  fetchLocalSeoRunCompetitors,
  fetchLocalSeoRunPointCompetitors,
  generateLocalSeoQueries,
  isLocalSeoLocationBound,
  localSeoLandmarksQueryKey,
  localSeoLatestListingLookupQueryKey,
  localSeoLatestRunQueryKey,
  localSeoLocationQueryKey,
  localSeoLocationQueryRecordsQueryKey,
  localSeoLocationsQueryKey,
  localSeoPointDetailsQueryKey,
  localSeoRunCompetitorsQueryKey,
  localSeoRunPointCompetitorsQueryKey,
  localSeoRunQueryKey,
  localSeoQueryTextKey,
  localSeoRunRefetchInterval,
  refreshLocalSeoLandmarks,
  updateLocalSeoLocationQueryRecords,
  validateLocalSeoCoordinates,
  validateLocalSeoRadiusM,
  type LocalSeoLocation,
  type LocalSeoLocationQueryDraft,
  type LocalSeoLocationQueryRecord,
  type LocalSeoRun,
  type LocalSeoRunStatus,
} from "~/lib/local-seo-api"
import { gridFeatureCollection } from "~/lib/local-seo-grid-geo"
import { findLocalSeoCentreCell } from "~/lib/local-seo-directional"
import { LocalSeoMap } from "~/components/local-seo-map"
import {
  localSeoLocationsBounds,
  localSeoSetupGeodesicBounds,
} from "~/components/local-seo-map-position"
import { LocalSeoMapDetailPanel } from "~/components/local-seo-map-detail-panel"
import { LocalSeoMapSearchCard } from "~/components/local-seo-map-search"
import { LocalSeoMapReportContent } from "~/components/local-seo-map-report"
import { LocalSeoMapSetupContent } from "~/components/local-seo-map-setup"
import { LocalSeoServicesEditor } from "~/components/local-seo-services-editor"
import { LocalSeoRunControls } from "~/components/local-seo-run-controls"
import { LocationSavedRunPicker } from "~/components/locations/location-saved-run-picker"
import { RevserpVisibilityView } from "~/components/revserp-visibility-view"
import {
  LocalSeoMapSidebar,
  describeLocalSeoRadiusLabel,
  type LocalSeoMapSidebarTab,
} from "~/components/local-seo-map-sidebar"

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

/** Editor draft rows that keep the saved id and metadata so an unchanged save is a no-op. */
function queryDraftsFromRecords(
  records: LocalSeoLocationQueryRecord[]
): LocalSeoLocationQueryDraft[] {
  return records.map((record) => ({
    id: record.id,
    text: record.text,
    enabled: record.enabled,
    kind: record.kind,
    source: record.source,
  }))
}

/** Free generation returns plain strings; an existing map record with the same
 * normalized text keeps its id so a regenerated row is updated, not duplicated. */
export function generatedQueryDrafts(
  texts: string[],
  existing: LocalSeoLocationQueryRecord[]
): LocalSeoLocationQueryDraft[] {
  const existingByText = new Map(
    existing
      .filter((record) => record.kind === "map")
      .map((record) => [localSeoQueryTextKey(record.text), record])
  )
  return texts.map((text) => {
    const match = existingByText.get(localSeoQueryTextKey(text))
    return match
      ? {
          id: match.id,
          text,
          enabled: match.enabled,
          kind: "map" as const,
          source: match.source,
        }
      : {
          text,
          enabled: true,
          kind: "map" as const,
          source: "generated" as const,
        }
  })
}

/**
 * Landmark candidates the refresh just created are merged into the user's unsaved
 * drafts by id. Only ids that were not already known are added, so an edit, a
 * removal, or an enabled choice already in the drafts is never overwritten. A new
 * candidate keeps its stored record id, source, and server enabled flag.
 */
export function mergeLocalSeoRefreshedQueryDrafts(args: {
  drafts: LocalSeoLocationQueryDraft[]
  records: LocalSeoLocationQueryRecord[]
  previousRecordIds: ReadonlySet<string>
}): LocalSeoLocationQueryDraft[] {
  const knownIds = new Set(args.previousRecordIds)
  for (const draft of args.drafts) {
    if (draft.id !== undefined) knownIds.add(draft.id)
  }
  const additions = args.records
    .filter((record) => record.kind === "map" && !knownIds.has(record.id))
    .map((record) => ({
      id: record.id,
      text: record.text,
      enabled: record.enabled,
      kind: record.kind,
      source: record.source,
    }))
  return additions.length === 0 ? args.drafts : [...args.drafts, ...additions]
}

/**
 * Landmark rows are not part of service/locality generation output, so generation
 * carries the saved or edited landmark drafts forward instead of dropping them.
 */
export function preserveLocalSeoLandmarkDrafts(args: {
  generated: LocalSeoLocationQueryDraft[]
  drafts: LocalSeoLocationQueryDraft[]
  records: LocalSeoLocationQueryRecord[]
}): LocalSeoLocationQueryDraft[] {
  const landmarkIds = new Set(
    args.records
      .filter(
        (record) => record.origin === "landmark" || record.landmark_id !== null
      )
      .map((record) => record.id)
  )
  const preserved = args.drafts.filter(
    (draft) => draft.id !== undefined && landmarkIds.has(draft.id)
  )
  const preservedIds = new Set(preserved.map((draft) => draft.id))
  const preservedKeys = new Set(
    preserved.map((draft) => localSeoQueryTextKey(draft.text))
  )
  const generated = args.generated.filter(
    (draft) =>
      !preservedIds.has(draft.id) &&
      !preservedKeys.has(localSeoQueryTextKey(draft.text))
  )
  return [...generated, ...preserved]
}

/** True while a location-scoped response still belongs to the selected location. */
export function isCurrentLocalSeoLocation(
  selectedLocationId: string | null,
  responseLocationId: string
): boolean {
  return selectedLocationId === responseLocationId
}

export type LocalSeoPinRunStatus = LocalSeoRunStatus | "none"

export function describeLocalSeoPinStatus(run: LocalSeoRun | null): {
  status: LocalSeoPinRunStatus
  label: string
  color: string
} {
  if (!run) return { status: "none", label: "No runs yet", color: "#94a3b8" }
  switch (run.status) {
    case "completed":
      return { status: run.status, label: "Completed", color: "#2ee6a8" }
    case "partial":
      return { status: run.status, label: "Partial", color: "#fbbf24" }
    case "failed":
      return { status: run.status, label: "Failed", color: "#ef4444" }
    case "queued":
      return { status: run.status, label: "Queued", color: "#38bdf8" }
    case "running":
      return { status: run.status, label: "Running", color: "#38bdf8" }
  }
}

export function frozenLocalSeoRunCenter(
  run: LocalSeoRun
): [number, number] | null {
  const centre = findLocalSeoCentreCell(run.cells)
  if (!centre) return null
  if (!Number.isFinite(centre.latitude) || !Number.isFinite(centre.longitude))
    return null
  if (validateLocalSeoCoordinates(centre.latitude, centre.longitude) !== null)
    return null
  return [centre.longitude, centre.latitude]
}

export function selectLocalSeoReportCenter(
  run: LocalSeoRun | null
): [number, number] | null {
  if (!run) return null
  return frozenLocalSeoRunCenter(run)
}

export function selectLocalSeoOverlayCenter(args: {
  setupLocation: LocalSeoLocation | null
  reportRun: LocalSeoRun | null
}): [number, number] | null {
  if (args.setupLocation) {
    if (
      !Number.isFinite(args.setupLocation.latitude) ||
      !Number.isFinite(args.setupLocation.longitude)
    )
      return null
    return [args.setupLocation.longitude, args.setupLocation.latitude]
  }
  return selectLocalSeoReportCenter(args.reportRun)
}

export function selectLocalSeoOverlayCells(args: {
  setupActive: boolean
  reportCells: LocalSeoRun["cells"]
}): LocalSeoRun["cells"] {
  if (args.setupActive) return []
  return args.reportCells
}

export function selectPendingLocalSeoDrafts(
  locations: LocalSeoLocation[]
): LocalSeoLocation[] {
  return locations.filter((location) => !isLocalSeoLocationBound(location))
}

export function describeLocalSeoUnresolvedMarker(location: LocalSeoLocation): {
  status: "unresolved"
  label: string
  color: string
  ariaLabel: string
} {
  return {
    status: "unresolved",
    label: "Unresolved search area",
    color: "#b45309",
    ariaLabel: `${location.name}, Unresolved search area, not a business location`,
  }
}

export function upsertLocalSeoLocationInList(
  list: LocalSeoLocation[],
  updated: LocalSeoLocation
): LocalSeoLocation[] {
  const index = list.findIndex((location) => location.id === updated.id)
  if (index < 0) return [...list, updated]
  return list.map((location) =>
    location.id === updated.id ? updated : location
  )
}

export function selectLocalSeoInitialReportLocation(
  locations: LocalSeoLocation[],
  runs: Map<string, LocalSeoRun | null>
): LocalSeoLocation | null {
  return (
    locations.find((location) => {
      const run = runs.get(location.id)
      return (
        isLocalSeoLocationBound(location) &&
        run &&
        frozenLocalSeoRunCenter(run) !== null
      )
    }) ?? null
  )
}

export function localSeoMapFitPadding(args: {
  collapsed: boolean
  containerWidth: number
}): { top: number; bottom: number; left: number; right: number } {
  const open = !args.collapsed && args.containerWidth > 0
  return {
    top: 96,
    bottom: 40,
    left: open ? Math.max(0, Math.round(args.containerWidth)) + 24 : 40,
    right: 40,
  }
}

export function LocalSeoMapPage({
  projectId,
  initialLocationId,
  initialVisibilityAuditId,
  lockedLocationId,
}: {
  projectId: string
  initialLocationId?: string
  initialVisibilityAuditId?: string
  /** Location-shell scope. Locks selection, hides the picker/add and AI/query tabs. */
  lockedLocationId?: string
}) {
  const queryClient = useQueryClient()
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [selectedIdState, setSelectedId] = useState<string | null>(
    lockedLocationId ?? initialLocationId ?? null
  )
  const selectedId = lockedLocationId ?? selectedIdState
  const [detailRequested, setDetailRequested] = useState(
    Boolean(lockedLocationId ?? initialLocationId)
  )
  const [focusedPointIndex, setFocusedPointIndex] = useState<number | null>(
    null
  )
  const [adding, setAdding] = useState(false)
  const [activeTab, setActiveTab] = useState<LocalSeoMapSidebarTab>(
    lockedLocationId
      ? "overview"
      : initialVisibilityAuditId
        ? "visibility"
        : "overview"
  )
  const [lockedHistoryRunId, setLockedHistoryRunId] = useState<string | null>(
    null
  )
  const [lockedSessionRunId, setLockedSessionRunId] = useState<string | null>(
    null
  )
  const [radiusDrafts, setRadiusDrafts] = useState<Record<string, number>>({})
  const [localityText, setLocalityText] = useState("")
  const [queryDrafts, setQueryDrafts] = useState<
    LocalSeoLocationQueryDraft[] | null
  >(null)
  const [searchCenter, setSearchCenter] = useState<[number, number] | null>(
    null
  )
  const [viewportWidth, setViewportWidth] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const shouldReduceMotion = useReducedMotion() ?? false
  const markersRef = useRef<Marker[]>([])
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const panelsRef = useRef<HTMLDivElement | null>(null)
  const initialSelectionDoneRef = useRef(Boolean(initialLocationId))
  const initialFitDoneRef = useRef(false)
  const fitKeyRef = useRef<string | null>(null)
  const seededLocationIdRef = useRef<string | null>(null)

  const locationsQuery = useQuery({
    queryKey: localSeoLocationsQueryKey(projectId),
    queryFn: () => fetchLocalSeoLocations(projectId),
    enabled: projectId !== "" && lockedLocationId === undefined,
  })
  const lockedLocationQuery = useQuery({
    queryKey: lockedLocationId
      ? localSeoLocationQueryKey(projectId, lockedLocationId)
      : ["local-seo-location", projectId, "none"],
    queryFn: () => fetchLocalSeoLocation(projectId, lockedLocationId!),
    enabled: projectId !== "" && lockedLocationId !== undefined,
  })
  const locations = useMemo(() => {
    if (lockedLocationId) {
      return lockedLocationQuery.data ? [lockedLocationQuery.data] : []
    }
    return locationsQuery.data ?? []
  }, [lockedLocationId, lockedLocationQuery.data, locationsQuery.data])

  const latestRuns = useQueries({
    queries: locations.map((location) => ({
      queryKey: localSeoLatestRunQueryKey(projectId, location.id),
      queryFn: () => fetchLocalSeoLatestRun(projectId, location.id),
      enabled: projectId !== "",
      refetchInterval:
        (focusedPointIndex !== null ||
          activeTab === "overview" ||
          activeTab === "competitors") &&
        location.id === selectedId
          ? (query: Query<LocalSeoRun | null>) =>
              localSeoRunRefetchInterval(query.state.data?.status)
          : false,
    })),
  })
  const runByLocation = useMemo(() => {
    const byId = new Map<string, LocalSeoRun | null>()
    locations.forEach((location, index) => {
      byId.set(location.id, latestRuns[index]?.data ?? null)
    })
    return byId
  }, [locations, latestRuns])

  const selectedLocation =
    locations.find((location) => location.id === selectedId) ?? null
  const selectedBound = selectedLocation
    ? isLocalSeoLocationBound(selectedLocation)
    : false
  const selectedRun = selectedLocation
    ? (runByLocation.get(selectedLocation.id) ?? null)
    : null
  const lockedEvidenceQuery = useQuery({
    queryKey:
      lockedLocationId && lockedHistoryRunId
        ? localSeoRunQueryKey(projectId, lockedLocationId, lockedHistoryRunId)
        : ["local-seo-run", projectId, "none"],
    queryFn: () =>
      fetchLocalSeoRun(projectId, lockedLocationId!, lockedHistoryRunId!),
    enabled: lockedLocationId !== undefined && lockedHistoryRunId !== null,
  })
  const evidenceRun =
    lockedLocationId && lockedHistoryRunId
      ? (lockedEvidenceQuery.data ?? null)
      : selectedRun
  const searchActive = adding || (selectedLocation !== null && !selectedBound)
  const detailOpen = lockedLocationId
    ? selectedBound
    : adding || (selectedLocation !== null && detailRequested)
  const detailSubtitle =
    adding || !selectedLocation
      ? undefined
      : selectedBound
        ? selectedLocation.address || selectedLocation.locality || undefined
        : "Unresolved search area"
  const detailRadiusLabel =
    !adding && selectedBound && evidenceRun
      ? describeLocalSeoRadiusLabel(evidenceRun.radius_m)
      : undefined

  const selectedIndex = selectedLocation
    ? locations.findIndex((location) => location.id === selectedLocation.id)
    : -1
  const selectedRunPending =
    selectedIndex >= 0 ? (latestRuns[selectedIndex]?.isPending ?? false) : false
  const selectedRunError =
    selectedIndex >= 0 && latestRuns[selectedIndex]?.isError
      ? errorMessageOf(
          latestRuns[selectedIndex]?.error,
          "Could not load the latest run"
        )
      : null
  const historySelected =
    lockedLocationId !== undefined && lockedHistoryRunId !== null
  const evidenceRunPending = historySelected
    ? lockedEvidenceQuery.isPending
    : selectedRunPending
  const evidenceRunError = historySelected
    ? lockedEvidenceQuery.isError
      ? errorMessageOf(
          lockedEvidenceQuery.error,
          "Could not load the saved run"
        )
      : null
    : selectedRunError

  const lookupQuery = useQuery({
    queryKey:
      selectedLocation && selectedBound
        ? localSeoLatestListingLookupQueryKey(projectId, selectedLocation.id)
        : ["local-seo-listing-lookup-latest", "none"],
    queryFn: () =>
      fetchLocalSeoLatestListingLookup(projectId, selectedLocation!.id),
    enabled: selectedBound,
  })

  const landmarksQuery = useQuery({
    queryKey:
      selectedLocation && selectedBound
        ? localSeoLandmarksQueryKey(projectId, selectedLocation.id)
        : ["local-seo-landmarks", projectId, "none"],
    queryFn: () => fetchLocalSeoLandmarks(projectId, selectedLocation!.id),
    enabled: selectedBound && activeTab === "queries",
  })

  const pointDetailsQuery = useQuery({
    queryKey:
      selectedLocation && evidenceRun && focusedPointIndex !== null
        ? localSeoPointDetailsQueryKey(
            projectId,
            selectedLocation.id,
            evidenceRun.id,
            focusedPointIndex,
            evidenceRun.status
          )
        : ["local-seo-point-details", projectId, "none"],
    queryFn: () =>
      fetchLocalSeoPointDetails(
        projectId,
        selectedLocation!.id,
        evidenceRun!.id,
        focusedPointIndex!
      ),
    enabled:
      projectId !== "" &&
      selectedBound &&
      selectedRun !== null &&
      focusedPointIndex !== null &&
      activeTab === "overview",
    refetchInterval: localSeoRunRefetchInterval(evidenceRun?.status),
  })

  const competitorsEnabled =
    projectId !== "" &&
    selectedBound &&
    selectedRun !== null &&
    activeTab === "competitors" &&
    focusedPointIndex === null
  const competitorsQuery = useQuery({
    queryKey:
      selectedLocation && evidenceRun && competitorsEnabled
        ? localSeoRunCompetitorsQueryKey(
            projectId,
            selectedLocation.id,
            evidenceRun.id,
            evidenceRun.status,
            evidenceRun.completed_cells ?? null
          )
        : ["local-seo-run-competitors", projectId, "none"],
    queryFn: () =>
      fetchLocalSeoRunCompetitors(
        projectId,
        selectedLocation!.id,
        evidenceRun!.id
      ),
    enabled: competitorsEnabled,
    refetchInterval: localSeoRunRefetchInterval(evidenceRun?.status),
  })

  const pointCompetitorsEnabled =
    projectId !== "" &&
    selectedBound &&
    selectedRun !== null &&
    activeTab === "competitors" &&
    focusedPointIndex !== null
  const pointCompetitorsQuery = useQuery({
    queryKey:
      selectedLocation &&
      evidenceRun &&
      pointCompetitorsEnabled &&
      focusedPointIndex !== null
        ? localSeoRunPointCompetitorsQueryKey(
            projectId,
            selectedLocation.id,
            evidenceRun.id,
            focusedPointIndex,
            evidenceRun.status,
            evidenceRun.completed_cells ?? null
          )
        : ["local-seo-run-point-competitors", projectId, "none"],
    queryFn: () =>
      fetchLocalSeoRunPointCompetitors(
        projectId,
        selectedLocation!.id,
        evidenceRun!.id,
        focusedPointIndex!
      ),
    enabled: pointCompetitorsEnabled,
    refetchInterval: localSeoRunRefetchInterval(evidenceRun?.status),
  })

  const selectedLocationIdRef = useRef<string | null>(null)
  selectedLocationIdRef.current = selectedLocation?.id ?? null

  const pendingDrafts = useMemo(
    () => selectPendingLocalSeoDrafts(locations),
    [locations]
  )

  function radiusDraftFor(id: string): number {
    return (
      radiusDrafts[id] ??
      (lockedLocationId
        ? locations.find((location) => location.id === id)?.radius_m
        : null) ??
      runByLocation.get(id)?.radius_m ??
      LOCAL_SEO_DEFAULT_RADIUS_M
    )
  }
  const selectedRadiusM = selectedLocation
    ? radiusDraftFor(selectedLocation.id)
    : LOCAL_SEO_DEFAULT_RADIUS_M

  const setupPreviewLocation = searchActive
    ? selectedLocation
    : selectedBound && activeTab === "queries"
      ? selectedLocation
      : null
  const reportRun =
    selectedBound && !searchActive && activeTab !== "queries"
      ? evidenceRun
      : null

  const overlayCenter = selectLocalSeoOverlayCenter({
    setupLocation: setupPreviewLocation,
    reportRun,
  })
  const overlayCells = selectLocalSeoOverlayCells({
    setupActive: setupPreviewLocation !== null,
    reportCells: reportRun?.cells ?? [],
  })
  const activeRadiusM = setupPreviewLocation
    ? radiusDraftFor(setupPreviewLocation.id)
    : (reportRun?.radius_m ?? LOCAL_SEO_DEFAULT_RADIUS_M)
  const overlayData = useMemo(
    () =>
      overlayCenter && validateLocalSeoRadiusM(activeRadiusM) === null
        ? gridFeatureCollection(overlayCells, overlayCenter, activeRadiusM)
        : undefined,
    [overlayCenter?.[0], overlayCenter?.[1], activeRadiusM, overlayCells]
  )

  const firstBound = locations.find((location) =>
    isLocalSeoLocationBound(location)
  )
  const selectedCoords: [number, number] | undefined =
    selectedLocation &&
    Number.isFinite(selectedLocation.latitude) &&
    Number.isFinite(selectedLocation.longitude)
      ? [selectedLocation.longitude, selectedLocation.latitude]
      : undefined
  const mapCenter: [number, number] | undefined =
    overlayCenter ??
    selectedCoords ??
    (firstBound ? [firstBound.longitude, firstBound.latitude] : undefined)

  useEffect(() => {
    if (!map) return
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []
    for (const location of locations) {
      if (!isLocalSeoLocationBound(location)) continue
      const pin = describeLocalSeoPinStatus(
        runByLocation.get(location.id) ?? null
      )
      const element = document.createElement("button")
      element.type = "button"
      element.setAttribute(
        "aria-label",
        `${location.name}, ${pin.label} location pin`
      )
      element.setAttribute("data-status", pin.status)
      element.title = `${location.name} · ${pin.label}`
      const label = document.createElement("span")
      label.className =
        "pointer-events-none absolute top-1/2 left-8 max-w-40 -translate-y-1/2 truncate rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 shadow-sm"
      label.textContent = location.name
      element.append(label)
      element.style.width = "28px"
      element.style.height = "28px"
      element.style.borderRadius = "9999px"
      element.style.border = "2px solid #ffffff"
      element.style.backgroundColor = pin.color
      element.style.cursor = "pointer"
      element.addEventListener("click", () => {
        selectLocation(location)
      })
      const marker = new Marker({ element }).setLngLat([
        location.longitude,
        location.latitude,
      ])
      marker.addTo(map)
      markersRef.current.push(marker)
    }
    for (const location of pendingDrafts) {
      if (
        !Number.isFinite(location.latitude) ||
        !Number.isFinite(location.longitude)
      )
        continue
      const unresolved = describeLocalSeoUnresolvedMarker(location)
      const element = document.createElement("button")
      element.type = "button"
      element.setAttribute("aria-label", unresolved.ariaLabel)
      element.setAttribute("data-status", unresolved.status)
      element.title = `${location.name} · ${unresolved.label}`
      element.style.width = "24px"
      element.style.height = "24px"
      element.style.borderRadius = "9999px"
      element.style.border = "2px dashed #fbbf24"
      element.style.backgroundColor = "transparent"
      element.style.outline = `2px solid ${unresolved.color}`
      element.style.outlineOffset = "2px"
      element.style.cursor = "pointer"
      element.addEventListener("click", () => {
        selectLocation(location)
      })
      const marker = new Marker({ element }).setLngLat([
        location.longitude,
        location.latitude,
      ])
      marker.addTo(map)
      markersRef.current.push(marker)
    }
    return () => {
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []
    }
  }, [map, locations, runByLocation, pendingDrafts])

  useEffect(() => {
    if (!map) return
    const update = () => {
      try {
        const center = map.getCenter()
        setSearchCenter([center.lng, center.lat])
      } catch {
        return
      }
    }
    update()
    map.on("moveend", update)
    return () => {
      map.off("moveend", update)
    }
  }, [map])

  useEffect(() => {
    const element = mapContainerRef.current
    if (!element) return
    const update = () => {
      const width = Math.round(element.getBoundingClientRect().width)
      setViewportWidth((current) => (current === width ? current : width))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = panelsRef.current
    if (!element) return
    const update = () => {
      const width = Math.round(element.getBoundingClientRect().width)
      setContainerWidth((current) => (current === width ? current : width))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (lockedLocationId || initialSelectionDoneRef.current) return
    if (locationsQuery.isPending || locationsQuery.isError) return
    const initial = selectLocalSeoInitialReportLocation(
      locations,
      runByLocation
    )
    if (!initial) return
    initialSelectionDoneRef.current = true
    setSelectedId(initial.id)
    setActiveTab("overview")
  }, [
    locations,
    runByLocation,
    locationsQuery.isPending,
    locationsQuery.isError,
  ])

  useEffect(() => {
    if (!map) return
    if (initialFitDoneRef.current || initialSelectionDoneRef.current) return
    if (locationsQuery.isPending || locationsQuery.isError) return
    if (locations.length === 0) return
    const bounds = localSeoLocationsBounds(locations)
    if (!bounds) return
    initialFitDoneRef.current = true
    try {
      map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 })
    } catch {
      return
    }
  }, [
    map,
    locationsQuery.isPending,
    locationsQuery.isError,
    locations.length,
    locations,
  ])

  useEffect(() => {
    if (!map || !overlayCenter) return
    if (validateLocalSeoRadiusM(activeRadiusM) !== null) return
    const bounds = localSeoSetupGeodesicBounds(overlayCenter, activeRadiusM)
    if (!bounds) return
    if (!collapsed && containerWidth === 0) return
    const key = [
      selectedId ?? "none",
      searchActive ? "search" : activeTab,
      overlayCenter[0],
      overlayCenter[1],
      activeRadiusM,
      collapsed ? "collapsed" : "open",
      containerWidth,
      viewportWidth,
    ].join(":")
    if (fitKeyRef.current === key) return
    fitKeyRef.current = key
    try {
      map.resize()
      map.fitBounds(bounds, {
        padding: localSeoMapFitPadding({ collapsed, containerWidth }),
        maxZoom: 14,
        duration: 0,
      })
    } catch {
      return
    }
  }, [
    map,
    selectedId,
    searchActive,
    activeTab,
    overlayCenter?.[0],
    overlayCenter?.[1],
    activeRadiusM,
    collapsed,
    containerWidth,
    viewportWidth,
  ])

  useEffect(() => {
    if (!selectedBound || !selectedLocation) return
    if (seededLocationIdRef.current === selectedLocation.id) return
    seededLocationIdRef.current = selectedLocation.id
    setLocalityText(selectedLocation.locality)
    setQueryDrafts(null)
  }, [selectedBound, selectedLocation])

  const generateMutation = useMutation({
    mutationFn: (input: {
      projectId: string
      locationId: string
      services: string[]
      locality: string
      localities: string[]
      existingRecords: LocalSeoLocationQueryRecord[]
    }) =>
      generateLocalSeoQueries(input.projectId, {
        service: "",
        services: input.services,
        locality: input.locality,
        localities: input.localities,
      }),
    onSuccess: (data, input) => {
      if (
        !isCurrentLocalSeoLocation(
          selectedLocationIdRef.current,
          input.locationId
        )
      )
        return
      setQueryDrafts((current) => {
        const generated = generatedQueryDrafts(
          data.queries,
          input.existingRecords
        )
        return preserveLocalSeoLandmarkDrafts({
          generated,
          drafts: current ?? queryDraftsFromRecords(input.existingRecords),
          records: input.existingRecords,
        })
      })
    },
  })
  const refreshLandmarksMutation = useMutation({
    mutationFn: (input: {
      locationId: string
      previousRecords: LocalSeoLocationQueryRecord[]
    }) => refreshLocalSeoLandmarks(projectId, input.locationId),
    onSuccess: async (refreshed, input) => {
      if (
        !isCurrentLocalSeoLocation(
          selectedLocationIdRef.current,
          input.locationId
        )
      )
        return
      queryClient.setQueryData(
        localSeoLandmarksQueryKey(projectId, input.locationId),
        refreshed
      )
      const records = await fetchLocalSeoLocationQueryRecords(
        projectId,
        input.locationId
      )
      if (
        !isCurrentLocalSeoLocation(
          selectedLocationIdRef.current,
          input.locationId
        )
      )
        return
      const previousRecordIds = new Set(
        input.previousRecords.map((record) => record.id)
      )
      queryClient.setQueryData(
        localSeoLocationQueryRecordsQueryKey(projectId, input.locationId),
        records
      )
      queryClient.setQueryData(
        localSeoLocationQueryKey(projectId, input.locationId),
        (current: LocalSeoLocation | undefined) =>
          current ? { ...current, queries: records } : current
      )
      queryClient.setQueryData(
        localSeoLocationsQueryKey(projectId),
        (current: LocalSeoLocation[] | undefined) =>
          current?.map((location) =>
            location.id === input.locationId
              ? { ...location, queries: records }
              : location
          )
      )
      setQueryDrafts((current) =>
        current === null
          ? null
          : mergeLocalSeoRefreshedQueryDrafts({
              drafts: current,
              records,
              previousRecordIds,
            })
      )
    },
  })
  const saveQueriesMutation = useMutation({
    mutationFn: (input: {
      locationId: string
      records: LocalSeoLocationQueryDraft[]
    }) =>
      updateLocalSeoLocationQueryRecords(
        projectId,
        input.locationId,
        input.records
      ),
    onSuccess: (saved, input) => {
      if (
        isCurrentLocalSeoLocation(
          selectedLocationIdRef.current,
          input.locationId
        )
      ) {
        setQueryDrafts(null)
      }
      queryClient.setQueryData(
        localSeoLocationQueryRecordsQueryKey(projectId, input.locationId),
        saved
      )
      queryClient.setQueryData(
        localSeoLocationQueryKey(projectId, input.locationId),
        (current: LocalSeoLocation | undefined) =>
          current ? { ...current, queries: saved } : current
      )
      queryClient.setQueryData(
        localSeoLocationsQueryKey(projectId),
        (current: LocalSeoLocation[] | undefined) =>
          current?.map((location) =>
            location.id === input.locationId
              ? { ...location, queries: saved }
              : location
          )
      )
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationsQueryKey(projectId),
      })
    },
  })

  function flyToLocation(location: LocalSeoLocation) {
    if (!map) return
    try {
      map.flyTo({
        center: [location.longitude, location.latitude],
        zoom: Math.max(map.getZoom(), 13),
        duration: shouldReduceMotion ? 0 : 900,
      })
    } catch {
      return
    }
  }

  function selectLocation(location: LocalSeoLocation) {
    if (lockedLocationId) return
    initialSelectionDoneRef.current = true
    setAdding(false)
    setSelectedId(location.id)
    setFocusedPointIndex(null)
    setDetailRequested(true)
    setActiveTab("overview")
    const run = runByLocation.get(location.id) ?? null
    if (
      !isLocalSeoLocationBound(location) ||
      !selectLocalSeoReportCenter(run)
    ) {
      flyToLocation(location)
    }
  }

  function openAddLocation() {
    if (lockedLocationId) return
    initialSelectionDoneRef.current = true
    setAdding(true)
    setDetailRequested(true)
    setSelectedId(null)
    setFocusedPointIndex(null)
  }

  function closeSearch() {
    setAdding(false)
    setDetailRequested(false)
    if (selectedLocation && !selectedBound) setSelectedId(null)
  }

  function closeDetail() {
    if (lockedLocationId) return
    setDetailRequested(false)
  }

  function clearSelection() {
    if (lockedLocationId) return
    setSelectedId(null)
    setDetailRequested(false)
    setFocusedPointIndex(null)
  }

  function selectPoint(pointIndex: number) {
    setFocusedPointIndex(pointIndex)
    setDetailRequested(true)
    setActiveTab("competitors")
  }

  function selectCompetitorScope(pointIndex: number | null) {
    setFocusedPointIndex(pointIndex)
    setDetailRequested(true)
    setActiveTab("competitors")
  }

  function handleBound(location: LocalSeoLocation) {
    queryClient.setQueryData(
      localSeoLocationQueryKey(projectId, location.id),
      location
    )
    queryClient.setQueryData(
      localSeoLocationsQueryKey(projectId),
      (old: LocalSeoLocation[] | undefined) =>
        upsertLocalSeoLocationInList(old ?? [], location)
    )
    seededLocationIdRef.current = null
    setAdding(false)
    setSelectedId(location.id)
    setFocusedPointIndex(null)
    setDetailRequested(true)
    setActiveTab("queries")
    flyToLocation(location)
  }

  function renderActiveTab() {
    if (!selectedLocation) return null
    if (activeTab === "queries") {
      if (!selectedBound) {
        return (
          <p className="text-sm text-muted-foreground">
            Resolve this listing first to set up queries. This search area is
            not yet bound to a business location.
          </p>
        )
      }
      const activeQueryDrafts =
        queryDrafts ?? queryDraftsFromRecords(selectedLocation.queries)
      const effectiveServices = selectedLocation.services
      return (
        <div className="flex flex-col gap-3">
          <LocalSeoServicesEditor
            projectId={projectId}
            locationId={selectedLocation.id}
          />
          <p className="text-xs text-muted-foreground">
            Setup preview · {describeLocalSeoRadiusLabel(selectedRadiusM)} · the
            map grid fills after a run.
          </p>
          <LocalSeoMapSetupContent
            radiusM={selectedRadiusM}
            onRadiusChange={(value) =>
              setRadiusDrafts((drafts) => ({
                ...drafts,
                [selectedLocation.id]: value,
              }))
            }
            localityText={localityText}
            onLocalityTextChange={setLocalityText}
            queryDrafts={activeQueryDrafts}
            onQueryDraftsChange={setQueryDrafts}
            onGenerate={() =>
              generateMutation.mutate({
                projectId,
                locationId: selectedLocation.id,
                services: effectiveServices,
                locality: localityText.trim(),
                localities: selectedLocation.localities,
                existingRecords: selectedLocation.queries,
              })
            }
            generating={generateMutation.isPending}
            generateError={
              generateMutation.isError
                ? errorMessageOf(
                    generateMutation.error,
                    "Could not generate queries"
                  )
                : null
            }
            effectiveServices={effectiveServices}
            queryRecords={selectedLocation.queries}
            landmarks={landmarksQuery.data ?? null}
            landmarksError={
              landmarksQuery.isError
                ? errorMessageOf(
                    landmarksQuery.error,
                    "Could not load landmarks"
                  )
                : null
            }
            onRefreshLandmarks={() =>
              refreshLandmarksMutation.mutate({
                locationId: selectedLocation.id,
                previousRecords: selectedLocation.queries,
              })
            }
            refreshingLandmarks={refreshLandmarksMutation.isPending}
            refreshLandmarksError={
              refreshLandmarksMutation.isError
                ? errorMessageOf(
                    refreshLandmarksMutation.error,
                    "Could not refresh landmarks"
                  )
                : null
            }
            onSave={() =>
              saveQueriesMutation.mutate({
                locationId: selectedLocation.id,
                records: activeQueryDrafts.map((draft) => ({
                  ...draft,
                  text: draft.text.trim(),
                })),
              })
            }
            saving={saveQueriesMutation.isPending}
            saveError={
              saveQueriesMutation.isError
                ? errorMessageOf(
                    saveQueriesMutation.error,
                    "Could not save queries"
                  )
                : null
            }
          />
        </div>
      )
    }
    if (activeTab === "run") {
      if (!selectedBound) return null
      return (
        <div className="flex flex-col gap-3">
          {lockedLocationId ? (
            <LocationSavedRunPicker
              projectId={projectId}
              locationId={selectedLocation.id}
              latestRun={selectedRun}
              value={lockedHistoryRunId}
              sessionRunId={lockedSessionRunId}
              onChange={(runId) => {
                setLockedHistoryRunId(runId)
                setFocusedPointIndex(null)
              }}
            />
          ) : null}
          <LocalSeoRunControls
            key={`${projectId}:${selectedLocation.id}`}
            projectId={projectId}
            location={selectedLocation}
            radiusM={selectedRadiusM}
            onRunStarted={
              lockedLocationId
                ? (runId) => {
                    setLockedSessionRunId(runId)
                    setLockedHistoryRunId(runId)
                  }
                : undefined
            }
          />
        </div>
      )
    }
    if (activeTab === "visibility") {
      if (!selectedBound) return null
      return (
        <RevserpVisibilityView
          projectId={projectId}
          crawlId={null}
          locationId={selectedLocation.id}
          locationName={selectedLocation.name}
          initialAuditId={
            selectedLocation.id === initialLocationId
              ? initialVisibilityAuditId
              : undefined
          }
        />
      )
    }
    if (!selectedBound) return null
    return (
      <LocalSeoMapReportContent
        projectId={projectId}
        location={selectedLocation}
        latestRun={evidenceRun}
        runPending={evidenceRunPending}
        runError={evidenceRunError}
        lookup={lookupQuery.data ?? null}
        lookupPending={lookupQuery.isPending}
        tab={activeTab}
        focusedPointIndex={focusedPointIndex}
        onClearPointFocus={() => setFocusedPointIndex(null)}
        onSelectPoint={selectPoint}
        pointDetails={pointDetailsQuery.data ?? null}
        pointDetailsPending={pointDetailsQuery.isPending}
        pointDetailsError={
          pointDetailsQuery.isError
            ? errorMessageOf(
                pointDetailsQuery.error,
                "Could not load point results"
              )
            : null
        }
        competitors={
          competitorsEnabled ? (competitorsQuery.data ?? null) : undefined
        }
        competitorsPending={
          competitorsEnabled ? competitorsQuery.isPending : false
        }
        competitorsError={
          competitorsEnabled && competitorsQuery.isError
            ? errorMessageOf(
                competitorsQuery.error,
                "Could not load competitors"
              )
            : null
        }
        pointCompetitors={
          pointCompetitorsEnabled
            ? (pointCompetitorsQuery.data ?? null)
            : undefined
        }
        pointCompetitorsPending={
          pointCompetitorsEnabled ? pointCompetitorsQuery.isPending : false
        }
        pointCompetitorsError={
          pointCompetitorsEnabled && pointCompetitorsQuery.isError
            ? errorMessageOf(
                pointCompetitorsQuery.error,
                "Could not load competitors"
              )
            : null
        }
        onSelectCompetitorScope={selectCompetitorScope}
        onShowAllCompetitors={() => setFocusedPointIndex(null)}
      />
    )
  }

  return (
    <div className="relative h-full min-h-[70vh] w-full overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0">
        <LocalSeoMap
          className="absolute inset-0 h-auto"
          center={mapCenter}
          radiusM={
            overlayCenter && validateLocalSeoRadiusM(activeRadiusM) === null
              ? activeRadiusM
              : null
          }
          overlayData={overlayData}
          onMapClick={() => setFocusedPointIndex(null)}
          onFeatureClick={(feature) => {
            const pointIndex = feature.properties?.pointIndex
            if (typeof pointIndex !== "number") return
            selectPoint(pointIndex)
          }}
          onReady={setMap}
        />
      </div>

      <div
        ref={panelsRef}
        className="pointer-events-none absolute top-[13px] bottom-3 left-3 flex items-stretch gap-2"
      >
        {lockedLocationId ? null : (
          <LocalSeoMapSidebar
            collapsed={collapsed}
            locations={locations}
            runByLocation={runByLocation}
            selectedId={selectedId}
            locationsPending={locationsQuery.isPending}
            locationsError={
              locationsQuery.isError
                ? errorMessageOf(
                    locationsQuery.error,
                    "Could not load locations"
                  )
                : null
            }
            onSelectLocation={selectLocation}
            onAddLocation={openAddLocation}
            onToggleCollapsed={() => setCollapsed((value) => !value)}
            className={detailOpen ? "max-lg:hidden" : undefined}
          />
        )}

        {detailOpen ? (
          <LocalSeoMapDetailPanel
            key={adding ? "add" : "detail"}
            title={adding ? "Add location" : (selectedLocation?.name ?? "")}
            meta={adding ? undefined : detailSubtitle}
            pill={adding ? undefined : detailRadiusLabel}
            onClose={
              lockedLocationId
                ? undefined
                : searchActive
                  ? closeSearch
                  : closeDetail
            }
            onBack={
              searchActive
                ? closeSearch
                : lockedLocationId
                  ? undefined
                  : clearSelection
            }
            backClassName={searchActive ? undefined : "lg:hidden"}
            activeTab={searchActive ? undefined : activeTab}
            onTabChange={searchActive ? undefined : setActiveTab}
            visibleTabs={
              lockedLocationId ? ["overview", "competitors", "run"] : undefined
            }
          >
            {searchActive ? (
              <LocalSeoMapSearchCard
                key={adding ? "new" : (selectedLocation?.id ?? "new")}
                projectId={projectId}
                initialLocation={
                  adding ? undefined : (selectedLocation ?? undefined)
                }
                searchCenter={searchCenter ?? undefined}
                onBound={handleBound}
                onClose={closeSearch}
              />
            ) : (
              renderActiveTab()
            )}
          </LocalSeoMapDetailPanel>
        ) : null}
      </div>
    </div>
  )
}
