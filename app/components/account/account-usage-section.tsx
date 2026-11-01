import { useQuery } from "@tanstack/react-query"
import { TriangleAlertIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Progress } from "~/components/ui/progress"
import { Skeleton } from "~/components/ui/skeleton"
import { clientApiFetch } from "~/lib/api"
import type { MeUsageMeter, MeUsageResponse } from "~/lib/api.types"
import { cn } from "~/lib/utils"

export const meUsageQueryKey = ["me", "usage"] as const

const numberFormat = new Intl.NumberFormat()

function formatResetDate(periodEnd: string) {
  // period_end is a UTC date; format it in UTC so it never shifts a day.
  return new Date(`${periodEnd}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function AccountUsageSection() {
  const query = useQuery({
    queryKey: meUsageQueryKey,
    queryFn: () => clientApiFetch<MeUsageResponse>("/me/usage"),
    staleTime: 30_000,
  })

  if (query.isError) {
    return (
      <Empty className="border-0 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load usage</EmptyTitle>
          <EmptyDescription>Try again in a moment.</EmptyDescription>
        </EmptyHeader>
        <Button
          onClick={() => void query.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          Try again
        </Button>
      </Empty>
    )
  }

  const usage = query.data

  return (
    <div className="flex flex-col gap-8">
      <UsageGroup
        aside={usage ? `Resets ${formatResetDate(usage.period_end)}` : undefined}
        title="This month"
      >
        <MeterRow label="AI messages" meter={usage?.ai_messages} />
        <MeterRow label="AI visibility audits" meter={usage?.ai_visibility_audits} />
      </UsageGroup>

      <UsageGroup title="Workspace">
        <MeterRow label="Projects" meter={usage?.projects} />
        <StatRow
          label="Competitors per project"
          value={usage ? numberFormat.format(usage.max_competitors_per_project) : null}
        />
      </UsageGroup>

      <UsageGroup title="Maps credits">
        <MapsCredits credits={usage?.maps_credits} />
      </UsageGroup>
    </div>
  )
}

function UsageGroup({
  title,
  aside,
  children,
}: {
  title: string
  aside?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
      </div>
      <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/20">
        {children}
      </div>
    </section>
  )
}

function MeterRow({ label, meter }: { label: string; meter?: MeUsageMeter }) {
  if (!meter) {
    return (
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-1.5 w-full" />
      </div>
    )
  }

  const included = meter.limit > 0
  const ratio = included ? Math.min(meter.used / meter.limit, 1) : 0
  const tone = ratio >= 1 ? "full" : ratio >= 0.8 ? "high" : "ok"

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        {included ? (
          <span className="font-mono text-xs tabular-nums">
            <span
              className={cn(
                "text-sm font-medium",
                tone === "high" && "text-amber-400",
                tone === "full" && "text-rose-400"
              )}
            >
              {numberFormat.format(meter.used)}
            </span>
            <span className="text-muted-foreground"> / {numberFormat.format(meter.limit)}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not included</span>
        )}
      </div>
      {included ? (
        <Progress
          aria-label={label}
          className={cn(
            tone === "high" && "[&_[data-slot=progress-indicator]]:bg-amber-400",
            tone === "full" && "[&_[data-slot=progress-indicator]]:bg-rose-400"
          )}
          value={ratio * 100}
        />
      ) : null}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
      <span>{label}</span>
      {value === null ? (
        <Skeleton className="h-4 w-8" />
      ) : (
        <span className="font-mono text-sm font-medium tabular-nums">{value}</span>
      )}
    </div>
  )
}

function MapsCredits({ credits }: { credits?: MeUsageResponse["maps_credits"] }) {
  if (!credits) {
    return (
      <div className="flex flex-col gap-2 px-4 py-4">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-4">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-2xl leading-none font-medium tabular-nums">
          {numberFormat.format(credits.remaining)}
        </span>
        <span className="text-xs text-muted-foreground">credits remaining</span>
      </div>
      <dl className="flex gap-6 text-xs">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Spent</dt>
          <dd className="font-mono text-sm tabular-nums">{numberFormat.format(credits.spent)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Reserved</dt>
          <dd className="font-mono text-sm tabular-nums">{numberFormat.format(credits.reserved)}</dd>
        </div>
      </dl>
    </div>
  )
}
