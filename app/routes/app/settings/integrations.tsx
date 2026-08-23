import { useCallback, useEffect, useState } from "react"
import { useLoaderData, useNavigate } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import { redirect } from "react-router"
import { BotIcon } from "lucide-react"
import { toast } from "sonner"

import { WorkspaceShellPreview } from "~/components/workspace-shell-preview"
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"
import { useSessionRenewal } from "~/hooks/use-session-renewal"
import {
  ApiError,
  buildApiUrl,
  clientApiFetch,
  clientApiPost,
  serverApiFetch,
} from "~/lib/api"
import { FeaturesProvider } from "~/lib/features"
import { isAccountSuspended } from "~/lib/auth.server"
import type {
  AgentSetupCodeResponse,
  APIKeyResponse,
  APIKeysResponse,
  AppBootstrapResponse,
} from "~/lib/api.types"

const apiBaseUrl = buildApiUrl("").replace(/\/$/, "")

export async function loader({ request }: LoaderFunctionArgs) {
  let bootstrap: AppBootstrapResponse
  try {
    bootstrap = await serverApiFetch<AppBootstrapResponse>(
      "/app-bootstrap",
      request
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const requestUrl = new URL(request.url)
      const nextPath = `${requestUrl.pathname}${requestUrl.search}`
      throw redirect(`/login?next=${encodeURIComponent(nextPath)}`)
    }
    if (isAccountSuspended(error)) {
      throw redirect("/account-suspended")
    }
    throw error
  }

  const { me, projects, active_project: activeProject, crawls } = bootstrap

  const recentCrawls = crawls ?? []
  const projectCrawls = activeProject
    ? { [activeProject.id]: recentCrawls }
    : {}

  return {
    skillUrl: new URL("/skills/revserp/SKILL.md", request.url).toString(),
    me,
    projects,
    activeProject,
    recentCrawls,
    projectCrawls,
    sessionExpiresAt: bootstrap.session_expires_at,
    sessionRenewAfter: bootstrap.session_renew_after,
  }
}

const COMPATIBLE_TOOLS = [
  "Claude Code or Claude Desktop",
  "ChatGPT Desktop",
  "Any AI assistant that can run commands on your computer",
]

const SETUP_STEPS = [
  "Click “Connect an AI agent”.",
  "Paste the copied message into your AI assistant.",
  "The assistant installs the Revserp skill and finishes setup.",
]

