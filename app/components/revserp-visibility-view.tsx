"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  ChevronDown,
  Loader2,
  PlayIcon,
  RefreshCwIcon,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Separator } from "~/components/ui/separator"
import { ApiError, clientApiFetch, clientApiPost } from "~/lib/api"
import type {
  AIAuditListResponse,
  AIAuditResponse,
  AIAuditRunResponse,
} from "~/lib/api.types"
import { cn } from "~/lib/utils"

type Props = {
  projectId: string | null
  crawlId: string | null
  locationId?: string
  locationName?: string
  initialAuditId?: string
}

type AIAuditScope =
  | { kind: "crawl"; projectId: string; crawlId: string }
  | { kind: "location"; projectId: string; locationId: string }

function auditListQueryKey(scope: AIAuditScope) {
  return scope.kind === "location"
    ? ([
        "ai-audits-list",
        scope.projectId,
        "location",
        scope.locationId,
      ] as const)
    : (["ai-audits-list", scope.projectId, "crawl", scope.crawlId] as const)
}

function auditScopeKey(scope: AIAuditScope) {
  return scope.kind === "location"
    ? `location:${scope.projectId}:${scope.locationId}`
    : `crawl:${scope.projectId}:${scope.crawlId}`
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

function MentionBadge({ run }: { run: AIAuditRunResponse }) {
  if (run.mentioned_branch === true) {
    return (
      <Badge variant="secondary" className="px-1.5 text-micro">
        Branch mention
      </Badge>
    )
  }
  if (run.mentioned_target === true && run.mentioned_branch === false) {
    return (
      <Badge variant="outline" className="px-1.5 text-micro">
        Brand mention
      </Badge>
    )
  }
  return null
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
    <div className="flex flex-col items-center justify-center gap-1 p-3">
      <RankPill mentioned={run.mentioned_target} rank={run.target_rank} />
      <MentionBadge run={run} />
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
    <div className="grid min-w-0 gap-5 @3xl/main:grid-cols-4">
      <Card className="@container/card bg-gradient-to-br from-card via-card to-muted/30">
        <CardHeader className="pb-2">
          <CardDescription>Visibility Rate</CardDescription>
          <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">
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
          <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">
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
          <CardTitle className="text-3xl font-semibold tracking-tight tabular-nums">
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
          <CardTitle className="truncate text-xl font-semibold tracking-tight">
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
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-micro font-semibold ${
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
                <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-micro font-semibold tracking-wide text-emerald-500 uppercase">
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

function QuestionStatusIcon({
  status,
}: {
  status: AIAuditRunResponse["status"] | "pending"
}) {
  if (status === "pending" || status === "running") {
    return (
      <Loader2
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
        strokeWidth={2.25}
      />
    )
  }
  if (status === "failed") {
    return (
      <X
        aria-hidden="true"
        className="size-3.5 shrink-0 text-destructive"
        strokeWidth={2.5}
      />
    )
  }
  return (
    <Check
      aria-hidden="true"
      className="size-3.5 shrink-0 text-emerald-500"
      strokeWidth={2.5}
    />
  )
}

function QuestionRow({
  order,
  question,
  run,
  isLast,
}: {
  order: number
  question?: string
  run?: AIAuditRunResponse
  isLast: boolean
}) {
  const status = run?.status ?? "pending"
  const expandable = status === "success" || status === "failed"
  const [open, setOpen] = useState(status === "failed")

  useEffect(() => {
    if (status === "failed") {
      setOpen(true)
      return
    }
    if (status === "success") setOpen(false)
  }, [status])

  const label = question?.trim() || `Question ${order}`

  return (
    <div className={cn("w-full", !isLast && "border-b border-border/40")}>
      <button
        aria-expanded={open}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-4 text-left transition-colors duration-100",
          expandable && "hover:bg-muted/50",
          !expandable && "cursor-default"
        )}
        disabled={!expandable}
        onClick={() => {
          if (!expandable) return
          setOpen((current) => !current)
        }}
        type="button"
      >
        <QuestionStatusIcon status={status} />
        <span className="min-w-0 flex-1 truncate text-sm leading-snug font-medium text-foreground/90">
          <span className="mr-1.5 text-muted-foreground">{order}.</span>
          {label}
        </span>
        {status === "failed" ? (
          <span className="shrink-0 text-xs font-medium text-destructive">
            Failed
          </span>
        ) : status === "pending" || status === "running" ? (
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            Running
          </span>
        ) : run ? (
          <span className="flex shrink-0 items-center gap-2">
            <MentionBadge run={run} />
            <RankPill mentioned={run.mentioned_target} rank={run.target_rank} />
          </span>
        ) : null}
        {expandable ? (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-300",
              open && "rotate-180"
            )}
            strokeWidth={2.2}
          />
        ) : (
          <span aria-hidden="true" className="size-3.5 shrink-0" />
        )}
      </button>

      {expandable ? (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            opacity: open ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
          }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-3 px-3 pb-5 pl-10">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {label}
              </p>
              {run ? <ResponseBody run={run} /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ModelResponseCards({
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
      <div className="h-[38rem] @3xl/main:h-[40rem]">
        <Card className="flex h-full items-center border-border/50">
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <RefreshCwIcon className="size-4 animate-spin" />
            Waiting for the first responses…
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid min-w-0 auto-rows-[38rem] gap-5 @3xl/main:h-[40rem] @3xl/main:auto-rows-auto @3xl/main:grid-cols-4 @3xl/main:grid-rows-1">
      {models.map((model) => {
        const count = mentionCount(model)
        return (
          <Card
            key={model}
            className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-border/50 bg-gradient-to-br from-card via-card to-muted/30 py-0"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-4">
              <h3
                className="truncate font-heading text-base font-semibold tracking-tight"
                title={formatModelName(model)}
              >
                {formatModelName(model)}
              </h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-micro font-semibold tabular-nums",
                  count > 0
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {count}/{orders.length}
              </span>
            </div>
            <hr className="mx-5 shrink-0 border-0 border-t border-border/60" />
            <ScrollArea className="min-h-0 flex-1 overflow-hidden">
              <div className="flex flex-col px-3 py-4">
                {orders.map((order, index) => (
                  <QuestionRow
                    key={order}
                    order={order}
                    question={questionByOrder.get(order)}
                    run={runMap.get(`${order}:${model}`)}
                    isLast={index === orders.length - 1}
                  />
                ))}
              </div>
            </ScrollArea>
          </Card>
        )
      })}
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
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-heading text-base font-semibold tracking-tight">
            Visibility matrix
          </h3>
          <p className="text-sm text-muted-foreground">
            Your brand&apos;s rank per question across every model.
          </p>
        </div>
        <MatrixLegend />
      </div>

      <Card className="min-w-0 gap-0 overflow-hidden border-border/50 py-0">
        <div className="w-full min-w-0 overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[44%]" />
              {cols.map((model) => (
                <col key={model} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-border/50 bg-muted/40 backdrop-blur">
                <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Question
                </th>
                {cols.map((model) => (
                  <th
                    key={model}
                    className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground"
                    title={model}
                  >
                    <span className="mx-auto block truncate">
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
                          className="flex min-w-0 gap-2 text-sm text-foreground/90"
                          title={question}
                        >
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                            {order}.
                          </span>
                          <span className="line-clamp-2 min-w-0">
                            {question}
                          </span>
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
        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-micro font-semibold text-white">
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

function RunningBanner({ completedCount }: { completedCount: number }) {
  return (
    <div className="mx-0 flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-4 @3xl/main:mx-6 @3xl/main:px-5 @5xl/main:mx-8">
      <RefreshCwIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
      <div className="flex-1">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Running visibility checks…
          </span>
          <span className="font-medium text-muted-foreground tabular-nums">
            {completedCount} completed
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
    </div>
  )
}

export const RevserpVisibilityView = memo(function RevserpVisibilityView({
  projectId,
  crawlId,
  locationId,
  locationName,
  initialAuditId,
}: Props) {
  const queryClient = useQueryClient()
  const [isTriggeringRun, setIsTriggeringRun] = useState(false)

  const scope = useMemo<AIAuditScope | null>(
    () =>
      projectId
        ? locationId
          ? { kind: "location", projectId, locationId }
          : crawlId
            ? { kind: "crawl", projectId, crawlId }
            : null
        : null,
    [projectId, crawlId, locationId]
  )
  const scopeKey = scope ? auditScopeKey(scope) : null
  const listQueryKey = useMemo(
    () => (scope ? auditListQueryKey(scope) : null),
    [scope]
  )

  const [pinnedAudit, setPinnedAudit] = useState<{
    scopeKey: string
    auditId: string
  } | null>(null)
  const pinnedAuditId =
    pinnedAudit && pinnedAudit.scopeKey === scopeKey
      ? pinnedAudit.auditId
      : null

  const {
    data: listData,
    isLoading: isLoadingList,
    isError: isListError,
  } = useQuery({
    queryKey: listQueryKey ?? (["ai-audits-list-disabled"] as const),
    queryFn: () =>
      clientApiFetch<AIAuditListResponse>(
        locationId
          ? `/projects/${projectId!}/ai-audits?limit=1&offset=0&location_id=${locationId}`
          : `/projects/${projectId!}/ai-audits?limit=1&offset=0&crawl_id=${crawlId!}`
      ),
    enabled: listQueryKey !== null,
    select: (data) =>
      locationId
        ? (data.ai_audits.find(
            (a) => a.location_id === locationId && a.project_id === projectId
          ) ?? null)
        : (data.ai_audits.find((a) => a.crawl_id === crawlId) ??
          data.ai_audits[0] ??
          null),
  })

  const resolvedAuditId =
    pinnedAuditId ?? initialAuditId ?? listData?.id ?? null

  const { data: audit } = useQuery({
    queryKey: resolvedAuditId
      ? auditDetailQueryKey(resolvedAuditId)
      : ["ai-audit-disabled"],
    queryFn: () =>
      clientApiFetch<AIAuditResponse>(`/ai-audits/${resolvedAuditId!}`),
    enabled: Boolean(resolvedAuditId),
    select: (data) =>
      data.project_id === projectId &&
      (locationId
        ? data.location_id === locationId
        : !data.location_id && data.crawl_id === crawlId)
        ? data
        : null,
  })

  const handleRunTest = useCallback(async () => {
    if (!projectId || !scope || !listQueryKey) return
    setIsTriggeringRun(true)

    try {
      const created = await clientApiPost<AIAuditResponse>(
        `/projects/${projectId}/ai-audits`,
        scope.kind === "location"
          ? { location_id: scope.locationId }
          : { crawl_id: scope.crawlId }
      )
      if (scopeKey) setPinnedAudit({ scopeKey, auditId: created.id })
      queryClient.invalidateQueries({ queryKey: listQueryKey })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: listQueryKey })
      } else if (err instanceof ApiError && err.status === 400) {
        toast.error(
          typeof err.details === "object" &&
            err.details !== null &&
            "error" in err.details
            ? String((err.details as { error: string }).error)
            : locationId
              ? "Could not start visibility test. Make sure this location has enabled map queries."
              : "Could not start visibility test. Make sure AI questions have been generated first."
        )
      } else if (err instanceof ApiError && err.status === 429) {
        const now = new Date()
        const resetsAt = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
        )
        const resetsLabel = resetsAt.toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          timeZone: "UTC",
          year: "numeric",
        })
        toast.error(
          `This workspace has no visibility tests left this month. The quota resets on ${resetsLabel}.`
        )
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setIsTriggeringRun(false)
    }
  }, [projectId, scope, scopeKey, listQueryKey, queryClient])

  if (!projectId || (!crawlId && !locationId)) {
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
  const completedCount = runs.filter(
    (r) => r.status === "success" || r.status === "failed"
  ).length
  const showListError =
    Boolean(locationId) && isListError && !hasResults && !isLoadingList

  return (
    <div className="@container/main flex max-w-full min-w-0 flex-1 flex-col gap-8 overflow-x-hidden py-6 @3xl/main:gap-10 @3xl/main:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="space-y-2">
          <h2 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-tight text-foreground sm:text-[2rem]">
            LLM Visibility
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {displayAudit?.completed_at
              ? `Last run ${new Date(displayAudit.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
              : locationName
                ? `Test whether AI answers mention ${locationName}`
                : "Test how your brand appears across AI models"}
          </p>
        </div>
        <Button
          onClick={handleRunTest}
          disabled={!canRun}
          size="sm"
          variant={hasResults ? "outline" : "default"}
          className="mt-1 shrink-0"
        >
          {isTriggeringRun ? (
            <RefreshCwIcon className="size-4 animate-spin" />
          ) : (
            <PlayIcon className="size-4" />
          )}
          {hasResults ? "Re-run Test" : "Run Visibility Test"}
        </Button>
      </div>

      {/* Running progress banner */}
      {isRunning && <RunningBanner completedCount={completedCount} />}

      {/* Summary stats */}
      {successRuns.length > 0 && <SummaryCards runs={successRuns} />}

      {/* Per-model response cards */}
      {hasResults && (
        <ModelResponseCards audit={displayAudit!} isRunning={isRunning} />
      )}

      {/* Results matrix */}
      {hasResults && (
        <div className="flex min-w-0 flex-col gap-10 pb-6">
          <Separator className="mx-0 w-auto @3xl/main:mx-6 @5xl/main:mx-8" />
          <VisibilityGrid audit={displayAudit!} isRunning={isRunning} />
        </div>
      )}

      {/* Empty state */}
      {!hasResults && !isLoadingList && !showListError && (
        <div className="flex flex-1 items-center justify-center">
          <Card className="w-full max-w-md border-dashed border-border/50">
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <PlayIcon className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No visibility data yet</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {locationName
                    ? `Run a visibility test to see how AI answers mention ${locationName}.`
                    : "Run a visibility test to see how your brand appears across AI models for your generated questions."}
                </p>
              </div>
              <Button onClick={handleRunTest} disabled={!canRun}>
                Run Visibility Test
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {showListError ? (
        <div className="flex flex-1 items-center justify-center">
          <Card className="w-full max-w-md border-dashed border-border/50">
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <div>
                <p className="font-medium">Could not load visibility data</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {locationName
                    ? `The saved visibility results for ${locationName} could not be loaded. Try again in a moment.`
                    : "The saved visibility results could not be loaded."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
})
