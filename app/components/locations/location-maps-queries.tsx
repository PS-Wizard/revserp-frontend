"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon, PlusIcon, SparklesIcon, XIcon } from "lucide-react"

import { ApiError } from "~/lib/api"
import {
  fetchLocalSeoLocationQueryRecords,
  localSeoLocationQueryKey,
  localSeoLocationQueryRecordsQueryKey,
  updateLocalSeoLocationQueryRecords,
  validateEditableLocalSeoQueries,
  type LocalSeoLocationQueryDraft,
  type LocalSeoLocationQueryRecord,
  type LocalSeoQueryKind,
  type LocalSeoQuerySource,
} from "~/lib/local-seo-api"
import {
  fetchLocationMapsQueriesStatus,
  locationMapsQueriesRefetchInterval,
  locationMapsQueriesStatusQueryKey,
  regenerateLocationMapsQueries,
} from "~/lib/location-setup-api"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import { useOrganizationEventsListener } from "~/hooks/use-organization-events"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"

function errorMessageOf(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

type Row = {
  key: string
  id?: string
  text: string
  enabled: boolean
  kind: LocalSeoQueryKind
  source: LocalSeoQuerySource
  landmark_id: string | null
}

function toRows(records: LocalSeoLocationQueryRecord[]): Row[] {
  return records.map((record) => ({
    key: record.id,
    id: record.id,
    text: record.text,
    enabled: record.enabled,
    kind: record.kind,
    source: record.source,
    landmark_id: record.landmark_id,
  }))
}

function toDrafts(rows: Row[]): LocalSeoLocationQueryDraft[] {
  return rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    text: row.text.trim(),
    enabled: row.enabled,
    kind: row.kind,
    source: row.source,
  }))
}

