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
import { Button, buttonVariants } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerNested,
  DrawerTitle,
} from "~/components/ui/drawer"
import { Input } from "~/components/ui/input"
import { Separator } from "~/components/ui/separator"
import { clientApiFetch, clientApiPut } from "~/lib/api"
import type {
  AdminFeaturesResponse,
  AdminWorkspaceFeatures,
  AIReasoningEffort,
  AIToolInfo,
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
const MIN_AI_CONCURRENT_TURN_LIMIT_PER_USER = 1
const MAX_AI_CONCURRENT_TURN_LIMIT_PER_USER = 20
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
    disabled_ai_tools: workspace.disabled_ai_tools ?? [],
    ai_allowed_reasoning_efforts: normalizeReasoningEfforts(
      workspace.ai_allowed_reasoning_efforts
    ),
  }
}

function sameStringArrays(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  )
}

function hasInvalidAISettings(workspace: AdminWorkspaceFeatures) {
  return (
    !Number.isInteger(workspace.ai_monthly_message_limit) ||
    workspace.ai_monthly_message_limit < 0 ||
    workspace.ai_monthly_message_limit > MAX_AI_MONTHLY_MESSAGE_LIMIT ||
    !Number.isInteger(workspace.ai_concurrent_turn_limit_per_user) ||
    workspace.ai_concurrent_turn_limit_per_user <
      MIN_AI_CONCURRENT_TURN_LIMIT_PER_USER ||
    workspace.ai_concurrent_turn_limit_per_user >
      MAX_AI_CONCURRENT_TURN_LIMIT_PER_USER ||
    workspace.ai_allowed_reasoning_efforts.length === 0
  )
}
type EditedRows = Map<string, AdminWorkspaceFeatures>

function ToggleRow({
	checked,
	label,
	description,
	meta,
	disabled,
	onChange,
}: {
	checked: boolean
	label: string
	description: string
	meta?: string
	disabled?: boolean
	onChange: (checked: boolean) => void
}) {
	const toggle = () => {
		if (!disabled) onChange(!checked)
	}

	return (
		<div
			role="checkbox"
			aria-checked={checked}
			aria-disabled={disabled}
			aria-label={label}
			tabIndex={disabled ? -1 : 0}
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
			} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
		>
      <span className="pointer-events-none mt-0.5">
        <Checkbox checked={checked} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={label}>
          {label}
        </span>
        {meta ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground/70">
            {meta}
          </span>
        ) : null}
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
  const [aiTools, setAiTools] = useState<AIToolInfo[]>([])
  const [aiToolsOpen, setAiToolsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data =
        await clientApiFetch<AdminFeaturesResponse>("/admin/features")
      setSaved((data.workspaces ?? []).map(normalizeWorkspace))
      setAiTools(data.ai_tools ?? [])
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
          edited.ai_use_internal_prompt !== workspace.ai_use_internal_prompt ||
          edited.ai_monthly_message_limit !==
            workspace.ai_monthly_message_limit ||
          edited.ai_concurrent_turn_limit_per_user !==
            workspace.ai_concurrent_turn_limit_per_user ||
          !sameStringArrays(
            edited.ai_allowed_reasoning_efforts,
            workspace.ai_allowed_reasoning_efforts
          ) ||
          !sameStringArrays(
            edited.disabled_ai_tools,
            workspace.disabled_ai_tools
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
          disabled_ai_tools: row.disabled_ai_tools,
          auto_crawl: row.auto_crawl,
          gsc_connector: row.gsc_connector,
          ai_chat: row.ai_chat,
          ai_use_internal_prompt: row.ai_use_internal_prompt,
          ai_monthly_message_limit: row.ai_monthly_message_limit,
          ai_concurrent_turn_limit_per_user:
            row.ai_concurrent_turn_limit_per_user,
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
  const concurrentTurnLimitInvalid =
    open !== null &&
    (!Number.isInteger(open.ai_concurrent_turn_limit_per_user) ||
      open.ai_concurrent_turn_limit_per_user <
        MIN_AI_CONCURRENT_TURN_LIMIT_PER_USER ||
      open.ai_concurrent_turn_limit_per_user >
        MAX_AI_CONCURRENT_TURN_LIMIT_PER_USER)
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
          if (!isOpen) {
            setOpenOrgId(null)
            setAiToolsOpen(false)
          }
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
                <ToggleRow
                  checked={open.ai_use_internal_prompt}
                  label="Use internal AI prompt"
                  description="Uses the internal system prompt from AI Config. Off uses the external prompt."
                  onChange={(checked) =>
                    updateRow(openWorkspace, {
                      ai_use_internal_prompt: checked,
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() => setAiToolsOpen(true)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">AI tools</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Choose which AI tools the assistant may call.
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
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
                  <Field data-invalid={concurrentTurnLimitInvalid}>
                    <FieldLabel htmlFor="ai-concurrent-turn-limit-per-user">
                      Concurrent chats per user
                    </FieldLabel>
                    <Input
                      id="ai-concurrent-turn-limit-per-user"
                      type="number"
                      min={MIN_AI_CONCURRENT_TURN_LIMIT_PER_USER}
                      max={MAX_AI_CONCURRENT_TURN_LIMIT_PER_USER}
                      step={1}
                      value={
                        Number.isNaN(open.ai_concurrent_turn_limit_per_user)
                          ? ""
                          : open.ai_concurrent_turn_limit_per_user
                      }
                      aria-invalid={concurrentTurnLimitInvalid}
                      onChange={(event) =>
                        updateRow(openWorkspace, {
                          ai_concurrent_turn_limit_per_user:
                            event.target.value === ""
                              ? Number.NaN
                              : Number(event.target.value),
                        })
                      }
                    />
                    <FieldDescription>
                      {concurrentTurnLimitInvalid
                        ? "Enter an integer from 1 to 20."
                        : "Maximum running chats for each workspace member; queued chats wait."}
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
              <DrawerNested
                direction="right"
                open={aiToolsOpen}
                onOpenChange={setAiToolsOpen}
              >
                <DrawerContent className="sm:max-w-md">
                  <DrawerHeader>
                    <DrawerTitle>AI tools</DrawerTitle>
                    <DrawerDescription>
                      {openWorkspace.org_name} — everything is enabled unless
                      you turn it off. Changes apply after saving.
                    </DrawerDescription>
                  </DrawerHeader>

                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
                    <FieldGroup className="gap-2">
                      {aiTools.map((tool) => {
						const featureOff = tool.gated_by_feature
							? open[tool.gated_by_feature as keyof AdminWorkspaceFeatures] === false
							: false
						return (
							<ToggleRow
								key={tool.name}
								checked={!open.disabled_ai_tools.includes(tool.name)}
								label={tool.label}
								description={
									featureOff
										? `${tool.description} Requires the ${tool.gated_by_feature} feature.`
										: tool.description
								}
								meta={tool.name}
								disabled={featureOff}
								onChange={(checked) =>
									updateRow(openWorkspace, {
										disabled_ai_tools: checked
											? open.disabled_ai_tools.filter(
													(name) => name !== tool.name
												)
												: [...open.disabled_ai_tools, tool.name],
									})
								}
							/>
						)
					  })}
                    </FieldGroup>
                  </div>

                  <DrawerFooter className="flex-row justify-end gap-2">
                    <DrawerClose
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Back
                    </DrawerClose>
                  </DrawerFooter>
                </DrawerContent>
              </DrawerNested>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
