import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Separator } from "~/components/ui/separator"
import { ApiError, clientApiFetch, clientApiPut } from "~/lib/api"

export type MapsCreditBudget = {
  remaining_credits: number
  reserved_credits: number
  spent_credits: number
  available_credits: number
}

export type MapsCreditBudgetScope =
  | { kind: "org"; orgId: string }
  | { kind: "platform" }

export const MAX_MAPS_CREDIT_BUDGET = 1_000_000_000

export function mapsCreditBudgetPath(scope: MapsCreditBudgetScope): string {
  return scope.kind === "platform"
    ? "/admin/maps-budget/platform"
    : `/admin/organizations/${scope.orgId}/maps-budget`
}

export function isValidMapsBudgetValue(value: number): boolean {
  return (
    Number.isInteger(value) && value >= 0 && value <= MAX_MAPS_CREDIT_BUDGET
  )
}

export function parseMapsBudgetInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const value = Number(trimmed)
  return isValidMapsBudgetValue(value) ? value : null
}

function normalizeBudget(value: Partial<MapsCreditBudget>): MapsCreditBudget {
  const integerOrZero = (input: unknown) =>
    typeof input === "number" && Number.isInteger(input) ? input : 0
  return {
    remaining_credits: integerOrZero(value.remaining_credits),
    reserved_credits: integerOrZero(value.reserved_credits),
    spent_credits: integerOrZero(value.spent_credits),
    available_credits: integerOrZero(value.available_credits),
  }
}

export function MapsCreditBudgetControl({
  scope,
}: {
  scope: MapsCreditBudgetScope
}) {
  const path = mapsCreditBudgetPath(scope)
  const [budget, setBudget] = useState<MapsCreditBudget | null>(null)
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await clientApiFetch<Partial<MapsCreditBudget>>(path)
      const normalized = normalizeBudget(data ?? {})
      setBudget(normalized)
      setDraft(String(normalized.remaining_credits))
    } catch {
      setLoadError("Failed to load Maps allowance.")
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    load()
  }, [load])

  const parsed = parseMapsBudgetInput(draft)
  const invalid = parsed === null
  const changed =
    budget !== null && !invalid && parsed !== budget.remaining_credits
  const canSave = budget !== null && changed && !loading && !saving

  const save = useCallback(async () => {
    if (budget === null || parsed === null) return
    setSaving(true)
    try {
      const data = await clientApiPut<Partial<MapsCreditBudget>>(path, {
        remaining_credits: parsed,
        expected_remaining_credits: budget.remaining_credits,
      })
      const normalized = normalizeBudget(data ?? {})
      setBudget(normalized)
      setDraft(String(normalized.remaining_credits))
      toast.success("Maps allowance saved")
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error("Allowance changed by another admin — reloaded latest.")
        load()
      } else {
        toast.error(
          error instanceof ApiError
            ? error.message
            : "Failed to save Maps allowance"
        )
      }
    } finally {
      setSaving(false)
    }
  }, [budget, parsed, path, load])

  const title =
    scope.kind === "platform"
      ? "Platform Maps allowance"
      : "Workspace Maps allowance"

  if (loading && budget === null) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">Loading allowance…</p>
      </div>
    )
  }

  if (loadError !== null && budget === null) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (budget === null) return null

  const stats = [
    { label: "Remaining", value: budget.remaining_credits },
    { label: "Reserved", value: budget.reserved_credits },
    { label: "Confirmed spent", value: budget.spent_credits },
    { label: "Available", value: budget.available_credits },
  ]

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          Spending allowance, not a purchased wallet. 0 blocks Maps runs.
          About 135 credits per run across 5 queries × 9 calls — the workspace
          and the platform allowance must both cover it. Admins top up manually
          here; no self-serve purchase, no financial ledger.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-md bg-muted/40 px-2 py-1.5"
          >
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-sm font-medium tabular-nums">
              {stat.value.toLocaleString("en-US")}
            </p>
          </div>
        ))}
      </div>
      <Separator />
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={`maps-allowance-${scope.kind}`}>
          Remaining allowance (credits)
        </FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id={`maps-allowance-${scope.kind}`}
            type="number"
            min={0}
            max={MAX_MAPS_CREDIT_BUDGET}
            step={1}
            value={draft}
            aria-invalid={invalid}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            variant="outline"
            onClick={load}
            disabled={loading || saving}
          >
            Reload
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <FieldDescription>
          {invalid
            ? "Enter a whole number from 0 to 1,000,000,000."
            : "Sets the remaining allowance to this exact value."}
        </FieldDescription>
      </Field>
    </div>
  )
}
