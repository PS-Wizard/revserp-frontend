import { ChevronRight } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "~/components/ui/badge"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer"
import { Input } from "~/components/ui/input"
import { Separator } from "~/components/ui/separator"
import { clientApiFetch, clientApiPut } from "~/lib/api"
import type {
  AdminFeaturesResponse,
  AdminWorkspaceFeatures,
  AIReasoningEffort,
} from "~/lib/api.types"

const FEATURE_COLUMNS = [
  {
    key: "auto_crawl",
    label: "AutoCrawl",
    description: "Scheduled recurring crawls and their settings.",
  },
  {
    key: "gsc_connector",
    label: "GSC Connector",
    description: "Search Console tab, connection, and query data.",
  },
  {
    key: "ai_chat",
    label: "AI Chat",
    description: "Enables the future AI Chat workspace.",
  },
] as const

type FeatureKey = (typeof FEATURE_COLUMNS)[number]["key"]
const MAX_AI_MONTHLY_MESSAGE_LIMIT = 1_000_000
const REASONING_EFFORT_ORDER = [
  "none",
  "low",
  "high",
  "max",
] as const satisfies readonly AIReasoningEffort[]
const REASONING_EFFORT_OPTIONS: Array<{
  value: AIReasoningEffort
  label: string
  description: string
}> = [
  { value: "none", label: "None", description: "Disable reasoning." },
  { value: "low", label: "Low", description: "Use light reasoning." },
  { value: "high", label: "High", description: "Use deeper reasoning." },
  { value: "max", label: "Max", description: "Use the most reasoning." },
]

function normalizeReasoningEfforts(
  efforts: readonly AIReasoningEffort[]
): AIReasoningEffort[] {
  return REASONING_EFFORT_ORDER.filter((effort) => efforts.includes(effort))
}

function normalizeWorkspace(
  workspace: AdminWorkspaceFeatures
): AdminWorkspaceFeatures {
  return {
    ...workspace,
    ai_allowed_reasoning_efforts: normalizeReasoningEfforts(
      workspace.ai_allowed_reasoning_efforts
    ),
  }
}

function sameReasoningEfforts(
  left: readonly AIReasoningEffort[],
  right: readonly AIReasoningEffort[]
) {
  return (
    left.length === right.length &&
    left.every((effort, index) => effort === right[index])
  )
}

function hasInvalidAISettings(workspace: AdminWorkspaceFeatures) {
  return (
    !Number.isInteger(workspace.ai_monthly_message_limit) ||
    workspace.ai_monthly_message_limit < 0 ||
    workspace.ai_monthly_message_limit > MAX_AI_MONTHLY_MESSAGE_LIMIT ||
    workspace.ai_allowed_reasoning_efforts.length === 0
  )
}
type EditedRows = Map<string, AdminWorkspaceFeatures>

