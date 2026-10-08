"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link2Icon } from "lucide-react"

import { DataLoadingState } from "~/components/data-loading-state"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { ApiError } from "~/lib/api"
import { LocationGoogleReportView } from "~/components/locations/location-google-report-view"
import { LocationGoogleSetupWizard } from "~/components/locations/location-google-setup-wizard"
import { useOptionalLocationWorkspace } from "~/lib/location-workspace"
import {
  deleteLocationGoogleBinding,
  locationGoogleBindingConfigured,
  locationGoogleBindingQueryKey,
  locationGoogleBindingQueryOptions,
  locationGoogleServiceLabel,
  locationGoogleServiceShortLabel,
  parseLocationGoogleSetupIntent,
  shouldRestoreLocationGoogleWizard,
  type LocationAnalyticsBindingResponse,
  type LocationGoogleBindingMode,
  type LocationGoogleService,
  type LocationGscBindingResponse,
} from "~/lib/location-google-api"

function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function gscOAuthNotice(status: string | null, code: string | null) {
  if (status === "connected") {
    return (
      "Google account connected. It is now available in the account list — " +
        "the parent binding was not changed."
    )
  }
  if (status !== "error") return null
  switch (code) {
    case "google_account_mismatch":
      return (
        "That Google account did not match the reconnect target. " +
          "Nothing was changed."
      )
    case "missing_refresh_token":
      return (
        "Google did not return a refresh token. Try again and grant offline access. " +
          "Nothing was changed."
      )
    case "oauth_state_expired":
      return "The connection request expired. Start again — nothing was changed."
    case "google_identity_verification_failed":
      return "Google identity verification failed. Nothing was changed."
    case "invalid_google_account":
      return "That Google account is no longer available. Nothing was changed."
    default:
      return `Google connection failed${code ? ` (${code})` : ""}. Nothing was changed.`
  }
}

