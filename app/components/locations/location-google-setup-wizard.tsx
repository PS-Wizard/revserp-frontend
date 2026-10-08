"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { RefreshCwIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { DialogFooter } from "~/components/ui/dialog"
import { GoogleAccountPicker } from "~/components/google-account-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { ApiError } from "~/lib/api"
import { locationWorkspacePath } from "~/lib/location-workspace"
import {
  describeGoogleAccount,
  isAllowedGoogleAuthURL,
  locationGoogleBindingQueryKey,
  locationGoogleSetupReturnPath,
  locationGoogleServiceShortLabel,
  putLocationAnalyticsBinding,
  putLocationGscBinding,
  startProjectGoogleConnect,
  useAccountPropertyList,
  type LocationAnalyticsBindingResponse,
  type LocationGoogleBindingMode,
  type LocationGoogleConnectMode,
  type LocationGoogleService,
  type LocationGscBindingResponse,
} from "~/lib/location-google-api"
import { cn } from "~/lib/utils"

function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function LocationGoogleSetupWizard({
  projectId,
  locationId,
  service,
  binding,
  initialMode,
  initialAccountId,
  initialPropertyId,
  onClose,
  onSaved,
}: {
  projectId: string
  locationId: string
  service: LocationGoogleService
  binding: LocationGscBindingResponse | LocationAnalyticsBindingResponse
  initialMode: LocationGoogleBindingMode
  initialAccountId: string
  initialPropertyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [draftMode, setDraftMode] =
    useState<LocationGoogleBindingMode>(initialMode)
  const [accountId, setAccountId] = useState(initialAccountId)
  const [propertyId, setPropertyId] = useState(initialPropertyId)
  const propertyList = useAccountPropertyList(projectId, service, accountId)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState("")
  const [oauthBusy, setOauthBusy] = useState(false)

  async function handleOAuthConnect(
    mode: LocationGoogleConnectMode,
    googleConnectionId?: string
  ) {
    if (oauthBusy) return
    setOauthBusy(true)
    setActionError("")
    try {
      const response = await startProjectGoogleConnect(
        projectId,
        service,
        {
          returnPath: locationGoogleSetupReturnPath(
            locationWorkspacePath(projectId, locationId) +
              window.location.hash,
            { mode: draftMode, service, locationId }
          ),
          mode,
          googleConnectionId,
        }
      )
      if (!isAllowedGoogleAuthURL(response.auth_url)) {
        throw new Error(
          "Unable to start the Google connection: unexpected auth URL."
        )
      }
      window.location.href = response.auth_url
    } catch (error) {
      setActionError(
        actionErrorMessage(error, "Unable to start the Google connection.")
      )
      setOauthBusy(false)
    }
  }

  function handlePickAccount(next: string | null) {
    setAccountId(next ?? "")
    setPropertyId("")
    propertyList.reset()
  }

  async function handleLoadProperties() {
    if (!accountId || propertyList.loading) return
    const { items } = await propertyList.load()
    setPropertyId((prev) =>
      prev && items.some((item) => item.value === prev) ? prev : ""
    )
  }

  async function handleFinalize() {
    if (saving) return
    if (draftMode === "custom" && (!accountId || !propertyId)) return
    setSaving(true)
    setActionError("")
    try {
      if (service === "gsc") {
        await putLocationGscBinding(
          projectId,
          locationId,
          draftMode === "custom"
            ? {
                mode: "custom",
                google_connection_id: accountId,
                site_url: propertyId,
              }
            : { mode: draftMode }
        )
      } else {
        await putLocationAnalyticsBinding(
          projectId,
          locationId,
          draftMode === "custom"
            ? {
                mode: "custom",
                google_connection_id: accountId,
                property_id: propertyId,
              }
            : { mode: draftMode }
        )
      }
      await queryClient.invalidateQueries({
        queryKey: locationGoogleBindingQueryKey(
          projectId,
          locationId,
          service
        ),
      })
      onSaved()
    } catch (error) {
      setActionError(
        actionErrorMessage(error, `Could not save this location's binding.`)
      )
    } finally {
      setSaving(false)
    }
  }

  const selectedAccount = binding.google_connections.find(
    (connection) => connection.id === accountId
  )
  const selectedIdentity = selectedAccount
    ? describeGoogleAccount(selectedAccount)
    : null
  const accountNeedsReconnect = selectedIdentity
    ? !selectedIdentity.verified ||
      (selectedAccount?.google_status ?? "") === "reauth_required"
    : false
  const finalizeDisabled =
    saving || (draftMode === "custom" && (!accountId || !propertyId))

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Google binding mode</legend>
        <ModeOption
          checked={draftMode === "inherit"}
          description="Follows the parent property automatically, including future parent changes."
          disabled={saving}
          label="Inherit parent (live)"
          name={`location-google-mode-${service}`}
          onChange={() => setDraftMode("inherit")}
        />
        <ModeOption
          checked={draftMode === "custom"}
          description="Bind this location to its own Google account and property."
          disabled={saving}
          label="This location's own property"
          name={`location-google-mode-${service}`}
          onChange={() => setDraftMode("custom")}
        />
        <ModeOption
          checked={draftMode === "off"}
          description="No Google data for this location. Parent history and connections stay intact."
          disabled={saving}
          label="Off for this location"
          name={`location-google-mode-${service}`}
          onChange={() => setDraftMode("off")}
        />
      </fieldset>

      {draftMode === "custom" ? (
        <div className="flex flex-col gap-4">
          {binding.google_connections.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                No Google accounts are connected yet. Connect the first shared
                account here — the parent binding is not changed.
              </p>
              <div>
                <Button
                  disabled={oauthBusy}
                  onClick={() => void handleOAuthConnect("connect")}
                  size="sm"
                  type="button"
                >
                  {oauthBusy
                    ? "Redirecting to Google…"
                    : "Connect Google account"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Google account
                <GoogleAccountPicker
                  accounts={binding.google_connections}
                  value={accountId}
                  onValueChange={handlePickAccount}
                  triggerClassName="min-h-12 w-full sm:max-w-xl"
                />
              </label>
              {accountNeedsReconnect ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    {selectedIdentity && !selectedIdentity.verified
                      ? "This account has no verified identity — reconnect it here to prove it. Only its tokens are refreshed; the parent binding is untouched."
                      : "This account needs a reconnect before its properties can be used. Reconnecting only refreshes its tokens; the parent binding is untouched."}
                  </p>
                  <div>
                    <Button
                      disabled={oauthBusy || !accountId}
                      onClick={() =>
                        void handleOAuthConnect("reconnect_account", accountId)
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {oauthBusy ? "Redirecting to Google…" : "Reconnect account"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {accountId ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={propertyList.loading}
                      onClick={() => void handleLoadProperties()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RefreshCwIcon aria-hidden="true" />
                      {propertyList.loading
                        ? "Loading properties…"
                        : propertyList.loadedAccountId === accountId
                          ? "Reload properties"
                          : "Load properties for this account"}
                    </Button>
                    <Button
                      disabled={oauthBusy}
                      onClick={() => void handleOAuthConnect("add_account")}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Add another Google account
                    </Button>
                  </div>
                  {propertyList.error ? (
                    <p className="text-sm text-destructive" role="alert">
                      {propertyList.error}
                    </p>
                  ) : null}
                  {propertyList.loadedAccountId === accountId &&
                  propertyList.needsReconnect ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">
                        This account needs a reconnect before its properties
                        can be used. Reconnecting only refreshes its tokens.
                      </p>
                      <div>
                        <Button
                          disabled={oauthBusy}
                          onClick={() =>
                            void handleOAuthConnect(
                              "reconnect_account",
                              accountId
                            )
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {oauthBusy
                            ? "Redirecting to Google…"
                            : "Reconnect account"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {propertyList.loadedAccountId === accountId &&
                  propertyList.missingScope ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">
                        This account hasn&apos;t granted{" "}
                        {locationGoogleServiceShortLabel(service)} access yet —
                        run Connect again as the same Google user to grant it.
                        The parent binding is not changed.
                      </p>
                      <div>
                        <Button
                          disabled={oauthBusy}
                          onClick={() => void handleOAuthConnect("connect")}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {oauthBusy
                            ? "Redirecting to Google…"
                            : "Connect Google account"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {propertyList.loadedAccountId === accountId ? (
                    propertyList.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        This account has no properties available.
                      </p>
                    ) : (
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        Property
                        <Select
                          onValueChange={(value) => setPropertyId(value ?? "")}
                          value={propertyId}
                        >
                          <SelectTrigger className="min-h-12 w-full sm:max-w-xl">
                            <SelectValue placeholder="Select a property">
                              {(value: string) =>
                                propertyList.items.find(
                                  (item) => item.value === value
                                )?.label || value
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {propertyList.items.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                <div className="flex flex-col gap-1 py-1">
                                  <span>{item.label}</span>
                                  {item.detail ? (
                                    <span className="text-xs text-muted-foreground">
                                      {item.detail}
                                    </span>
                                  ) : null}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                    )
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {saving ? (
        <p className="text-sm text-muted-foreground">Saving…</p>
      ) : null}
      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={finalizeDisabled}
          onClick={() => void handleFinalize()}
        >
          {saving ? "Saving…" : "Finalize"}
        </Button>
      </DialogFooter>
    </div>
  )
}

function ModeOption({
  checked,
  description,
  disabled,
  label,
  name,
  onChange,
}: {
  checked: boolean
  description: string
  disabled: boolean
  label: string
  name: string
  onChange: () => void
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border border-border/40 px-4 py-3",
        checked && "border-foreground/30 bg-muted/30",
        disabled && "cursor-default opacity-60"
      )}
    >
      <input
        checked={checked}
        className="mt-1"
        disabled={disabled}
        name={name}
        onChange={onChange}
        type="radio"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}
