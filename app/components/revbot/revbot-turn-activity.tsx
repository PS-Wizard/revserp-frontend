"use client"

import { Check, ChevronDown, Loader2, X } from "lucide-react"
import { useEffect, useState } from "react"

import type { AIStreamPhase, CMSApproval } from "~/lib/api.types"
import { cn } from "~/lib/utils"

import { approvalToolLabel } from "./mcp-approval-copy"
import { resolveToolOutcome } from "./tool-call-status"
import type { ToolOutcome } from "./tool-call-status"
import type { RevbotActivityRound } from "./revbot-replay-state"
import type { RevbotToolCall } from "./use-revbot"

const DRIVE_DELAYS = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3)
  const column = index % 3
  return (column + Math.abs(row - 1)) * 90
})

function formatDuration(ms: number) {
  const total = ms / 1000
  if (total < 60) return `${total.toFixed(1)}s`
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`
}

function TurnElapsedTime({ startedAt }: { startedAt: number | null }) {
  const [elapsed, setElapsed] = useState(() =>
    startedAt === null ? "0.0s" : formatDuration(Date.now() - startedAt)
  )

  useEffect(() => {
    if (startedAt === null) {
      setElapsed("0.0s")
      return
    }
    setElapsed(formatDuration(Date.now() - startedAt))
    const timer = window.setInterval(() => {
      setElapsed(formatDuration(Date.now() - startedAt))
    }, 100)
    return () => window.clearInterval(timer)
  }, [startedAt])

  return (
    <span className="font-mono text-xs text-zinc-500 tabular-nums">
      {elapsed}
    </span>
  )
}

export function DriveSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid grid-cols-[repeat(3,4px)] gap-[1.5px]", className)}
    >
      {DRIVE_DELAYS.map((delay, index) => (
        <span
          className="size-[4px] rounded-[1px] bg-zinc-300 motion-reduce:opacity-30"
          key={index}
          style={{
            animation: `revbot-pixel-on 650ms ease-in-out ${delay}ms infinite`,
            opacity: 0.15,
          }}
        />
      ))}
    </span>
  )
}

export function ShimmerLabel({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "bg-clip-text text-sm font-medium text-transparent motion-reduce:text-zinc-300",
        className
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(113 113 122) 35%, rgb(244 244 245) 50%, rgb(113 113 122) 65%)",
        backgroundSize: "200% 100%",
        animation: "revbot-shimmer-text 1.4s linear infinite",
      }}
    >
      {children}
    </span>
  )
}

function formatToolName(name: string) {
  return name
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function resolveRevbotToolDisplayName(
  call: Pick<RevbotToolCall, "name" | "callId">,
  approvals: CMSApproval[] = []
): string {
  const approval = approvals.find(
    (item) => item.tool_call_id === call.callId && item.remote_tool_name
  )
  if (approval?.remote_tool_name)
    return approvalToolLabel(approval.remote_tool_name)
  const unhashed = call.name.match(/^mcp_[A-Za-z0-9]+_(.+)$/)?.[1]
  if (unhashed) return approvalToolLabel(unhashed) || "Working"
  return formatToolName(call.name) || "Working"
}

export function resolveRevbotLiveStatusLabel({
  activity,
  approvals = [],
  phase,
  toolCalls,
}: {
  activity: RevbotActivityRound[]
  approvals?: CMSApproval[]
  phase: AIStreamPhase | null
  toolCalls: RevbotToolCall[]
}): string {
  const runningTool = [...toolCalls]
    .reverse()
    .find((call) => call.status === "running" || call.status === "awaiting")
  if (runningTool)
    return `${resolveRevbotToolDisplayName(runningTool, approvals)}…`
  const runningActivity = [...activity]
    .reverse()
    .find((round) => round.status === "running" && round.text.trim())
  if (runningActivity) {
    const line = (runningActivity.text.split("\n")[0] ?? "").trim()
    return line.length > 140 ? `${line.slice(0, 140)}…` : line
  }
  if (phase === "writing") return "Writing…"
  if (phase === "thinking") return "Thinking…"
  return "Working…"
}

function formatToolMeta(name: string, args: Record<string, unknown>) {
  if (name === "read_issues") {
    const parts: string[] = []
    if (typeof args.pillar === "string" && args.pillar) {
      parts.push(args.pillar)
    }
    if (typeof args.severity === "string" && args.severity) {
      parts.push(args.severity)
    }
    if (typeof args.limit === "number") {
      parts.push(`limit ${args.limit}`)
    }
    if (typeof args.offset === "number" && args.offset > 0) {
      parts.push(`offset ${args.offset}`)
    }
    return parts.join(" · ") || "All issues"
  }

  const entries = Object.entries(args).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  )
  if (!entries.length) return ""
  return entries
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ")
}

function ToolOutcomeIcon({ outcome }: { outcome: ToolOutcome }) {
  if (outcome === "running") {
    return (
      <Loader2
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin text-zinc-400 motion-reduce:animate-none"
        strokeWidth={2.25}
      />
    )
  }
  if (outcome === "failed") {
    return (
      <X
        aria-hidden="true"
        className="size-3.5 shrink-0 text-red-400"
        strokeWidth={2.5}
      />
    )
  }
  if (outcome === "partial") {
    return (
      <span
        aria-hidden="true"
        className="inline-flex w-3.5 shrink-0 justify-center text-sm leading-none font-medium text-zinc-500"
      >
        ~
      </span>
    )
  }
  return (
    <Check
      aria-hidden="true"
      className="size-3.5 shrink-0 text-emerald-400"
      strokeWidth={2.5}
    />
  )
}

function ToolCallRow({
  approvals = [],
  call,
  isDark,
  isLast,
}: {
  approvals?: CMSApproval[]
  call: RevbotToolCall
  isDark: boolean
  isLast: boolean
}) {
  const meta = formatToolMeta(call.name, call.args)
  const outcome = resolveToolOutcome(call)
  const [open, setOpen] = useState(
    outcome === "failed" || outcome === "partial"
  )
  const detail = call.summary?.trim()
  const expandable = Boolean(detail || meta)

  useEffect(() => {
    if (outcome === "failed" || outcome === "partial") {
      setOpen(true)
      return
    }

    setOpen(false)
  }, [outcome])

  return (
    <div
      className={cn(
        "w-full",
        !isLast &&
          (isDark ? "border-b border-white/5" : "border-b border-border/60")
      )}
    >
      <button
        aria-expanded={open}
        className={cn(
          "flex min-h-8 w-full items-center gap-2 py-1.5 text-left transition-colors duration-100",
          expandable &&
            (isDark ? "hover:bg-white/[0.03]" : "hover:bg-muted/50"),
          !expandable && "cursor-default"
        )}
        disabled={!expandable}
        onClick={() => {
          if (!expandable) return
          setOpen((current) => !current)
        }}
        type="button"
      >
        <ToolOutcomeIcon outcome={outcome} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
          {resolveRevbotToolDisplayName(call, approvals)}
        </span>
        {meta && open ? (
          <span className="min-w-0 truncate text-xs text-zinc-500">{meta}</span>
        ) : null}
        {outcome === "failed" ? (
          <span className="shrink-0 text-micro font-medium text-red-300/90">
            Failed
          </span>
        ) : outcome === "partial" ? (
          <span className="shrink-0 text-micro font-medium text-zinc-500">
            No results
          </span>
        ) : outcome === "running" ? (
          <span className="shrink-0 text-micro font-medium text-zinc-500">
            Running
          </span>
        ) : null}
        {expandable ? (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 text-zinc-500 transition-transform duration-300",
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
            <div className="pb-2 pl-5">
              {detail ? (
                <p
                  className={cn(
                    "text-xs leading-relaxed",
                    outcome === "failed" ? "text-red-200/90" : "text-zinc-400"
                  )}
                >
                  {detail}
                </p>
              ) : outcome === "running" ? (
                <p className="text-xs text-zinc-500">Running tool…</p>
              ) : outcome === "partial" ? (
                <p className="text-xs text-zinc-500">No results returned.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ToolCallList({
  active,
  approvals = [],
  isDark,
  toolCalls,
}: {
  active: boolean
  approvals?: CMSApproval[]
  isDark: boolean
  toolCalls: RevbotToolCall[]
}) {
  if (!toolCalls.length) return null

  return (
    <div className="flex w-full flex-col pb-2">
      {toolCalls.map((call, index) => (
        <div
          key={call.callId}
          style={{
            animation: active
              ? `revbot-fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${index * 80}ms both`
              : undefined,
          }}
        >
          <ToolCallRow
            approvals={approvals}
            call={call}
            isDark={isDark}
            isLast={index === toolCalls.length - 1}
          />
        </div>
      ))}
    </div>
  )
}

function ActivityRoundMarker({
  active,
  running,
}: {
  active: boolean
  running: boolean
}) {
  if (active && running) {
    return (
      <Loader2
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin text-zinc-400 motion-reduce:animate-none"
        strokeWidth={2.25}
      />
    )
  }
  if (running) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex w-3.5 shrink-0 justify-center text-sm leading-none font-medium text-zinc-500"
      >
        ~
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-3.5 shrink-0 items-center justify-center"
    >
      <span className="size-1 rounded-full bg-zinc-500" />
    </span>
  )
}

function ActivityRoundList({
  active,
  activity,
  isDark,
}: {
  active: boolean
  activity: RevbotActivityRound[]
  isDark: boolean
}) {
  const rounds = activity.filter((round) => round.text.trim().length > 0)
  if (!rounds.length) return null

  return (
    <div className="flex w-full flex-col pb-2">
      {rounds.map((round, index) => {
        const running = round.status === "running"
        return (
          <div
            key={round.round}
            style={{
              animation: active
                ? `revbot-fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${index * 80}ms both`
                : undefined,
            }}
          >
            <div className="flex w-full items-start gap-2 py-1.5">
              <ActivityRoundMarker active={active} running={running} />
              <p
                className={cn(
                  "min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-wrap",
                  isDark ? "text-zinc-300" : "text-muted-foreground"
                )}
              >
                {round.text}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
export function RevbotTurnActivity({
  active,
  activity = [],
  approvals = [],
  endedAt = null,
  phase,
  showDivider = false,
  startedAt,
  toolCalls,
  variant = "dark",
}: {
  active: boolean
  activity?: RevbotActivityRound[]
  approvals?: CMSApproval[]
  endedAt?: number | null
  phase: AIStreamPhase | null
  showDivider?: boolean
  startedAt: number | null
  toolCalls: RevbotToolCall[]
  variant?: "default" | "dark"
}) {
  const isDark = variant === "dark"
  const hasTools = toolCalls.length > 0
  const hasActivity = activity.some((round) => round.text.trim().length > 0)
  const isComplete =
    !active && startedAt !== null && endedAt !== null && endedAt >= startedAt
  const thoughtDuration =
    isComplete && startedAt !== null && endedAt !== null
      ? formatDuration(endedAt - startedAt)
      : null
  const needsAttention =
    toolCalls.some((call) => resolveToolOutcome(call) !== "success") ||
    activity.some((round) => round.status === "running")
  const [accordionOpen, setAccordionOpen] = useState(needsAttention)
  const [liveToolsOpen, setLiveToolsOpen] = useState(false)
  useEffect(() => {
    if (needsAttention) setAccordionOpen(true)
  }, [needsAttention])
  const liveLabel = resolveRevbotLiveStatusLabel({
    activity,
    approvals,
    phase,
    toolCalls,
  })

  if (!active && !hasTools && !hasActivity && !isComplete) return null

  if (isComplete && thoughtDuration) {
    return (
      <div className="mb-3 w-full">
        <div className="overflow-hidden">
          <button
            aria-expanded={accordionOpen}
            className={cn(
              "flex min-h-8 w-full items-center gap-2 py-1.5 text-left transition-colors duration-100",
              isDark ? "hover:bg-white/[0.03]" : "hover:bg-muted/50"
            )}
            onClick={() => setAccordionOpen((current) => !current)}
            type="button"
          >
            <span className="min-w-0 flex-1 text-sm font-medium text-zinc-400">
              Activity · {thoughtDuration}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-zinc-500 transition-transform duration-300",
                accordionOpen && "rotate-180"
              )}
              strokeWidth={2.2}
            />
          </button>

          <div
            className="grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none"
            style={{
              gridTemplateRows: accordionOpen ? "1fr" : "0fr",
              opacity: accordionOpen ? 1 : 0,
              transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          >
            <div className="overflow-hidden">
              <ActivityRoundList
                active={false}
                activity={activity}
                isDark={isDark}
              />
              <ToolCallList
                active={false}
                approvals={approvals}
                isDark={isDark}
                toolCalls={toolCalls}
              />
            </div>
          </div>
        </div>

        {showDivider ? (
          <hr
            className={cn(
              "mt-2 mb-5 border-0 border-t",
              isDark ? "border-white/10" : "border-border"
            )}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="mb-3 w-full">
      {active ? (
        <button
          aria-expanded={liveToolsOpen}
          className={cn(
            "mb-1 flex w-full items-center gap-2 rounded-md py-1 text-left transition-colors duration-100",
            isDark ? "hover:bg-white/[0.04]" : "hover:bg-muted/50"
          )}
          onClick={() => setLiveToolsOpen((open) => !open)}
          type="button"
        >
          <DriveSpinner />
          <ShimmerLabel>{liveLabel}</ShimmerLabel>
          <TurnElapsedTime startedAt={startedAt} />
        </button>
      ) : null}

      {active && liveToolsOpen ? (
        <>
          <ActivityRoundList active activity={activity} isDark={isDark} />
          <ToolCallList
            active
            approvals={approvals}
            isDark={isDark}
            toolCalls={toolCalls}
          />
        </>
      ) : null}
      {!active ? (
        <>
          <ActivityRoundList
            active={false}
            activity={activity}
            isDark={isDark}
          />
          <ToolCallList
            active={false}
            approvals={approvals}
            isDark={isDark}
            toolCalls={toolCalls}
          />
        </>
      ) : null}

      {showDivider ? (
        <hr
          className={cn(
            "mt-2 mb-5 border-0 border-t",
            isDark ? "border-white/10" : "border-border"
          )}
        />
      ) : null}
    </div>
  )
}