export function LocationGoogleView({
  projectId,
  locationId,
  service,
}: {
  projectId: string
  locationId: string
  service: LocationGoogleService
}) {
  const queryClient = useQueryClient()
  const workspace = useOptionalLocationWorkspace()
  const canManage = workspace?.canManage ?? true
  const serviceLabel = locationGoogleServiceLabel(service)
  const serviceShort = locationGoogleServiceShortLabel(service)

  const bindingQuery = useQuery(
    locationGoogleBindingQueryOptions(projectId, locationId, service)
  )
  const binding =
    (bindingQuery.data as
      | LocationGscBindingResponse
      | LocationAnalyticsBindingResponse
      | undefined) ?? null
  const configured = binding ? locationGoogleBindingConfigured(binding) : false

  const [wizardOpen, setWizardOpen] = useState(false)
  const [draftMode, setDraftMode] =
    useState<LocationGoogleBindingMode>("inherit")
  const [wizardAccountId, setWizardAccountId] = useState("")
  const [wizardPropertyId, setWizardPropertyId] = useState("")
  const [removing, setRemoving] = useState(false)
  const [actionError, setActionError] = useState("")
  const [oauthNotice, setOauthNotice] = useState<string | null>(null)
  const [oauthReturn, setOauthReturn] = useState<string | null>(null)
  const [setupIntent, setSetupIntent] =
    useState<ReturnType<typeof parseLocationGoogleSetupIntent>>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get("gsc_status")
    const intent = parseLocationGoogleSetupIntent(params)
    if (intent) setSetupIntent(intent)
    if (status === null) {
      if (intent) {
        params.delete("google_setup")
        params.delete("google_service")
        params.delete("google_location")
        const nextSearch = params.toString()
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`
        )
      }
      return
    }
    setOauthReturn(status)
    const notice = gscOAuthNotice(status, params.get("gsc_error"))
    if (notice) setOauthNotice(notice)
    params.delete("gsc_project_id")
    params.delete("gsc_status")
    params.delete("gsc_error")
    params.delete("google_setup")
    params.delete("google_service")
    params.delete("google_location")
    const nextSearch = params.toString()
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`
    )
  }, [])

  const wizardRestoredRef = useRef(false)
  useEffect(() => {
    if (wizardRestoredRef.current || !binding) return
    if (
      !shouldRestoreLocationGoogleWizard({
        intent: setupIntent,
        service,
        locationId,
        oauthStatus: oauthReturn,
        configured: locationGoogleBindingConfigured(binding),
        canManage,
      })
    )
      return
    wizardRestoredRef.current = true
    prefillWizard(binding, setupIntent?.mode)
    setWizardOpen(true)
  }, [oauthReturn, setupIntent, binding, canManage, service, locationId])

  if (!projectId || !locationId) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Link2Icon aria-hidden="true" className="size-8" />
          </EmptyMedia>
          <EmptyTitle>No location selected</EmptyTitle>
          <EmptyDescription>
            Choose a location first to manage its {serviceLabel} binding.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (bindingQuery.isLoading && !binding) {
    return <DataLoadingState label={`Loading ${serviceLabel} binding...`} />
  }

  if (bindingQuery.isError && !binding) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Link2Icon aria-hidden="true" className="size-8" />
          </EmptyMedia>
          <EmptyTitle>Unable to load {serviceLabel} binding</EmptyTitle>
          <EmptyDescription>
            {actionErrorMessage(
              bindingQuery.error,
              `Could not load this location's ${serviceLabel} binding.`
            )}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            onClick={() => void bindingQuery.refetch()}
            size="sm"
            variant="outline"
          >
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (!binding) return null

  function prefillWizard(
    source: LocationGscBindingResponse | LocationAnalyticsBindingResponse,
    forcedMode?: LocationGoogleBindingMode
  ) {
    const effective = source.effective
    setDraftMode(
      forcedMode ??
        (source.mode === "custom" || source.mode === "off"
          ? source.mode
          : "inherit")
    )
    setWizardAccountId(
      effective?.source === "location"
        ? (effective.google_connection_id ?? "")
        : (source.google_connections[0]?.id ?? "")
    )
    if (effective?.source !== "location") {
      setWizardPropertyId("")
      return
    }
    setWizardPropertyId(
      service === "gsc"
        ? ((effective as NonNullable<
            LocationGscBindingResponse["effective"]
          >).site_url ?? "")
        : ((effective as NonNullable<
            LocationAnalyticsBindingResponse["effective"]
          >).property_id ?? "")
    )
  }

  function openWizard() {
    if (!binding) return
    prefillWizard(binding)
    setWizardOpen(true)
  }

  async function handleRemoveConfiguration() {
    if (removing) return
    setRemoving(true)
    setActionError("")
    try {
      await deleteLocationGoogleBinding(projectId, locationId, service)
      await queryClient.invalidateQueries({
        queryKey: locationGoogleBindingQueryKey(
          projectId,
          locationId,
          service
        ),
      })
    } catch (error) {
      setActionError(
        actionErrorMessage(error, "Could not remove this configuration.")
      )
    } finally {
      setRemoving(false)
    }
  }

  const wizard = (
    <Dialog
      open={wizardOpen}
      onOpenChange={(next) => {
        if (!next) setWizardOpen(false)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {serviceShort} for this location</DialogTitle>
          <DialogDescription>
            Nothing is saved until you finalize. Changing this binding never
            revokes the shared Google account, and the parent connection is
            unaffected.
          </DialogDescription>
        </DialogHeader>
        <LocationGoogleSetupWizard
          projectId={projectId}
          locationId={locationId}
          service={service}
          binding={binding}
          initialMode={draftMode}
          initialAccountId={wizardAccountId}
          initialPropertyId={wizardPropertyId}
          onClose={() => setWizardOpen(false)}
          onSaved={() => setWizardOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )

  if (!configured) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        {oauthNotice ? (
          <p className="text-sm text-muted-foreground" role="status">
            {oauthNotice}
          </p>
        ) : null}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Link2Icon aria-hidden="true" className="size-8" />
            </EmptyMedia>
            <EmptyTitle>
              {serviceLabel} isn&apos;t set up for this location
            </EmptyTitle>
            <EmptyDescription>
              Follow the parent property live, connect this location&apos;s own
              property, or leave {serviceShort} off — nothing is saved until
              you finalize.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {canManage ? (
              <Button onClick={openWizard} type="button">
                Connect {serviceShort}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only organization owners can change Google bindings.
              </p>
            )}
          </EmptyContent>
        </Empty>
        {wizard}
      </div>
    )
  }

  if (binding.mode === "off") {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        {oauthNotice ? (
          <p className="text-sm text-muted-foreground" role="status">
            {oauthNotice}
          </p>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {serviceShort} is off for this location
            </CardTitle>
            <CardDescription>
              The parent connection, its property, and stored history are
              untouched.
            </CardDescription>
          </CardHeader>
          {canManage ? (
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button onClick={openWizard} size="sm" type="button">
                  Configure
                </Button>
                <Button
                  disabled={removing}
                  onClick={() => void handleRemoveConfiguration()}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {removing ? "Removing…" : "Remove configuration"}
                </Button>
              </div>
              {actionError ? (
                <p className="pt-4 text-sm text-destructive" role="alert">
                  {actionError}
                </p>
              ) : null}
            </CardContent>
          ) : (
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Only organization owners can change Google bindings.
              </p>
            </CardContent>
          )}
        </Card>
        {wizard}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {oauthNotice ? (
        <p className="text-sm text-muted-foreground" role="status">
          {oauthNotice}
        </p>
      ) : null}
      {binding.effective !== null ? (
        <LocationGoogleReportView
          binding={binding}
          locationId={locationId}
          projectId={projectId}
          service={service}
          onChangeConnection={canManage ? openWizard : undefined}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No property to report yet</CardTitle>
            <CardDescription>
              This location is configured, but there is no property behind it
              yet — the parent project hasn&apos;t selected one.
            </CardDescription>
          </CardHeader>
          {canManage ? (
            <CardContent>
              <Button onClick={openWizard} size="sm" type="button">
                Configure
              </Button>
            </CardContent>
          ) : null}
        </Card>
      )}
      {wizard}
    </div>
  )
}
