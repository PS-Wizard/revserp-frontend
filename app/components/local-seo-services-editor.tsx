import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon } from "lucide-react"

import {
  fetchLocalSeoLocationServices,
  localSeoLocationQueryKey,
  localSeoLocationServicesQueryKey,
  localSeoLocationsQueryKey,
  updateLocalSeoLocationServices,
  type LocalSeoLocationServices,
} from "~/lib/local-seo-api"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"

export type LocalSeoServicesEditorProps = {
  projectId: string
  locationId: string
}

export type LocalSeoServicesDraft = {
  excludedIds: string[]
  localOnly: string[]
}

function localSeoServicesErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message !== "") return error.message
  return fallback
}

function sameLocalSeoServiceMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const seen = new Set(a)
  return b.every((value) => seen.has(value))
}

function sameLocalSeoServicesDraft(
  a: LocalSeoServicesDraft,
  b: LocalSeoServicesDraft
): boolean {
  return (
    sameLocalSeoServiceMembers(a.excludedIds, b.excludedIds) &&
    sameLocalSeoServiceMembers(a.localOnly, b.localOnly)
  )
}

/**
 * Draft the per-location service overrides from the server's final list.
 * Project services are included by default, so only excluded ids are drafted;
 * location-only labels are the only explicit includes the editor sends.
 */
export function seedLocalSeoServicesDraft(
  services: LocalSeoLocationServices
): LocalSeoServicesDraft {
  return {
    excludedIds: services.project
      .filter((option) => option.excluded)
      .map((option) => option.id),
    localOnly: [...services.location_only],
  }
}

/**
 * Full-replace override payload. Sends excluded project ids and local-only
 * labels only; a re-included project service needs no redundant include row.
 */
export function buildLocalSeoServicesOverrides(
  draft: LocalSeoServicesDraft
): import("~/lib/local-seo-api").LocalSeoServiceOverride[] {
  return [
    ...draft.excludedIds.map((serviceId) => ({
      service_id: serviceId,
      service_label: null,
      mode: "exclude" as const,
    })),
    ...draft.localOnly.map((serviceLabel) => ({
      service_id: null,
      service_label: serviceLabel,
      mode: "include" as const,
    })),
  ]
}

/**
 * Services selector for one location. Opt-out (Model A): the BusinessProfile
 * service catalog is included by default and this location only deselects.
 * The catalog itself is managed in the BusinessProfile, never here, so this
 * editor performs no catalog writes. Location-only rows stay explicitly
 * labeled and are preserved in the payload.
 */
export function LocalSeoServicesEditor({
  projectId,
  locationId,
}: LocalSeoServicesEditorProps) {
  return (
    <LocalSeoServicesEditorInner
      key={`${projectId}:${locationId}`}
      projectId={projectId}
      locationId={locationId}
    />
  )
}

