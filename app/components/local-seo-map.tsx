import { useEffect, useRef, useState } from "react"

import {
  AttributionControl,
  Map as MapLibreMapInstance,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
} from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import type { FeatureCollection, Point, Polygon } from "geojson"

import {
  gridMeasurementFeatureCollection,
  gridMeasurementLabelCollection,
  samplingRadiusPolygon,
  type GridGeoCellProperties,
  type GridMeasurementFeatureCollection,
  type GridMeasurementLabelFeatureCollection,
} from "~/lib/local-seo-grid-geo"
import { cn } from "~/lib/utils"

const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron"

const RADIUS_SOURCE_ID = "local-seo-radius"
const RADIUS_FILL_LAYER_ID = "local-seo-radius-fill"
const RADIUS_LINE_LAYER_ID = "local-seo-radius-line"
const OVERLAY_SOURCE_ID = "local-seo-overlay"
const OVERLAY_FILL_LAYER_ID = "local-seo-overlay-fill"
const OVERLAY_HATCH_LAYER_ID = "local-seo-overlay-hatch"
const OVERLAY_LINE_LAYER_ID = "local-seo-overlay-line"
const OVERLAY_LABEL_LAYER_ID = "local-seo-overlay-label"
const OVERLAY_LABEL_SOURCE_ID = "local-seo-overlay-labels"
const MEASUREMENT_SOURCE_ID = "local-seo-measurement"
const MEASUREMENT_CASING_LAYER_ID = "local-seo-measurement-casing"
const MEASUREMENT_LINE_LAYER_ID = "local-seo-measurement-line"
const MEASUREMENT_LABEL_SOURCE_ID = "local-seo-measurement-labels"
const MEASUREMENT_LABEL_LAYER_ID = "local-seo-measurement-label"
const OVERLAY_LABEL_FONT_STACK = ["Noto Sans Regular", "Open Sans Regular"]
const HATCH_PATTERN_ID = "local-seo-hatch"

/** A blank canvas with no error event is the failure that ships, so the style must
 * actually finish loading inside this window or we say so. */
const MAP_LOAD_TIMEOUT_MS = 12_000

const DEFAULT_CENTER: [number, number] = [85.3123, 27.6942]

export type LocalSeoOverlayData = FeatureCollection<
  Polygon,
  GridGeoCellProperties
>

type MapLibreLngLat = [number, number]

type MapLibreRadiusTarget = {
  center: MapLibreLngLat
  radiusM: number | null
}

function emptyRadiusCollection(): FeatureCollection<Polygon> {
  return { type: "FeatureCollection", features: [] }
}

function emptyOverlayCollection(): LocalSeoOverlayData {
  return { type: "FeatureCollection", features: [] }
}

function emptyMeasurementCollection(): GridMeasurementFeatureCollection {
  return { type: "FeatureCollection", features: [] }
}

function emptyMeasurementLabelCollection(): GridMeasurementLabelFeatureCollection {
  return { type: "FeatureCollection", features: [] }
}

function measurementFeatureCollection(
  center: MapLibreLngLat,
  radiusM: number | null
): GridMeasurementFeatureCollection {
  if (radiusM === null) return emptyMeasurementCollection()
  return gridMeasurementFeatureCollection(center, radiusM)
}

function measurementLabelCollection(
  center: MapLibreLngLat,
  radiusM: number | null
): GridMeasurementLabelFeatureCollection {
  if (radiusM === null) return emptyMeasurementLabelCollection()
  return gridMeasurementLabelCollection(center, radiusM)
}

function radiusFeatureCollection(
  center: MapLibreLngLat,
  radiusM: number | null
): FeatureCollection<Polygon> {
  if (radiusM === null || !Number.isFinite(radiusM) || radiusM <= 0) {
    return emptyRadiusCollection()
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: samplingRadiusPolygon(center, radiusM),
      },
    ],
  }
}

