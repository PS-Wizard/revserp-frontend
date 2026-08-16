import { RefreshCw } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import type { ProjectGSCSiteResponse } from "~/lib/api.types"

export function GSCHeaderCard({
  isOrganizationOwner,
  selectedGSCSiteURL,
  availableSites,
  selectedSite,
  isRefreshingOverview,
  isSavingGSCProjectSelection,
  overviewErrorMessage,
  gscProjectSelectionErrorMessage,
  onRefreshOverview,
  onSelectedSiteChange,
}: {
  isOrganizationOwner: boolean
  selectedGSCSiteURL: string
  availableSites: ProjectGSCSiteResponse[]
  selectedSite: ProjectGSCSiteResponse | null
  isRefreshingOverview: boolean
  isSavingGSCProjectSelection: boolean
  overviewErrorMessage: string
  gscProjectSelectionErrorMessage: string
  onRefreshOverview: () => void | Promise<void>
  onSelectedSiteChange: (nextSiteURL: string) => void | Promise<void>
}) {
  return (
    <Card className="mx-4 bg-gradient-to-br from-card via-card to-muted/30 sm:mx-6 lg:mx-4">
      <CardHeader className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <CardTitle className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
            Google Search Console
          </CardTitle>
          <CardDescription className="max-w-2xl pt-4 text-base leading-7">
            Switch the connected property here, refresh the latest data, and
            work inside one performance view.
          </CardDescription>
        </div>

        <div className="flex w-full flex-col gap-3 xl:max-w-md">
          {isOrganizationOwner ? (
            <Select
              disabled={isSavingGSCProjectSelection}
              onValueChange={(value) => value && onSelectedSiteChange(value)}
              value={selectedGSCSiteURL}
            >
              <SelectTrigger className="min-h-12 w-full">
                <SelectValue placeholder="Select a Search Console property" />
              </SelectTrigger>
              <SelectContent>
                {availableSites.map((site) => (
                  <SelectItem key={site.site_url} value={site.site_url}>
                    <div className="flex flex-col gap-1 py-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{site.site_url}</span>
                        {site.site_url === selectedSite?.site_url ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                            Connected
                          </span>
                        ) : null}
                      </div>
                      {site.permission_level ? (
                        <span className="text-xs text-muted-foreground">
                          {site.permission_level}
                        </span>
                      ) : null}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-md border border-border bg-background/60 px-4 py-3 text-sm">
              <p className="text-muted-foreground">Connected property</p>
              <p className="pt-1 text-foreground">{selectedSite?.site_url}</p>
            </div>
          )}

          <Button
            disabled={isRefreshingOverview || isSavingGSCProjectSelection}
            onClick={onRefreshOverview}
          >
            <RefreshCw className={isRefreshingOverview ? "animate-spin" : ""} />
            {isRefreshingOverview ? "Refreshing..." : "Refresh data"}
          </Button>
        </div>
      </CardHeader>

      {(isSavingGSCProjectSelection ||
        selectedSite?.permission_level ||
        gscProjectSelectionErrorMessage ||
        overviewErrorMessage) && (
        <CardContent className="space-y-2 text-sm">
          {isSavingGSCProjectSelection ? (
            <p className="text-muted-foreground">
              Switching connected property...
            </p>
          ) : null}
          {selectedSite?.permission_level &&
          !["siteOwner", "siteFullUser"].includes(
            selectedSite.permission_level
          ) ? (
            <p className="text-amber-200">
              This property is visible in Search Console, but Search Analytics
              usually needs Owner or Full User access.
            </p>
          ) : null}
          {gscProjectSelectionErrorMessage ? (
            <p className="text-red-200">{gscProjectSelectionErrorMessage}</p>
          ) : null}
          {overviewErrorMessage ? (
            <p className="text-red-200">{overviewErrorMessage}</p>
          ) : null}
        </CardContent>
      )}
    </Card>
  )
}