function LocalSeoServicesEditorInner({
  projectId,
  locationId,
}: LocalSeoServicesEditorProps) {
  const queryClient = useQueryClient()

  const servicesQuery = useQuery({
    queryKey: localSeoLocationServicesQueryKey(projectId, locationId),
    queryFn: () => fetchLocalSeoLocationServices(projectId, locationId),
  })

  const [draft, setDraft] = useState<LocalSeoServicesDraft | null>(null)
  const [baseline, setBaseline] = useState<LocalSeoServicesDraft | null>(null)
  const [seedEpoch, setSeedEpoch] = useState(0)
  const [seededEpoch, setSeededEpoch] = useState(-1)
  const [localOnlyInput, setLocalOnlyInput] = useState("")

  const services = servicesQuery.data ?? null

  if (services !== null && seededEpoch !== seedEpoch) {
    const seeded = seedLocalSeoServicesDraft(services)
    setSeededEpoch(seedEpoch)
    setDraft(seeded)
    setBaseline(seeded)
  }

  const saveMutation = useMutation({
    mutationFn: (next: LocalSeoServicesDraft) =>
      updateLocalSeoLocationServices(
        projectId,
        locationId,
        buildLocalSeoServicesOverrides(next)
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(
        localSeoLocationServicesQueryKey(projectId, locationId),
        saved
      )
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationQueryKey(projectId, locationId),
      })
      void queryClient.invalidateQueries({
        queryKey: localSeoLocationsQueryKey(projectId),
      })
      setSeedEpoch((epoch) => epoch + 1)
    },
  })

  const dirty =
    draft !== null &&
    baseline !== null &&
    !sameLocalSeoServicesDraft(draft, baseline)
  const canSave = draft !== null && dirty && !saveMutation.isPending
  const pendingLocalOnly = localOnlyInput.trim()
  const canAddLocalOnly = pendingLocalOnly !== ""

  function toggleIncluded(serviceId: string, included: boolean) {
    if (draft === null) return
    setDraft({
      ...draft,
      excludedIds: included
        ? draft.excludedIds.filter((id) => id !== serviceId)
        : [...draft.excludedIds, serviceId],
    })
  }

  function addLocalOnly() {
    if (draft === null) return
    const label = localOnlyInput.trim()
    if (label === "") return
    const duplicate = draft.localOnly.some(
      (existing) => existing.toLowerCase() === label.toLowerCase()
    )
    if (!duplicate) {
      setDraft({ ...draft, localOnly: [...draft.localOnly, label] })
    }
    setLocalOnlyInput("")
  }

  function removeLocalOnly(label: string) {
    if (draft === null) return
    setDraft({
      ...draft,
      localOnly: draft.localOnly.filter((existing) => existing !== label),
    })
  }

  function save() {
    if (draft === null || services === null) return
    const projectIds = new Set(services.project.map((option) => option.id))
    saveMutation.mutate({
      excludedIds: draft.excludedIds.filter((id) => projectIds.has(id)),
      localOnly: draft.localOnly,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="local-seo-saved-services-heading"
        className="flex flex-col gap-2"
      >
        <h3
          id="local-seo-saved-services-heading"
          className="text-sm font-medium"
        >
          Saved services
        </h3>
        {servicesQuery.isPending ? (
          <Skeleton className="h-5 w-48" />
        ) : servicesQuery.isError ? (
          <FieldError>
            {localSeoServicesErrorText(
              servicesQuery.error,
              "Could not load this location's services"
            )}
          </FieldError>
        ) : services !== null && services.effective.length > 0 ? (
          <ul
            aria-label="Saved services for this location"
            className="flex flex-col divide-y divide-border/60 text-sm"
          >
            {services.effective.map((label, index) => (
              <li key={`${index}:${label}`} className="py-1.5">
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <FieldDescription>
            No services saved for this location yet.
          </FieldDescription>
        )}
      </section>

      <FieldSet
        disabled={saveMutation.isPending}
        aria-busy={saveMutation.isPending}
      >
        <FieldLegend variant="label">Location services</FieldLegend>
        <FieldDescription>
          Choose which services this location offers. Toggles stay unsaved
          until you save.
        </FieldDescription>

        {servicesQuery.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : servicesQuery.isError ? (
          <FieldError>
            {localSeoServicesErrorText(
              servicesQuery.error,
              "Could not load this location's services"
            )}
          </FieldError>
        ) : draft !== null && services !== null ? (
          <>
            {services.project.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border/60">
                {services.project.map((option) => {
                  const included = !draft.excludedIds.includes(option.id)
                  return (
                    <li
                      key={option.id}
                      className="flex items-center gap-3 py-2"
                    >
                      <Checkbox
                        checked={included}
                        aria-label={`Include ${option.label} for this location`}
                        onCheckedChange={(checked) =>
                          toggleIncluded(option.id, checked)
                        }
                      />
                      <span className="text-sm">{option.label}</span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <FieldDescription>
                No services in the catalog yet. Add services in Business
                profile, then select them here. You can also add a local-only
                service below.
              </FieldDescription>
            )}

            {draft.localOnly.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border/60">
                {draft.localOnly.map((label) => (
                  <li key={label} className="flex items-center gap-3 py-2">
                    <span className="text-sm">{label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Local only
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove local-only service ${label}`}
                      onClick={() => removeLocalOnly(label)}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex items-center gap-2">
              <Input
                aria-label="New local-only service label"
                value={localOnlyInput}
                autoComplete="off"
                onChange={(event) => setLocalOnlyInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  if (event.nativeEvent.isComposing) return
                  event.preventDefault()
                  addLocalOnly()
                }}
                aria-describedby={
                  canAddLocalOnly
                    ? "local-seo-local-only-pending"
                    : "local-seo-local-only-hint"
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={!canAddLocalOnly}
                aria-describedby={
                  canAddLocalOnly ? undefined : "local-seo-local-only-hint"
                }
                onClick={addLocalOnly}
              >
                Add local-only service
              </Button>
            </div>
            {canAddLocalOnly ? (
              <FieldDescription
                id="local-seo-local-only-pending"
                role="status"
              >
                “{pendingLocalOnly}” is not added yet. Press Enter or Add
                local-only service, then save.
              </FieldDescription>
            ) : (
              <FieldDescription id="local-seo-local-only-hint">
                Enter a label to add a local-only service.
              </FieldDescription>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" disabled={!canSave} onClick={save}>
                {saveMutation.isPending ? "Saving…" : "Save location services"}
              </Button>
              {dirty ? (
                <FieldDescription role="status">
                  Unsaved changes to this location's services.
                </FieldDescription>
              ) : null}
            </div>
            {saveMutation.isError ? (
              <FieldError>
                {localSeoServicesErrorText(
                  saveMutation.error,
                  "Could not save location services"
                )}
              </FieldError>
            ) : null}
          </>
        ) : null}
      </FieldSet>
    </div>
  )
}
