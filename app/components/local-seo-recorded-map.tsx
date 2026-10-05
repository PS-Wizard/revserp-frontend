import { LocalSeoMap } from "~/components/local-seo-map"
import {
  gridFeatureCollection,
  samplingRadiusPolygon,
} from "~/lib/local-seo-grid-geo"
import {
  validateLocalSeoCoordinates,
  validateLocalSeoRadiusM,
  type LocalSeoRun,
} from "~/lib/local-seo-api"
import { findLocalSeoCentreCell } from "~/lib/local-seo-directional"

export function LocalSeoRecordedMap({ run }: { run: LocalSeoRun }) {
  const point = findLocalSeoCentreCell(run.cells)
  if (
    !point ||
    validateLocalSeoCoordinates(point.latitude, point.longitude) ||
    validateLocalSeoRadiusM(run.radius_m)
  ) {
    return (
      <p role="alert">
        Recorded map coordinates are unavailable. Use the result table below.
      </p>
    )
  }
  const centre: [number, number] = [point.longitude, point.latitude]
  const overlay = gridFeatureCollection(run.cells, centre, run.radius_m)
  const ring = samplingRadiusPolygon(centre, run.radius_m).coordinates[0]
  const bounds: [[number, number], [number, number]] = [
    [
      Math.min(...ring.map((position) => position[0])),
      Math.min(...ring.map((position) => position[1])),
    ],
    [
      Math.max(...ring.map((position) => position[0])),
      Math.max(...ring.map((position) => position[1])),
    ],
  ]
  return (
    <section
      aria-label="Recorded sampling map"
      className="overflow-hidden rounded-lg border"
    >
      <div className="h-[28rem] w-full">
        <LocalSeoMap
          center={centre}
          radiusM={run.radius_m}
          overlayData={overlay}
          onReady={(map) =>
            map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 })
          }
        />
      </div>
    </section>
  )
}
