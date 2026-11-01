import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { TriangleAlertIcon } from "lucide-react"

import { formatCrawlDateTime } from "~/components/app-navbar/utils"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog"
import { Skeleton } from "~/components/ui/skeleton"
import { clientApiFetch } from "~/lib/api"
import type { CrawlDetailsResponse, CrawlResponse } from "~/lib/api.types"
import { formatCrawlDuration } from "~/lib/crawl"
import { CRAWL_DETAILS_EVENT } from "~/lib/crawl-details-events"
import { cn } from "~/lib/utils"

const numberFormat = new Intl.NumberFormat()

type StatusClass = "2xx" | "3xx" | "4xx" | "5xx" | "none"

const STATUS_CLASS_STYLE: Record<StatusClass, { dot: string; bar: string }> = {
  "2xx": { dot: "bg-emerald-400", bar: "bg-emerald-400/80" },
  "3xx": { dot: "bg-sky-400", bar: "bg-sky-400/80" },
  "4xx": { dot: "bg-amber-400", bar: "bg-amber-400/80" },
  "5xx": { dot: "bg-rose-400", bar: "bg-rose-400/80" },
  none: { dot: "bg-muted-foreground", bar: "bg-muted-foreground/60" },
}

function statusClass(code: number | null): StatusClass {
  if (code === null) return "none"
  if (code >= 500) return "5xx"
  if (code >= 400) return "4xx"
  if (code >= 300) return "3xx"
  return "2xx"
}

/** Mounted once in the shell; opens for whichever crawl requestCrawlDetails names. */
export function CrawlDetailsDialogHost() {
  const [crawl, setCrawl] = useState<CrawlResponse | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handle = (event: Event) => {
      setCrawl((event as CustomEvent<CrawlResponse>).detail)
      setOpen(true)
    }
    window.addEventListener(CRAWL_DETAILS_EVENT, handle)
    return () => window.removeEventListener(CRAWL_DETAILS_EVENT, handle)
  }, [])

  if (!crawl) return null
  return <CrawlDetailsDialog crawl={crawl} onOpenChange={setOpen} open={open} />
}

