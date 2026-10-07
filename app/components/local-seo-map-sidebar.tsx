import { useState } from "react"
import {
  ChevronRightIcon,
  MapPinIcon,
  MapPinOffIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react"

import {
  isLocalSeoLocationBound,
  type LocalSeoLocation,
  type LocalSeoRun,
} from "~/lib/local-seo-api"
import { Button } from "~/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "~/components/ui/input-group"
import { Skeleton } from "~/components/ui/skeleton"
import { cn } from "~/lib/utils"

export type LocalSeoMapSidebarTab =
  | "overview"
  | "competitors"
  | "queries"
  | "listing"
  | "run"
  | "visibility"

export const LOCAL_SEO_MAP_SIDEBAR_TABS: ReadonlyArray<{
  value: LocalSeoMapSidebarTab
  label: string
}> = [
  { value: "overview", label: "Overview" },
  { value: "competitors", label: "Competitors" },
  { value: "queries", label: "Queries" },
  { value: "listing", label: "Listing" },
  { value: "run", label: "Run" },
  { value: "visibility", label: "AI" },
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

export function filterLocalSeoSidebarLocations(
  locations: LocalSeoLocation[],
  query: string
): LocalSeoLocation[] {
  const needle = query.trim().toLowerCase()
  if (needle === "") return locations
  return locations.filter((location) =>
    [location.name, location.address, location.locality].some((field) =>
      field.toLowerCase().includes(needle)
    )
  )
}

export type LocalSeoMapSidebarProps = {
  collapsed: boolean
  locations: LocalSeoLocation[]
  runByLocation: Map<string, LocalSeoRun | null>
  selectedId: string | null
  locationsPending: boolean
  locationsError: string | null
  onSelectLocation: (location: LocalSeoLocation) => void
  onAddLocation: () => void
  onToggleCollapsed: () => void
  className?: string
}

export function LocalSeoMapSidebar({
  collapsed,
  locations,
  runByLocation,
  selectedId,
  locationsPending,
  locationsError,
  onSelectLocation,
  onAddLocation,
  onToggleCollapsed,
  className,
}: LocalSeoMapSidebarProps) {
  const [query, setQuery] = useState("")
  const filteredLocations = filterLocalSeoSidebarLocations(locations, query)

  return (
    <aside
      id="local-seo-map-sidebar"
      aria-label="Locations"
      className={cn(
        "pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg",
        collapsed ? "w-11 self-start" : "min-h-0 w-[clamp(18rem,22vw,22rem)]",
        className
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
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
            <h2 className="text-sm font-medium">Locations</h2>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-controls="local-seo-map-sidebar"
              aria-expanded={true}
              aria-label="Collapse locations"
              className="ml-auto"
              onClick={onToggleCollapsed}
            >
              <PanelLeftCloseIcon aria-hidden="true" />
            </Button>
          </header>

          <div className="shrink-0 px-4 py-3">
            <InputGroup className="shadow-none">
              <InputGroupAddon align="inline-start">
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={query}
                autoComplete="off"
                placeholder="Search saved locations"
                aria-label="Search saved locations"
                onChange={(event) => setQuery(event.target.value)}
              />
            </InputGroup>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {locationsPending ? (
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : locationsError ? (
              <p
                role="alert"
                className="m-4 rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive"
              >
                {locationsError}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {filteredLocations.map((location) => {
                  const run = runByLocation.get(location.id) ?? null
                  const row = describeLocalSeoSidebarRow(location, run)
                  const selected = location.id === selectedId
                  return (
                    <li key={location.id}>
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        onClick={() => onSelectLocation(location)}
                        className={cn(
                          "group relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                          selected && "bg-muted"
                        )}
                      >
                        {selected ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-0.5 bg-primary"
                          />
                        ) : null}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg",
                            row.bound
                              ? "bg-muted text-muted-foreground"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-500"
                          )}
                        >
                          {row.bound ? (
                            <MapPinIcon className="size-4" />
                          ) : (
                            <PinIcon className="size-4" />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            {location.name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground tabular-nums">
                            {row.bound && run
                              ? `${row.label} · ${describeLocalSeoRadiusLabel(run.radius_m)}`
                              : row.label}
                          </span>
                        </span>
                        <ChevronRightIcon
                          aria-hidden="true"
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
                            selected ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {!locationsPending &&
            !locationsError &&
            filteredLocations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                {locations.length === 0 ? (
                  <MapPinOffIcon
                    aria-hidden="true"
                    className="size-6 text-muted-foreground/60"
                  />
                ) : (
                  <SearchXIcon
                    aria-hidden="true"
                    className="size-6 text-muted-foreground/60"
                  />
                )}
                <p className="max-w-[18rem] text-xs text-muted-foreground">
                  {locations.length === 0
                    ? "No locations yet. Use New location to drop a pin on the map."
                    : "No saved locations match this search."}
                </p>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onAddLocation}
            className="flex w-full shrink-0 items-center gap-3 border-t border-border/60 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            >
              <PlusIcon className="size-4" />
            </span>
            New location
          </button>
        </>
      )}
    </aside>
  )
}
