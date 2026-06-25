"use client"

import { memo, useMemo } from "react"

import type { CrawlResponse } from "~/lib/api.types"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  TrendBadge,
  TrendSparkline,
  formatScore,
  getRoundedDelta,
  getTrendLabel,
  getTrendSummary,
} from "~/components/trend-sparkline"

export const SectionCards = memo(function SectionCards({
  crawls,
  currentCrawl,
  previousCrawl,
}: {
  crawls: CrawlResponse[]
  currentCrawl: CrawlResponse | null
  previousCrawl: CrawlResponse | null
}) {
  const cardCrawls = useMemo(() => [...crawls].reverse(), [crawls])
  const cards = useMemo(
    () =>
      [
        {
          label: "Overall Score",
          value: currentCrawl?.overall_score,
          previousValue: previousCrawl?.overall_score,
          series: cardCrawls.map((crawl) => crawl.overall_score),
        },
        {
          label: "SEO Score",
          value: currentCrawl?.seo_score,
          previousValue: previousCrawl?.seo_score,
          series: cardCrawls.map((crawl) => crawl.seo_score),
        },
        {
          label: "AEO Score",
          value: currentCrawl?.aeo_score,
          previousValue: previousCrawl?.aeo_score,
          series: cardCrawls.map((crawl) => crawl.aeo_score),
        },
        {
          label: "PageSpeed Score",
          value: currentCrawl?.pagespeed_score,
          previousValue: previousCrawl?.pagespeed_score,
          series: cardCrawls.map((crawl) => crawl.pagespeed_score),
        },
      ] as const,
    [cardCrawls, currentCrawl, previousCrawl]
  )

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => {
        const delta = getRoundedDelta(card.value, card.previousValue)

        return (
          <Card
            key={card.label}
            className="@container/card border-border/50 bg-gradient-to-br from-card via-card to-muted/30"
          >
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {formatScore(card.value)}
              </CardTitle>
              {delta !== null && <TrendBadge delta={delta} />}
            </CardHeader>
            <CardFooter className="flex items-end justify-between gap-4 text-sm">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="font-medium">{getTrendLabel(delta)}</div>
                <div className="text-muted-foreground">
                  {getTrendSummary(card.previousValue, card.value)}
                </div>
              </div>
              <TrendSparkline values={card.series} trend={delta} />
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
})
