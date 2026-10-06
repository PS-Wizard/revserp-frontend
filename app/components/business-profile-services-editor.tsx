import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, Trash2Icon } from "lucide-react"

import {
  createLocalSeoProjectService,
  deleteLocalSeoProjectService,
  fetchLocalSeoProjectServices,
  localSeoLocationQueryKey,
  localSeoLocationServicesQueryKey,
  localSeoLocationsQueryKey,
  localSeoProjectServicesQueryKey,
  renameLocalSeoProjectService,
  type LocalSeoProjectService,
} from "~/lib/local-seo-api"
import { Button } from "~/components/ui/button"
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Skeleton } from "~/components/ui/skeleton"

export type BusinessProfileServicesEditorProps = {
  projectId: string
  canManage: boolean
  disabled?: boolean
}

function servicesErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message !== "") return error.message
  return fallback
}

export function BusinessProfileServicesEditor({
  projectId,
  canManage,
  disabled = false,
}: BusinessProfileServicesEditorProps) {
  return (
    <BusinessProfileServicesEditorInner
      key={projectId}
      projectId={projectId}
      canManage={canManage}
      disabled={disabled}
    />
  )
}

function BusinessProfileServicesEditorInner({
  projectId,
  canManage,
  disabled,
}: BusinessProfileServicesEditorProps) {
  const queryClient = useQueryClient()
  const fieldsDisabled = disabled || !canManage

  const catalogQuery = useQuery({
    queryKey: localSeoProjectServicesQueryKey(projectId),
    queryFn: () => fetchLocalSeoProjectServices(projectId),
  })

  const [newServiceLabel, setNewServiceLabel] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameLabel, setRenameLabel] = useState("")

  function invalidateCachesFor(varsProjectId: string) {
    void queryClient.invalidateQueries({
      queryKey: localSeoProjectServicesQueryKey(varsProjectId),
    })
    void queryClient.invalidateQueries({
      queryKey: localSeoLocationServicesQueryKey(varsProjectId, "").slice(0, 2),
    })
    void queryClient.invalidateQueries({
      queryKey: localSeoLocationQueryKey(varsProjectId, "").slice(0, 2),
    })
    void queryClient.invalidateQueries({
      queryKey: localSeoLocationsQueryKey(varsProjectId),
    })
  }

  const createMutation = useMutation({
    mutationFn: (input: { projectId: string; label: string }) =>
      createLocalSeoProjectService(input.projectId, input.label),
    onSuccess: (_data, vars) => {
      setNewServiceLabel("")
      invalidateCachesFor(vars.projectId)
    },
  })
  const renameMutation = useMutation({
    mutationFn: (input: {
      projectId: string
      serviceId: string
      label: string
    }) =>
      renameLocalSeoProjectService(
        input.projectId,
        input.serviceId,
        input.label
      ),
    onSuccess: (_data, vars) => {
      setRenamingId(null)
      invalidateCachesFor(vars.projectId)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (input: { projectId: string; serviceId: string }) =>
      deleteLocalSeoProjectService(input.projectId, input.serviceId),
    onSuccess: (_data, vars) => invalidateCachesFor(vars.projectId),
  })
  const mutationPending =
    createMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending

  const catalog = catalogQuery.data ?? []
  const canAdd = newServiceLabel.trim() !== "" && !createMutation.isPending
  const mutationError =
    createMutation.error ?? renameMutation.error ?? deleteMutation.error

  function startRename(service: LocalSeoProjectService) {
    setRenamingId(service.id)
    setRenameLabel(service.label)
  }

  function submitRename() {
    if (renamingId === null) return
    const label = renameLabel.trim()
    if (label === "") return
    renameMutation.mutate({ projectId, serviceId: renamingId, label })
  }

  if (!canManage) {
    return (
      <FieldSet>
        <FieldLegend variant="label">Services the business sells</FieldLegend>
        <FieldDescription>
          Services added here are available at all locations. Deselect services
          a location does not offer.
        </FieldDescription>
        {catalogQuery.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : catalogQuery.isError ? (
          <FieldError>
            {servicesErrorText(catalogQuery.error, "Could not load services")}
          </FieldError>
        ) : catalog.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border/60">
            {catalog.map((service) => (
              <li key={service.id} className="py-2 text-sm">
                {service.label}
              </li>
            ))}
          </ul>
        ) : (
          <FieldDescription>No services yet.</FieldDescription>
        )}
      </FieldSet>
    )
  }

  return (
    <FieldSet
      disabled={disabled || mutationPending}
      aria-busy={mutationPending}
    >
      <FieldLegend variant="label">Services the business sells</FieldLegend>
      <FieldDescription>
        Service changes save separately. Locations choose from this list.
        Services added here are available at all locations. Deselect services a
        location does not offer.
      </FieldDescription>

      {catalogQuery.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : catalogQuery.isError ? (
        <FieldError>
          {servicesErrorText(catalogQuery.error, "Could not load services")}
        </FieldError>
      ) : (
        <>
          {catalog.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border/60">
              {catalog.map((service) =>
                renamingId === service.id ? (
                  <li key={service.id} className="flex items-center gap-2 py-2">
                    <Input
                      aria-label={`Rename service ${service.label}`}
                      value={renameLabel}
                      autoComplete="off"
                      onChange={(event) => setRenameLabel(event.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        renameLabel.trim() === "" || renameMutation.isPending
                      }
                      aria-label={`Save rename for service ${service.label}`}
                      onClick={submitRename}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </Button>
                  </li>
                ) : (
                  <li key={service.id} className="flex items-center gap-3 py-2">
                    <span className="text-sm">{service.label}</span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="ml-auto"
                      aria-label={`Rename service ${service.label}`}
                      disabled={fieldsDisabled}
                      onClick={() => startRename(service)}
                    >
                      <PencilIcon aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete service ${service.label}`}
                      disabled={fieldsDisabled}
                      onClick={() =>
                        deleteMutation.mutate({
                          projectId,
                          serviceId: service.id,
                        })
                      }
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </li>
                )
              )}
            </ul>
          ) : (
            <FieldDescription>
              No services yet. Add the first one below.
            </FieldDescription>
          )}

          <div className="flex items-center gap-2">
            <Input
              aria-label="New service label"
              value={newServiceLabel}
              autoComplete="off"
              disabled={fieldsDisabled}
              onChange={(event) => setNewServiceLabel(event.target.value)}
              aria-describedby={
                canAdd ? undefined : "business-profile-service-add-hint"
              }
            />
            <Button
              type="button"
              disabled={!canAdd || fieldsDisabled}
              aria-describedby={
                canAdd ? undefined : "business-profile-service-add-hint"
              }
              onClick={() => {
                const label = newServiceLabel.trim()
                if (label !== "") createMutation.mutate({ projectId, label })
              }}
            >
              Add service
            </Button>
          </div>
          {canAdd ? null : (
            <FieldDescription id="business-profile-service-add-hint">
              Enter a label to add a service.
            </FieldDescription>
          )}
        </>
      )}

      {mutationError ? (
        <FieldError>
          {servicesErrorText(mutationError, "Could not update services")}
        </FieldError>
      ) : null}
    </FieldSet>
  )
}