function CrawlDetailsDialog({
  crawl,
  open,
  onOpenChange,
}: {
  crawl: CrawlResponse
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const query = useQuery({
    queryKey: ["crawl-details", crawl.id],
    queryFn: () =>
      clientApiFetch<CrawlDetailsResponse>(`/crawls/${crawl.id}/details`),
    enabled: open,
    staleTime: 60_000,
  })
  const details = query.data

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[min(720px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <header className="flex flex-col gap-1.5 border-b border-border/60 px-6 pt-6 pb-5">
          <div className="flex items-center gap-2.5 pr-8">
            <DialogTitle className="text-lg">Crawl details</DialogTitle>
            <Badge className="uppercase" variant="outline">
              {crawl.status}
            </Badge>
          </div>
          <DialogDescription>{formatCrawlDateTime(crawl)}</DialogDescription>
        </header>

        <div className="flex min-h-0 flex-col gap-7 overflow-y-auto px-6 py-6">
          <CrawlNotice crawl={crawl} failedTotal={details?.failed_pages.total} />
          <SummaryGrid crawl={crawl} />

          {query.isError ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
              <span>Couldn&apos;t load crawl details.</span>
              <Button
                onClick={() => void query.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <Section title="Status codes">
                <StatusCodes details={details} />
              </Section>
              <Section title="Links">
                <LinkStats details={details} />
              </Section>
              <Section
                aside={
                  details && details.failed_pages.total > 0
                    ? numberFormat.format(details.failed_pages.total)
                    : undefined
                }
                title="Failed URLs"
              >
                <FailedPages details={details} />
              </Section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CrawlNotice({
  crawl,
  failedTotal,
}: {
  crawl: CrawlResponse
  failedTotal?: number
}) {
  let message: string | null = null
  if (crawl.status === "failed") {
    message = "This crawl failed before it finished. Results may be incomplete."
  } else if (crawl.status === "cancelled") {
    message = "This crawl was cancelled. Results cover only the pages crawled before it stopped."
  } else if (crawl.status === "completed" && failedTotal && failedTotal > 0) {
    message = `Completed with ${numberFormat.format(failedTotal)} ${failedTotal === 1 ? "URL" : "URLs"} that could not be crawled. They are listed below.`
  }
  if (!message) return null

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-400" />
      <span>{message}</span>
    </div>
  )
}

function SummaryGrid({ crawl }: { crawl: CrawlResponse }) {
  const crawled = crawl.page_count ?? crawl.urls_crawled
  const stats = [
    { label: "Duration", value: formatCrawlDuration(crawl) ?? "—" },
    { label: "Pages crawled", value: numberFormat.format(crawled) },
    { label: "Discovered", value: numberFormat.format(crawl.urls_discovered) },
    {
      label: "Overall score",
      value: crawl.overall_score === undefined ? "—" : `${crawl.overall_score}/100`,
    },
  ]

  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-border/60 bg-muted/20 sm:grid-cols-4">
      {stats.map((stat, index) => (
        <div
          className={cn(
            "flex flex-col gap-1.5 px-4 py-3.5",
            index % 2 === 1 && "border-l border-border/60",
            index >= 2 && "border-t border-border/60 sm:border-t-0",
            index === 2 && "sm:border-l"
          )}
          key={stat.label}
        >
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="font-mono text-lg leading-none font-medium tabular-nums">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Section({
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
        {aside ? (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function StatusCodes({ details }: { details?: CrawlDetailsResponse }) {
  if (!details) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
    )
  }

  const total = details.status_codes.reduce((sum, entry) => sum + entry.count, 0)
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No pages were stored for this crawl.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {details.status_codes.map((entry) => (
          <span
            className={STATUS_CLASS_STYLE[statusClass(entry.code)].bar}
            key={entry.code ?? "none"}
            style={{ width: `${(entry.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {details.status_codes.map((entry) => (
          <span
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1 text-xs"
            key={entry.code ?? "none"}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                STATUS_CLASS_STYLE[statusClass(entry.code)].dot
              )}
            />
            <span className="font-mono tabular-nums">{entry.code ?? "No response"}</span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {numberFormat.format(entry.count)}
            </span>
          </span>
        ))}
      </div>
      {details.soft_404_count > 0 ? (
        <p className="text-xs text-muted-foreground">
          {numberFormat.format(details.soft_404_count)}{" "}
          {details.soft_404_count === 1 ? "page returns" : "pages return"} 200 but
          {details.soft_404_count === 1 ? " looks" : " look"} like a “not found” page (soft 404).
        </p>
      ) : null}
    </div>
  )
}

function LinkStats({ details }: { details?: CrawlDetailsResponse }) {
  const links = details?.links
  const rows = [
    { label: "Internal links", hint: "Links between your pages", value: links?.internal },
    { label: "Outbound links", hint: "Links to other sites", value: links?.external },
    { label: "External domains", hint: "Sites you link to", value: links?.unique_external_domains },
    { label: "Nofollow links", hint: "Marked rel=nofollow", value: links?.nofollow },
    {
      label: "Broken internal links",
      hint: "Point to a page that returns 4xx or 5xx",
      value: links?.broken_internal,
      alert: (links?.broken_internal ?? 0) > 0,
    },
  ]

  return (
    <dl className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/20 text-sm">
      {rows.map((row) => (
        <div className="flex items-center justify-between gap-4 px-4 py-3" key={row.label}>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt>{row.label}</dt>
            <span className="text-xs text-muted-foreground">{row.hint}</span>
          </div>
          <dd
            className={cn(
              "font-mono font-medium tabular-nums",
              row.alert && "text-rose-400"
            )}
          >
            {row.value === undefined ? (
              <Skeleton className="h-4 w-10" />
            ) : (
              numberFormat.format(row.value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function FailedPages({ details }: { details?: CrawlDetailsResponse }) {
  if (!details) {
    return <Skeleton className="h-24 w-full rounded-xl" />
  }

  const { items, total } = details.failed_pages
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Every crawled URL responded successfully.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/20">
        {items.map((item) => (
          <li className="flex items-start gap-3 px-4 py-3" key={item.url}>
            <span
              className={cn(
                "mt-0.5 flex shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-1.5 py-0.5 font-mono text-xs tabular-nums"
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  STATUS_CLASS_STYLE[statusClass(item.status_code)].dot
                )}
              />
              {item.status_code ?? "—"}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <a
                className="truncate text-sm hover:underline"
                href={item.url}
                rel="noreferrer"
                target="_blank"
                title={item.url}
              >
                {item.url}
              </a>
              <span className="text-xs break-words text-muted-foreground">
                {item.reason ??
                  (item.status_code === null
                    ? "No response from the server."
                    : `The server returned HTTP ${item.status_code}.`)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {total > items.length ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {numberFormat.format(items.length)} of{" "}
          {numberFormat.format(total)}. Export the crawl to see all of them.
        </p>
      ) : null}
    </div>
  )
}
