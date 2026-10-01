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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type {
  RuneCMSStatusResponse,
  RuneCMSToolResponse,
} from "~/lib/api.types"

export type RuneCMSPanelProps = {
  projectName: string
  status: RuneCMSStatusResponse
  isOrganizationOwner: boolean
  endpointUrl: string
  bearerToken: string
  formError: string
  actionError: string
  isConnecting: boolean
  isChecking: boolean
  isDisconnecting: boolean
  onEndpointChange: (value: string) => void
  onBearerTokenChange: (value: string) => void
  onConnect: () => Promise<boolean>
  onCheck: () => void
  onDisconnect: () => void
  onDismissCredentials: () => void
}

const TOOL_LABELS: Record<string, string> = {
  list_collections: "List collections",
  get_collection_schema: "View collection fields",
  list_records: "Browse records",
  read_record: "Read a record",
  create_record: "Create a record",
  update_record: "Update a record",
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  list_collections: LayersIcon,
  get_collection_schema: TablePropertiesIcon,
  list_records: Rows3Icon,
  read_record: FileTextIcon,
  create_record: FilePlus2Icon,
  update_record: PencilLineIcon,
}

const EXPLORE_TOOLS = new Set([
  "list_collections",
  "get_collection_schema",
  "list_records",
  "read_record",
])

const EDIT_TOOLS = new Set(["create_record", "update_record"])

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

