export type ComposerActivity =
  | "idle"
  | "working"
  | "stopping"
  | "awaiting"
  | "answering"

const LABELS: Record<ComposerActivity, string> = {
  idle: "",
  working: "Working…",
  stopping: "Stopping…",
  awaiting: "Waiting for approval",
  answering: "Waiting for your answer",
}

export function composerActivity(
  active: boolean,
  stopping: boolean,
  waitingForApproval: boolean,
  waitingForQuestion = false
): ComposerActivity {
  if (!active) return "idle"
  if (stopping) return "stopping"
  if (waitingForQuestion) return "answering"
  return waitingForApproval ? "awaiting" : "working"
}

export function composerActivityLabel(activity: ComposerActivity): string {
  return LABELS[activity]
}

export function composerActivityAnimated(activity: ComposerActivity): boolean {
  return activity === "working" || activity === "stopping"
}
