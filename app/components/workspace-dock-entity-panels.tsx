import type { ReactNode } from "react"
import { MapPinIcon, SwordsIcon } from "lucide-react"

import { HoverPill, useKeyedHoverPill } from "~/components/ui/hover-pill"
import { NavigationMenuLink } from "~/components/ui/navigation-menu"
import type { CompetitorResponse } from "~/lib/api.types"
import type { LocalSeoLocation } from "~/lib/local-seo-api"
import { cn } from "~/lib/utils"

const ICON_BOX =
  "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-foreground/[0.07] to-foreground/[0.03] text-muted-foreground ring-1 ring-border ring-inset dark:from-white/10 dark:to-white/[0.03] dark:ring-white/[0.06]"

type EntityRow = {
  key: string
  label: string
  detail?: string
  leading: ReactNode
  onSelect: () => void
}

/** Dock menu rows for live records (competitors, locations), styled like the tab panels. */
function EntityPanel({ rows }: { rows: EntityRow[] }) {
  const { clearPill, pill, setItemRef, showPill } = useKeyedHoverPill()
  const columns = rows.length > 5 ? 2 : 1

  return (
    <ul
      className="relative grid max-h-80 gap-0.5 overflow-y-auto"
      onMouseLeave={clearPill}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      <HoverPill className="rounded-lg" pill={pill} />
      {rows.map((row, index) => (
        <li className={cn(index === 0 && "col-span-full")} key={row.key}>
          <NavigationMenuLink
            className="relative z-10 h-auto cursor-pointer items-center gap-2.5 bg-transparent p-2 text-foreground/80 hover:bg-transparent hover:text-foreground focus:bg-transparent"
            onClick={row.onSelect}
            onMouseEnter={() => showPill(row.key)}
            ref={setItemRef(row.key)}
          >
            {row.leading}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {row.label}
              </span>
              {row.detail ? (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {row.detail}
                </span>
              ) : null}
            </span>
          </NavigationMenuLink>
        </li>
      ))}
    </ul>
  )
}

function initialBox(name: string) {
  return (
    <span className={cn(ICON_BOX, "text-sm font-semibold")}>
      {name.slice(0, 1).toUpperCase() || "?"}
    </span>
  )
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function competitorDetail(competitor: CompetitorResponse) {
  const host = hostOf(competitor.seed_url)
  const status = competitor.crawl?.status
  if (status === "queued" || status === "running") return `${host} · Crawling…`
  if (status === "failed") return `${host} · Crawl failed`
  if (!competitor.crawl) return `${host} · Not crawled yet`
  return host
}

export function CompetitorsDockPanel({
  competitors,
  onOpenAll,
  onOpenCompetitor,
}: {
  competitors: CompetitorResponse[]
  onOpenAll: () => void
  onOpenCompetitor: (competitorId: string) => void
}) {
  return (
    <EntityPanel
      rows={[
        {
          key: "__all__",
          label: "All competitors",
          detail: "Compare your crawl set against other sites.",
          leading: (
            <span className={ICON_BOX}>
              <SwordsIcon aria-hidden="true" className="size-4" />
            </span>
          ),
          onSelect: onOpenAll,
        },
        ...competitors.map((competitor) => {
          const label = competitor.name.trim() || hostOf(competitor.seed_url)
          return {
            key: competitor.id,
            label,
            detail: competitorDetail(competitor),
            leading: initialBox(label),
            onSelect: () => onOpenCompetitor(competitor.id),
          }
        }),
      ]}
    />
  )
}

export function LocationsDockPanel({
  locations,
  onOpenAll,
  onOpenLocation,
}: {
  locations: LocalSeoLocation[]
  onOpenAll: () => void
  onOpenLocation: (locationId: string) => void
}) {
  return (
    <EntityPanel
      rows={[
        {
          key: "__all__",
          label: "All locations",
          detail: "Physical locations for grid sampling.",
          leading: (
            <span className={ICON_BOX}>
              <MapPinIcon aria-hidden="true" className="size-4" />
            </span>
          ),
          onSelect: onOpenAll,
        },
        ...locations.map((location) => ({
          key: location.id,
          label: location.name,
          detail: location.address || location.locality || undefined,
          leading: initialBox(location.name),
          onSelect: () => onOpenLocation(location.id),
        })),
      ]}
    />
  )
}
