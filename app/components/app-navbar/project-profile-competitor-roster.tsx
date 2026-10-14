"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"

import { Badge } from "~/components/ui/badge"
import { Skeleton } from "~/components/ui/skeleton"
import { useOrganizationEventsListener } from "~/hooks/use-organization-events"
import { clientApiFetch } from "~/lib/api"
import type {
  CompetitorResponse,
  ProjectCompetitorsResponse,
} from "~/lib/api.types"

/** Project profile competitor roster: the project_competitors table is the only roster. */
export function projectProfileCompetitorsQueryKey(projectId: string) {
  return ["project-competitors", projectId] as const
}

/** Save-free roster read. GET only, so viewing the profile can never start a crawl. */
export function fetchProjectProfileCompetitors(projectId: string) {
  return clientApiFetch<ProjectCompetitorsResponse>(
    `/projects/${projectId}/competitors`
  )
}

function competitorDisplayName(competitor: CompetitorResponse) {
  const name = competitor.name.trim()
  if (name) return name
  try {
    return new URL(competitor.seed_url).hostname.replace(/^www\./, "")
  } catch {
    return competitor.seed_url
  }
}

export function ProjectProfileCompetitorRoster({
  projectId,
  onManageInCompetitors,
}: {
  projectId: string
  onManageInCompetitors: () => void
}) {
  const queryClient = useQueryClient()

  // The shared events provider already refreshes the project-competitors
  // prefix on project_competitor.* frames; the setup-completion refresh lives
  // here so initialization-created rows appear without touching shared wiring.
  useOrganizationEventsListener((event) => {
    if (event.project_id !== projectId) return
    if (
      event.type === "project_setup.completed" ||
      event.type.startsWith("project_competitor.")
    ) {
      void queryClient.invalidateQueries({
        queryKey: projectProfileCompetitorsQueryKey(projectId),
      })
    }
  })

  const rosterQuery = useQuery({
    queryKey: projectProfileCompetitorsQueryKey(projectId),
    queryFn: () => fetchProjectProfileCompetitors(projectId),
  })

  const competitors = rosterQuery.data?.competitors ?? []
  const maxCompetitors = rosterQuery.data?.max_competitors ?? null
  const atCap =
    maxCompetitors !== null && competitors.length >= maxCompetitors

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rosterQuery.isLoading
            ? "Loading competitors…"
            : maxCompetitors !== null
              ? `${competitors.length} of ${maxCompetitors}`
              : `${competitors.length}`}
        </p>
        <a
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="#competitors"
          onClick={onManageInCompetitors}
        >
          Manage in Competitors
        </a>
      </div>

      {rosterQuery.isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Loading competitors">
          {[0, 1].map((index) => (
            <Skeleton className="h-14 w-full" key={index} />
          ))}
        </div>
      ) : rosterQuery.isError ? (
        <p className="text-sm text-destructive">
          Unable to load competitors. Manage them in the Competitors tab.
        </p>
      ) : competitors.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No competitors yet. Research and Revbot additions appear here
          automatically.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {competitors.map((competitor) => (
            <li
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5"
              key={competitor.id}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {competitorDisplayName(competitor)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground select-text">
                  {competitor.seed_url}
                </span>
              </span>
              <Badge variant="outline">
                {competitor.crawl ? competitor.crawl.status : "Not crawled"}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {atCap ? (
        <p className="text-xs text-muted-foreground">
          Competitor limit reached. Remove one in the Competitors tab to add
          another.
        </p>
      ) : null}
    </div>
  )
}
