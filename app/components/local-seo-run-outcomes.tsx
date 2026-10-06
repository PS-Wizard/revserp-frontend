import {
  isLocalSeoRunActive,
  localSeoPointLetter,
  type LocalSeoCell,
  type LocalSeoRun,
} from "~/lib/local-seo-api"
import { FieldDescription, FieldError } from "~/components/ui/field"

/** Historical runs retain this incorrect summary; replace only this text in the UI. */
export const LOCAL_SEO_GENERIC_RUN_ERROR =
  "Some calls failed or were not performed; unconfirmed charges retain reservations"

export function isGenericLocalSeoRunError(
  error: string | null | undefined
): boolean {
  return error?.trim() === LOCAL_SEO_GENERIC_RUN_ERROR
}

/**
 * Held and unconfirmed fields are optional in the API. Absent means unknown,
 * never zero: only an explicit reported 0 proves nothing is held.
 */
export function localSeoHeldCredits(run: LocalSeoRun): number | null {
  const value = run.reserved_credits
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value
  }
  return null
}

export function localSeoUnconfirmedCalls(run: LocalSeoRun): number | null {
  const value = run.unconfirmed_calls
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value
  }
  return null
}

/**
 * Confirmed spend can only still rise when the API reports a positive hold or
 * unconfirmed count, or when either field is unknown. A known zero on both
 * leaves nothing that could settle later.
 */
export function localSeoMayStillCharge(run: LocalSeoRun): boolean {
  const held = localSeoHeldCredits(run)
  const unconfirmed = localSeoUnconfirmedCalls(run)
  return held === null || unconfirmed === null || held > 0 || unconfirmed > 0
}

export type LocalSeoCallCounts = {
  total: number
  successful: number
  failed: number
  pending: number
  settled: number
}

export function countLocalSeoRunCalls(run: LocalSeoRun): LocalSeoCallCounts {
  let successful = 0
  let failed = 0
  let pending = 0
  for (const cell of run.cells) {
    if (cell.call_status === "pending") pending += 1
    else if (cell.call_status === "request_failed") failed += 1
    else successful += 1
  }
  const total = run.cells.length
  return { total, successful, failed, pending, settled: total - pending }
}

export function describeLocalSeoRunCalls(run: LocalSeoRun): string | null {
  const { total, successful, failed, pending, settled } =
    countLocalSeoRunCalls(run)
  if (total === 0) return null
  if (pending === 0 && failed === 0)
    return `All ${total} calls returned valid results.`
  const recorded =
    pending === 0 ? `All ${total} calls` : `${settled} of ${total} calls`
  return `${recorded} have recorded outcomes. ${successful} succeeded and ${failed} failed.`
}

function localSeoQueryText(
  run: LocalSeoRun,
  cell: LocalSeoCell
): string | null {
  const text = run.queries[cell.query_index]
  return typeof text === "string" && text.trim() !== "" ? text : null
}

function describeLocalSeoCell(run: LocalSeoRun, cell: LocalSeoCell): string {
  const query = localSeoQueryText(run, cell)
  const queryText = query ? `Query “${query}”` : `Query ${cell.query_index + 1}`
  return `${queryText} · point ${localSeoPointLetter(cell.point_index)} (${cell.sector})`
}

function explainFailedLocalSeoCall(cell: LocalSeoCell): string {
  if (cell.error && /viewport/i.test(cell.error)) {
    return "The provider returned a Maps viewport that could not be validated, so this call's ranks were not accepted."
  }
  return "The provider call failed, so no rank was recorded for this point."
}

function describeFailedLocalSeoCharge(cell: LocalSeoCell): string {
  if (cell.credit_known) {
    return `${cell.credits} credit${cell.credits === 1 ? "" : "s"} charged (confirmed)`
  }
  return "charge unknown"
}

export type LocalSeoFailedCellOutcome = {
  key: string
  label: string
  explanation: string
  charge: string
  rawError: string | null
}

