import type { ReactNode, RefObject } from "react"
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from "lucide-react"

import {
  isLocalSeoLocationBound,
  type LocalSeoLocation,
  type LocalSeoRun,
} from "~/lib/local-seo-api"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"

export type LocalSeoMapSidebarTab = "overview" | "queries" | "listing" | "run"

export const LOCAL_SEO_MAP_SIDEBAR_TABS: ReadonlyArray<{
  value: LocalSeoMapSidebarTab
  label: string
}> = [
  { value: "overview", label: "Overview" },
  { value: "queries", label: "Queries" },
  { value: "listing", label: "Listing" },
  { value: "run", label: "Run" },
]

export function describeLocalSeoRadiusLabel(radiusM: number): string {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return "Radius not set"
  const km = radiusM / 1000
  const value = Number.isInteger(km) ? String(km) : km.toFixed(1)
  return `${value} km radius`
}

export function describeLocalSeoSidebarRow(
  location: LocalSeoLocation,
  run: LocalSeoRun | null
): { label: string; bound: boolean } {
  if (!isLocalSeoLocationBound(location)) {
    return {
      label: "Unresolved search area, not a business location",
      bound: false,
    }
  }
  if (run === null) return { label: "No runs yet", bound: true }
  switch (run.status) {
    case "queued":
      return { label: "Run queued", bound: true }
    case "running":
      return { label: "Run running", bound: true }
    case "completed":
      return { label: "Run completed", bound: true }
    case "partial":
      return { label: "Run partial", bound: true }
    case "failed":
      return { label: "Run failed", bound: true }
  }
}

export type LocalSeoMapSidebarProps = {
  collapsed: boolean
  locations: LocalSeoLocation[]
  runByLocation: Map<string, LocalSeoRun | null>
  selectedId: string | null
  selectedRadiusM: number
  searchActive: boolean
  locationsPending: boolean
  locationsError: string | null
  onSelectLocation: (location: LocalSeoLocation) => void
  onAddLocation: () => void
  onToggleCollapsed: () => void
  panelRef?: RefObject<HTMLElement | null>
  searchForm?: ReactNode
  children?: ReactNode
}

export function LocalSeoMapSidebar({
  collapsed,
  locations,
  runByLocation,
  selectedId,
  selectedRadiusM,
  searchActive,
  locationsPending,
  locationsError,
  onSelectLocation,
  onAddLocation,
  onToggleCollapsed,
  panelRef,
  searchForm,
  children,
}: LocalSeoMapSidebarProps) {
  const selectedLocation =
    locations.find((location) => location.id === selectedId) ?? null
  const selectedBound = selectedLocation
    ? isLocalSeoLocationBound(selectedLocation)
    : false

  return (
    <aside
      ref={panelRef}
      id="local-seo-map-sidebar"
      aria-label="Locations"
      className={cn(
        "absolute top-[13px] left-3 z-20 flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg",
        collapsed
          ? "w-11"
          : "bottom-3 w-[clamp(15rem,60vw,21.25rem)] xl:w-[23.75rem]"
      )}
    >
      {collapsed ? (
        <div className="flex items-center justify-center p-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-controls="local-seo-map-sidebar"
            aria-expanded={false}
            aria-label="Expand locations panel"
            onClick={onToggleCollapsed}
          >
            <PanelLeftOpenIcon aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <>
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <h2 className="text-sm font-medium">Locations</h2>
            <div className="ml-auto flex items-center gap-1">
              {searchActive ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onAddLocation}
                >
                  <PlusIcon aria-hidden="true" data-icon="inline-start" />
                  Add location
                </Button>
              )}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-controls="local-seo-map-sidebar"
                aria-expanded={true}
                aria-label="Collapse locations"
                onClick={onToggleCollapsed}
              >
                <PanelLeftCloseIcon aria-hidden="true" />
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {locationsPending ? (
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : locationsError ? (
              <p
                role="alert"
                className="m-4 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive"
              >
                {locationsError}
              </p>
            ) : searchActive ? (
              <div className="p-4">{searchForm}</div>
            ) : (
              <ul className="flex flex-col">
                {locations.map((location) => {
                  const row = describeLocalSeoSidebarRow(
                    location,
                    runByLocation.get(location.id) ?? null
                  )
                  const selected = location.id === selectedId
                  return (
                    <li key={location.id}>
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        onClick={() => onSelectLocation(location)}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 border-b border-border/60 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                          selected && "bg-muted/60"
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              row.bound
                                ? "bg-emerald-500"
                                : "border border-dashed border-amber-500"
                            )}
                          />
                          {location.name}
                        </span>
                        <span
                          className={cn(
                            "pl-4 text-xs",
                            row.bound
                              ? "text-muted-foreground"
                              : "text-amber-600 dark:text-amber-500"
                          )}
                        >
                          {row.label}
                        </span>
                      </button>
                    </li>
                  )
                })}
                {locations.length === 0 ? (
                  <li className="px-4 py-6 text-sm text-muted-foreground">
                    No locations yet. Add one to drop a pin on the map.
                  </li>
                ) : null}
              </ul>
            )}

            {!searchActive && selectedBound && selectedLocation ? (
              <section
                aria-label={`${selectedLocation.name} details`}
                className="flex flex-col gap-3 border-t border-border p-4"
              >
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-medium">
                    {selectedLocation.name}
                  </h3>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {describeLocalSeoRadiusLabel(selectedRadiusM)}
                  </p>
                </div>
                {children}
              </section>
            ) : null}
          </div>
        </>
      )}
    </aside>
  )
}