export default function APIKeysPage() {
  const {
    skillUrl,
    me,
    projects,
    activeProject,
    recentCrawls,
    projectCrawls,
    sessionExpiresAt,
    sessionRenewAfter,
  } = useLoaderData() as Awaited<ReturnType<typeof loader>>
  const navigate = useNavigate()
  useSessionRenewal(sessionExpiresAt, sessionRenewAfter)
  const [apiKeys, setAPIKeys] = useState<APIKeyResponse[]>([])
  const [loadError, setLoadError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingSetupCode, setIsCreatingSetupCode] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<APIKeyResponse | null>(null)
  const [revokingKeyID, setRevokingKeyID] = useState<string | null>(null)

  const loadAPIKeys = useCallback(async () => {
    setIsLoading(true)
    setLoadError("")
    try {
      const response = await clientApiFetch<APIKeysResponse>("/api-keys")
      setAPIKeys(response.api_keys ?? [])
    } catch (error) {
      setLoadError(getErrorMessage(error, "Unable to load API keys."))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAPIKeys()
  }, [loadAPIKeys])

  const activeKeys = apiKeys.filter((key) => !key.revoked_at)
  const revokedKeys = apiKeys.filter((key) => key.revoked_at)

  async function connectAgent() {
    if (isCreatingSetupCode) return

    setIsCreatingSetupCode(true)
    try {
      const response = await clientApiPost<AgentSetupCodeResponse>(
        "/agent/setup-codes",
        {}
      )
      await copyConnectionDetails(response.code)
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to create a setup code."))
    } finally {
      setIsCreatingSetupCode(false)
    }
  }

  async function copyConnectionDetails(code: string) {
    const details = `Read and follow this Revserp skill:
${skillUrl}

Use this Revserp API base: ${apiBaseUrl}

Use this one-time setup code:
${code}`
    try {
      await navigator.clipboard.writeText(details)
      toast.success("Connection details copied")
    } catch {
      toast.error("Unable to copy the connection details.")
    }
  }

  async function revokeAPIKey() {
    if (!revokeTarget || revokingKeyID) return

    setRevokingKeyID(revokeTarget.id)
    try {
      await clientApiPost<{ ok: boolean }>(
        `/api-keys/${encodeURIComponent(revokeTarget.id)}/revoke`,
        {}
      )
      setRevokeTarget(null)
      toast.success("API key revoked")
      await loadAPIKeys()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to revoke API key."))
    } finally {
      setRevokingKeyID(null)
    }
  }

  return (
    <FeaturesProvider features={me.features}>
      <WorkspaceShellPreview
        activeProjectId={activeProject?.id}
        auditTab="overview"
        compareLabel={null}
        crawlStatusLabel=""
        currentCrawl={recentCrawls[0] ?? null}
        isCrawlRunning={false}
        isExportingAudit={false}
        isPlatformAdmin={me.is_platform_admin}
        onAuditTabChange={() => void navigate("/app")}
        onCompareCrawl={(crawl) =>
          void navigate(`/app?project=${crawl.project_id}&crawl=${crawl.id}`)
        }
        onCrawlStart={(crawl) =>
          void navigate(`/app?project=${crawl.project_id}&crawl=${crawl.id}`)
        }
        onExportAudit={() => {}}
        onViewChange={(view) =>
          void navigate(
            view === "search-console" ? "/app#search-console" : "/app"
          )
        }
        organizationId={me.active_org_id}
        organizations={me.organizations}
        projectCrawls={projectCrawls}
        projects={projects}
        revbotConversationId={null}
        onRevbotConversationChange={() => {}}
        userEmail={me.user.email}
        userName={me.user.name}
        view="revserp-audit"
      >
        <main className="@container/main flex w-full flex-col gap-6 py-6">
          <div className="px-4 lg:px-6">
            <h1 className="font-heading text-2xl font-medium tracking-tight">
              Integrations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect an AI assistant to your Revserp workspace.
            </p>
          </div>

          <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Context</CardTitle>
                <CardDescription>
                  This is an experimental way to use Revserp from an AI
                  assistant. It gives the assistant read-only access to your
                  crawl data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Works with
                </p>
                <ul className="flex flex-col gap-2 text-sm">
                  {COMPATIBLE_TOOLS.map((tool) => (
                    <li className="flex items-center gap-3" key={tool}>
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                      />
                      {tool}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Steps</CardTitle>
              </CardHeader>
              <CardContent className="flex h-full flex-col justify-between gap-6">
                <ol className="flex flex-col gap-3 text-sm">
                  {SETUP_STEPS.map((step, index) => (
                    <li className="flex items-center gap-3" key={step}>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <Button
                  className="w-full sm:w-fit"
                  disabled={isCreatingSetupCode}
                  onClick={() => void connectAgent()}
                >
                  <BotIcon data-icon="inline-start" />
                  {isCreatingSetupCode
                    ? "Copying details..."
                    : "Connect an AI agent"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {loadError ? (
            <p className="px-4 text-sm text-destructive lg:px-6" role="alert">
              {loadError}
            </p>
          ) : null}

          <div className="px-4 lg:px-6">
            <Card>
              <CardHeader>
                <CardTitle>Connected agents</CardTitle>
                <CardDescription>
                  Keys grant read-only access to every workspace you belong to.
                  Revoke a key when you no longer use that agent or computer.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex flex-col gap-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BotIcon />
                      </EmptyMedia>
                      <EmptyTitle>No connected agents</EmptyTitle>
                      <EmptyDescription>
                        Connect an AI agent to create a read-only key.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="flex flex-col">
                    {activeKeys.length > 0 ? (
                      activeKeys.map((key, index) => (
                        <KeyRow
                          isFirst={index === 0}
                          key={key.id}
                          onRevoke={setRevokeTarget}
                          value={key}
                        />
                      ))
                    ) : (
                      <p className="py-3 text-sm text-muted-foreground">
                        No active connections.
                      </p>
                    )}
                    {revokedKeys.length > 0 ? (
                      <>
                        <Separator className="my-4" />
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Revoked
                        </p>
                        <div className="mt-2 flex flex-col">
                          {revokedKeys.map((key) => (
                            <KeyRow isFirst={false} key={key.id} value={key} />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>

        <Dialog
          open={revokeTarget !== null}
          onOpenChange={(open) => {
            if (!open && !revokingKeyID) setRevokeTarget(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke API key?</DialogTitle>
              <DialogDescription>
                {revokeTarget
                  ? `Agents using ${revokeTarget.token_prefix} will lose access immediately.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <Button
                disabled={revokingKeyID !== null}
                onClick={() => void revokeAPIKey()}
                variant="destructive"
              >
                {revokingKeyID ? "Revoking..." : "Revoke key"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </WorkspaceShellPreview>
    </FeaturesProvider>
  )
}

function KeyRow({
  isFirst,
  onRevoke,
  value: key,
}: {
  isFirst: boolean
  onRevoke?: (key: APIKeyResponse) => void
  value: APIKeyResponse
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${
        isFirst ? "" : "border-t border-border/60"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{key.name}</span>
          {key.revoked_at ? <Badge variant="secondary">Revoked</Badge> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <code>{key.token_prefix}</code> · Created{" "}
          {formatDateTime(key.created_at)} · Last used{" "}
          {key.last_used_at ? formatDateTime(key.last_used_at) : "never"}
        </p>
      </div>
      {onRevoke && !key.revoked_at ? (
        <Button
          className="shrink-0 text-destructive hover:text-destructive"
          onClick={() => onRevoke(key)}
          size="sm"
          variant="ghost"
        >
          Revoke
        </Button>
      ) : null}
    </div>
  )
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
