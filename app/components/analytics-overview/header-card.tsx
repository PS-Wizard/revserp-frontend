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
import type { ProjectAnalyticsPropertyResponse } from "~/lib/api.types"

export function AnalyticsHeaderCard({
  properties,
  selectedProperty,
  selectedPropertyId,
  accountEmail,
  accountName,
  activeNow,
  isOwner,
  isRefreshing,
  isSaving,
  errorMessage,
  onPropertyChange,
  onRefresh,
}: {
  properties: ProjectAnalyticsPropertyResponse[]
  selectedProperty: ProjectAnalyticsPropertyResponse | null
  selectedPropertyId: string
  accountEmail?: string
  accountName?: string
  activeNow?: number
  isOwner: boolean
  isRefreshing: boolean
  isSaving: boolean
  errorMessage: string
  onPropertyChange: (value: string) => void | Promise<void>
  onRefresh: () => void | Promise<void>
}) {
  return (
    <Card className="mx-4 bg-gradient-to-br from-card via-card to-muted/30 sm:mx-6 lg:mx-4">
      <CardHeader className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <CardTitle className="text-4xl font-medium tracking-[-0.06em] sm:text-5xl">
            Google Analytics
          </CardTitle>
          <CardDescription className="flex max-w-2xl flex-wrap items-center gap-3 pt-4 text-base leading-7">
            <span>
              {accountName || accountEmail
                ? `${accountName ?? "Google account"}${accountEmail ? ` · ${accountEmail}` : ""}`
                : "Review traffic and engagement for the connected property."}
            </span>
            {activeNow != null ? (
              <span
                className="text-sm text-muted-foreground"
                title="Users with at least one event in the last 30 minutes. Updates every 60 seconds."
              >
                Active now{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {activeNow.toLocaleString()}
                </span>
              </span>
            ) : null}
          </CardDescription>
        </div>
        <div className="flex w-full flex-col gap-3 xl:max-w-md">
          {isOwner ? (
            <Select
              disabled={isSaving}
              onValueChange={(value) => value && onPropertyChange(value)}
              value={selectedPropertyId}
            >
              <SelectTrigger className="min-h-12 w-full">
                <SelectValue placeholder="Select a Google Analytics property">
                  {(value) =>
                    properties.find(
                      (property) => property.property_id === value
                    )?.display_name ?? value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem
                    key={property.property_id}
                    value={property.property_id}
                  >
                    <div className="flex flex-col gap-1 py-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate">
                          {property.display_name}
                        </span>
                        {property.property_id ===
                        selectedProperty?.property_id ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                            Connected
                          </span>
                        ) : null}
                      </div>
                      {property.account_display_name ? (
                        <span className="text-xs text-muted-foreground">
                          {property.account_display_name}
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
              <p className="pt-1 text-foreground">
                {selectedProperty?.display_name}
              </p>
            </div>
          )}
          <Button disabled={isRefreshing || isSaving} onClick={onRefresh}>
            <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Refreshing..." : "Refresh data"}
          </Button>
        </div>
      </CardHeader>
      {isSaving || errorMessage ? (
        <CardContent className="space-y-2 text-sm">
          {isSaving ? (
            <p className="text-muted-foreground">
              Switching connected property...
            </p>
          ) : null}
          {errorMessage ? <p className="text-red-200">{errorMessage}</p> : null}
        </CardContent>
      ) : null}
    </Card>
  )
}
