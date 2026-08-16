"use client"

import { memo, useCallback, useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircleIcon, PlayIcon, RefreshCwIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Separator } from "~/components/ui/separator"
import { ApiError, clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  AIAuditListResponse,
  AIAuditResponse,
  AIAuditRunResponse,
  CrawlResponse,
  ProjectResponse,
} from "~/lib/api.types"

type Props = {
  activeProject: ProjectResponse | null
  currentCrawl: CrawlResponse | null
}

function auditListQueryKey(projectId: string) {
  return ["ai-audits-list", projectId] as const
}

function auditDetailQueryKey(auditId: string) {
  return ["ai-audit", auditId] as const
}

function formatModelName(slug: string): string {
  const afterSlash = slug.split("/").pop() ?? slug
  return afterSlash.replace(/:[^:]+$/, "")
}

// Small colored rank pill — no # prefix, just the number
function RankPill({ mentioned, rank }: { mentioned?: boolean; rank?: number }) {
  if (!mentioned) {
    return <span className="text-sm text-muted-foreground/40">—</span>
  }
  if (!rank || rank === 0) {
    return (
      <span
        title="Mentioned but not ranked"
        className="text-xs text-muted-foreground"
      >
        ~
      </span>
    )
  }

  let colorClass = "bg-orange-400/20 text-orange-400"
  if (rank === 1) colorClass = "bg-emerald-500 text-white"
  else if (rank <= 3) colorClass = "bg-emerald-400/30 text-emerald-400"
  else if (rank <= 6) colorClass = "bg-amber-500/20 text-amber-500"

  return (
    <span
      className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${colorClass}`}
    >
      {rank}
    </span>
  )
}

function SkeletonCell() {
  return (
    <div className="flex items-center justify-center p-3">
      <div className="h-5 w-8 animate-pulse rounded-full bg-muted" />
    </div>
  )
}

function ResultCell({ run }: { run: AIAuditRunResponse }) {
  if (run.status === "failed") {
    return (
      <div className="flex items-center justify-center p-3">
        <span className="text-xs text-destructive" title={run.error_message}>
          Error
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center p-3">
      <RankPill mentioned={run.mentioned_target} rank={run.target_rank} />
    </div>
  )
}

function SummaryCards({ runs }: { runs: AIAuditRunResponse[] }) {
  const successRuns = runs.filter((r) => r.status === "success")
  const mentionedRuns = successRuns.filter((r) => r.mentioned_target)
  const total = successRuns.length
  const mentioned = mentionedRuns.length
  const rate = total > 0 ? Math.round((mentioned / total) * 100) : 0

  const rankedRuns = mentionedRuns.filter(
    (r) => r.target_rank !== undefined && r.target_rank > 0
  )
  const avgRank =
    rankedRuns.length > 0
      ? Math.round(
          rankedRuns.reduce((s, r) => s + (r.target_rank ?? 0), 0) /
            rankedRuns.length
        )
      : null

  const modelMentions: Record<string, number> = {}
  for (const r of mentionedRuns) {
    modelMentions[r.model_name] = (modelMentions[r.model_name] ?? 0) + 1
  }
  const topModel = Object.entries(modelMentions).sort(
    ([, a], [, b]) => b - a
  )[0]

  return (
    <div className="grid gap-4 px-4 lg:grid-cols-4 lg:px-6">
      <Card className="@container/card bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader className="pb-2">
          <CardDescription>Visibility Rate</CardDescription>
          <CardTitle className="text-3xl font-bold tabular-nums">
            {rate}%
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Across all questions and models
          </p>
        </CardContent>
      </Card>

      <Card className="@container/card bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader className="pb-2">
          <CardDescription>Total Mentions</CardDescription>
          <CardTitle className="text-3xl font-bold tabular-nums">
            {mentioned}
            <span className="text-lg font-normal text-muted-foreground">
              /{total}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Question × model combinations
          </p>
        </CardContent>
      </Card>

      <Card className="@container/card bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader className="pb-2">
          <CardDescription>Average Rank</CardDescription>
          <CardTitle className="text-3xl font-bold tabular-nums">
            {avgRank !== null ? `#${avgRank}` : "—"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Where your brand was listed
          </p>
        </CardContent>
      </Card>

      <Card className="@container/card bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader className="pb-2">
          <CardDescription>Top Model</CardDescription>
          <CardTitle className="truncate text-xl font-bold">
            {topModel ? formatModelName(topModel[0]) : "—"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {topModel
              ? `${topModel[1]} mention${topModel[1] !== 1 ? "s" : ""}`
              : "No mentions yet"}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

const numberedLineRe = /^\s*(\d+)[.)]\s+(.+)$/

// Render a model's raw response as a clean ranked list, highlighting the
// list item that matches the target's computed rank.
function ResponseBody({ run }: { run: AIAuditRunResponse }) {
  if (run.status === "failed") {
    return (
      <p className="text-sm text-destructive">
        {run.error_message ?? "Request failed"}
      </p>
    )
  }

  const raw = run.raw_response ?? ""
  const items: { num: number; text: string }[] = []
  for (const line of raw.split("\n")) {
    const m = line.match(numberedLineRe)
    if (m) items.push({ num: Number(m[1]), text: m[2].trim() })
  }

  const highlightRank =
    run.mentioned_target && run.target_rank ? run.target_rank : 0

  if (items.length === 0) {
    return (
      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
        {raw || "No response."}
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-1">
      {items.map((item, idx) => {
        const isTarget = idx + 1 === highlightRank
        return (
          <li
            key={idx}
            className={`flex items-start gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              isTarget ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : ""
            }`}
          >
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                isTarget
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {idx + 1}
            </span>
            <span
              className={`break-words ${
                isTarget ? "font-medium text-foreground" : "text-foreground/80"
              }`}
            >
              {item.text}
              {isTarget && (
                <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-500 uppercase">
                  You
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ResponseTabs({
  audit,
  isRunning,
}: {
  audit: AIAuditResponse
  isRunning: boolean
}) {
  const runs = audit.runs ?? []

  const models = Array.from(new Set(runs.map((r) => r.model_name))).sort()
  const orders = Array.from(new Set(runs.map((r) => r.display_order))).sort(
    (a, b) => a - b
  )

  const runMap = new Map<string, AIAuditRunResponse>()
  for (const run of runs) {
    runMap.set(`${run.display_order}:${run.model_name}`, run)
  }

  const questionByOrder = new Map<number, string>()
  for (const run of runs) {
    if (!questionByOrder.has(run.display_order)) {
      questionByOrder.set(run.display_order, run.question_text)
    }
  }

  const mentionCount = (model: string) =>
    runs.filter(
      (r) =>
        r.model_name === model && r.status === "success" && r.mentioned_target
    ).length

  if (models.length === 0) {
    if (!isRunning) return null
    return (
      <div className="px-4 lg:px-6">
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <RefreshCwIcon className="size-4 animate-spin" />
            Waiting for the first responses…
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 lg:px-6">
      <Tabs defaultValue={models[0]} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Model Responses</h3>
            <p className="text-xs text-muted-foreground">
              What each model actually answered. Your brand is highlighted where
              it ranked.
            </p>
          </div>
          <TabsList>
            {models.map((model) => {
              const count = mentionCount(model)
              return (
                <TabsTrigger key={model} value={model}>
                  {formatModelName(model)}
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                      count > 0
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}/{orders.length}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        {models.map((model) => (
          <TabsContent key={model} value={model}>
            <Card className="overflow-hidden border-border/50 py-0">
              <ScrollArea className="h-[520px]">
                <div className="flex flex-col divide-y divide-border/50">
                  {orders.map((order) => {
                    const run = runMap.get(`${order}:${model}`)
                    const question = questionByOrder.get(order)
                    return (
                      <div
                        key={order}
                        className="flex flex-col gap-3 px-5 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="min-w-0 break-words text-sm leading-snug font-medium text-foreground">
                            <span className="mr-1.5 text-muted-foreground">
                              {order}.
                            </span>
                            {question}
                          </h4>
                          {run && (
                            <RankPill
                              mentioned={run.mentioned_target}
                              rank={run.target_rank}
                            />
                          )}
                        </div>
                        {!run ? (
                          <div className="space-y-1.5 pl-1">
                            {[...Array(4)].map((_, i) => (
                              <div
                                key={i}
                                className="h-3 animate-pulse rounded bg-muted"
                                style={{ width: `${60 + (i % 3) * 12}%` }}
                              />
                            ))}
                          </div>
                        ) : (
                          <ResponseBody run={run} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function VisibilityGrid({
  audit,
  isRunning,
}: {
  audit: AIAuditResponse
  isRunning: boolean
}) {
  const runs = audit.runs ?? []
  const models = Array.from(new Set(runs.map((r) => r.model_name))).sort()
  const displayOrders = Array.from(
    new Set(runs.map((r) => r.display_order))
  ).sort((a, b) => a - b)

  const runMap = new Map<string, AIAuditRunResponse>()
  for (const run of runs) {
    runMap.set(`${run.display_order}:${run.model_name}`, run)
  }

  const questionByOrder = new Map<number, string>()
  for (const run of runs) {
    if (!questionByOrder.has(run.display_order)) {
      questionByOrder.set(run.display_order, run.question_text)
    }
  }

  if (models.length === 0 && !isRunning) return null

  const skeletonOrders = displayOrders.length === 0 ? [1, 2, 3, 4, 5] : []
  const skeletonModels =
    models.length === 0 ? ["model-a", "model-b", "model-c"] : []

  const rows = displayOrders.length > 0 ? displayOrders : skeletonOrders
  const cols = models.length > 0 ? models : skeletonModels

  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Visibility Matrix</h3>
          <p className="text-xs text-muted-foreground">
            Your brand&apos;s rank per question across every model.
          </p>
        </div>
        <MatrixLegend />
      </div>

      <Card className="min-w-0 gap-0 overflow-hidden border-border/50 py-0">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/40 backdrop-blur">
                <th className="w-[44%] px-4 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Question
                </th>
                {cols.map((model) => (
                  <th
                    key={model}
                    className="min-w-[110px] px-3 py-3 text-center text-xs font-semibold text-muted-foreground"
                    title={model}
                  >
                    <span className="mx-auto block max-w-[130px] truncate">
                      {formatModelName(model)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => {
                const question = questionByOrder.get(order)
                const isSkeletonRow = !question

                return (
                  <tr
                    key={order}
                    className="border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 align-middle">
                      {isSkeletonRow ? (
                        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                      ) : (
                        <span
                          className="flex gap-2 text-sm text-foreground/90"
                          title={question}
                        >
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                            {order}.
                          </span>
                          <span className="line-clamp-2">{question}</span>
                        </span>
                      )}
                    </td>
                    {cols.map((model) => {
                      const run = runMap.get(`${order}:${model}`)
                      if (!run)
                        return (
                          <td key={model}>
                            <SkeletonCell />
                          </td>
                        )
                      return (
                        <td key={model} className="text-center">
                          <ResultCell run={run} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function MatrixLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold text-white">
          1
        </span>
        Rank position
      </span>
      <span className="flex items-center gap-1.5">
        <span className="font-semibold text-muted-foreground">~</span>
        Mentioned, unranked
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-muted-foreground/40">—</span>
        Not mentioned
      </span>
    </div>
  )
}

function RunningBanner({
  completedCount,
  totalEstimate,
}: {
  completedCount: number
  totalEstimate: number
}) {
  const pct =
    totalEstimate > 0 ? Math.round((completedCount / totalEstimate) * 100) : 0
  return (
    <div className="mx-4 flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 lg:mx-6">
      <RefreshCwIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      <div className="flex-1">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Running visibility checks…
          </span>
          <span className="font-medium text-muted-foreground tabular-nums">
            {completedCount} / {totalEstimate || "?"} completed
          </span>
        </div>
        {totalEstimate > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export const RevserpVisibilityView = memo(function RevserpVisibilityView({
  activeProject,
  currentCrawl,
}: Props) {
  const queryClient = useQueryClient()
  const projectId = activeProject?.id
  const crawlId = currentCrawl?.id
  const [isTriggeringRun, setIsTriggeringRun] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null)

  // Clear the pinned audit id when the selected crawl changes, so the
  // detail query falls back to `listData?.id` for the newly selected crawl
  // instead of staying pinned to a previous crawl's just-triggered run.
  useEffect(() => {
    setActiveAuditId(null)
  }, [crawlId])

  const { data: listData, isLoading: isLoadingList } = useQuery({
    queryKey: projectId
      ? auditListQueryKey(projectId)
      : ["ai-audits-list-disabled"],
    queryFn: () =>
      clientApiFetch<AIAuditListResponse>(
        `/projects/${projectId!}/ai-audits?limit=50&offset=0`
      ),
    enabled: Boolean(projectId),
    select: (data) =>
      data.ai_audits.find((a) => a.crawl_id === crawlId) ?? null,
  })

  const resolvedAuditId = activeAuditId ?? listData?.id ?? null

  const { data: audit } = useQuery({
    queryKey: resolvedAuditId
      ? auditDetailQueryKey(resolvedAuditId)
      : ["ai-audit-disabled"],
    queryFn: () =>
      clientApiFetch<AIAuditResponse>(`/ai-audits/${resolvedAuditId!}`),
    enabled: Boolean(resolvedAuditId),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      if (s === "queued" || s === "running") return 2000
      return false
    },
  })

  const handleRunTest = useCallback(async () => {
    if (!projectId || !crawlId) return
    setIsTriggeringRun(true)
    setTriggerError(null)

    try {
      const created = await clientApiPost<AIAuditResponse>(
        `/projects/${projectId}/ai-audits`,
        { crawl_id: crawlId }
      )
      setActiveAuditId(created.id)
      queryClient.invalidateQueries({ queryKey: auditListQueryKey(projectId) })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({
          queryKey: auditListQueryKey(projectId),
        })
      } else if (err instanceof ApiError && err.status === 400) {
        setTriggerError(
          typeof err.details === "object" &&
            err.details !== null &&
            "error" in err.details
            ? String((err.details as { error: string }).error)
            : "Could not start visibility test. Make sure AI questions have been generated first."
        )
      } else {
        setTriggerError("Something went wrong. Please try again.")
      }
    } finally {
      setIsTriggeringRun(false)
    }
  }, [projectId, crawlId, queryClient])

  if (!projectId || !crawlId) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">
            Select a project and crawl to run a visibility test.
          </p>
        </div>
      </div>
    )
  }

  const displayAudit = audit ?? listData ?? null
  const runs = displayAudit?.runs ?? []
  const auditStatus = displayAudit?.status
  const isRunning = auditStatus === "queued" || auditStatus === "running"
  const hasResults = (runs.length > 0 || isRunning) && Boolean(displayAudit)
  const canRun = !isRunning && !isTriggeringRun
  const successRuns = runs.filter((r) => r.status === "success")
  const totalExpected =
    Array.from(new Set(runs.map((r) => r.display_order))).length *
    Math.max(1, Array.from(new Set(runs.map((r) => r.model_name))).length)

  return (
    <div className="@container/main flex min-w-0 flex-1 flex-col gap-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-4 lg:px-6">
        <div>
          <h2 className="text-lg font-semibold">LLM Visibility</h2>
          <p className="text-sm text-muted-foreground">
            {displayAudit?.completed_at
              ? `Last run ${new Date(displayAudit.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
              : "Test how your brand appears across AI models"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {triggerError && (
            <div className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircleIcon className="size-4 shrink-0" />
              <span className="max-w-xs">{triggerError}</span>
            </div>
          )}
          <Button
            onClick={handleRunTest}
            disabled={!canRun}
            size="sm"
            variant={hasResults ? "outline" : "default"}
          >
            {isTriggeringRun ? (
              <RefreshCwIcon className="size-4 animate-spin" />
            ) : (
              <PlayIcon className="size-4" />
            )}
            {hasResults ? "Re-run Test" : "Run Visibility Test"}
          </Button>
        </div>
      </div>

      {/* Running progress banner */}
      {isRunning && (
        <RunningBanner
          completedCount={runs.length}
          totalEstimate={totalExpected}
        />
      )}

      {/* Summary stats */}
      {successRuns.length > 0 && <SummaryCards runs={successRuns} />}

      {successRuns.length > 0 && hasResults && (
        <Separator className="mx-4 w-auto lg:mx-6" />
      )}

      {/* Per-model responses */}
      {hasResults && (
        <ResponseTabs audit={displayAudit!} isRunning={isRunning} />
      )}

      {hasResults && <Separator className="mx-4 w-auto lg:mx-6" />}

      {/* Results matrix */}
      {hasResults && (
        <VisibilityGrid audit={displayAudit!} isRunning={isRunning} />
      )}

      {/* Empty state */}
      {!hasResults && !isLoadingList && (
        <div className="flex flex-1 items-center justify-center px-4">
          <Card className="w-full max-w-md border-dashed border-border/50">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <PlayIcon className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No visibility data yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Run a visibility test to see how your brand appears across AI
                  models for your generated questions.
                </p>
              </div>
              <Button onClick={handleRunTest} disabled={!canRun}>
                Run Visibility Test
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
})