export function listLocalSeoFailedCells(
  run: LocalSeoRun
): LocalSeoFailedCellOutcome[] {
  return run.cells
    .filter((cell) => cell.call_status === "request_failed")
    .map((cell) => ({
      key: `${cell.query_index}:${cell.point_index}`,
      label: describeLocalSeoCell(run, cell),
      explanation: explainFailedLocalSeoCall(cell),
      charge: describeFailedLocalSeoCharge(cell),
      rawError: cell.error,
    }))
}

/** Pending cells in a terminal run: unfinished, and the API does not say if they started. */
export function listLocalSeoPendingCells(run: LocalSeoRun): string[] {
  return run.cells
    .filter((cell) => cell.call_status === "pending")
    .map((cell) => describeLocalSeoCell(run, cell))
}

function LocalSeoRunMoney({ run }: { run: LocalSeoRun }) {
  const held = localSeoHeldCredits(run)
  const unconfirmed = localSeoUnconfirmedCalls(run)
  return (
    <p className="text-muted-foreground tabular-nums">
      {run.credits_used} credits used
      {held === null
        ? " · held credits unknown"
        : held === 0
          ? " · No credits are held"
          : ` · ${held} still held`}
      {unconfirmed === null
        ? " · unresolved charges unknown"
        : unconfirmed > 0
          ? ` · ${unconfirmed} unresolved charge${unconfirmed === 1 ? "" : "s"}`
          : ""}
    </p>
  )
}

/**
 * Money settlement and measurement success are reported apart: a run can have
 * every call charged and settled while one result was still unrankable.
 */
export function LocalSeoRunOutcomes({ run }: { run: LocalSeoRun }) {
  const terminal = !isLocalSeoRunActive(run.status)
  const showsDetail = run.status === "partial" || run.status === "failed"
  const genericError = isGenericLocalSeoRunError(run.error)
  const mayStillCharge = localSeoMayStillCharge(run)
  const failedCells = showsDetail ? listLocalSeoFailedCells(run) : []
  const pendingCells = showsDetail ? listLocalSeoPendingCells(run) : []
  const callSummary = showsDetail ? describeLocalSeoRunCalls(run) : null

  return (
    <div className="flex flex-col gap-2 text-sm">
      <LocalSeoRunMoney run={run} />
      {terminal ? (
        mayStillCharge ? (
          <FieldDescription role="status">
            {(localSeoHeldCredits(run) ?? 0) > 0 ||
            (localSeoUnconfirmedCalls(run) ?? 0) > 0
              ? "This run did not settle cleanly."
              : "Charge settlement is unknown."}{" "}
            Confirmed spend may still rise and nothing retries automatically.
          </FieldDescription>
        ) : (
          <FieldDescription role="status">
            Charges are fully settled and no auto-retry will run.
          </FieldDescription>
        )
      ) : null}
      {run.error && !genericError ? <FieldError>{run.error}</FieldError> : null}
      {genericError &&
      showsDetail &&
      !callSummary &&
      failedCells.length === 0 ? (
        <FieldDescription role="status">
          Some calls did not complete; per-call detail is not available for this
          run.
        </FieldDescription>
      ) : null}
      {callSummary ? (
        <p className="text-muted-foreground">{callSummary}</p>
      ) : null}
      {failedCells.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {failedCells.map((cell) => (
            <li key={cell.key} className="text-muted-foreground">
              <span className="font-medium text-foreground">{cell.label}</span>
              {". "}
              {cell.explanation} {cell.charge}.
              {cell.rawError ? (
                <span className="block">Raw error: {cell.rawError}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {pendingCells.length > 0 ? (
        <div className="text-muted-foreground">
          <p>
            {pendingCells.length} call{pendingCells.length === 1 ? "" : "s"}{" "}
            have no result recorded (unfinished; the API does not report whether
            they started):
          </p>
          <ul className="flex flex-col gap-1">
            {pendingCells.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