function ensureHatchPattern(map: MapLibreMap): void {
  if (map.hasImage(HATCH_PATTERN_ID)) return
  const data = new Uint8Array(8 * 8 * 4)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 8 < 2) data.set([180, 83, 9, 210], (y * 8 + x) * 4)
    }
  }
  map.addImage(
    HATCH_PATTERN_ID,
    { width: 8, height: 8, data },
    { pixelRatio: 2 }
  )
}

function overlayLabelCollection(
  data: LocalSeoOverlayData
): FeatureCollection<Point, GridGeoCellProperties> {
  return {
    type: "FeatureCollection",
    features: data.features.map((feature) => ({
      type: "Feature",
      properties: feature.properties,
      geometry: {
        type: "Point",
        coordinates: [
          feature.properties.longitude,
          feature.properties.latitude,
        ],
      },
    })),
  }
}

/**
 * Runs only after the style loads: addSource and addLayer before that throw.
 */
function installLocalSeoSources(map: MapLibreMap): void {
  if (map.getSource(RADIUS_SOURCE_ID) && map.getSource(OVERLAY_SOURCE_ID)) {
    return
  }
  ensureHatchPattern(map)
  if (!map.getSource(RADIUS_SOURCE_ID)) {
    map.addSource(RADIUS_SOURCE_ID, {
      type: "geojson",
      data: emptyRadiusCollection(),
    })
    map.addLayer({
      id: RADIUS_FILL_LAYER_ID,
      type: "fill",
      source: RADIUS_SOURCE_ID,
      paint: { "fill-color": "#2563eb", "fill-opacity": 0.035 },
    })
    map.addLayer({
      id: RADIUS_LINE_LAYER_ID,
      type: "line",
      source: RADIUS_SOURCE_ID,
      paint: {
        "line-color": "#2563eb",
        "line-width": 1.5,
        "line-dasharray": [2, 2],
      },
    })
  }
  if (!map.getSource(MEASUREMENT_SOURCE_ID)) {
    map.addSource(MEASUREMENT_SOURCE_ID, {
      type: "geojson",
      data: emptyMeasurementCollection(),
    })
    map.addSource(MEASUREMENT_LABEL_SOURCE_ID, {
      type: "geojson",
      data: emptyMeasurementLabelCollection(),
    })
    map.addLayer(
      {
        id: MEASUREMENT_CASING_LAYER_ID,
        type: "line",
        source: MEASUREMENT_SOURCE_ID,
        paint: {
          "line-color": "#ffffff",
          "line-width": 3,
          "line-opacity": 0.85,
        },
      },
      RADIUS_FILL_LAYER_ID
    )
    map.addLayer(
      {
        id: MEASUREMENT_LINE_LAYER_ID,
        type: "line",
        source: MEASUREMENT_SOURCE_ID,
        layout: { "line-cap": "round" },
        paint: {
          "line-color": "#334155",
          "line-width": 1.5,
          "line-opacity": 0.85,
          "line-dasharray": [2, 3],
        },
      },
      RADIUS_FILL_LAYER_ID
    )
    map.addLayer(
      {
        id: MEASUREMENT_LABEL_LAYER_ID,
        type: "symbol",
        source: MEASUREMENT_LABEL_SOURCE_ID,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-font": OVERLAY_LABEL_FONT_STACK,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-optional": false,
        },
        paint: {
          "text-color": "#1e293b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 3,
        },
      },
      RADIUS_FILL_LAYER_ID
    )
  }
  if (!map.getSource(OVERLAY_SOURCE_ID)) {
    map.addSource(OVERLAY_SOURCE_ID, {
      type: "geojson",
      data: emptyOverlayCollection(),
    })
    map.addLayer({
      id: OVERLAY_FILL_LAYER_ID,
      type: "fill",
      source: OVERLAY_SOURCE_ID,
      filter: ["!=", ["get", "hatched"], true],
      paint: {
        "fill-color": ["get", "fill"],
        "fill-opacity": ["get", "opacity"],
      },
    })
    map.addLayer({
      id: OVERLAY_HATCH_LAYER_ID,
      type: "fill",
      source: OVERLAY_SOURCE_ID,
      filter: ["==", ["get", "hatched"], true],
      paint: {
        "fill-color": ["get", "fill"],
        "fill-opacity": ["get", "opacity"],
        "fill-pattern": HATCH_PATTERN_ID,
      },
    })
    map.addLayer({
      id: OVERLAY_LINE_LAYER_ID,
      type: "line",
      source: OVERLAY_SOURCE_ID,
      paint: {
        "line-color": ["get", "stroke"],
        "line-width": 1.5,
      },
    })
    map.addSource(OVERLAY_LABEL_SOURCE_ID, {
      type: "geojson",
      data: overlayLabelCollection(emptyOverlayCollection()),
    })
    map.addLayer({
      id: OVERLAY_LABEL_LAYER_ID,
      type: "symbol",
      source: OVERLAY_LABEL_SOURCE_ID,
      layout: {
        "text-field": [
          "case",
          ["==", ["get", "resultCountLabel"], ""],
          [
            "format",
            ["get", "pointLetter"],
            { "font-scale": 1 },
            "\n",
            {},
            ["get", "displayRank"],
            {},
          ],
          [
            "format",
            ["get", "pointLetter"],
            { "font-scale": 1 },
            "\n",
            {},
            ["get", "displayRank"],
            {},
            "\n",
            {},
            ["get", "resultCountLabel"],
            { "font-scale": 0.85 },
          ],
        ],
        "text-size": 12,
        "text-line-height": 1.15,
        "text-font": OVERLAY_LABEL_FONT_STACK,
        "text-allow-overlap": true,
        "text-offset": [0, -1.1],
      },
      paint: {
        "text-color": "#0f172a",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    })
  }
}

