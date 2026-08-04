import { ChevronRight, SlidersHorizontal } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerNested,
  DrawerTitle,
} from "~/components/ui/drawer"
import { Input } from "~/components/ui/input"
import { clientApiFetch, clientApiPut } from "~/lib/api"
import type {
  AdminFeatureToolGroup,
  AdminFeaturesResponse,
  AdminWorkspaceFeatures,
} from "~/lib/api.types"

/** The three top-level product surfaces, with what turning each off costs. */
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
    description: "The assistant dock. Turning this off disables every tool.",
  },
] as const

type FeatureKey = (typeof FEATURE_COLUMNS)[number]["key"]

/** Row identity for the edit map; workspaces are keyed by org id. */
type EditedRows = Map<string, AdminWorkspaceFeatures>

/**
 * One toggle row. The whole row is the hit target rather than just the box —
 * the Checkbox is a <button>, so it is rendered inert here and the row owns the
 * interaction, keeping a single focusable control per option.
 */
function ToggleRow({
  checked,
  disabled,
  label,
  description,
  mono,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  description?: string
  mono?: boolean
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
      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : `cursor-pointer ${
              checked
                ? "border-primary/30 bg-primary/5 dark:bg-primary/10"
                : "border-dashed hover:bg-muted/40"
            }`
      }`}
    >
      <span className="pointer-events-none mt-0.5">
        <Checkbox checked={checked} disabled={disabled} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate ${mono ? "font-mono text-[13px]" : "font-medium text-sm"}`}
          title={label}
        >
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-muted-foreground text-xs">
            {description}
          </span>
        ) : null}
      </span>
    </div>
  )
}

