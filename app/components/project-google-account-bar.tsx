"use client"

import { useEffect, useState } from "react"

import { Button } from "~/components/ui/button"
import { GoogleAccountPicker } from "~/components/google-account-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { ApiError, clientApiPost } from "~/lib/api"
import {
  describeGoogleAccount,
  isAllowedGoogleAuthURL,
  projectGoogleBoundAccountId,
  projectGoogleConnections,
  projectGoogleSelectedAccountId,
  startProjectGoogleConnect,
  useAccountPropertyList,
  type LocationGoogleConnection,
  type LocationGoogleService,
} from "~/lib/location-google-api"

/**
 * Shared Google account row for the parent project GSC/Analytics views.
 *
 * Shows which shared account backs the project binding (a picker when the
 * organization connected more than one), plus owner actions: add another
 * account, reconnect the selected account, and disconnect the property
 * binding. Disconnect removes only the project property binding — never
 * the shared OAuth account row or stored history.
 */
export function ProjectGoogleAccountBar({
  projectId,
  service,
  googleConnectionId,
  selectedGoogleConnectionId,
  googleConnections,
  googleAccountEmail,
  needsReconnect,
  tokenError,
  currentPropertyId,
  selectPath,
  selectBody,
  disconnectPath,
  isOrganizationOwner,
  onChanged,
}: {
  projectId: string
  service: LocationGoogleService
  googleConnectionId?: string
  selectedGoogleConnectionId?: string
  googleConnections?: LocationGoogleConnection[]
  googleAccountEmail?: string
  needsReconnect: boolean
  tokenError?: string
  currentPropertyId: string
  selectPath: string
  selectBody: (googleConnectionId: string) => Record<string, string>
  disconnectPath: string | null
  isOrganizationOwner: boolean
  onChanged: () => Promise<void> | void
}) {
  const connections = projectGoogleConnections({
    google_connections: googleConnections,
  })
  const boundAccountId = projectGoogleBoundAccountId({
    selected_google_connection_id: selectedGoogleConnectionId,
    google_connection_id: googleConnectionId,
  })

  const [accountId, setAccountId] = useState(() =>
    projectGoogleSelectedAccountId({
      selected_google_connection_id: selectedGoogleConnectionId,
      google_connection_id: googleConnectionId,
      google_connections: googleConnections,
    })
  )
  const [busy, setBusy] = useState<
    "switch" | "add" | "reconnect" | "disconnect" | null
  >(null)
  const [error, setError] = useState("")

  useEffect(() => {
    setAccountId((prev) => {
      const next = projectGoogleSelectedAccountId({
        selected_google_connection_id: selectedGoogleConnectionId,
        google_connection_id: googleConnectionId,
        google_connections: googleConnections,
      })
      if (prev === next) return prev
      if (prev && connections.some((connection) => connection.id === prev))
        return prev
      return next
    })
  }, [
    connections,
    googleConnectionId,
    googleConnections,
    selectedGoogleConnectionId,
  ])

  const selectedAccount: LocationGoogleConnection | undefined =
    connections.find((connection) => connection.id === accountId)
  const displayIdentity = describeGoogleAccount(
    selectedAccount ??
      connections[0] ?? { id: "", google_account_email: googleAccountEmail }
  )
  const displayEmail =
    displayIdentity.verified && displayIdentity.email !== ""
      ? displayIdentity.email
      : googleAccountEmail || displayIdentity.label
  const boundConnection = connections.find(
    (connection) => connection.id === boundAccountId
  )
  const boundUnverified =
    boundAccountId !== "" &&
    (!boundConnection || !describeGoogleAccount(boundConnection).verified)
  const showPicker = connections.length > 1 && isOrganizationOwner
  const showReconnect =
    isOrganizationOwner &&
    boundAccountId !== "" &&
    (needsReconnect || Boolean(tokenError) || boundUnverified)
  const propertyList = useAccountPropertyList(projectId, service, "")
  const [switchDraft, setSwitchDraft] = useState<{
    accountId: string
    propertyId: string
  } | null>(null)

  async function handleAccountSwitch(next: string | null) {
    if (!next || next === boundAccountId || busy) return
    setAccountId(next)
    setSwitchDraft(null)
    setError("")
    if (!currentPropertyId) {
      await loadSwitchProperties(next)
      return
    }
    setBusy("switch")
    try {
      await clientApiPost<{ ok: boolean }>(selectPath, selectBody(next))
      await onChanged()
    } catch (switchError) {
      if (switchError instanceof ApiError && switchError.status === 400) {
        setBusy(null)
        await loadSwitchProperties(next)
        return
      }
      setError(
        switchError instanceof ApiError
          ? switchError.message
          : "Unable to switch the Google account."
      )
    } finally {
      setBusy(null)
    }
  }

  async function loadSwitchProperties(next: string) {
    setBusy("switch")
    setError("")
    const { items, error: loadError } = await propertyList.load(next)
    setBusy(null)
    if (loadError) return
    if (items.length === 0) {
      setError(
        "That account has no properties available, so the switch was not saved."
      )
      return
    }
    setSwitchDraft({ accountId: next, propertyId: "" })
  }

  async function handleConfirmSwitch() {
    if (!switchDraft || !switchDraft.propertyId || busy) return
    setBusy("switch")
    setError("")
    try {
      await clientApiPost<{ ok: boolean }>(selectPath, {
        ...selectBody(switchDraft.accountId),
        ...(service === "gsc"
          ? { site_url: switchDraft.propertyId }
          : { property_id: switchDraft.propertyId }),
      })
      setSwitchDraft(null)
      propertyList.reset()
      await onChanged()
    } catch (switchError) {
      setError(
        switchError instanceof ApiError
          ? switchError.message
          : "Unable to switch the Google account."
      )
    } finally {
      setBusy(null)
    }
  }

  function handleCancelSwitch() {
    setSwitchDraft(null)
    propertyList.reset()
    setError("")
    setAccountId(boundAccountId)
  }

  async function handleOAuth(
    kind: "add" | "reconnect",
    body: {
      mode: "add_account" | "reconnect_account"
      googleConnectionId?: string
    }
  ) {
    if (busy) return
    setBusy(kind)
    setError("")
    try {
      const response = await startProjectGoogleConnect(projectId, service, {
        returnPath:
          window.location.pathname +
          window.location.search +
          window.location.hash,
        mode: body.mode,
        googleConnectionId: body.googleConnectionId,
      })
      if (!isAllowedGoogleAuthURL(response.auth_url)) {
        throw new Error(
          "Unable to start the Google connection: unexpected auth URL."
        )
      }
      window.location.href = response.auth_url
    } catch (oauthError) {
      setError(
        oauthError instanceof ApiError
          ? oauthError.message
          : oauthError instanceof Error
            ? oauthError.message
            : "Unable to start the Google connection."
      )
      setBusy(null)
    }
  }

  async function handleDisconnect() {
    if (!disconnectPath || busy) return
    setBusy("disconnect")
    setError("")
    try {
      await clientApiPost<{ ok: boolean }>(disconnectPath, {})
      await onChanged()
    } catch (disconnectError) {
      setError(
        disconnectError instanceof ApiError
          ? disconnectError.message
          : "Unable to disconnect the property."
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Google account
        </span>
        {showPicker ? (
          <GoogleAccountPicker
            accounts={connections}
            value={accountId}
            onValueChange={(value) => void handleAccountSwitch(value ?? "")}
            disabled={busy !== null}
            triggerClassName="h-9 min-w-52"
          />
        ) : (
          <span className="text-sm font-medium">
            {displayEmail || "Connected"}
          </span>
        )}
        {busy === "switch" ? (
          <span className="text-xs text-muted-foreground">Switching…</span>
        ) : null}
        {isOrganizationOwner ? (
          <span className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy !== null}
              onClick={() => void handleOAuth("add", { mode: "add_account" })}
              size="xs"
              type="button"
              variant="outline"
            >
              {busy === "add" ? "Redirecting…" : "Add another account"}
            </Button>
            {showReconnect ? (
              <Button
                disabled={busy !== null}
                onClick={() =>
                  void handleOAuth("reconnect", {
                    mode: "reconnect_account",
                    googleConnectionId: boundAccountId,
                  })
                }
                size="xs"
                type="button"
                variant="outline"
              >
                {busy === "reconnect" ? "Redirecting…" : "Reconnect account"}
              </Button>
            ) : null}
            {disconnectPath ? (
              <Button
                disabled={busy !== null}
                onClick={() => void handleDisconnect()}
                size="xs"
                type="button"
                variant="ghost"
              >
                {busy === "disconnect"
                  ? "Disconnecting…"
                  : "Disconnect property"}
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
      {disconnectPath ? (
        <p className="pt-1.5 text-xs text-muted-foreground">
          Disconnect removes only this project&apos;s property binding. The
          shared Google account, other projects, and stored history stay.
        </p>
      ) : null}
      {propertyList.error ? (
        <p className="pt-1.5 text-xs text-red-200" role="alert">
          {propertyList.error}
        </p>
      ) : null}
      {switchDraft && propertyList.loadedAccountId === switchDraft.accountId ? (
        <div className="flex flex-col gap-2 pt-2">
          <p className="text-xs text-muted-foreground">
            The current property isn&apos;t on that account — pick one of its
            properties to finish switching.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              onValueChange={(value) =>
                setSwitchDraft((draft) =>
                  draft ? { ...draft, propertyId: value ?? "" } : draft
                )
              }
              value={switchDraft.propertyId}
            >
              <SelectTrigger className="h-9 min-w-52" disabled={busy !== null}>
                <SelectValue placeholder="Select a property">
                  {(value: string) =>
                    propertyList.items.find((item) => item.value === value)
                      ?.label || value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {propertyList.items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    <div className="flex flex-col gap-0.5 py-0.5">
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
            <Button
              disabled={busy !== null || !switchDraft.propertyId}
              onClick={() => void handleConfirmSwitch()}
              size="xs"
              type="button"
            >
              Switch account
            </Button>
            <Button
              disabled={busy !== null}
              onClick={handleCancelSwitch}
              size="xs"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="pt-1.5 text-xs text-red-200" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