function applyRadius(map: MapLibreMap, target: MapLibreRadiusTarget) {
  const source = map.getSource(RADIUS_SOURCE_ID) as GeoJSONSource | undefined
  if (!source) return
  source.setData(radiusFeatureCollection(target.center, target.radiusM))
  const measurements = map.getSource(MEASUREMENT_SOURCE_ID) as
    GeoJSONSource | undefined
  measurements?.setData(
    measurementFeatureCollection(target.center, target.radiusM)
  )
  const labels = map.getSource(MEASUREMENT_LABEL_SOURCE_ID) as
    GeoJSONSource | undefined
  labels?.setData(measurementLabelCollection(target.center, target.radiusM))
}

function applyOverlay(map: MapLibreMap, data: LocalSeoOverlayData) {
  const source = map.getSource(OVERLAY_SOURCE_ID) as GeoJSONSource | undefined
  if (!source) return
  source.setData(data)
  const labels = map.getSource(OVERLAY_LABEL_SOURCE_ID) as
    GeoJSONSource | undefined
  labels?.setData(overlayLabelCollection(data))
}

/** MapLibre reports tile problems through its error event, but a blocked style
host or a lost glyph endpoint can leave the canvas silently blank. */
function isBasemapFailure(event: { error?: { message?: string } }): boolean {
  const message = event.error?.message ?? ""
  return /fetch|network|404|not found|unable to load|webgl|context lost|style|glyph|sprite|json/i.test(
    message
  )
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
  } catch {
    return false
  }
}

export type LocalSeoMapProps = {
  className?: string
  center?: [number, number]
  zoom?: number
  radiusM?: number | null
  onMapClick?: (lngLat: [number, number]) => void
  onReady?: (map: MapLibreMap) => void
  interactive?: boolean
  overlayData?: LocalSeoOverlayData
  onFeatureClick?: (feature: MapGeoJSONFeature) => void
  fallbackHref?: string
}

