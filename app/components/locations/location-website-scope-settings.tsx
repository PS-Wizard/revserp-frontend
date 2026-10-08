"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"

import { ApiError } from "~/lib/api"
import type {
  LocationWorkspace,
  LocationWebsiteScopeRevision,
} from "~/lib/location-workspace"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { FieldError } from "~/components/ui/field"
import {
  invalidateLocationWebsiteAudit,
  useLocationWebsiteAuditBreakdown,
} from "~/components/locations/location-website-audit-api"
import {
  describeLocationWebsiteScopeMatch,
  saveLocationWebsiteScope,
  validateLocationWebsiteScopeInput,
  type LocationWebsiteScopeInput,
} from "~/components/locations/location-website-scope"
import { LocationWebsiteScopeFields } from "~/components/locations/location-website-scope-fields"
import { LocationWebsiteScopeHistory } from "~/components/locations/location-website-scope-history"

/**
 * Post-save refresh: revalidates the authoritative workspace context when
 * the shell supplies refresh, then invalidates every cached branch audit
 * read so panels refetch. No browser reload, ever.
 */
export function refreshLocationWebsiteAuditAfterSave(
  workspace: LocationWorkspace | null | undefined,
  invalidate: (filters: { queryKey: readonly unknown[] }) => unknown,
  projectId: string,
  locationId: string
) {
  workspace?.refresh?.()
  invalidateLocationWebsiteAudit(invalidate, projectId, locationId)
}

/**
 * Shared scope save: PUTs a new revision, then refreshes workspace and
 * audit caches through refreshLocationWebsiteAuditAfterSave.
 */
export function useSaveLocationWebsiteScope(
  projectId: string,
  locationId: string,
  workspace?: LocationWorkspace | null
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LocationWebsiteScopeInput) =>
      saveLocationWebsiteScope(projectId, locationId, input),
    onSuccess: (revision) => {
      refreshLocationWebsiteAuditAfterSave(
        workspace,
        (filters) => void queryClient.invalidateQueries(filters),
        projectId,
        locationId
      )
      return revision
    },
  })
}

/**
 * Dedicated website scope settings: current scope, editor, revision
 * history, and branch measurement limits. Rendered from a navbar action
 * or an empty state, never inline on every report.
 */
export function LocationWebsiteScopeSettingsDialog({
  projectId,
  locationId,
  workspace,
  parentUrl,
  open,
  onOpenChange,
}: {
  projectId: string
  locationId: string
  workspace: LocationWorkspace | null
  parentUrl?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const scope = workspace?.websiteScope ?? null
  const revisions = workspace?.websiteScopeRevisions ?? []
  const canManage = workspace?.canManage ?? false
  const [fields, setFields] = useState({
    match: scope?.match ?? ("exact" as const),
    url: scope?.url ?? "",
  })

  const wasOpenRef = useRef(open)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = open
    if (!wasOpen && open) {
      setFields({ match: scope?.match ?? "exact", url: scope?.url ?? "" })
    }
  }, [open, scope?.match, scope?.url])

  const saveMutation = useSaveLocationWebsiteScope(
    projectId,
    locationId,
    workspace
  )
  const validationError = validateLocationWebsiteScopeInput(
    fields.url,
    fields.match
  )
  const serverError =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : saveMutation.error instanceof Error
        ? saveMutation.error.message
        : null

  const limitsQuery = useLocationWebsiteAuditBreakdown(projectId, locationId, {
    crawlId: null,
    scopeRevision: scope?.revision ?? null,
    enabled: open && scope !== null && scope.match !== "none",
  })
  const limits = limitsQuery.data
  const unsupported = limits?.unsupported_buckets ?? []
  const excluded = limits?.excluded_sitewide_issue_types ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Website scope</DialogTitle>
          <DialogDescription>
            {scope && scope.match !== "none" && scope.url
              ? `${describeLocationWebsiteScopeMatch(scope.match)} · ${scope.url} · Rev ${scope.revision}. Saving appends a revision; earlier revisions stay readable.`
              : "Choose which parent-site pages belong to this location."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {canManage ? (
            <div className="flex flex-col gap-3">
              <LocationWebsiteScopeFields
                value={fields}
                onChange={setFields}
                parentUrl={parentUrl}
                idPrefix="location-website-scope-settings"
              />
              {serverError && <FieldError>{serverError}</FieldError>}
              <div>
                <Button
                  disabled={
                    validationError !== null || saveMutation.isPending
                  }
                  onClick={() =>
                    saveMutation.mutate(
                      {
                        url: fields.match === "none" ? null : fields.url.trim(),
                        match: fields.match,
                      },
                      { onSuccess: () => onOpenChange(false) }
                    )
                  }
                >
                  {saveMutation.isPending && (
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
                  )}
                  Save scope
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only managers can change the branch scope.
            </p>
          )}
          {revisions.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Revision history</h3>
              <LocationWebsiteScopeHistory revisions={revisions} />
            </div>
          )}
          {(unsupported.length > 0 || excluded.length > 0) && (
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <h3 className="font-medium text-foreground">
                Not measured for branches
              </h3>
              {unsupported.length > 0 && (
                <p>
                  Lab buckets unavailable per branch: {unsupported.join(", ")}.
                </p>
              )}
              {excluded.length > 0 && (
                <p>Site-wide checks excluded: {excluded.join(", ")}.</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Navbar action for website scope settings. The shell owner places this in
 * the existing navbar when a location is selected; the dialog state stays
 * inside this component so no cross-file wiring is needed:
 *
 *   <LocationWebsiteScopeSettingsButton
 *     projectId={projectId}
 *     locationId={locationId}
 *     workspace={workspace}
 *     parentUrl={parentWebsiteUrl}
 *   />
 */
export function LocationWebsiteScopeSettingsButton({
  projectId,
  locationId,
  workspace,
  parentUrl,
  label = "Website scope",
}: {
  projectId: string
  locationId: string
  workspace: LocationWorkspace | null
  parentUrl?: string | null
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <LocationWebsiteScopeSettingsDialog
        projectId={projectId}
        locationId={locationId}
        workspace={workspace}
        parentUrl={parentUrl}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

export type { LocationWebsiteScopeRevision }
