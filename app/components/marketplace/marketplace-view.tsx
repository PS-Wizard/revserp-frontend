"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  EllipsisIcon,
  Loader2Icon,
  LockIcon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Empty,
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
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
import { DataLoadingState } from "~/components/data-loading-state"
import { cn } from "~/lib/utils"
import type { ProjectResponse } from "~/lib/api.types"
import type {
  MCPCatalogItem,
  MCPConnection,
  MCPService,
  MCPToolInfo,
  MCPToolPermission,
  MCPToolPermissionEdit,
} from "~/lib/api.types"

import {
  checkMCPConnection,
  connectionPermissionEdits,
  createMCPConnection,
  deleteMCPConnection,
  fetchMCPCatalog,
  fetchMCPConnections,
  humanizeMCPGroup,
  humanizeMCPToolName,
  mcpConnectionsQueryKey,
  mcpCatalogQueryKey,
  mcpErrorMessage,
  MCP_PERMISSION_CHOICES,
  patchMCPConnection,
  saveMCPToolPermissions,
  validateMCPConnectionForm,
} from "./marketplace-api"
import type { MCPConnectionFieldError } from "./marketplace-api"
import { MarketplaceBrandIcon } from "./marketplace-brand-icon"
import {
  catalogConnectionsForItem,
  catalogEntryConnectionSupported,
  catalogEntryService,
  connectionBrandId,
  connectionBrandLogo,
  CUSTOM_MCP_CATALOG_ITEM,
  groupCatalogItems,
  marketplaceBrandLogo,
  mergeCatalogPresets,
} from "./marketplace-catalog"

const SERVICE_LABEL: Record<MCPService, string> = {
  wordpress: "WordPress",
  custom: "Custom",
}

/** One async action at a time by id; concurrent runs are refused. */
export function useSingleFlight() {
  const activeRef = useRef<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const run = useCallback(async (id: string, task: () => Promise<void>) => {
    if (activeRef.current !== null) return false
    activeRef.current = id
    setActiveId(id)
    try {
      await task()
      return true
    } finally {
      if (activeRef.current === id) {
        activeRef.current = null
        setActiveId(null)
      }
    }
  }, [])
  return { activeId, run }
}

/** True once loaded data no longer contains the selected connection. Loading
 * data never clears the selection. */
export function isSelectedConnectionStale(
  configureId: string | null,
  loadedConnections: MCPConnection[] | undefined
) {
  if (configureId === null || loadedConnections === undefined) return false
  return !loadedConnections.some((connection) => connection.id === configureId)
}

