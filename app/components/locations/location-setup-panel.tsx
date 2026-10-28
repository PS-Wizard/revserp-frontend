"use client"

import { useState } from "react"
import {
  AlertTriangleIcon,
  Check,
  CircleCheckIcon,
  Loader2,
  Loader2Icon,
  MapPinIcon,
  RotateCcwIcon,
  SparklesIcon,
  X,
  type LucideIcon,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Textarea } from "~/components/ui/textarea"
import { cn } from "~/lib/utils"
import type {
  LocationSetupResponse,
  LocationSetupStatus,
  LocationSetupStep,
} from "~/lib/location-setup-api"
import {
  DriveSpinner,
  ShimmerLabel,
} from "~/components/revbot/revbot-turn-activity"

const SETUP_STEPS: Array<{ id: LocationSetupStep["id"]; label: string }> = [
  { id: "prepare", label: "Prepare location" },
  { id: "profile", label: "Business profile" },
  { id: "keyword_analysis", label: "Keyword estimates" },
  { id: "questions", label: "AI questions" },
  { id: "map_queries", label: "Map queries" },
  { id: "ai_visibility", label: "AI visibility test" },
  { id: "maps_visibility", label: "Maps visibility test" },
]

type StepState = "done" | "active" | "failed" | "pending" | "skipped"

const STEP_STATUS_WORD: Record<StepState, string> = {
  done: "Done",
  active: "Running",
  failed: "Failed",
  pending: "Waiting",
  skipped: "Skipped",
}

const SETUP_STAGE_COPY: Record<
  LocationSetupStatus,
  { icon: LucideIcon; title: string; description: string }
> = {
  ready: {
    icon: SparklesIcon,
    title: "Set up this location",
    description:
      "Generate local questions and map queries, then test AI and Maps visibility for this location in one go.",
  },
  running: {
    icon: MapPinIcon,
    title: "Setting up this location",
    description:
      "AI questions and map generation run as independent branches. Finished steps are kept when you retry.",
  },
  completed: {
    icon: CircleCheckIcon,
    title: "Location ready",
    description: "Everything finished. The location overview is next.",
  },
  failed: {
    icon: AlertTriangleIcon,
    title: "Location setup needs attention",
    description:
      "Finished steps are kept. Retry to resume only what is unfinished.",
  },
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

function SetupProgress({ setup }: { setup: LocationSetupResponse }) {
  const isFailed = setup.status === "failed"
  const isCompleted = setup.status === "completed"
  const isRunning = !isFailed && !isCompleted
  const byId = new Map(setup.steps.map((step) => [step.id, step] as const))
  const states = SETUP_STEPS.map((step) => {
    const backend = byId.get(step.id)?.status ?? "pending"
    const state: StepState =
      backend === "completed"
        ? "done"
        : backend === "running"
          ? "active"
          : backend === "failed"
            ? "failed"
            : backend === "skipped"
              ? "skipped"
              : "pending"
    return { ...step, state, reason: byId.get(step.id)?.reason }
  })
  const settled = states.filter(
    (step) => step.state === "done" || step.state === "skipped"
  ).length
  const progress = isCompleted
    ? 100
    : Math.round((settled / SETUP_STEPS.length) * 100)

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
                Setting up location…
              </ShimmerLabel>
            </span>
          )}
          <span className="shrink-0 font-mono text-sm text-zinc-500 tabular-nums">
            {progress}%
          </span>
        </div>
      ) : null}

      <ol aria-label="Location setup progress" className="flex w-full flex-col">
        {states.map((step, index) => {
          const isLast = index === states.length - 1
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
              <StepIcon state={step.state} />
              <span className="min-w-0 flex-1 truncate">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    step.state === "pending" || step.state === "skipped"
                      ? "text-zinc-500"
                      : "text-zinc-200"
                  )}
                >
                  {step.label}
                </span>
                {step.reason ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {step.reason}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  step.state === "failed" ? "text-red-300/90" : "text-zinc-500"
                )}
              >
                {STEP_STATUS_WORD[step.state]}
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
            "Location setup stopped. Finished steps are kept; retry resumes the rest."}
        </p>
      ) : null}
    </div>
  )
}

export function LocationSetupPanel({
  canStart,
  setup,
  isLoading,
  isStarting,
  startError,
  gridSummary,
  onStart,
}: {
  canStart: boolean
  setup: LocationSetupResponse | null
  isLoading: boolean
  isStarting: boolean
  startError: string
  /** Saved grid settings line, e.g. "4 map queries · 5.0 km radius". */
  gridSummary?: string | null
  onStart: (differences: string) => void
}) {
  const [differences, setDifferences] = useState("")
  const isFailed = setup?.status === "failed"
  const isReady = setup === null || setup?.status === "ready"
  const showProgress = (setup !== null && !isReady) || isLoading
  const stage = SETUP_STAGE_COPY[setup?.status ?? "ready"]
  const StageIcon = stage.icon
  const estimated =
    typeof setup?.estimated_maps_credits === "number" &&
    Number.isFinite(setup.estimated_maps_credits)
      ? setup.estimated_maps_credits
      : null
  const savedDifferences = setup?.differences?.trim() || ""

  return (
    <div
      className="@container/main flex min-h-0 flex-1 flex-col overflow-y-auto py-6"
      data-tour="onboarding-location-details"
    >
      <div className="m-auto flex w-full max-w-lg flex-col items-center text-center">
        <div className="mb-5 flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/50">
          <StageIcon
            aria-hidden="true"
            className={cn(
              "size-8",
              isFailed ? "text-destructive" : "text-violet-400"
            )}
          />
        </div>
        <p className="text-xl font-semibold text-foreground">{stage.title}</p>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {stage.description}
        </p>

        <div className="mt-8 flex w-full flex-col items-center gap-5">
          {showProgress && setup ? <SetupProgress setup={setup} /> : null}

          {!setup && isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon aria-hidden="true" className="animate-spin" />
              Checking setup…
            </div>
          ) : null}

          {savedDifferences && !isReady ? (
            <p className="w-full rounded-md bg-muted px-3 py-2 text-left text-sm text-muted-foreground">
              What makes this location different: {savedDifferences}
            </p>
          ) : null}

          {isReady ? (
            <Field className="w-full gap-2 text-left">
              <FieldLabel htmlFor="location-setup-differences">
                What is different at this location?
              </FieldLabel>
              <Textarea
                id="location-setup-differences"
                placeholder="e.g. downtown branch, no weekend hours, focuses on commercial catering"
                value={differences}
                onChange={(event) => setDifferences(event.target.value)}
                rows={3}
              />
              <FieldDescription>
                Optional. Initializing runs the AI visibility test and a Maps
                check against your quota automatically.
                {gridSummary ? ` Currently saved: ${gridSummary}.` : ""}
                {estimated !== null
                  ? " Estimated cost: up to " +
                    estimated +
                    " Maps credits. Generating queries can change the count, so the final charge may differ."
                  : " The Maps cost is estimated when setup runs: generating queries can change the count, so no fixed price is quoted here."}
                You can keep using every other tab while it runs.
              </FieldDescription>
            </Field>
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
                onClick={() => onStart(differences)}
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
                    : "Initialize Location"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only a workspace manager can start or retry setup.
              </p>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