export function LocationMapsQueriesPanel({
  projectId,
  locationId,
  onRunBlockedChange,
}: {
  projectId: string
  locationId: string
  onRunBlockedChange?: (blocked: boolean) => void
}) {
  const queryClient = useQueryClient()
  const workspace = useOptionalLocationWorkspace()
  const canManage = workspace?.canManage ?? false
  const [rows, setRows] = useState<Row[] | null>(null)
  const [dirty, setDirty] = useState(false)
  const [newQuery, setNewQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [regenerating, setRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState("")

  const recordsQuery = useQuery({
    queryKey: localSeoLocationQueryRecordsQueryKey(projectId, locationId),
    queryFn: () => fetchLocalSeoLocationQueryRecords(projectId, locationId),
    enabled: projectId !== "" && locationId !== "",
    retry: false,
  })
  const statusQuery = useQuery({
    queryKey: locationMapsQueriesStatusQueryKey(projectId, locationId),
    queryFn: () => fetchLocationMapsQueriesStatus(projectId, locationId),
    enabled: projectId !== "" && locationId !== "",
    refetchInterval: (query) =>
      locationMapsQueriesRefetchInterval(query.state.data?.status),
    retry: false,
  })

  useEffect(() => {
    setRows(null)
    setDirty(false)
    setNewQuery("")
    setSaveError("")
    setRegenerateError("")
  }, [projectId, locationId])

  useEffect(() => {
    if (recordsQuery.data && !dirty) setRows(toRows(recordsQuery.data))
  }, [recordsQuery.data, dirty])

  useOrganizationEventsListener((event) => {
    if (!projectId || !locationId) return
    if ((event.project_id ?? null) !== projectId) return
    const payload = event.payload as { location_id?: unknown }
    if (payload.location_id !== locationId) return
    void queryClient.invalidateQueries({
      queryKey: localSeoLocationQueryRecordsQueryKey(projectId, locationId),
    })
    void queryClient.invalidateQueries({
      queryKey: locationMapsQueriesStatusQueryKey(projectId, locationId),
    })
  })

  const status = statusQuery.data?.status ?? "idle"
  const jobActive = status === "pending" || status === "running" || regenerating

  const previousStatusRef = useRef(status)
  useEffect(() => {
    const previous = previousStatusRef.current
    previousStatusRef.current = status
    const wasActive = previous === "pending" || previous === "running"
    if (wasActive && status === "completed") {
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationQueryRecordsQueryKey(projectId, locationId),
      })
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationQueryKey(projectId, locationId),
      })
    }
  }, [status, projectId, locationId, queryClient])

  const runBlocked =
    dirty ||
    saving ||
    jobActive ||
    recordsQuery.isPending ||
    recordsQuery.isError
  useEffect(() => {
    onRunBlockedChange?.(runBlocked)
  }, [onRunBlockedChange, runBlocked])

  function editRows(next: (current: Row[]) => Row[]) {
    setRows((current) => next(current ?? []))
    setDirty(true)
  }

  const mapRows = (rows ?? []).filter((row) => row.kind === "map")
  const keptCount = (rows ?? []).length - mapRows.length
  const validationError = validateEditableLocalSeoQueries(
    mapRows.map((row) => row.text)
  )
  const disabled = !canManage || saving

  async function handleSave() {
    if (!rows || saving || validationError) return
    setSaving(true)
    setSaveError("")
    try {
      const saved = await updateLocalSeoLocationQueryRecords(
        projectId,
        locationId,
        toDrafts(rows.filter((row) => row.kind === "map"))
      )
      const previous =
        queryClient.getQueryData<LocalSeoLocationQueryRecord[]>(
          localSeoLocationQueryRecordsQueryKey(projectId, locationId)
        ) ?? []
      const merged = [
        ...saved,
        ...previous.filter((record) => record.kind !== "map"),
      ]
      setRows(toRows(merged))
      setDirty(false)
      queryClient.setQueryData(
        localSeoLocationQueryRecordsQueryKey(projectId, locationId),
        merged
      )
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationQueryKey(projectId, locationId),
      })
    } catch (error) {
      setSaveError(errorMessageOf(error, "Could not save map queries."))
    } finally {
      setSaving(false)
    }
  }

  async function handleRegenerate() {
    if (regenerating || jobActive || dirty) return
    setRegenerating(true)
    setRegenerateError("")
    try {
      const next = await regenerateLocationMapsQueries(projectId, locationId)
      queryClient.setQueryData(
        locationMapsQueriesStatusQueryKey(projectId, locationId),
        next
      )
      await statusQuery.refetch()
      await queryClient.invalidateQueries({
        queryKey: localSeoLocationQueryRecordsQueryKey(projectId, locationId),
      })
    } catch (error) {
      setRegenerateError(errorMessageOf(error, "Could not queue regeneration."))
    } finally {
      setRegenerating(false)
    }
  }

  function addManualQuery() {
    const text = newQuery.trim()
    if (!text || disabled) return
    editRows((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        text,
        enabled: true,
        kind: "map",
        source: "manual",
        landmark_id: null,
      },
    ])
    setNewQuery("")
  }

  const recordsFailed = recordsQuery.isError && rows === null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Map queries</CardTitle>
        <CardDescription>
          RevBot suggests up to 10 queries. Add your own as needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {recordsFailed ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessageOf(recordsQuery.error, "Could not load map queries.")}{" "}
            <Button
              size="xs"
              type="button"
              variant="outline"
              onClick={() => void recordsQuery.refetch()}
            >
              Try again
            </Button>
          </p>
        ) : recordsQuery.isPending || rows === null ? (
          <p className="text-sm text-muted-foreground">Loading map queries…</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {mapRows.map((row) => (
                <li key={row.key} className="flex items-center gap-2">
                  <Checkbox
                    aria-label={`Enable query ${row.text}`}
                    checked={row.enabled}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      editRows((current) =>
                        current.map((entry) =>
                          entry.key === row.key
                            ? { ...entry, enabled: checked }
                            : entry
                        )
                      )
                    }
                  />
                  <Input
                    aria-label="Map query text"
                    className="min-w-0 flex-1"
                    disabled={disabled}
                    value={row.text}
                    onChange={(event) =>
                      editRows((current) =>
                        current.map((entry) =>
                          entry.key === row.key
                            ? { ...entry, text: event.target.value }
                            : entry
                        )
                      )
                    }
                  />
                  {row.source === "manual" ? (
                    <Button
                      aria-label={`Remove query ${row.text}`}
                      disabled={disabled}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        editRows((current) =>
                          current.filter((entry) => entry.key !== row.key)
                        )
                      }
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {mapRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No map queries yet. Generate a set or add one manually.
              </p>
            ) : null}
            {keptCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {keptCount} non-map {keptCount === 1 ? "record" : "records"}{" "}
                kept server-side, never sent from here.
              </p>
            ) : null}
            {canManage ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  addManualQuery()
                }}
              >
                <Input
                  aria-label="New manual map query"
                  className="min-w-0 flex-1"
                  disabled={disabled}
                  placeholder="e.g. emergency plumber downtown"
                  value={newQuery}
                  onChange={(event) => setNewQuery(event.target.value)}
                />
                <Button
                  disabled={!newQuery.trim() || disabled}
                  size="sm"
                  type="submit"
                  variant="outline"
                >
                  <PlusIcon aria-hidden="true" data-icon="inline-start" />
                  Add
                </Button>
              </form>
            ) : null}
            {validationError ? (
              <p className="text-sm text-destructive" role="alert">
                {validationError}
              </p>
            ) : null}
            {dirty ? (
              <p className="text-sm text-muted-foreground" role="status">
                Unsaved query edits. Save first: a paid run prices the last
                saved set, not what is typed above.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={disabled || validationError !== null}
                size="sm"
                type="button"
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <Loader2Icon
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : null}
                {saving ? "Saving…" : "Save queries"}
              </Button>
              {canManage ? (
                <Button
                  disabled={disabled || regenerating || jobActive || dirty}
                  title={dirty ? "Save queries before regenerating" : undefined}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void handleRegenerate()}
                >
                  {jobActive ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <SparklesIcon aria-hidden="true" data-icon="inline-start" />
                  )}
                  {jobActive ? "Regenerating…" : "Regenerate"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only workspace managers can edit map queries.
                </p>
              )}
            </div>
            {saveError ? (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            ) : null}
            {regenerateError || status === "failed" ? (
              <p className="text-sm text-destructive" role="alert">
                {regenerateError ||
                  statusQuery.data?.error ||
                  "Query regeneration failed. Your saved queries are unchanged."}
              </p>
            ) : null}
            {status === "completed" ? (
              <p className="text-sm text-muted-foreground" role="status">
                Regeneration finished; the refreshed list is above.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