function endpointHost(raw: string) {
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

type MarketplaceViewProps = {
  activeProject: ProjectResponse | null
  isOrganizationOwner: boolean
}

export const MarketplaceView = memo(function MarketplaceView({
  activeProject,
  isOrganizationOwner,
}: MarketplaceViewProps) {
  const queryClient = useQueryClient()
  const projectId = activeProject?.id
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const catalogQuery = useQuery({
    queryKey: projectId
      ? mcpCatalogQueryKey(projectId)
      : ["mcp-catalog-disabled"],
    queryFn: () => fetchMCPCatalog(projectId!),
    enabled: Boolean(projectId),
    retry: false,
  })
  const connectionsQuery = useQuery({
    queryKey: projectId
      ? mcpConnectionsQueryKey(projectId)
      : ["mcp-connections-disabled"],
    queryFn: () => fetchMCPConnections(projectId!),
    enabled: Boolean(projectId),
    retry: false,
  })

  const [connectState, setConnectState] = useState<
    | { mode: "create"; service: MCPService; preset: MCPCatalogItem }
    | { mode: "edit"; connection: MCPConnection }
    | null
  >(null)
  const [configureId, setConfigureId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MCPConnection | null>(null)
  const [actionError, setActionError] = useState("")
  const checkFlight = useSingleFlight()
  const checkingId = checkFlight.activeId

  useEffect(() => {
    setConnectState(null)
    setConfigureId(null)
    setDeleteTarget(null)
    setActionError("")
  }, [projectId])

  const loadedConnections = connectionsQuery.data?.connections
  useEffect(() => {
    if (isSelectedConnectionStale(configureId, loadedConnections)) {
      setConfigureId(null)
    }
  }, [configureId, loadedConnections])

  async function refreshConnections() {
    if (projectId) {
      await queryClient.invalidateQueries({
        queryKey: mcpConnectionsQueryKey(projectId),
      })
    }
  }

  function clearActionError() {
    setActionError("")
  }

  function openCreateConnection(item: MCPCatalogItem) {
    if (!catalogEntryConnectionSupported(item)) {
      setActionError(
        `${item.title} needs setup this connector cannot do yet: ${item.setup_note ?? "new connections are not supported."}`
      )
      return
    }
    setActionError("")
    setConnectState({
      mode: "create",
      service: catalogEntryService(item),
      preset: item,
    })
  }

  async function handleCheck(connection: MCPConnection) {
    if (!projectId) return
    await checkFlight.run(connection.id, async () => {
      setActionError("")
      try {
        await checkMCPConnection(projectId, connection.id)
        await refreshConnections()
      } catch (error) {
        setActionError(
          mcpErrorMessage(error, "Unable to refresh the connection.")
        )
      }
    })
  }

  if (!activeProject) {
    return (
      <MarketplaceStateCard
        title="Select a project"
        description="Choose a project first to see its Marketplace connections."
      />
    )
  }

  const catalogItems = mergeCatalogPresets(catalogQuery.data?.items)
  const catalogGroups = groupCatalogItems(catalogItems)
  const connections = connectionsQuery.data?.connections ?? []
  const loading =
    (catalogQuery.isLoading || connectionsQuery.isLoading) &&
    connections.length === 0
  const loadError =
    connectionsQuery.error && connections.length === 0
      ? mcpErrorMessage(
          connectionsQuery.error,
          "Unable to load Marketplace data."
        )
      : ""

  function catalogActions(item: MCPCatalogItem): CatalogConnectionActions {
    return {
      onConnect: () => openCreateConnection(item),
      onConfigure: (connection) => setConfigureId(connection.id),
      onEdit: (connection) => {
        setActionError("")
        setConnectState({ mode: "edit", connection })
      },
      onRefresh: (connection) => void handleCheck(connection),
      onDisconnect: (connection) => setDeleteTarget(connection),
    }
  }

  function renderCatalogCard(item: MCPCatalogItem) {
    return (
      <CatalogCard
        key={item.id}
        item={item}
        connections={catalogConnectionsForItem(item, connections, catalogItems)}
        canManage={isOrganizationOwner}
        checkingId={checkingId}
        actions={catalogActions(item)}
      />
    )
  }
  if (loading) return <DataLoadingState label="Loading Marketplace..." />
  if (loadError) {
    return (
      <MarketplaceStateCard
        title="Unable to load Marketplace"
        description={loadError}
        error
        onRetry={() => {
          void catalogQuery.refetch()
          void connectionsQuery.refetch()
        }}
        retryBusy={catalogQuery.isFetching || connectionsQuery.isFetching}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-6 sm:py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Marketplace
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Connect WordPress or custom MCP servers so chat tools can read content
          and propose edits. Every tool asks first until you allow it.
        </p>
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

      {!isOrganizationOwner ? (
        <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            You have read-only access. Only the organization owner can manage
            connections.
          </span>
        </p>
      ) : null}

      <section aria-label="Connections" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          Connections
          <span className="ml-2 text-muted-foreground tabular-nums">
            {connections.length}
          </span>
        </h2>
        <div className="flex flex-col gap-4">
          {isOrganizationOwner ? (
            <CatalogCard
              tone="action"
              item={CUSTOM_MCP_CATALOG_ITEM}
              connections={catalogConnectionsForItem(
                CUSTOM_MCP_CATALOG_ITEM,
                connections,
                catalogItems
              )}
              canManage
              checkingId={checkingId}
              actions={catalogActions(CUSTOM_MCP_CATALOG_ITEM)}
            />
          ) : null}
          {connections.length === 0 ? (
            <Empty className="border p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlugIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No connections yet</EmptyTitle>
                <EmptyDescription>
                  Connect {activeProject.name} to a catalog entry below to
                  discover its tools.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {connections.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  canManage={isOrganizationOwner}
                  checking={checkingId === connection.id}
                  onConfigure={() => setConfigureId(connection.id)}
                  onEdit={() => {
                    setActionError("")
                    setConnectState({ mode: "edit", connection })
                  }}
                  onCheck={() => void handleCheck(connection)}
                  onDelete={() => setDeleteTarget(connection)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section aria-label="Catalog" className="flex flex-col gap-5">
        <h2 className="text-sm font-medium">Catalog</h2>
        {catalogGroups.map((group) =>
          group.id === "others" ? (
            <details key={group.id}>
              <summary className="cursor-pointer text-micro font-medium tracking-wide text-muted-foreground uppercase select-none">
                {group.title}
                <span className="ml-2 tabular-nums">{group.items.length}</span>
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {group.items.map(renderCatalogCard)}
              </div>
            </details>
          ) : (
            <div className="flex flex-col gap-2.5" key={group.id}>
              <h3 className="text-micro font-medium tracking-wide text-muted-foreground uppercase">
                {group.title}
                <span className="ml-2 tabular-nums">{group.items.length}</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map(renderCatalogCard)}
              </div>
            </div>
          )
        )}
      </section>

      <ConnectDialog
        key={
          connectState
            ? `${connectState.mode}-${connectState.mode === "edit" ? connectState.connection.id : connectState.preset.id}`
            : "closed"
        }
        state={connectState}
        projectId={projectId!}
        projectName={activeProject.name}
        onClose={() => setConnectState(null)}
        onSaved={() => {
          setConnectState(null)
          setActionError("")
          void refreshConnections()
        }}
        onError={setActionError}
        onClearError={clearActionError}
      />
      {configureId ? (
        <ConfigureDialog
          key={configureId}
          connection={connections.find((c) => c.id === configureId) ?? null}
          projectId={projectId!}
          canManage={isOrganizationOwner}
          onClose={() => setConfigureId(null)}
          onSaved={() => {
            setConfigureId(null)
            setActionError("")
            void refreshConnections()
          }}
          onError={setActionError}
          onClearError={clearActionError}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteDialog
          connection={deleteTarget}
          projectId={projectId!}
          projectName={activeProject.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null)
            setActionError("")
            void refreshConnections()
          }}
          onError={setActionError}
          onClearError={clearActionError}
        />
      ) : null}
    </div>
  )
}, areMarketplaceViewPropsEqual)

function areMarketplaceViewPropsEqual(
  previous: MarketplaceViewProps,
  next: MarketplaceViewProps
) {
  return (
    previous.activeProject?.id === next.activeProject?.id &&
    previous.activeProject?.name === next.activeProject?.name &&
    previous.isOrganizationOwner === next.isOrganizationOwner
  )
}

function MarketplaceStateCard({
  title,
  description,
  error,
  onRetry,
  retryBusy,
}: {
  title: string
  description: string
  error?: boolean
  onRetry?: () => void
  retryBusy?: boolean
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Marketplace
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Connect MCP servers so chat tools can read content and propose edits.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Empty className="border-0 p-2">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {error ? (
                  <TriangleAlertIcon aria-hidden="true" />
                ) : (
                  <PlugIcon aria-hidden="true" />
                )}
              </EmptyMedia>
              <EmptyTitle>{title}</EmptyTitle>
              <EmptyDescription>{description}</EmptyDescription>
            </EmptyHeader>
            {onRetry ? (
              <div className="flex justify-center pt-2">
                <Button
                  disabled={retryBusy}
                  onClick={onRetry}
                  type="button"
                  variant="outline"
                >
                  {retryBusy ? "Retrying…" : "Try again"}
                </Button>
              </div>
            ) : null}
          </Empty>
        </CardContent>
      </Card>
    </div>
  )
}

export type CatalogConnectionActions = {
  onConnect: () => void
  onConfigure: (connection: MCPConnection) => void
  onEdit: (connection: MCPConnection) => void
  onRefresh: (connection: MCPConnection) => void
  onDisconnect: (connection: MCPConnection) => void
}

/** Compact catalogue row: mark, name, summary, plus or overflow. */
export function CatalogCard({
  item,
  connections,
  canManage,
  checkingId,
  tone = "catalog",
  actions,
}: {
  item: MCPCatalogItem
  connections: MCPConnection[]
  canManage: boolean
  checkingId: string | null
  /** "action" tints the add-custom row with accent tokens. */
  tone?: "catalog" | "action"
  actions: CatalogConnectionActions
}) {
  const connected = connections.length > 0
  const supported = catalogEntryConnectionSupported(item)
  const blockedNote = supported
    ? undefined
    : (item.setup_note ??
      "New connections are not supported for this provider.")
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5",
        tone === "action" ? "border-accent/40 bg-accent/25" : "border-border"
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
        <MarketplaceBrandIcon
          id={item.id}
          logo={marketplaceBrandLogo(item.id, item.logo)}
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{item.title}</span>
          {supported ? null : (
            <Badge className="shrink-0" variant="outline">
              Setup required
            </Badge>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {blockedNote ?? item.description}
        </span>
      </div>
      {canManage ? (
        connected ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={`Manage ${item.title}`}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <EllipsisIcon className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                {connections.map((connection) => (
                  <DropdownMenuSub key={connection.id}>
                    <DropdownMenuSubTrigger>
                      {connection.name}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={() => actions.onConfigure(connection)}
                      >
                        <Settings2Icon className="size-4" />
                        Configure tools
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => actions.onEdit(connection)}
                      >
                        <PlugIcon className="size-4" />
                        Edit connection
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={checkingId === connection.id}
                        onClick={() => actions.onRefresh(connection)}
                      >
                        {checkingId === connection.id ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <RefreshCwIcon className="size-4" />
                        )}
                        {checkingId === connection.id
                          ? "Checking…"
                          : "Refresh tools"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => actions.onDisconnect(connection)}
                        variant="destructive"
                      >
                        <Trash2Icon className="size-4" />
                        Disconnect
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
                <DropdownMenuItem
                  disabled={!supported}
                  onClick={actions.onConnect}
                >
                  <PlusIcon className="size-4" />
                  Add connection
                </DropdownMenuItem>
                {blockedNote ? (
                  <p className="px-2 py-1.5 text-xs leading-relaxed text-pretty text-muted-foreground">
                    {blockedNote}
                  </p>
                ) : null}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            aria-label={`Connect ${item.title}`}
            disabled={!supported}
            onClick={actions.onConnect}
            size="icon-sm"
            title={blockedNote}

            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-4" />
          </Button>
        )
      ) : null}
    </div>
  )
}

export const ConnectionCard = memo(function ConnectionCard({
  connection,
  canManage,
  checking,
  onConfigure,
  onEdit,
  onCheck,
  onDelete,
}: {
  connection: MCPConnection
  canManage: boolean
  checking: boolean
  onConfigure: () => void
  onEdit: () => void
  onCheck: () => void
  onDelete: () => void
}) {
  const allowCount = connection.tools.filter(
    (tool) => tool.permission === "allow"
  ).length
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
              <MarketplaceBrandIcon
                id={
                  connection.service === "wordpress"
                    ? "wordpress"
                    : connectionBrandId(connection.endpoint_url)
                }
                logo={
                  connection.service === "wordpress"
                    ? marketplaceBrandLogo("wordpress")
                    : connectionBrandLogo(connection.endpoint_url)
                }
              />
            </span>
            <div className="flex min-w-0 flex-col">
              <CardTitle className="truncate text-sm font-medium">
                {connection.name}
              </CardTitle>
              <p className="truncate text-xs text-muted-foreground">
                {SERVICE_LABEL[connection.service]} ·{" "}
                {endpointHost(connection.endpoint_url)}
              </p>
            </div>
          </div>
          {canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={`Manage ${connection.name}`}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <EllipsisIcon className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onConfigure}>
                    <Settings2Icon className="size-4" />
                    Configure tools
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onEdit}>
                    <PlugIcon className="size-4" />
                    Edit connection
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={checking} onClick={onCheck}>
                    {checking ? (
                      <Loader2Icon
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : (
                      <RefreshCwIcon className="size-4" />
                    )}
                    {checking ? "Checking…" : "Refresh tools"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDelete} variant="destructive">
                    <Trash2Icon className="size-4" />
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            aria-label={`${connection.tools.length} tools`}
          >
            {connection.tools.length} tools
          </Badge>
          {allowCount > 0 ? (
            <Badge variant="outline">{allowCount} always allowed</Badge>
          ) : null}
        </div>
        {checking ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
            Checking…
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Checked {formatCheckedAt(connection.last_checked_at)}
          </p>
        )}
        <div>
          <Button
            onClick={onConfigure}
            size="sm"
            type="button"
            variant="outline"
          >
            <Settings2Icon data-icon="inline-start" aria-hidden="true" />
            Configure
          </Button>
        </div>
      </CardContent>
    </Card>
  )
})

export type ConnectFormValues = {
  name: string
  endpointUrl: string
  bearerToken: string
}

/** Name/URL/token form. Validation flags only the failing field. */
export function ConnectForm({
  initialName,
  initialEndpointUrl,
  namePlaceholder,
  tokenPlaceholder,
  tokenOptional,
  saving,
  submitLabel,
  submitError,
  onSubmit,
  onCancel,
}: {
  initialName: string
  initialEndpointUrl: string
  namePlaceholder: string
  tokenPlaceholder: string
  tokenOptional: boolean
  saving: boolean
  submitLabel: string
  submitError: string
  onSubmit: (values: ConnectFormValues) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [endpointUrl, setEndpointUrl] = useState(initialEndpointUrl)
  const [bearerToken, setBearerToken] = useState("")
  const [fieldError, setFieldError] = useState<MCPConnectionFieldError | null>(
    null
  )

  function handleSubmit() {
    const validation = validateMCPConnectionForm({
      name,
      endpointUrl,
      bearerToken,
      tokenOptional,
    })
    if (validation) {
      setFieldError(validation)
      return
    }
    setFieldError(null)
    onSubmit({ name, endpointUrl, bearerToken })
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        handleSubmit()
      }}
    >
      <FieldGroup>
        <Field data-invalid={fieldError?.field === "name" || undefined}>
          <FieldLabel htmlFor="mcp-connect-name">Name</FieldLabel>
          <Input
            aria-invalid={fieldError?.field === "name" || undefined}
            autoComplete="off"
            disabled={saving}
            id="mcp-connect-name"
            onChange={(event) => {
              setName(event.target.value)
              if (fieldError?.field === "name") setFieldError(null)
            }}
            placeholder={namePlaceholder}
            value={name}
          />
          {fieldError?.field === "name" ? (
            <FieldError>{fieldError.message}</FieldError>
          ) : null}
        </Field>
        <Field data-invalid={fieldError?.field === "endpointUrl" || undefined}>
          <FieldLabel htmlFor="mcp-connect-endpoint">MCP endpoint</FieldLabel>
          <Input
            aria-invalid={fieldError?.field === "endpointUrl" || undefined}
            autoComplete="off"
            disabled={saving}
            id="mcp-connect-endpoint"
            inputMode="url"
            onChange={(event) => {
              setEndpointUrl(event.target.value)
              if (fieldError?.field === "endpointUrl") setFieldError(null)
            }}
            placeholder="https://example.com/mcp"
            value={endpointUrl}
          />
          <FieldDescription>
            The full streamable HTTP MCP endpoint URL.
          </FieldDescription>
          {fieldError?.field === "endpointUrl" ? (
            <FieldError>{fieldError.message}</FieldError>
          ) : null}
        </Field>
        <Field data-invalid={fieldError?.field === "bearerToken" || undefined}>
          <FieldLabel htmlFor="mcp-connect-token">Bearer token</FieldLabel>
          <Input
            aria-invalid={fieldError?.field === "bearerToken" || undefined}
            autoComplete="off"
            disabled={saving}
            id="mcp-connect-token"
            onChange={(event) => {
              setBearerToken(event.target.value)
              if (fieldError?.field === "bearerToken") setFieldError(null)
            }}
            placeholder={tokenPlaceholder}
            type="password"
            value={bearerToken}
          />
          <FieldDescription>
            Checked before the token is stored encrypted. It is never displayed
            again.
          </FieldDescription>
          {fieldError?.field === "bearerToken" ? (
            <FieldError>{fieldError.message}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>
      {submitError ? (
        <p className="text-sm leading-relaxed text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}
      <DialogFooter>
        <Button
          disabled={saving}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button disabled={saving} type="submit">
          {saving ? (
            <Loader2Icon
              data-icon="inline-start"
              aria-hidden="true"
              className="animate-spin"
            />
          ) : null}
          {saving ? "Checking…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ConnectDialog({
  state,
  projectId,
  projectName,
  onClose,
  onSaved,
  onError,
  onClearError,
}: {
  state:
    | { mode: "create"; service: MCPService; preset: MCPCatalogItem }
    | { mode: "edit"; connection: MCPConnection }
    | null
  projectId: string
  projectName: string
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
  onClearError: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const open = state !== null
  const preset = state?.mode === "create" ? state.preset : null
  const tokenRequired = preset ? preset.auth_required !== false : false

  async function handleSubmit(values: ConnectFormValues) {
    if (!state || !projectId) return
    setSubmitError("")
    onClearError()
    setSaving(true)
    try {
      if (state.mode === "create") {
        await createMCPConnection(projectId, {
          name: values.name.trim(),
          service: state.service,
          endpoint_url: values.endpointUrl.trim(),
          bearer_token: values.bearerToken,
        })
      } else {
        const body: {
          name?: string
          endpoint_url?: string
          bearer_token?: string
        } = {}
        if (values.name.trim() !== state.connection.name)
          body.name = values.name.trim()
        if (values.endpointUrl.trim() !== state.connection.endpoint_url)
          body.endpoint_url = values.endpointUrl.trim()
        if (values.bearerToken) body.bearer_token = values.bearerToken
        if (Object.keys(body).length > 0) {
          await patchMCPConnection(projectId, state.connection.id, body)
        }
      }
      onSaved()
    } catch (error) {
      const message = mcpErrorMessage(error, "Unable to save the connection.")
      setSubmitError(message)
      onError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.mode === "edit"
              ? `Edit ${state.connection.name}`
              : `Connect ${preset?.title ?? "custom MCP"}`}
          </DialogTitle>
          <DialogDescription>
            Save the endpoint and token for {projectName}. The connection is
            checked before anything is stored, and the token is never shown
            again.
          </DialogDescription>
        </DialogHeader>
        {preset?.setup_note ? (
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
            {preset.setup_note}
          </p>
        ) : null}
        <ConnectForm
          initialName={
            state?.mode === "edit"
              ? state.connection.name
              : (preset?.title ?? "")
          }
          initialEndpointUrl={
            state?.mode === "edit"
              ? state.connection.endpoint_url
              : (preset?.endpoint_url ?? "")
          }
          namePlaceholder={preset?.title ?? "My MCP server"}
          tokenPlaceholder={
            state?.mode === "edit"
              ? "Leave empty to keep the saved token"
              : tokenRequired
                ? "Paste the bearer token"
                : "Optional, leave empty for no authentication"
          }

          tokenOptional={!tokenRequired}
          saving={saving}
          submitLabel={state?.mode === "edit" ? "Save changes" : "Connect"}
          submitError={submitError}
          onSubmit={(values) => void handleSubmit(values)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Searchable per-tool policy list. Only explicit overrides differ from the
 * live server policy, so refreshes and new tools never get silently resent. */
export function ConfigureToolsContent({
  connection,
  canManage,
  saving,
  submitError,
  onClose,
  onSubmit,
}: {
  connection: MCPConnection
  canManage: boolean
  saving: boolean
  submitError: string
  onClose: () => void
  onSubmit: (edits: MCPToolPermissionEdit[]) => void
}) {
  const [search, setSearch] = useState("")
  const [overrides, setOverrides] = useState<Record<string, MCPToolPermission>>(
    {}
  )

  const sections = useMemo(() => groupMCPTools(connection.tools), [connection])
  const filtered = useMemo(
    () => filterMCPToolSections(sections, search),
    [sections, search]
  )

  const changedEdits = useMemo(
    () => connectionPermissionEdits(connection.tools, overrides),
    [connection, overrides]
  )
  const dirtyCount = changedEdits.length

  function setAllToolPermissions(permission: "allow" | "deny") {
    setOverrides((current) => {
      const next = { ...current }
      for (const tool of connection.tools) {
        if (tool.available) next[tool.name] = permission
      }
      return next
    })
  }

  const bulkDisabled =
    !canManage || saving || !connection.tools.some((tool) => tool.available)

  return (
    <>
      <Input
        aria-label="Search tools"
        autoComplete="off"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search tools…"
        value={search}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={bulkDisabled}
          onClick={() => setAllToolPermissions("allow")}
          size="sm"
          type="button"
          variant="outline"
        >
          Allow all
        </Button>
        <Button
          disabled={bulkDisabled}
          onClick={() => setAllToolPermissions("deny")}
          size="sm"
          type="button"
          variant="outline"
        >
          Deny all
        </Button>
      </div>
      <div
        aria-label="Connection tools"
        className="max-h-[min(50vh,26rem)] overflow-y-auto overscroll-contain pr-1"
        role="region"
        tabIndex={0}
      >
        <div className="flex flex-col gap-5">
          {filtered.map((section) => (
            <section
              key={section.key}
              aria-label={section.title}
              className="flex flex-col gap-1.5"
            >
              <h3 className="flex items-center gap-2 text-micro font-medium tracking-wide text-muted-foreground uppercase">
                <span className="truncate">{section.title}</span>
                <span className="text-muted-foreground/70 tabular-nums">
                  {section.rows.length}
                </span>
              </h3>
              <ul className="flex flex-col gap-2">
                {section.rows.map((row) => (
                  <li
                    key={row.name}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 basis-40 flex-col">
                      <span className="truncate text-sm font-medium">
                        {row.label}
                      </span>
                      {row.description ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {row.description}
                        </span>
                      ) : null}
                    </div>
                    {row.available ? (
                      <ToggleGroup
                        aria-label={`Permission for ${row.label}`}
                        disabled={!canManage || saving}
                        onValueChange={(values) => {
                          const next = values[0] as
                            MCPToolPermission | undefined
                          if (
                            next === "ask" ||
                            next === "allow" ||
                            next === "deny"
                          ) {
                            setOverrides((current) => ({
                              ...current,
                              [row.name]: next,
                            }))
                          }
                        }}
                        size="sm"
                        value={[overrides[row.name] ?? row.permission]}
                        variant="outline"
                      >
                        {MCP_PERMISSION_CHOICES.map((choice) => (
                          <ToggleGroupItem
                            key={choice.value}
                            aria-label={choice.label}
                            value={choice.value}
                          >
                            {choice.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    ) : (
                      <div className="flex min-w-0 flex-col items-end gap-1">
                        <Badge variant="secondary">Unavailable</Badge>
                        {row.unavailableReason ? (
                          <span className="max-w-[16rem] text-right text-xs leading-relaxed text-pretty text-muted-foreground">
                            {row.unavailableReason}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No tools match “{search.trim()}”.
            </p>
          ) : null}
        </div>
      </div>
      {submitError ? (
        <p className="text-sm leading-relaxed text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}
      <Separator />
      <DialogFooter>
        <Button
          disabled={saving}
          onClick={onClose}
          type="button"
          variant="outline"
        >
          Close
        </Button>
        <Button
          disabled={!canManage || saving || dirtyCount === 0}
          onClick={() => onSubmit(changedEdits)}
          type="button"
        >
          {saving ? (
            <Loader2Icon
              data-icon="inline-start"
              aria-hidden="true"
              className="animate-spin"
            />
          ) : null}
          {saving
            ? "Saving…"
            : dirtyCount > 0
              ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`
              : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}

export function ConfigureDialog({
  connection,
  projectId,
  canManage,
  onClose,
  onSaved,
  onError,
  onClearError,
}: {
  connection: MCPConnection | null
  projectId: string
  canManage: boolean
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
  onClearError: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState("")

  async function handleSave(edits: MCPToolPermissionEdit[]) {
    if (!connection || !projectId || edits.length === 0) return
    setSubmitError("")
    onClearError()
    setSaving(true)
    try {
      await saveMCPToolPermissions(projectId, connection.id, edits)
      onSaved()
    } catch (error) {
      const message = mcpErrorMessage(error, "Unable to save tool permissions.")
      setSubmitError(message)
      onError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={connection !== null}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Configure {connection?.name ?? "connection"}
          </DialogTitle>
          <DialogDescription>
            Every tool asks first until you change it here. Denied tools stay
            denied even if they disappear and reappear.
          </DialogDescription>
        </DialogHeader>
        {connection ? (
          <ConfigureToolsContent
            connection={connection}
            canManage={canManage}
            saving={saving}
            submitError={submitError}
            onClose={onClose}
            onSubmit={(edits) => void handleSave(edits)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  connection,
  projectId,
  projectName,
  onClose,
  onDeleted,
  onError,
  onClearError,
}: {
  connection: MCPConnection
  projectId: string
  projectName: string
  onClose: () => void
  onDeleted: () => void
  onError: (message: string) => void
  onClearError: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!projectId) return
    onClearError()
    setDeleting(true)
    try {
      await deleteMCPConnection(projectId, connection.id)
      onDeleted()
    } catch (error) {
      onError(mcpErrorMessage(error, "Unable to disconnect."))
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !deleting) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect {connection.name}?</DialogTitle>
          <DialogDescription>
            This removes the saved endpoint, token, and tool permissions for{" "}
            {projectName}. You can reconnect at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={deleting}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={deleting}
            onClick={() => void handleDelete()}
            type="button"
            variant="destructive"
          >
            {deleting ? (
              <Loader2Icon
                data-icon="inline-start"
                aria-hidden="true"
                className="animate-spin"
              />
            ) : null}
            {deleting ? "Disconnecting…" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type MCPToolSectionRow = {
  name: string
  label: string
  description: string
  available: boolean
  permission: MCPToolInfo["permission"]
  unavailableReason?: string
}

export type MCPToolSection = {
  key: string
  title: string
  rows: MCPToolSectionRow[]
}

/** Case-insensitive name/label/description filter for the configure list. */
export function filterMCPToolSections(
  sections: MCPToolSection[],
  query: string
) {
  const needle = query.trim().toLowerCase()
  if (!needle) return sections
  return sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter(
        (row) =>
          row.name.toLowerCase().includes(needle) ||
          row.label.toLowerCase().includes(needle) ||
          row.description.toLowerCase().includes(needle)
      ),
    }))
    .filter((section) => section.rows.length > 0)
}

function groupMCPTools(tools: MCPToolInfo[]): MCPToolSection[] {
  const groups = new Map<string, MCPToolInfo[]>()
  for (const tool of tools) {
    const key = tool.group?.trim() || "other"
    const bucket = groups.get(key)
    if (bucket) bucket.push(tool)
    else groups.set(key, [tool])
  }
  return [...groups].map(([key, groupTools]) => ({
    key,
    title: key === "other" ? "Other tools" : humanizeMCPGroup(key),
    rows: groupTools.map((tool) => ({
      name: tool.name,
      label: humanizeMCPToolName(tool.name),
      description: tool.description ?? "",
      available: tool.available,
      permission: tool.permission,
      unavailableReason: tool.unavailable_reason,
    })),
  }))
}
