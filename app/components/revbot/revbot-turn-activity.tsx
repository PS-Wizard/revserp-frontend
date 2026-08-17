"use client"

import { Check, ChevronDown, Loader2, X } from "lucide-react"
import { useEffect, useState } from "react"

import type { AIStreamPhase } from "~/lib/api.types"
import { cn } from "~/lib/utils"

import type { RevbotToolCall } from "./use-revbot"

const DRIVE_DELAYS = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3)
  const column = index % 3
  return (column + Math.abs(row - 1)) * 90
})

type ToolOutcome = "running" | "failed" | "partial" | "success"

function formatDuration(ms: number) {
  const total = ms / 1000
  if (total < 60) return `${total.toFixed(1)}s`
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`
}

function useElapsed(startedAt: number | null, active: boolean) {
  const [elapsed, setElapsed] = useState("0.0s")

  useEffect(() => {
    if (!startedAt) {
      setElapsed("0.0s")
      return
    }

    const tick = () => {
      const total = (Date.now() - startedAt) / 1000
      if (total < 60) {
        setElapsed(`${total.toFixed(1)}s`)
        return
      }
      setElapsed(
        `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`
      )
    }

    tick()
    if (!active) return
    const timer = window.setInterval(tick, 100)
    return () => window.clearInterval(timer)
  }, [active, startedAt])

  return elapsed
}

function DriveSpinner({ className }: { className?: string }) {
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

function ShimmerLabel({ children }: { children: string }) {
  return (
    <span
      className="bg-clip-text text-[13px] font-medium text-transparent motion-reduce:text-zinc-300"
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

function looksLikeToolError(summary: string) {
  const lower = summary.toLowerCase()
  return (
    lower.includes("error") ||
    lower.startsWith("argument ") ||
    lower.startsWith("unknown ") ||
    lower.includes(" must ") ||
    lower.includes("invalid ")
  )
}

function resolveToolOutcome(call: RevbotToolCall): ToolOutcome {
  if (call.status === "running") return "running"
  if (call.status === "failed") return "failed"

  const summary = call.summary?.trim() ?? ""
  if (!summary) return "partial"
  if (looksLikeToolError(summary)) return "failed"

  if (call.name === "read_issues") {
    const match = summary.match(/^(\d+)\s+issues?\s+shown\b/i)
    if (match && Number(match[1]) === 0) return "partial"
  }

  return "success"
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
        className="inline-flex w-3.5 shrink-0 justify-center text-[13px] leading-none font-medium text-zinc-500"
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
  call,
  isDark,
  isLast,
}: {
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
        !isLast && (isDark ? "border-b border-white/5" : "border-b border-border/60")
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
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-200">
          {formatToolName(call.name)}
        </span>
        {meta && open ? (
          <span className="min-w-0 truncate text-[12px] text-zinc-500">
            {meta}
          </span>
        ) : null}
        {outcome === "failed" ? (
          <span className="shrink-0 text-[11px] font-medium text-red-300/90">
            Failed
          </span>
        ) : outcome === "partial" ? (
          <span className="shrink-0 text-[11px] font-medium text-zinc-500">
            No results
          </span>
        ) : outcome === "running" ? (
          <span className="shrink-0 text-[11px] font-medium text-zinc-500">
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
                    "text-[12px] leading-relaxed",
                    outcome === "failed"
                      ? "text-red-200/90"
                      : "text-zinc-400"
                  )}
                >
                  {detail}
                </p>
              ) : outcome === "running" ? (
                <p className="text-[12px] text-zinc-500">Running tool…</p>
              ) : outcome === "partial" ? (
                <p className="text-[12px] text-zinc-500">No results returned.</p>
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
  isDark,
  toolCalls,
}: {
  active: boolean
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
            call={call}
            isDark={isDark}
            isLast={index === toolCalls.length - 1}
          />
        </div>
      ))}
    </div>
  )
}

export function RevbotTurnActivity({
  active,
  endedAt = null,
  showDivider = false,
  startedAt,
  toolCalls,
  variant = "dark",
}: {
  active: boolean
  endedAt?: number | null
  phase: AIStreamPhase | null
  showDivider?: boolean
  startedAt: number | null
  toolCalls: RevbotToolCall[]
  variant?: "default" | "dark"
}) {
  const isDark = variant === "dark"
  const elapsed = useElapsed(startedAt, active)
  const hasTools = toolCalls.length > 0
  const isComplete =
    !active && startedAt !== null && endedAt !== null && endedAt >= startedAt
  const thoughtDuration =
    isComplete && startedAt !== null && endedAt !== null
      ? formatDuration(endedAt - startedAt)
      : null
  const [accordionOpen, setAccordionOpen] = useState(true)

  if (!active && !hasTools && !isComplete) return null

  if (isComplete && thoughtDuration) {
    return (
      <div className="mb-3 w-full">
        <div
          className={cn(
            "overflow-hidden rounded-lg",
            isDark ? "bg-white/[0.03]" : "bg-muted/30"
          )}
        >
          <button
            aria-expanded={accordionOpen}
            className={cn(
              "flex w-full items-center gap-2 px-2 py-2 text-left transition-colors duration-100",
              isDark ? "hover:bg-white/[0.04]" : "hover:bg-muted/50"
            )}
            onClick={() => setAccordionOpen((current) => !current)}
            type="button"
          >
            <span className="min-w-0 flex-1 text-[13px] font-medium text-zinc-400">
              Thought for {thoughtDuration}
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
              <div className="px-2 pt-0">
                <ToolCallList
                  active={false}
                  isDark={isDark}
                  toolCalls={toolCalls}
                />
              </div>
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
        <div className="mb-1 flex items-center gap-2 py-1">
          <DriveSpinner />
          <ShimmerLabel>Churning…</ShimmerLabel>
          <span className="font-mono text-[12px] text-zinc-500 tabular-nums">
            {elapsed}
          </span>
        </div>
      ) : null}

      <ToolCallList active={active} isDark={isDark} toolCalls={toolCalls} />

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
