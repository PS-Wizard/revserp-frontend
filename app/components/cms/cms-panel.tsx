"use client"

import { useState } from "react"
import {
  Clock3Icon,
  DatabaseZapIcon,
  EyeIcon,
  FilePlus2Icon,
  FileTextIcon,
  FolderGit2Icon,
  InfoIcon,
  LayersIcon,
  Loader2Icon,
  LockIcon,
  PencilLineIcon,
  RefreshCwIcon,
  Rows3Icon,
  Settings2Icon,
  TablePropertiesIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { Separator } from "~/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { CMSProvider, CMSStatusResponse } from "~/lib/api.types"
import {
  groupCMSTools,
  type CMSToolRow,
  type CMSToolSection,
} from "./cms-tool-groups"

export type CMSPanelProps = {
  projectName: string
  status: CMSStatusResponse
  isOrganizationOwner: boolean
  provider: CMSProvider
  endpointUrl: string
  bearerToken: string
  formError: string
  actionError: string
  isConnecting: boolean
  isChecking: boolean
  isDisconnecting: boolean
  onProviderChange: (provider: CMSProvider) => void
  onEndpointChange: (value: string) => void
  onBearerTokenChange: (value: string) => void
  onConnect: () => Promise<boolean>
  onCheck: () => void
  onDisconnect: () => void
  onDismissCredentials: () => void
}

const PROVIDER_LABEL: Record<CMSProvider, string> = {
  rune: "Rune CMS",
  wordpress: "WordPress",
}

const PROVIDER_ENDPOINT_PLACEHOLDER: Record<CMSProvider, string> = {
  rune: "https://cms.example.com/mcp",
  wordpress: "https://example.com/wp-json/wp-mcp/v1/mcp",
}

const PROVIDER_ENDPOINT_HINT: Record<CMSProvider, string> = {
  rune: "The full MCP endpoint URL of the Rune CMS.",
  wordpress: "The full WordPress MCP endpoint URL, not just /wp-json.",
}

const PROVIDER_TOKEN_LABEL: Record<CMSProvider, string> = {
  rune: "Bearer token",
  wordpress: "Bearer token",
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  list_collections: LayersIcon,
  get_collection_schema: TablePropertiesIcon,
  list_records: Rows3Icon,
  read_record: FileTextIcon,
  create_record: FilePlus2Icon,
  update_record: PencilLineIcon,
}

/** Approval truth: listed sensitive tools pause; unlisted tools run directly. */
const APPROVAL_POLICY =
  "Reads and new drafts run directly. Listed sensitive tools — publishing, edits to published content, deletes, settings — pause for your approval in chat. Tools outside that list run directly."

/** Rune edits write records; the published site still depends on its static build. */
const RUNE_POLICY =
  "Reads and drafts run directly. Record edits pause for your approval in chat and write CMS records; the published site changes only after a static build."

function policyNote(provider: CMSProvider | null) {
  return provider === "rune" ? RUNE_POLICY : APPROVAL_POLICY
}

function endpointHost(raw?: string) {
  if (!raw) return ""
  try {
    return new URL(raw.trim()).hostname
  } catch {
    return raw.trim()
  }
}

function formatCheckedAt(value?: string) {
  if (!value) return "Not checked yet"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function CMSPanel({
  projectName,
  status,
  isOrganizationOwner,
  provider,
  endpointUrl,
  bearerToken,
  formError,
  actionError,
  isConnecting,
  isChecking,
  isDisconnecting,
  onProviderChange,
  onEndpointChange,
  onBearerTokenChange,
  onConnect,
  onCheck,
  onDisconnect,
  onDismissCredentials,
}: CMSPanelProps) {
  const [manageOpen, setManageOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const isBusy = isConnecting || isChecking || isDisconnecting

  const tools = Array.isArray(status.tools) ? status.tools : []
  const connected = status.connected
  const connectedProvider = status.provider
  const needsReplacement =
    connected && connectedProvider !== null && provider !== connectedProvider
  const host = endpointHost(status.endpoint_url)
  const sections = groupCMSTools(tools)
  const totalTools = tools.length

  function handleManageOpenChange(open: boolean) {
    setManageOpen(open)
    if (!open) {
      setConfirmOpen(false)
      setReplaceOpen(false)
      onDismissCredentials()
    }
  }

  async function handleManageSubmit() {
    if (needsReplacement) {
      setReplaceOpen(true)
      return
    }
    const ok = await onConnect()
    if (ok) {
      setManageOpen(false)
      setConfirmOpen(false)
      setReplaceOpen(false)
    }
  }

  async function handleReplaceConfirm() {
    const ok = await onConnect()
    if (ok) {
      setManageOpen(false)
      setConfirmOpen(false)
      setReplaceOpen(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-semibold tracking-tight text-balance">
              CMS
            </h1>
            <Badge variant={connected ? "default" : "secondary"}>
              {connected && connectedProvider
                ? `Connected · ${PROVIDER_LABEL[connectedProvider]}`
                : "Not connected"}
            </Badge>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Connect one content provider per project so workspace tools can read
            content and propose edits.
          </p>
          {connected ? (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium break-all text-foreground">
                {projectName}
              </span>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 break-all">
                {host || "Unknown endpoint"}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock3Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="break-words">
                  {formatCheckedAt(status.last_checked_at)}
                </span>
              </span>
            </p>
          ) : null}
        </div>
        {connected && isOrganizationOwner ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              disabled={isBusy}
              onClick={onCheck}
              size="sm"
              type="button"
              variant="outline"
            >
              {isChecking ? (
                <Loader2Icon
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : (
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              )}
              {isChecking ? "Checking…" : "Check connection"}
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => setManageOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Settings2Icon data-icon="inline-start" aria-hidden="true" />
              Manage connection
            </Button>
          </div>
        ) : null}
      </header>

      {actionError ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-destructive"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      {!connected ? (
        isOrganizationOwner ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <Empty className="order-2 border p-8 lg:order-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <DatabaseZapIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Connect your CMS</EmptyTitle>
                <EmptyDescription>
                  {provider === "wordpress"
                    ? "Link this project to its WordPress site once. Revserp checks the connection before saving anything."
                    : "Link this project to its Rune CMS endpoint once. Revserp checks the connection before saving anything."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <ul className="flex w-full flex-col gap-2.5 text-left">
                  <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                    <FolderGit2Icon
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Connection settings are scoped to{" "}
                      <span className="font-medium text-foreground">
                        {projectName}
                      </span>
                      . Only one provider can be active at a time.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                    <EyeIcon
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      {provider === "wordpress" ? APPROVAL_POLICY : RUNE_POLICY}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                    <LockIcon
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      The token is stored encrypted and never shown again.
                    </span>
                  </li>
                </ul>
              </EmptyContent>
            </Empty>
            <Card className="order-1 lg:order-2">
              <CardHeader>
                <CardTitle>Connect CMS</CardTitle>
                <CardDescription>
                  Save the endpoint and token for {projectName}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CredentialsForm
                  bearerToken={bearerToken}
                  disabled={isBusy}
                  endpointUrl={endpointUrl}
                  formError={formError}
                  idPrefix="cms-connect"
                  onBearerTokenChange={onBearerTokenChange}
                  onEndpointChange={onEndpointChange}
                  onProviderChange={onProviderChange}
                  onSubmit={() => void onConnect()}
                  pending={isConnecting}
                  pendingLabel="Connecting…"
                  provider={provider}
                  submitLabel="Connect CMS"
                  tokenDescription="The connection is checked before the token is stored encrypted. It is never displayed again."
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <Empty className="border p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LockIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>CMS is not connected</EmptyTitle>
              <EmptyDescription>
                Only the organization owner can connect a CMS for {projectName}.
                Ask them to connect it before this view becomes available.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <section aria-label="Content catalog" className="flex flex-col gap-6">
          {sections.length === 0 ? (
            <Empty className="border p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayersIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No tools reported yet</EmptyTitle>
                <EmptyDescription>
                  The CMS endpoint did not report any content tools. Re-check
                  the connection to refresh the catalog.
                </EmptyDescription>
              </EmptyHeader>
              {isOrganizationOwner ? (
                <EmptyContent>
                  <Button
                    disabled={isBusy}
                    onClick={onCheck}
                    type="button"
                    variant="outline"
                  >
                    {isChecking ? (
                      <Loader2Icon
                        data-icon="inline-start"
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    ) : (
                      <RefreshCwIcon
                        data-icon="inline-start"
                        aria-hidden="true"
                      />
                    )}
                    {isChecking ? "Checking…" : "Check connection"}
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            <ToolBrowser
              policyNote={policyNote(connectedProvider)}
              sections={sections}
              totalTools={totalTools}
            />
          )}
          {!isOrganizationOwner ? (
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
              <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                You have read-only access. Only the organization owner can check
                or change this connection.
              </span>
            </p>
          ) : null}
        </section>
      )}

      <Dialog
        open={isOrganizationOwner && connected && manageOpen}
        onOpenChange={handleManageOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage connection</DialogTitle>
            <DialogDescription>
              Replace the endpoint and token for {projectName}, or disconnect
              {connectedProvider
                ? ` ${PROVIDER_LABEL[connectedProvider]}`
                : " the CMS"}
              .
            </DialogDescription>
          </DialogHeader>
          <CredentialsForm
            bearerToken={bearerToken}
            disabled={isBusy}
            endpointUrl={endpointUrl}
            formError={formError}
            idPrefix="cms-manage"
            onBearerTokenChange={onBearerTokenChange}
            onEndpointChange={onEndpointChange}
            onProviderChange={onProviderChange}
            onSubmit={() => void handleManageSubmit()}
            pending={isConnecting}
            pendingLabel="Saving…"
            provider={provider}
            submitLabel="Save and re-check"
            tokenDescription="Replacing the endpoint or token requires entering a new token. The saved token is never shown."
            tokenLabel="New bearer token"
          />
          {needsReplacement ? (
            <p
              className="text-sm leading-relaxed text-muted-foreground"
              role="note"
            >
              Saving with {PROVIDER_LABEL[provider]} replaces the{" "}
              {connectedProvider
                ? PROVIDER_LABEL[connectedProvider]
                : "current"}{" "}
              connection after confirmation. Pending approvals are invalidated.
            </p>
          ) : null}
          {actionError ? (
            <p
              className="text-sm leading-relaxed text-destructive"
              role="alert"
            >
              {actionError}
            </p>
          ) : null}
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">Disconnect</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Removes the saved endpoint and token.
              </p>
            </div>
            <Button
              disabled={isBusy}
              onClick={() => setConfirmOpen(true)}
              type="button"
              variant="outline"
            >
              Disconnect…
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isOrganizationOwner && connected && confirmOpen}
        onOpenChange={(open) => {
          if (!isDisconnecting) setConfirmOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Disconnect
              {connectedProvider
                ? ` ${PROVIDER_LABEL[connectedProvider]}`
                : " CMS"}
              ?
            </DialogTitle>
            <DialogDescription>
              This removes the saved endpoint and token for {projectName}. You
              can reconnect at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isDisconnecting}
              onClick={() => setConfirmOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => {
                setManageOpen(false)
                setConfirmOpen(false)
                onDismissCredentials()
                onDisconnect()
              }}
              type="button"
              variant="destructive"
            >
              {isDisconnecting ? (
                <Loader2Icon
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : null}
              {isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isOrganizationOwner && connected && replaceOpen}
        onOpenChange={(open) => {
          if (!isConnecting) setReplaceOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Replace
              {connectedProvider ? ` ${PROVIDER_LABEL[connectedProvider]}` : ""}
              {connectedProvider
                ? ` with ${PROVIDER_LABEL[provider]}`
                : " connection"}
              ?
            </DialogTitle>
            <DialogDescription>
              Revserp validates the new {PROVIDER_LABEL[provider]} endpoint
              before saving anything — a failed check keeps the current
              connection untouched. Replacing rotates the connection and
              invalidates pending approvals. Only one provider stays active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={isConnecting}
              onClick={() => setReplaceOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => void handleReplaceConfirm()}
              type="button"
              variant="destructive"
            >
              {isConnecting ? (
                <Loader2Icon
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : null}
              {isConnecting ? "Replacing…" : "Replace and connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProviderSelector({
  idPrefix,
  provider,
  disabled,
  onProviderChange,
}: {
  idPrefix: string
  provider: CMSProvider
  disabled: boolean
  onProviderChange: (provider: CMSProvider) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span id={`${idPrefix}-provider-label`} className="text-sm font-medium">
        Provider
      </span>
      <Tabs
        value={provider}
        onValueChange={(value) => {
          if (value === "rune" || value === "wordpress") onProviderChange(value)
        }}
      >
        <TabsList aria-labelledby={`${idPrefix}-provider-label`}>
          <TabsTrigger value="rune" disabled={disabled}>
            Rune CMS
          </TabsTrigger>
          <TabsTrigger value="wordpress" disabled={disabled}>
            WordPress
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}

function CredentialsForm({
  idPrefix,
  provider,
  endpointUrl,
  bearerToken,
  formError,
  disabled,
  pending,
  pendingLabel,
  submitLabel,
  tokenLabel,
  tokenDescription,
  onProviderChange,
  onEndpointChange,
  onBearerTokenChange,
  onSubmit,
}: {
  idPrefix: string
  provider: CMSProvider
  endpointUrl: string
  bearerToken: string
  formError: string
  disabled: boolean
  pending: boolean
  pendingLabel: string
  submitLabel: string
  tokenLabel?: string
  tokenDescription: string
  onProviderChange: (provider: CMSProvider) => void
  onEndpointChange: (value: string) => void
  onBearerTokenChange: (value: string) => void
  onSubmit: () => void
}) {
  const hasError = formError.trim().length > 0
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <ProviderSelector
        disabled={disabled}
        idPrefix={idPrefix}
        onProviderChange={onProviderChange}
        provider={provider}
      />
      <FieldGroup>
        <Field data-invalid={hasError || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-endpoint`}>CMS endpoint</FieldLabel>
          <Input
            aria-invalid={hasError || undefined}
            autoComplete="off"
            disabled={disabled}
            id={`${idPrefix}-endpoint`}
            inputMode="url"
            onChange={(event) => onEndpointChange(event.target.value)}
            placeholder={PROVIDER_ENDPOINT_PLACEHOLDER[provider]}
            value={endpointUrl}
          />
          <FieldDescription>
            {PROVIDER_ENDPOINT_HINT[provider]}
          </FieldDescription>
        </Field>
        <Field data-invalid={hasError || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-token`}>
            {tokenLabel ?? PROVIDER_TOKEN_LABEL[provider]}
          </FieldLabel>
          <Input
            aria-invalid={hasError || undefined}
            autoComplete="off"
            disabled={disabled}
            id={`${idPrefix}-token`}
            onChange={(event) => onBearerTokenChange(event.target.value)}
            placeholder={
              idPrefix === "cms-manage"
                ? "Enter a new token to replace the saved one"
                : provider === "wordpress"
                  ? "Paste the WordPress MCP bearer token"
                  : "Paste the CMS bearer token"
            }
            type="password"
            value={bearerToken}
          />
          <FieldDescription>{tokenDescription}</FieldDescription>
        </Field>
      </FieldGroup>
      {hasError ? <FieldError>{formError}</FieldError> : null}
      <div>
        <Button disabled={disabled} type="submit">
          {pending ? (
            <Loader2Icon
              data-icon="inline-start"
              aria-hidden="true"
              className="animate-spin"
            />
          ) : null}
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** One bounded scroll region for the whole catalog; sections stack inside it. */
function ToolBrowser({
  sections,
  totalTools,
  policyNote,
}: {
  sections: CMSToolSection[]
  totalTools: number
  policyNote: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="font-heading text-sm font-medium">
            Tools
          </CardTitle>
          <Badge variant="secondary" aria-label={`${totalTools} tools`}>
            {totalTools}
          </Badge>
        </div>
        <CardDescription>
          Tools grouped by category. Hover or focus the info icon for details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          aria-label="CMS tools"
          className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain pr-1"
          role="region"
          tabIndex={0}
        >
          <div className="flex flex-col gap-5">
            {sections.map((section, index) => (
              <section
                key={section.key}
                aria-labelledby={`cms-tools-${index}`}
                className="flex flex-col gap-1.5"
              >
                <h2
                  id={`cms-tools-${index}`}
                  className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
                >
                  <span className="truncate">{section.title}</span>
                  <span className="text-muted-foreground/70 tabular-nums">
                    {section.rows.length}
                  </span>
                </h2>
                <ul className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                  {section.rows.map((row) => (
                    <ToolRow key={row.name} row={row} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
        <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          {policyNote}
        </p>
      </CardContent>
    </Card>
  )
}

function ToolRow({ row }: { row: CMSToolRow }) {
  const Icon = TOOL_ICONS[row.name] ?? WrenchIcon
  return (
    <li className="flex min-w-0 items-center gap-2 py-1">
      <Icon
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="truncate text-[13px] font-medium">{row.label}</span>
      {row.write ? <Badge variant="outline">Write</Badge> : null}
      {row.description ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                aria-label={`${row.label}: ${row.description}`}
                className="-mr-1 shrink-0 cursor-help rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                type="button"
              />
            }
          >
            <InfoIcon className="size-3.5" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs break-words">
            {row.description}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </li>
  )
}
