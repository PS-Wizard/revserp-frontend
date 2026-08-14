import { ChevronRight } from "lucide-react"
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
  DrawerTitle,
} from "~/components/ui/drawer"
import { Input } from "~/components/ui/input"
import { clientApiFetch, clientApiPut } from "~/lib/api"
import type {
  AdminFeaturesResponse,
  AdminWorkspaceFeatures,
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
      setSaved(data.workspaces ?? [])
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
        FEATURE_COLUMNS.some(
          (column) => edited[column.key] !== workspace[column.key]
        )
      ) {
        changed.add(workspace.org_id)
      }
    }
    return changed
  }, [saved, edits])

  const save = useCallback(async () => {
    if (dirtyIds.size === 0) return
    const workspaces = saved
      .filter((workspace) => dirtyIds.has(workspace.org_id))
      .map((workspace) => {
        const row = rowFor(workspace)
        return {
          org_id: row.org_id,
          auto_crawl: row.auto_crawl,
          gsc_connector: row.gsc_connector,
          ai_chat: row.ai_chat,
        }
      })

    setSaving(true)
    try {
      const data = await clientApiPut<AdminFeaturesResponse>(
        "/admin/features",
        { workspaces }
      )
      setSaved(data.workspaces ?? [])
      setEdits(new Map())
      toast.success(
        `Saved ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`
      )
    } catch {
      toast.error("Failed to save feature settings")
    } finally {
      setSaving(false)
    }
  }, [dirtyIds, saved, rowFor])

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
              </div>

              <DrawerFooter className="flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => setOpenOrgId(null)}>
                  Close
                </Button>
                <Button onClick={save} disabled={dirtyIds.size === 0 || saving}>
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
