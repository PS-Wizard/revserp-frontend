export type ComposerActivity = "idle" | "working" | "stopping" | "awaiting"

const LABELS: Record<ComposerActivity, string> = {
  idle: "",
  working: "Working…",
  stopping: "Stopping…",
  awaiting: "Waiting for approval",
}

export function composerActivity(
  active: boolean,
  stopping: boolean,
  waitingForApproval: boolean
): ComposerActivity {
  if (!active) return "idle"
  if (stopping) return "stopping"
  return waitingForApproval ? "awaiting" : "working"
}

export function composerActivityLabel(activity: ComposerActivity): string {
  return LABELS[activity]
}

export function composerActivityAnimated(activity: ComposerActivity): boolean {
  return activity === "working" || activity === "stopping"
}