export function FeaturesTab() {
  const [saved, setSaved] = useState<AdminWorkspaceFeatures[]>([])
  const [toolGroups, setToolGroups] = useState<AdminFeatureToolGroup[]>([])
  const [edits, setEdits] = useState<EditedRows>(new Map())
  const [openOrgId, setOpenOrgId] = useState<string | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data =
        await clientApiFetch<AdminFeaturesResponse>("/admin/features")
      setSaved(data.workspaces ?? [])
      setToolGroups(data.tool_groups ?? [])
      // Discard pending edits on reload so nothing shows a mix of server state
      // and stale local toggles.
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

  const allTools = useMemo(
    () => toolGroups.flatMap((group) => group.tools),
    [toolGroups]
  )

  /** The row as currently displayed: the local edit if one exists, else saved. */
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

  /** Bulk helper over an explicit tool list; each tool stays individually settable. */
  const setToolsEnabled = useCallback(
    (
      workspace: AdminWorkspaceFeatures,
      tools: readonly string[],
      enable: boolean
    ) => {
      const current = edits.get(workspace.org_id) ?? workspace
      const disabled = new Set(current.disabled_ai_tools)
      for (const tool of tools) {
        if (enable) disabled.delete(tool)
        else disabled.add(tool)
      }
      updateRow(workspace, { disabled_ai_tools: [...disabled].sort() })
    },
    [edits, updateRow]
  )

  // Only changed rows are sent. Comparing against the server copy (rather than
  // tracking "touched") means toggling a box and toggling it back correctly
  // counts as no change.
  const dirtyIds = useMemo(() => {
    const changed = new Set<string>()
    for (const workspace of saved) {
      const edited = edits.get(workspace.org_id)
      if (!edited) continue
      const sameFeatures = FEATURE_COLUMNS.every(
        (column) => edited[column.key] === workspace[column.key]
      )
      const sameTools =
        edited.disabled_ai_tools.length ===
          workspace.disabled_ai_tools.length &&
        edited.disabled_ai_tools.every(
          (tool, index) => tool === workspace.disabled_ai_tools[index]
        )
      if (!sameFeatures || !sameTools) changed.add(workspace.org_id)
    }
    return changed
  }, [saved, edits])

  const save = useCallback(async () => {
    if (dirtyIds.size === 0) return
    const payload = saved
      .filter((workspace) => dirtyIds.has(workspace.org_id))
      .map((workspace) => {
        const row = edits.get(workspace.org_id) ?? workspace
        return {
          org_id: row.org_id,
          auto_crawl: row.auto_crawl,
          gsc_connector: row.gsc_connector,
          ai_chat: row.ai_chat,
          disabled_ai_tools: row.disabled_ai_tools,
        }
      })

    setSaving(true)
    try {
      const data = await clientApiPut<AdminFeaturesResponse>(
        "/admin/features",
        { workspaces: payload }
      )
      setSaved(data.workspaces ?? [])
      setToolGroups(data.tool_groups ?? toolGroups)
      setEdits(new Map())
      toast.success(
        `Saved ${payload.length} workspace${payload.length === 1 ? "" : "s"}`
      )
    } catch {
      toast.error("Failed to save feature settings")
    } finally {
      setSaving(false)
    }
  }, [dirtyIds, saved, edits, toolGroups])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return saved
    return saved.filter((workspace) =>
      workspace.org_name.toLowerCase().includes(query)
    )
  }, [saved, search])

  const openWorkspace = saved.find(
    (workspace) => workspace.org_id === openOrgId
  )
  const open = openWorkspace ? rowFor(openWorkspace) : null

  const enabledToolCount = (row: AdminWorkspaceFeatures) =>
    row.ai_chat ? allTools.length - row.disabled_ai_tools.length : 0

  /** Short chips showing what is restricted, so the list reads without opening it. */
  const restrictionChips = (row: AdminWorkspaceFeatures) => {
    const chips: string[] = []
    for (const column of FEATURE_COLUMNS) {
      if (!row[column.key]) chips.push(`${column.label} off`)
    }
    if (row.ai_chat && row.disabled_ai_tools.length > 0) {
      chips.push(
        `${row.disabled_ai_tools.length} tool${row.disabled_ai_tools.length === 1 ? "" : "s"} off`
      )
    }
    return chips
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-lg">Feature toggles</h2>
          <p className="text-muted-foreground text-sm">
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
          <Button onClick={save} disabled={dirtyIds.size === 0 || saving}>
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
          <p className="px-4 py-12 text-center text-muted-foreground text-sm">
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
                      className="truncate font-medium text-sm"
                      title={workspace.org_name}
                    >
                      {workspace.org_name}
                    </span>
                    {isDirty ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-amber-600 text-xs dark:text-amber-500"
                      >
                        Unsaved
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {chips.length === 0 ? (
                      <span className="text-muted-foreground text-xs">
                        All features on
                      </span>
                    ) : (
                      chips.map((chip) => (
                        <Badge
                          key={chip}
                          variant="secondary"
                          className="font-normal text-xs"
                        >
                          {chip}
                        </Badge>
                      ))
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {enabledToolCount(row)}/{allTools.length} tools
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
            setToolsOpen(false)
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

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
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

                {/* AI tools live one level deeper: 17 checkboxes would bury the
                    three settings most edits are actually about. */}
                <button
                  type="button"
                  disabled={!open.ai_chat}
                  onClick={() => setToolsOpen(true)}
                  className="mt-2 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50"
                >
                  <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-sm">AI tools</span>
                    <span className="mt-0.5 block text-muted-foreground text-xs">
                      {open.ai_chat
                        ? `${enabledToolCount(open)} of ${allTools.length} enabled`
                        : "AI Chat is off, so every tool is disabled"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </div>

              <DrawerFooter className="flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => setOpenOrgId(null)}>
                  Close
                </Button>
                <Button
                  onClick={save}
                  disabled={dirtyIds.size === 0 || saving}
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
                open={toolsOpen}
                onOpenChange={setToolsOpen}
              >
                <DrawerContent className="sm:max-w-md">
                  <DrawerHeader>
                    <DrawerTitle>AI tools</DrawerTitle>
                    <DrawerDescription>
                      {enabledToolCount(open)} of {allTools.length} enabled for{" "}
                      {openWorkspace.org_name}.
                    </DrawerDescription>
                  </DrawerHeader>

                  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
                    {toolGroups.map((group) => {
                      const disabledSet = new Set(open.disabled_ai_tools)
                      const groupEnabled = group.tools.filter(
                        (tool) => !disabledSet.has(tool)
                      ).length
                      const allOn = groupEnabled === group.tools.length

                      return (
                        <div key={group.id} className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-xs uppercase tracking-wide">
                              {group.label}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {groupEnabled}/{group.tools.length}
                            </span>
                            <span className="h-px flex-1 bg-border" />
                            <button
                              type="button"
                              className="text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
                              onClick={() =>
                                setToolsEnabled(
                                  openWorkspace,
                                  group.tools,
                                  !allOn
                                )
                              }
                            >
                              {allOn ? "none" : "all"}
                            </button>
                          </div>
                          {group.tools.map((tool) => (
                            <ToggleRow
                              key={tool}
                              mono
                              checked={!disabledSet.has(tool)}
                              label={tool}
                              onChange={(checked) =>
                                setToolsEnabled(openWorkspace, [tool], checked)
                              }
                            />
                          ))}
                        </div>
                      )
                    })}
                  </div>

                  <DrawerFooter className="flex-row justify-between gap-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setToolsEnabled(openWorkspace, allTools, true)
                        }
                      >
                        Enable all
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setToolsEnabled(openWorkspace, allTools, false)
                        }
                      >
                        Disable all
                      </Button>
                    </div>
                    <Button variant="outline" onClick={() => setToolsOpen(false)}>
                      Done
                    </Button>
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