export function LocalSeoMap({
  className,
  center = DEFAULT_CENTER,
  zoom = 12,
  radiusM = null,
  onMapClick,
  onReady,
  interactive = true,
  overlayData,
  onFeatureClick,
  fallbackHref,
}: LocalSeoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onMapClickRef = useRef(onMapClick)
  const onReadyRef = useRef(onReady)
  const onFeatureClickRef = useRef(onFeatureClick)
  const overlayDataRef = useRef<LocalSeoOverlayData | undefined>(overlayData)
  const radiusRef = useRef<MapLibreRadiusTarget>({
    center: [center[0], center[1]],
    radiusM,
  })
  const [basemapFailed, setBasemapFailed] = useState(false)
  const [mapUnavailable, setMapUnavailable] = useState(false)

  onMapClickRef.current = onMapClick
  onReadyRef.current = onReady
  onFeatureClickRef.current = onFeatureClick
  overlayDataRef.current = overlayData
  radiusRef.current = { center: [center[0], center[1]], radiusM }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (container.dataset.mapInitialized) return
    if (!supportsWebGL()) {
      setMapUnavailable(true)
      return
    }
    container.replaceChildren()
    let instance: MapLibreMap
    try {
      instance = new MapLibreMapInstance({
        container,
        style: BASEMAP_STYLE_URL,
        center: [center[0], center[1]],
        zoom,
        interactive,
        attributionControl: false,
      })
    } catch {
      setMapUnavailable(true)
      return
    }
    container.dataset.mapInitialized = "true"
    mapRef.current = instance

    instance.addControl(
      new NavigationControl({ visualizePitch: true }),
      "bottom-right"
    )
    instance.addControl(
      new AttributionControl({ compact: true }),
      "bottom-right"
    )
    instance.addControl(
      new ScaleControl({ maxWidth: 90, unit: "metric" }),
      "bottom-right"
    )

    instance.on("error", (event) => {
      if (isBasemapFailure(event)) setBasemapFailed(true)
    })

    let settled = false
    const watchdog = setTimeout(() => {
      if (!settled) setMapUnavailable(true)
    }, MAP_LOAD_TIMEOUT_MS)
    instance.on("load", () => {
      settled = true
      clearTimeout(watchdog)
    })
    instance.on("click", (event) => {
      const layers = [
        OVERLAY_FILL_LAYER_ID,
        OVERLAY_HATCH_LAYER_ID,
        OVERLAY_LABEL_LAYER_ID,
      ].filter((id) => {
        try {
          return Boolean(instance.getLayer(id))
        } catch {
          return false
        }
      })
      let features: MapGeoJSONFeature[] = []
      try {
        features =
          instance.queryRenderedFeatures(event.point, { layers }) ?? []
      } catch {
        features = []
      }
      const feature = features[0]
      if (feature && onFeatureClickRef.current) {
        onFeatureClickRef.current(feature)
        return
      }
      onMapClickRef.current?.([event.lngLat.lng, event.lngLat.lat])
    })
    instance.on("load", () => {
      installLocalSeoSources(instance)
      applyRadius(instance, radiusRef.current)
      applyOverlay(instance, overlayDataRef.current ?? emptyOverlayCollection())
      onReadyRef.current?.(instance)
    })

    return () => {
      clearTimeout(watchdog)
      mapRef.current = null
      instance.remove()
      delete container.dataset.mapInitialized
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    applyRadius(map, radiusRef.current)
  }, [radiusM, center[0], center[1]])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    applyOverlay(map, overlayData ?? emptyOverlayCollection())
  }, [overlayData])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={cn(
        "relative isolate h-full w-full overflow-hidden",
        className
      )}
    >
      <div
        ref={containerRef}
        role="application"
        aria-label="Map of the sampled location and its search radius"
        className="absolute inset-0"
        style={{ position: "absolute" }}
      />
      {basemapFailed || mapUnavailable ? (
        <div
          role="status"
          className="absolute top-20 right-3 max-w-xs rounded-md border border-border bg-popover px-3 py-2 text-sm text-muted-foreground"
        >
          <p>
            {mapUnavailable
              ? "Map could not start."
              : "Basemap could not be reached."}{" "}
            Recorded results remain available in the report table.
          </p>
          {fallbackHref ? (
            <a href={fallbackHref} className="mt-1 block underline">
              Open location list and manual setup
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