export function RuneCMSPanel({
  projectName,
  status,
  isOrganizationOwner,
  endpointUrl,
  bearerToken,
  formError,
  actionError,
  isConnecting,
  isChecking,
  isDisconnecting,
  onEndpointChange,
  onBearerTokenChange,
  onConnect,
  onCheck,
  onDisconnect,
  onDismissCredentials,
}: RuneCMSPanelProps) {
  const [manageOpen, setManageOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isBusy = isConnecting || isChecking || isDisconnecting

  const tools = Array.isArray(status.tools) ? status.tools : []
  const connected = status.connected
  const host = endpointHost(status.endpoint_url)
  const exploreTools = tools.filter((tool) => EXPLORE_TOOLS.has(tool.name))
  const editTools = tools.filter((tool) => EDIT_TOOLS.has(tool.name))
  const otherTools = tools.filter(
    (tool) => !EXPLORE_TOOLS.has(tool.name) && !EDIT_TOOLS.has(tool.name),
  )

  function handleManageOpenChange(open: boolean) {
    setManageOpen(open)
    if (!open) {
      setConfirmOpen(false)
      onDismissCredentials()
    }
  }

  async function handleManageSubmit() {
    const ok = await onConnect()
    if (ok) {
      setManageOpen(false)
      setConfirmOpen(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-semibold tracking-tight text-balance">
              Rune CMS
            </h1>
            <Badge variant={connected ? "default" : "secondary"}>
              {connected ? "Connected" : "Not connected"}
            </Badge>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Connect this project to Rune CMS so workspace tools can read
            content and draft preview edits.
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
                <Loader2Icon data-icon="inline-start" aria-hidden="true" className="animate-spin" />
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
                  Link this project to its Rune CMS endpoint once. Revserp
                  checks the connection before saving anything.
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
                      .
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                    <EyeIcon
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Reads content and drafts preview edits. Nothing is
                      published.
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
                <CardTitle>Connect Rune CMS</CardTitle>
                <CardDescription>
                  Save the MCP endpoint and bearer token for {projectName}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CredentialsForm
                  bearerToken={bearerToken}
                  disabled={isBusy}
                  endpointUrl={endpointUrl}
                  formError={formError}
                  idPrefix="rune-cms-connect"
                  onBearerTokenChange={onBearerTokenChange}
                  onEndpointChange={onEndpointChange}
                  onSubmit={() => void onConnect()}
                  pending={isConnecting}
                  pendingLabel="Connecting…"
                  submitLabel="Connect CMS"
                  tokenDescription="The connection is checked before the token is stored encrypted. It is never displayed again."
                  tokenLabel="Bearer token"
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
              <EmptyTitle>Rune CMS is not connected</EmptyTitle>
              <EmptyDescription>
                Only the organization owner can connect Rune CMS for{" "}
                {projectName}. Ask them to connect it before this view becomes
                available.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <section aria-label="Content catalog" className="flex flex-col gap-6">
          {tools.length === 0 ? (
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
          ) : exploreTools.length > 0 && editTools.length > 0 ? (
            <>
              <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
                <ToolGroupCard
                  description="Look up collections, fields and records."
                  title="Explore content"
                  tools={exploreTools}
                />
                <ToolGroupCard
                  description="Draft changes against preview content."
                  footer="Edits apply to preview content only — they do not publish the site."
                  title="Preview edits"
                  tools={editTools}
                />
              </div>
              {otherTools.length > 0 ? (
                <ToolGroupCard
                  description="Reported by the endpoint outside the standard set."
                  title="Other tools"
                  tools={otherTools}
                />
              ) : null}
            </>
          ) : (
            <>
              <ToolGroupCard
                description="Look up collections, fields and records."
                title="Explore content"
                tools={exploreTools}
              />
              <ToolGroupCard
                description="Draft changes against preview content."
                footer="Edits apply to preview content only — they do not publish the site."
                title="Preview edits"
                tools={editTools}
              />
              <ToolGroupCard
                description="Reported by the endpoint outside the standard set."
                title="Other tools"
                tools={otherTools}
              />
            </>
          )}
          {!isOrganizationOwner ? (
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
              <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                You have read-only access. Only the organization owner can
                check or change this connection.
              </span>
            </p>
          ) : null}
        </section>
      )}

      <Dialog open={isOrganizationOwner && connected && manageOpen} onOpenChange={handleManageOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage connection</DialogTitle>
            <DialogDescription>
              Replace the endpoint and token for {projectName}, or disconnect
              Rune CMS.
            </DialogDescription>
          </DialogHeader>
          <CredentialsForm
            bearerToken={bearerToken}
            disabled={isBusy}
            endpointUrl={endpointUrl}
            formError={formError}
            idPrefix="rune-cms-manage"
            onBearerTokenChange={onBearerTokenChange}
            onEndpointChange={onEndpointChange}
            onSubmit={() => void handleManageSubmit()}
            pending={isConnecting}
            pendingLabel="Saving…"
            submitLabel="Save and re-check"
            tokenDescription="Replacing the endpoint or token requires entering a new token. The saved token is never shown."
            tokenLabel="New bearer token"
          />
          {actionError ? (
            <p className="text-sm leading-relaxed text-destructive" role="alert">
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
            <DialogTitle>Disconnect Rune CMS?</DialogTitle>
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
                <Loader2Icon data-icon="inline-start" aria-hidden="true" className="animate-spin" />
              ) : null}
              {isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CredentialsForm({
  idPrefix,
  endpointUrl,
  bearerToken,
  formError,
  disabled,
  pending,
  pendingLabel,
  submitLabel,
  tokenLabel,
  tokenDescription,
  onEndpointChange,
  onBearerTokenChange,
  onSubmit,
}: {
  idPrefix: string
  endpointUrl: string
  bearerToken: string
  formError: string
  disabled: boolean
  pending: boolean
  pendingLabel: string
  submitLabel: string
  tokenLabel: string
  tokenDescription: string
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
      <FieldGroup>
        <Field data-invalid={hasError || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-endpoint`}>
            CMS endpoint
          </FieldLabel>
          <Input
            aria-invalid={hasError || undefined}
            autoComplete="off"
            disabled={disabled}
            id={`${idPrefix}-endpoint`}
            inputMode="url"
            onChange={(event) => onEndpointChange(event.target.value)}
            placeholder="https://cms.example.com/mcp"
            value={endpointUrl}
          />
          <FieldDescription>
            The full MCP endpoint URL of the CMS.
          </FieldDescription>
        </Field>
        <Field data-invalid={hasError || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-token`}>{tokenLabel}</FieldLabel>
          <Input
            aria-invalid={hasError || undefined}
            autoComplete="off"
            disabled={disabled}
            id={`${idPrefix}-token`}
            onChange={(event) => onBearerTokenChange(event.target.value)}
            placeholder={
              idPrefix === "rune-cms-manage"
                ? "Enter a new token to replace the saved one"
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
            <Loader2Icon data-icon="inline-start" aria-hidden="true" className="animate-spin" />
          ) : null}
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function ToolGroupCard({
  title,
  description,
  tools,
  footer,
}: {
  title: string
  description: string
  tools: RuneCMSToolResponse[]
  footer?: string
}) {
  if (tools.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-base leading-normal font-medium">{title}</h2>
          <Badge variant="secondary" aria-label={`${tools.length} tools`}>
            {tools.length}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <ul className="flex flex-col divide-y divide-border">
          {tools.map((tool) => {
            const Icon = TOOL_ICONS[tool.name] ?? WrenchIcon
            const label = TOOL_LABELS[tool.name] ?? tool.name
            return (
              <li key={tool.name} className="flex items-start gap-3 py-3.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {label}
                    {tool.description ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className="inline-flex cursor-help items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              tabIndex={0}
                              aria-label={`About ${label}`}
                            />
                          }
                        >
                          <InfoIcon
                            className="size-3.5"
                            aria-hidden="true"
                          />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs break-words">
                          {tool.description}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </span>
                  {tool.description ? (
                    <span className="text-sm leading-relaxed text-muted-foreground">
                      {tool.description}
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
        {footer ? (
          <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {footer}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
