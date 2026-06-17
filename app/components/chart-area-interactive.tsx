"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import type { CrawlResponse } from "~/lib/api.types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart"

const chartConfig = {
  overall: {
    label: "Overall",
    color: "var(--chart-1)",
  },
  seo: {
    label: "SEO",
    color: "var(--chart-2)",
  },
  aeo: {
    label: "AEO",
    color: "var(--chart-3)",
  },
  pagespeed: {
    label: "PageSpeed",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

export function ChartAreaInteractive({
  activeProjectName,
  crawls,
}: {
  activeProjectName?: string
  crawls: CrawlResponse[]
}) {
  const chartData = [...crawls]
    .sort((left, right) => getCrawlTimestamp(left) - getCrawlTimestamp(right))
    .map((crawl) => {
      const timestamp = crawl.completed_at ?? crawl.created_at

      return {
        timestamp,
        overall: crawl.overall_score ?? null,
        seo: crawl.seo_score ?? null,
        aeo: crawl.aeo_score ?? null,
        pagespeed: crawl.pagespeed_score ?? null,
      }
    })

  return (
    <Card className="@container/card border-border/50 bg-gradient-to-br from-card via-card to-muted/30">
      <CardHeader>
        <CardTitle>Score History</CardTitle>
        <CardDescription>
          {activeProjectName
            ? `Recent completed crawls for ${activeProjectName}`
            : "Recent completed crawls"}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {chartData.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No completed crawl history yet.
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="fill-overall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fill-seo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fill-aeo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fill-pagespeed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-4)" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="var(--chart-4)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatAxisDateTime}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis
                axisLine={false}
                domain={[0, 100]}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
                width={44}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value, name) => (
                      <>
                        <span className="text-muted-foreground">{name}</span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {typeof value === "number" ? `${Math.round(value)}%` : String(value)}
                        </span>
                      </>
                    )}
                    labelFormatter={(value) => formatTooltipDateTime(String(value))}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                dataKey="overall"
                fill="url(#fill-overall)"
                stroke="var(--chart-1)"
                type="monotone"
              />
              <Area
                dataKey="seo"
                fill="url(#fill-seo)"
                stroke="var(--chart-2)"
                type="monotone"
              />
              <Area
                dataKey="aeo"
                fill="url(#fill-aeo)"
                stroke="var(--chart-3)"
                type="monotone"
              />
              <Area
                dataKey="pagespeed"
                fill="url(#fill-pagespeed)"
                stroke="var(--chart-4)"
                type="monotone"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function formatAxisDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatTooltipDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function getCrawlTimestamp(crawl: CrawlResponse) {
  return new Date(crawl.completed_at ?? crawl.created_at).getTime()
}