function ToggleRow({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean
  label: string
  description: string
  onChange: (checked: boolean) => void
}) {
  const toggle = () => onChange(!checked)

  return (
    <div
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault()
          toggle()
        }
      }}
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked
          ? "border-primary/30 bg-primary/5 dark:bg-primary/10"
          : "border-dashed hover:bg-muted/40"
      }`}
    >
      <span className="pointer-events-none mt-0.5">
        <Checkbox checked={checked} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={label}>
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </div>
  )
}

export function FeaturesTab() {
  const [saved, setSaved] = useState<AdminWorkspaceFeatures[]>([])
  const [edits, setEdits] = useState<EditedRows>(new Map())
  const [openOrgId, setOpenOrgId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data =
        await clientApiFetch<AdminFeaturesResponse>("/admin/features")
      setSaved((data.workspaces ?? []).map(normalizeWorkspace))
      setEdits(new Map())
    } catch {
      toast.error("Failed to load feature settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rowFor = useCallback(
    (workspace: AdminWorkspaceFeatures) =>
      edits.get(workspace.org_id) ?? workspace,
    [edits]
  )

  const updateRow = useCallback(
    (
      workspace: AdminWorkspaceFeatures,
      change: Partial<AdminWorkspaceFeatures>
    ) => {
      setEdits((previous) => {
        const next = new Map(previous)
        next.set(workspace.org_id, {
          ...(previous.get(workspace.org_id) ?? workspace),
          ...change,
        })
        return next
      })
    },
    []
  )

  const dirtyIds = useMemo(() => {
    const changed = new Set<string>()
    for (const workspace of saved) {
      const edited = edits.get(workspace.org_id)
      if (
        edited &&
        (FEATURE_COLUMNS.some(
          (column) => edited[column.key] !== workspace[column.key]
        ) ||
          edited.ai_monthly_message_limit !==
            workspace.ai_monthly_message_limit ||
          !sameReasoningEfforts(
            edited.ai_allowed_reasoning_efforts,
            workspace.ai_allowed_reasoning_efforts
          ))
      ) {
        changed.add(workspace.org_id)
      }
    }
    return changed
  }, [saved, edits])

  const invalidDirtyIds = useMemo(() => {
    const invalid = new Set<string>()
    for (const workspace of saved) {
      const edited = edits.get(workspace.org_id)
      if (
        edited &&
        dirtyIds.has(workspace.org_id) &&
        hasInvalidAISettings(edited)
      ) {
        invalid.add(workspace.org_id)
      }
    }
    return invalid
  }, [dirtyIds, edits, saved])

  const save = useCallback(async () => {
    if (dirtyIds.size === 0 || invalidDirtyIds.size > 0) return
    const workspaces = saved
      .filter((workspace) => dirtyIds.has(workspace.org_id))
      .map((workspace) => {
        const row = rowFor(workspace)
        return {
          org_id: row.org_id,
          auto_crawl: row.auto_crawl,
          gsc_connector: row.gsc_connector,
          ai_chat: row.ai_chat,
          ai_monthly_message_limit: row.ai_monthly_message_limit,
          ai_allowed_reasoning_efforts: normalizeReasoningEfforts(
            row.ai_allowed_reasoning_efforts
          ),
        }
      })

    setSaving(true)
    try {
      const data = await clientApiPut<AdminFeaturesResponse>(
        "/admin/features",
        { workspaces }
      )
      setSaved((data.workspaces ?? []).map(normalizeWorkspace))
      setEdits(new Map())
      toast.success(
        `Saved ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`
      )
    } catch {
      toast.error("Failed to save feature settings")
    } finally {
      setSaving(false)
    }
  }, [dirtyIds, invalidDirtyIds, saved, rowFor])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query
      ? saved.filter((workspace) =>
          workspace.org_name.toLowerCase().includes(query)
        )
      : saved
  }, [saved, search])

  const openWorkspace = saved.find(
    (workspace) => workspace.org_id === openOrgId
  )
  const open = openWorkspace ? rowFor(openWorkspace) : null

  const restrictionChips = (row: AdminWorkspaceFeatures) =>
    FEATURE_COLUMNS.filter((column) => !row[column.key]).map(
      (column) => `${column.label} off`
    )

  const monthlyLimitInvalid =
    open !== null &&
    (!Number.isInteger(open.ai_monthly_message_limit) ||
      open.ai_monthly_message_limit < 0 ||
      open.ai_monthly_message_limit > MAX_AI_MONTHLY_MESSAGE_LIMIT)
  const reasoningEffortsInvalid =
    open !== null && open.ai_allowed_reasoning_efforts.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Feature toggles</h2>
          <p className="text-sm text-muted-foreground">
            Per-workspace gating. Everything is enabled unless you turn it off.
            Edits across workspaces batch into one save.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter workspaces"
            className="w-56"
          />
          <Button variant="outline" onClick={load} disabled={loading || saving}>
            Reload
          </Button>
          <Button
            onClick={save}
            disabled={dirtyIds.size === 0 || invalidDirtyIds.size > 0 || saving}
          >
            {saving
              ? "Saving…"
              : dirtyIds.size > 0
                ? `Save ${dirtyIds.size} change${dirtyIds.size === 1 ? "" : "s"}`
                : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        {visible.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "No workspaces match that filter."}
          </p>
        ) : (
          visible.map((workspace) => {
            const row = rowFor(workspace)
            const isDirty = dirtyIds.has(workspace.org_id)
            const chips = restrictionChips(row)

            return (
              <button
                key={workspace.org_id}
                type="button"
                onClick={() => setOpenOrgId(workspace.org_id)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className="truncate text-sm font-medium"
                      title={workspace.org_name}
                    >
                      {workspace.org_name}
                    </span>
                    {isDirty ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-xs text-amber-600 dark:text-amber-500"
                      >
                        Unsaved
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {chips.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        All features on
                      </span>
                    ) : (
                      chips.map((chip) => (
                        <Badge
                          key={chip}
                          variant="secondary"
                          className="text-xs font-normal"
                        >
                          {chip}
                        </Badge>
                      ))
                    )}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })
        )}
      </div>

      <Drawer
        direction="right"
        open={openWorkspace !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenOrgId(null)
        }}
      >
        <DrawerContent className="sm:max-w-md">
          {openWorkspace && open ? (
            <>
              <DrawerHeader>
                <DrawerTitle className="truncate">
                  {openWorkspace.org_name}
                </DrawerTitle>
                <DrawerDescription>
                  Everything is enabled unless you turn it off. Changes apply
                  right after saving — no re-login needed.
                </DrawerDescription>
              </DrawerHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
                <FieldGroup className="gap-2">
                  {FEATURE_COLUMNS.map((column) => (
                    <ToggleRow
                      key={column.key}
                      checked={open[column.key as FeatureKey]}
                      label={column.label}
                      description={column.description}
                      onChange={(checked) =>
                        updateRow(openWorkspace, { [column.key]: checked })
                      }
                    />
                  ))}
                </FieldGroup>
                <Separator />
                <FieldGroup>
                  <Field data-invalid={monthlyLimitInvalid}>
                    <FieldLabel htmlFor="ai-monthly-message-limit">
                      Monthly message limit
                    </FieldLabel>
                    <Input
                      id="ai-monthly-message-limit"
                      type="number"
                      min={0}
                      max={MAX_AI_MONTHLY_MESSAGE_LIMIT}
                      step={1}
                      value={
                        Number.isNaN(open.ai_monthly_message_limit)
                          ? ""
                          : open.ai_monthly_message_limit
                      }
                      aria-invalid={monthlyLimitInvalid}
                      onChange={(event) =>
                        updateRow(openWorkspace, {
                          ai_monthly_message_limit:
                            event.target.value === ""
                              ? Number.NaN
                              : Number(event.target.value),
                        })
                      }
                    />
                    <FieldDescription>
                      {monthlyLimitInvalid
                        ? "Enter an integer from 0 to 1,000,000."
                        : "Maximum AI chat messages allowed per month."}
                    </FieldDescription>
                  </Field>
                  <FieldSet
                    data-invalid={reasoningEffortsInvalid}
                    className="gap-3"
                  >
                    <FieldLegend>Allowed reasoning efforts</FieldLegend>
                    <FieldDescription>
                      Select the DeepSeek reasoning levels available in this
                      workspace.
                    </FieldDescription>
                    <FieldGroup data-slot="checkbox-group" className="gap-2">
                      {REASONING_EFFORT_OPTIONS.map((option) => (
                        <ToggleRow
                          key={option.value}
                          checked={open.ai_allowed_reasoning_efforts.includes(
                            option.value
                          )}
                          label={option.label}
                          description={option.description}
                          onChange={() => {
                            const selected =
                              open.ai_allowed_reasoning_efforts.includes(
                                option.value
                              )
                            const efforts = selected
                              ? open.ai_allowed_reasoning_efforts.filter(
                                  (effort) => effort !== option.value
                                )
                              : normalizeReasoningEfforts([
                                  ...open.ai_allowed_reasoning_efforts,
                                  option.value,
                                ])
                            updateRow(openWorkspace, {
                              ai_allowed_reasoning_efforts: efforts,
                            })
                          }}
                        />
                      ))}
                    </FieldGroup>
                    {reasoningEffortsInvalid ? (
                      <FieldDescription className="text-destructive">
                        Select at least one reasoning effort.
                      </FieldDescription>
                    ) : null}
                  </FieldSet>
                </FieldGroup>
              </div>

              <DrawerFooter className="flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => setOpenOrgId(null)}>
                  Close
                </Button>
                <Button
                  onClick={save}
                  disabled={
                    dirtyIds.size === 0 || invalidDirtyIds.size > 0 || saving
                  }
                >
                  {saving
                    ? "Saving…"
                    : dirtyIds.size > 0
                      ? `Save ${dirtyIds.size} change${dirtyIds.size === 1 ? "" : "s"}`
                      : "Save changes"}
                </Button>
              </DrawerFooter>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
