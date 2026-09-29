import { useState } from "react"
import { useLoaderData, useNavigate } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import { redirect } from "react-router"
import { CopyIcon, ExternalLinkIcon } from "lucide-react"
import { toast } from "sonner"

import { WorkspaceShellPreview } from "~/components/workspace-shell-preview"
import { Button, buttonVariants } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { useSessionRenewal } from "~/hooks/use-session-renewal"
import { ApiError, buildApiUrl, serverApiFetch } from "~/lib/api"
import { FeaturesProvider } from "~/lib/features"
import { isAccountSuspended } from "~/lib/auth.server"
import type { AppBootstrapResponse } from "~/lib/api.types"

const CLAUDE_CONNECTOR_URL =
  "https://claude.ai/customize/connectors/yours?modal=add-custom-connector"

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

  if (me.features?.integrations === false) {
    throw redirect("/app")
  }

  const recentCrawls = crawls ?? []
  const projectCrawls = activeProject
    ? { [activeProject.id]: recentCrawls }
    : {}

  return {
    me,
    projects,
    activeProject,
    recentCrawls,
    projectCrawls,
    sessionExpiresAt: bootstrap.session_expires_at,
    sessionRenewAfter: bootstrap.session_renew_after,
  }
}

export default function IntegrationsPage() {
  const {
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
  const [isCopying, setIsCopying] = useState(false)

  const mcpUrl = buildApiUrl("/mcp")

  async function copyMcpUrl() {
    if (isCopying) return
    setIsCopying(true)
    try {
      await navigator.clipboard.writeText(mcpUrl)
      toast.success("MCP URL copied")
    } catch {
      toast.error("Unable to copy the MCP URL.")
    } finally {
      setIsCopying(false)
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
            view === "search-console"
              ? "/app#search-console"
              : view === "analytics"
                ? "/app#analytics"
                : view === "competitors"
                  ? "/app#competitors"
                  : view === "keywords"
                    ? "/app#keywords"
                    : "/app"
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
              Connect Claude, Grok, or another MCP client to your Revserp
              workspace with OAuth.
            </p>
          </div>

          <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Claude</CardTitle>
                <CardDescription>
                  Add Revserp as a custom connector, then authorize with your
                  Revserp account.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label
                    className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    htmlFor="mcp-url"
                  >
                    MCP endpoint
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="mcp-url"
                      name="mcp-url"
                      readOnly
                      value={mcpUrl}
                      onFocus={(event) => event.target.select()}
                    />
                    <Button
                      className="shrink-0"
                      disabled={isCopying}
                      onClick={() => void copyMcpUrl()}
                      type="button"
                    >
                      <CopyIcon data-icon="inline-start" />
                      {isCopying ? "Copying..." : "Copy URL"}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <a
                    className={buttonVariants({
                      variant: "default",
                      size: "default",
                      className: "w-full sm:w-fit",
                    })}
                    href={CLAUDE_CONNECTOR_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Set up in Claude
                    <ExternalLinkIcon data-icon="inline-end" />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    Opens the Claude add-connector form. Paste the endpoint
                    above and authorize when prompted.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Other MCP clients</CardTitle>
                <CardDescription>
                  Grok and other OAuth-capable MCP clients.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-3 text-sm">
                  <li className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      1
                    </span>
                    <span>Copy the MCP endpoint URL above.</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      2
                    </span>
                    <span>
                      Add it as a custom MCP server or connector in your
                      client.
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      3
                    </span>
                    <span>
                      Authorize with Revserp OAuth when prompted to grant
                      workspace access.
                    </span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </main>
      </WorkspaceShellPreview>
    </FeaturesProvider>
  )
}
