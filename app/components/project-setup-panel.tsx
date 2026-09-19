"use client"

import {
  AlertTriangleIcon,
  Check,
  Loader2,
  Loader2Icon,
  RotateCcwIcon,
  SparklesIcon,
  X,
} from "lucide-react"

import {
  DriveSpinner,
  ShimmerLabel,
} from "~/components/revbot/revbot-turn-activity"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import type { ProjectSetupResponse, ProjectSetupStatus } from "~/lib/api.types"

const SETUP_STEPS = [
  { id: "crawl", label: "Crawl site" },
  { id: "profile", label: "Business profile" },
  { id: "questions", label: "Questions" },
  { id: "visibility", label: "Visibility" },
] as const

const STATUS_STEP_INDEX: Record<ProjectSetupStatus, number> = {
  ready: 0,
  crawling: 0,
  profile_generation: 1,
  prompt_generation: 2,
  visibility: 3,
  completed: SETUP_STEPS.length,
  failed: 0,
}

type StepState = "done" | "active" | "failed" | "pending"

const STEP_STATUS_WORD: Record<StepState, string> = {
  done: "Done",
  active: "Running",
  failed: "Failed",
  pending: "Waiting",
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <Check
        aria-hidden="true"
        className="size-3.5 shrink-0 text-emerald-400"
        strokeWidth={2.5}
      />
    )
  }

  if (state === "active") {
    return (
      <Loader2
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin text-zinc-400 motion-reduce:animate-none"
        strokeWidth={2.25}
      />
    )
  }

  if (state === "failed") {
    return (
      <X
        aria-hidden="true"
        className="size-3.5 shrink-0 text-red-400"
        strokeWidth={2.5}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex w-3.5 shrink-0 justify-center"
    >
      <span className="size-1.5 rounded-full bg-zinc-700" />
    </span>
  )
}

function SetupProgress({ setup }: { setup: ProjectSetupResponse }) {
  const isFailed = setup.status === "failed"
  const isCompleted = setup.status === "completed"
  const isRunning = !isFailed && !isCompleted
  const activeIndex = isFailed
    ? setup.failed_step
      ? STATUS_STEP_INDEX[setup.failed_step]
      : 0
    : STATUS_STEP_INDEX[setup.status]
  const progress = isCompleted
    ? 100
    : Math.round((activeIndex / SETUP_STEPS.length) * 100)

  return (
    <div aria-live="polite" className="flex w-full flex-col" role="status">
      {!isFailed ? (
        <div className="flex min-h-8 w-full items-center gap-2 border-b border-white/5 py-1.5 text-left">
          {isCompleted ? (
            <Check
              aria-hidden="true"
              className="size-3.5 shrink-0 text-emerald-400"
              strokeWidth={2.5}
            />
          ) : (
            <DriveSpinner />
          )}
          {isCompleted ? (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
              Setup complete
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate">
              <ShimmerLabel className="text-sm">
                Setting up project…
              </ShimmerLabel>
            </span>
          )}
          <span className="shrink-0 font-mono text-[13px] text-zinc-500 tabular-nums">
            {progress}%
          </span>
        </div>
      ) : null}

      <ol aria-label="Project setup progress" className="flex w-full flex-col">
        {SETUP_STEPS.map((step, index) => {
          const done = isCompleted || index < activeIndex
          const state: StepState = done
            ? "done"
            : isFailed && index === activeIndex
              ? "failed"
              : !isFailed && index === activeIndex
                ? "active"
                : "pending"
          const isLast = index === SETUP_STEPS.length - 1
          return (
            <li
              key={step.id}
              className={cn(
                "flex min-h-8 w-full items-center gap-2 py-1.5 text-left",
                !isLast && "border-b border-white/5"
              )}
              style={{
                animation: isRunning
                  ? `revbot-fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${index * 80}ms both`
                  : undefined,
              }}
            >
              <StepIcon state={state} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm font-medium",
                  state === "pending" ? "text-zinc-500" : "text-zinc-200"
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  state === "failed" ? "text-red-300/90" : "text-zinc-500"
                )}
              >
                {STEP_STATUS_WORD[state]}
              </span>
            </li>
          )
        })}
      </ol>

      {isFailed ? (
        <p
          className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-left text-sm text-destructive"
          role="alert"
        >
          {setup.error?.trim() ||
            "Project setup failed. You can try again below."}
        </p>
      ) : null}

      {isCompleted && setup.visibility_skip_reason ? (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-left text-sm text-muted-foreground">
          Visibility was skipped: {setup.visibility_skip_reason}
        </p>
      ) : null}
    </div>
  )
}

export function ProjectSetupPanel({
  canStart,
  setup,
  isLoading,
  isStarting,
  startError,
  onStart,
}: {
  canStart: boolean
  setup: ProjectSetupResponse | null
  isLoading: boolean
  isStarting: boolean
  startError: string
  onStart: () => void
}) {
  const isFailed = setup?.status === "failed"
  // `ready` means the row exists but no work has started yet: show the fresh
  // empty state (owner-only start button) and no progress until POST returns
  // `crawling`. Progress only tracks an in-flight or failed setup.
  const isReady = setup?.status === "ready"
  const showProgress = (setup !== null && !isReady) || isLoading

  // overflow-y-auto plus an auto-margin child centers the panel when it fits
  // and scrolls from the top when it does not. justify-center would clip the
  // top of an overflowing panel.
  return (
    <div className="@container/main flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 lg:px-6">
      <div className="m-auto flex w-full max-w-lg flex-col items-center text-center">
        <div className="mb-5 flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50">
          {isFailed ? (
            <AlertTriangleIcon
              aria-hidden="true"
              className="size-8 text-destructive"
            />
          ) : (
            <SparklesIcon
              aria-hidden="true"
              className="size-8 text-violet-400"
            />
          )}
        </div>
        <p className="text-xl font-semibold text-foreground">
          {isFailed ? "Project setup failed" : "Set up this project"}
        </p>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          {isFailed
            ? "Nothing was lost. Retry to run the remaining steps."
            : "Run the crawl, draft a business profile, generate questions, and check AI visibility in one go."}
        </p>

        <div className="mt-8 flex w-full flex-col items-center gap-5">
          {showProgress && setup ? <SetupProgress setup={setup} /> : null}

          {!setup && isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon aria-hidden="true" className="animate-spin" />
              Checking setup…
            </div>
          ) : null}

          {startError ? (
            <p className="text-sm text-destructive" role="alert">
              {startError}
            </p>
          ) : null}

          {!showProgress || isFailed ? (
            canStart ? (
              <Button
                aria-busy={isStarting}
                disabled={isStarting || isLoading}
                onClick={onStart}
                type="button"
              >
                {isStarting ? (
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : isFailed ? (
                  <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
                ) : null}
                {isStarting
                  ? "Starting…"
                  : isFailed
                    ? "Try again"
                    : "Initialize Project"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only an organization owner can start or retry setup.
              </p>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
