"use client"
import { Link, useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"
import { useEffect, useState, useCallback } from "react"
import {
  ArrowLeft,
  CheckIcon,
  ChevronDownIcon,
  MoreHorizontal,
  RotateCcwIcon,
  SaveIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent } from "~/components/ui/card"
import { Textarea } from "~/components/ui/textarea"
import { Checkbox } from "~/components/ui/checkbox"
import {
  ApiError,
  clientApiFetch,
  clientApiPost,
  clientApiPut,
  clientApiDelete,
} from "~/lib/api"
import type {
  AdminUserResponse,
  AdminOrganizationResponse,
  ProjectResponse,
  CrawlResponse,
  ScoreBreakdownResponse,
  ScoringConfig,
} from "~/lib/api.types"
import { ScoringEditor } from "./internal/scoring/editor"
import { TablePagination } from "~/components/issue-explorer/scope-controls"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { FeaturesTab } from "~/components/admin/features-tab"
import { requirePlatformAdmin } from "~/lib/auth.server"
import { useSessionRenewal } from "~/hooks/use-session-renewal"

export async function loader({ request }: LoaderFunctionArgs) {
  const me = await requirePlatformAdmin(request)
  return {
    sessionExpiresAt: me.session_expires_at,
    sessionRenewAfter: me.session_renew_after,
  }
}

type AiConfig = {
  internal_system_prompt: string
  external_system_prompt: string
  question_generation_prompt: string
}

// --- Scoring Tab ---
function ScoringTab() {
  const [config, setConfig] = useState<ScoringConfig | null>(null)
  const [defaultConfig, setDefaultConfig] = useState<ScoringConfig | null>(null)
  const [orgs, setOrgs] = useState<AdminOrganizationResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [baselineBreakdown, setBaselineBreakdown] =
    useState<ScoreBreakdownResponse | null>(null)
  const [editorVersion, setEditorVersion] = useState(0)
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [crawls, setCrawls] = useState<CrawlResponse[]>([])
  const [selectedCrawlId, setSelectedCrawlId] = useState<string | null>(null)
  const [selectedPreviewOrgId, setSelectedPreviewOrgId] = useState("")
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingCrawls, setLoadingCrawls] = useState(false)
  const [menuOrgId, setMenuOrgId] = useState("")
  const [menuProjectId, setMenuProjectId] = useState("")

  const loadGlobal = useCallback(async () => {
    setLoading(true)
    try {
      const data = await clientApiFetch<{
        config: ScoringConfig
        default: ScoringConfig
      }>("/internal/scoring-config")
      setConfig(data.config)
      setDefaultConfig(data.default)
      setEditorVersion((version) => version + 1)
    } catch {
      toast.error("Failed to load scoring config")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadOrgs = useCallback(async () => {
    try {
      const data = await clientApiFetch<{
        organizations: AdminOrganizationResponse[]
      }>("/admin/organizations")
      setOrgs(data.organizations ?? [])
    } catch {
      /* ignore */
    }
  }, [])

  const loadProjects = useCallback(async (orgId: string) => {
    if (!orgId) {
      setProjects([])
      return
    }
    setLoadingProjects(true)
    try {
      const data = await clientApiFetch<{ projects: ProjectResponse[] }>(
        `/admin/organizations/${orgId}/projects`
      )
      setProjects(data.projects ?? [])
    } catch {
      setProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  const loadCrawls = useCallback(async (projectId: string) => {
    if (!projectId) {
      setCrawls([])
      return
    }
    setLoadingCrawls(true)
    try {
      const data = await clientApiFetch<{ crawls: CrawlResponse[] }>(
        `/admin/projects/${projectId}/crawls?status=completed&limit=50&offset=0`
      )
      setCrawls(data.crawls ?? [])
    } catch {
      setCrawls([])
    } finally {
      setLoadingCrawls(false)
    }
  }, [])

  const loadBaselineBreakdown = useCallback(async () => {
    if (!selectedCrawlId) {
      setBaselineBreakdown(null)
      return
    }
    try {
      const data = await clientApiFetch<ScoreBreakdownResponse>(
        `/admin/crawls/${selectedCrawlId}/score-breakdown`
      )
      setBaselineBreakdown(data)
    } catch {
      setBaselineBreakdown(null)
    }
  }, [selectedCrawlId])

  useEffect(() => {
    loadOrgs()
  }, [loadOrgs])
  useEffect(() => {
    loadBaselineBreakdown()
  }, [loadBaselineBreakdown])

  // Load the GLOBAL config on mount.
  // Deliberately NOT dependent on selectedPreviewOrgId: choosing a preview crawl
  // must not reload or remount the global config editor (it would discard draft edits).
  useEffect(() => {
    loadGlobal()
  }, [loadGlobal])

  useEffect(() => {
    loadProjects(selectedPreviewOrgId)
  }, [selectedPreviewOrgId, loadProjects])

  useEffect(() => {
    loadCrawls(selectedProjectId)
  }, [selectedProjectId, loadCrawls])

  const handleEditorSave = async (
    draftConfig: ScoringConfig
  ): Promise<void> => {
    try {
      await clientApiPut("/internal/scoring-config", { config: draftConfig })
      toast.success("Saved changes")
    } catch {
      toast.error("Failed to save changes")
    }
  }

  const handleMenuOrgHover = (orgId: string) => {
    if (menuOrgId === orgId) return
    setMenuOrgId(orgId)
    setMenuProjectId("")
    setCrawls([])
    loadProjects(orgId)
  }

  const handleMenuProjectHover = (projectId: string) => {
    if (menuProjectId === projectId) return
    setMenuProjectId(projectId)
    loadCrawls(projectId)
  }

  const handleSelectOrg = (orgId: string) => {
    setSelectedPreviewOrgId(orgId)
    setSelectedProjectId("")
    setSelectedCrawlId(null)
  }

  const handleSelectProject = (orgId: string, projectId: string) => {
    setSelectedPreviewOrgId(orgId)
    setSelectedProjectId(projectId)
    setSelectedCrawlId(null)
  }

  const handleSelectCrawl = (
    orgId: string,
    projectId: string,
    crawlId: string
  ) => {
    setSelectedPreviewOrgId(orgId)
    setSelectedProjectId(projectId)
    setSelectedCrawlId(crawlId)
  }

  // --- Picker label for the dropdown trigger ---
  const selectedOrg = orgs.find((o) => o.id === selectedPreviewOrgId)
  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const selectedCrawl = crawls.find((c) => c.id === selectedCrawlId)

  const selectedCrawlLabel = selectedCrawl
    ? `${new Date(selectedCrawl.completed_at || selectedCrawl.created_at).toLocaleDateString()}${selectedCrawl.overall_score != null ? ` · ${selectedCrawl.overall_score}` : ""}`
    : null

  const triggerLabel = (() => {
    if (!selectedPreviewOrgId) return "Choose preview crawl"
    return [selectedOrg?.name, selectedProject?.name, selectedCrawlLabel]
      .filter(Boolean)
      .join(" / ")
  })()

  if (!config && loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  if (!config) {
    return <p className="text-sm text-muted-foreground">No config loaded</p>
  }

  return (
    <div className="space-y-6">
      <ScoringEditor
        key={`global-${editorVersion}`}
        config={config}
        defaultConfig={defaultConfig ?? config}
        crawlId={selectedCrawlId}
        baselineBreakdown={baselineBreakdown}
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-9 min-w-0 justify-between sm:w-[28rem]"
                  >
                    <span className="min-w-0 truncate text-left">
                      {triggerLabel}
                    </span>
                    <ChevronDownIcon
                      data-icon="inline-end"
                      className="shrink-0 text-muted-foreground"
                    />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuGroup>
                  {orgs.length === 0 ? (
                    <DropdownMenuItem disabled>
                      No organizations
                    </DropdownMenuItem>
                  ) : (
                    orgs.map((org) => {
                      const isMenuOrg = org.id === menuOrgId
                      return (
                        <DropdownMenuSub key={org.id}>
                          <DropdownMenuSubTrigger
                            onClick={() => handleSelectOrg(org.id)}
                            onFocus={() => handleMenuOrgHover(org.id)}
                            onPointerMove={() => handleMenuOrgHover(org.id)}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {org.name}
                            </span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-72">
                            {!isMenuOrg || loadingProjects ? (
                              <DropdownMenuItem disabled>
                                Loading projects...
                              </DropdownMenuItem>
                            ) : projects.length === 0 ? (
                              <DropdownMenuItem disabled>
                                No projects
                              </DropdownMenuItem>
                            ) : (
                              projects.map((project) => {
                                const isMenuProject =
                                  project.id === menuProjectId
                                return (
                                  <DropdownMenuSub key={project.id}>
                                    <DropdownMenuSubTrigger
                                      onClick={() =>
                                        handleSelectProject(org.id, project.id)
                                      }
                                      onFocus={() =>
                                        handleMenuProjectHover(project.id)
                                      }
                                      onPointerMove={() =>
                                        handleMenuProjectHover(project.id)
                                      }
                                    >
                                      <span className="min-w-0 flex-1 truncate">
                                        {project.name}
                                      </span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="w-56">
                                      {!isMenuProject || loadingCrawls ? (
                                        <DropdownMenuItem disabled>
                                          Loading crawls...
                                        </DropdownMenuItem>
                                      ) : crawls.length === 0 ? (
                                        <DropdownMenuItem disabled>
                                          No completed crawls
                                        </DropdownMenuItem>
                                      ) : (
                                        crawls.map((crawl) => (
                                          <DropdownMenuItem
                                            key={crawl.id}
                                            onClick={() =>
                                              handleSelectCrawl(
                                                org.id,
                                                project.id,
                                                crawl.id
                                              )
                                            }
                                          >
                                            <span className="min-w-0 flex-1 truncate">
                                              {new Date(
                                                crawl.completed_at ||
                                                  crawl.created_at
                                              ).toLocaleDateString()}
                                              {crawl.overall_score != null
                                                ? ` · ${crawl.overall_score}`
                                                : ""}
                                            </span>
                                          </DropdownMenuItem>
                                        ))
                                      )}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                )
                              })
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )
                    })
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
        loading={loading}
        previewEndpoint="/admin/scoring-config/preview"
        onSave={handleEditorSave}
      />
    </div>
  )
}

// --- AI Config Tab ---
function AIConfigTab() {
  const [config, setConfig] = useState<AiConfig>({
    internal_system_prompt: "",
    external_system_prompt: "",
    question_generation_prompt: "",
  })
  const [defaultConfig, setDefaultConfig] = useState<AiConfig>({
    internal_system_prompt: "",
    external_system_prompt: "",
    question_generation_prompt: "",
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    clientApiFetch<{ config: AiConfig; default: AiConfig }>("/admin/ai-config")
      .then((data) => {
        setConfig(data.config)
        setDefaultConfig(data.default)
      })
      .catch(() => toast.error("Failed to load AI config"))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await clientApiPut("/admin/ai-config", config)
      toast.success("Saved changes")
    } catch {
      toast.error("Failed to save changes")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    try {
      await clientApiPost("/admin/ai-config/reset", {})
      setConfig(defaultConfig)
      toast.success("Reset to defaults")
    } catch {
      toast.error("Failed to reset")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          AI Configuration
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <SaveIcon /> {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={saving}
          >
            <RotateCcwIcon /> Reset to defaults
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardContent className="flex flex-col gap-1.5">
            <Label>Internal system prompt</Label>
            <Textarea
              className="min-h-[140px] font-mono"
              value={config.internal_system_prompt}
              onChange={(e) =>
                setConfig({
                  ...config,
                  internal_system_prompt: e.target.value,
                })
              }
              placeholder={
                defaultConfig.internal_system_prompt ||
                "Internal system prompt..."
              }
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex flex-col gap-1.5">
            <Label>External system prompt</Label>
            <Textarea
              className="min-h-[120px] font-mono"
              value={config.external_system_prompt}
              onChange={(e) =>
                setConfig({
                  ...config,
                  external_system_prompt: e.target.value,
                })
              }
              placeholder={
                defaultConfig.external_system_prompt ||
                "External system prompt..."
              }
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex flex-col gap-1.5">
            <Label>LLM Visibility Prompt</Label>
            <Textarea
              className="min-h-[260px] font-mono text-xs"
              value={config.question_generation_prompt}
              onChange={(e) =>
                setConfig({
                  ...config,
                  question_generation_prompt: e.target.value,
                })
              }
              placeholder={
                defaultConfig.question_generation_prompt ||
                "Prompt used to generate visibility questions..."
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// --- Accounts Tab ---
type UserRow = AdminUserResponse & {
  suspended_at?: string
  deleted_at?: string
}

function AccountsTab() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [disableTarget, setDisableTarget] = useState<
    { user: UserRow } | "bulk" | null
  >(null)
  // /admin/users returns every user with no limit/offset support, so we
  // paginate the render client-side to keep the DOM (and input latency)
  // bounded at scale while search/filter still runs over the full list.
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await clientApiFetch<{ users: UserRow[] }>("/admin/users")
      setUsers(data.users ?? [])
    } catch {
      toast.error("Failed to load users")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const action = async (userId: string, path: string, successMsg: string) => {
    try {
      await clientApiPost(`/admin/users/${userId}/${path}`, {})
      toast.success(successMsg)
      loadUsers()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Action failed")
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return (
      u.email.toLowerCase().includes(q) ||
      (u.name ?? "").toLowerCase().includes(q)
    )
  })

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const clampedPageIndex = Math.min(pageIndex, pageCount - 1)
  const paginated = filtered.slice(
    clampedPageIndex * pageSize,
    clampedPageIndex * pageSize + pageSize
  )

  const someFilteredSelected = paginated.some((u) => selectedIds.has(u.id))
  const allFilteredSelected =
    paginated.length > 0 && paginated.every((u) => selectedIds.has(u.id))

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      const pageIds = new Set(paginated.map((u) => u.id))
      const next = new Set(selectedIds)
      for (const id of pageIds) next.delete(id)
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      for (const u of paginated) next.add(u.id)
      setSelectedIds(next)
    }
  }

  const handleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const selectedUsers = users.filter((u) => selectedIds.has(u.id))
  const selectedCount = selectedIds.size

  const bulkSuspend = async () => {
    const eligible = selectedUsers.filter((user) => {
      if (user.is_platform_admin) {
        toast.error(`Cannot suspend admin: ${user.email}`)
        return false
      }
      return true
    })
    const results = await Promise.allSettled(
      eligible.map((user) =>
        clientApiPost(`/admin/users/${user.id}/suspend`, {}).catch((err) => {
          throw { email: user.email, err }
        })
      )
    )
    const failed = results.filter((r) => r.status === "rejected")
    const succeeded = results.length - failed.length
    if (succeeded > 0)
      toast.success(`${succeeded} user${succeeded > 1 ? "s" : ""} suspended`)
    for (const r of failed) {
      toast.error(`Failed to suspend ${r.reason?.email ?? "user"}`)
    }
    setSelectedIds(new Set())
    loadUsers()
  }

  const bulkUnsuspend = async () => {
    const eligible = selectedUsers.filter((user) => {
      if (user.is_platform_admin) {
        toast.error(`Cannot unsuspend admin: ${user.email}`)
        return false
      }
      return true
    })
    const results = await Promise.allSettled(
      eligible.map((user) =>
        clientApiPost(`/admin/users/${user.id}/unsuspend`, {}).catch((err) => {
          throw { email: user.email, err }
        })
      )
    )
    const failed = results.filter((r) => r.status === "rejected")
    const succeeded = results.length - failed.length
    if (succeeded > 0)
      toast.success(`${succeeded} user${succeeded > 1 ? "s" : ""} unsuspended`)
    for (const r of failed) {
      toast.error(`Failed to unsuspend ${r.reason?.email ?? "user"}`)
    }
    setSelectedIds(new Set())
    loadUsers()
  }

  const confirmDisable = async () => {
    if (disableTarget === "bulk") {
      const eligible = selectedUsers.filter((user) => {
        if (user.is_platform_admin) {
          toast.error(`Cannot disable admin: ${user.email}`)
          return false
        }
        return true
      })
      const results = await Promise.allSettled(
        eligible.map((user) =>
          clientApiDelete(`/admin/users/${user.id}`).catch((err) => {
            throw { email: user.email, err }
          })
        )
      )
      const failed = results.filter((r) => r.status === "rejected")
      const succeeded = results.length - failed.length
      if (succeeded > 0)
        toast.success(`${succeeded} user${succeeded > 1 ? "s" : ""} disabled`)
      for (const r of failed) {
        toast.error(`Failed to disable ${r.reason?.email ?? "user"}`)
      }
      setSelectedIds(new Set())
    } else if (disableTarget) {
      try {
        await clientApiDelete(`/admin/users/${disableTarget.user.id}`)
        toast.success("User disabled")
      } catch (error) {
        toast.error(
          error instanceof ApiError ? error.message : "Failed to disable user"
        )
      }
    }
    setDisableTarget(null)
    loadUsers()
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })

  const dialogUser =
    disableTarget && disableTarget !== "bulk" ? disableTarget.user : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search users..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPageIndex(0)
            }}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadUsers}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {selectedCount} selected
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={bulkSuspend}>
              Suspend
            </Button>
            <Button size="sm" variant="secondary" onClick={bulkUnsuspend}>
              Unsuspend
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDisableTarget("bulk")}
            >
              <TrashIcon className="size-3.5" />
              Disable
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={
                  allFilteredSelected
                    ? true
                    : someFilteredSelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={handleSelectAll}
                aria-label="Select all users"
              />
            </TableHead>
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginated.map((user) => (
            <TableRow
              key={user.id}
              data-state={selectedIds.has(user.id) ? "selected" : undefined}
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(user.id)}
                  onCheckedChange={() => handleSelect(user.id)}
                  aria-label={`Select ${user.email}`}
                />
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {user.name || user.email}
                  </span>
                  {user.name && (
                    <span className="text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {user.status === "active" ? (
                  <Badge variant="default">Active</Badge>
                ) : user.status === "suspended" ? (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary">Suspended</Badge>
                    {user.suspended_at && (
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(user.suspended_at)}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="destructive">Disabled</Badge>
                    {user.deleted_at && (
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(user.deleted_at)}
                      </span>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {user.is_platform_admin ? (
                  <Badge variant="outline" className="gap-1">
                    <ShieldIcon className="size-3" />
                    Admin
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">User</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {fmtDate(user.created_at)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() =>
                        action(
                          user.id,
                          user.is_platform_admin
                            ? "remove-admin"
                            : "make-admin",
                          user.is_platform_admin
                            ? "Admin privileges removed"
                            : "Admin privileges granted"
                        )
                      }
                    >
                      <ShieldIcon className="size-4" />
                      {user.is_platform_admin ? "Remove Admin" : "Make Admin"}
                    </DropdownMenuItem>
                    {user.status === "suspended" ? (
                      <DropdownMenuItem
                        onClick={() =>
                          action(user.id, "unsuspend", "User unsuspended")
                        }
                      >
                        <CheckIcon className="size-4" />
                        Unsuspend
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() =>
                          action(user.id, "suspend", "User suspended")
                        }
                      >
                        <XIcon className="size-4" />
                        Suspend
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDisableTarget({ user })}
                    >
                      <TrashIcon className="size-4" />
                      Disable
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-24 text-center text-sm text-muted-foreground"
              >
                No users found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {filtered.length > 0 && (
        <div className="flex justify-end">
          <TablePagination
            pageIndex={clampedPageIndex}
            pageSize={pageSize}
            setPageIndex={setPageIndex}
            setPageSize={setPageSize}
            totalRows={filtered.length}
          />
        </div>
      )}

      <Dialog
        open={disableTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {disableTarget === "bulk"
                ? `Disable ${selectedCount} user${selectedCount > 1 ? "s" : ""}?`
                : "Disable user?"}
            </DialogTitle>
            <DialogDescription>
              {disableTarget === "bulk"
                ? "Disabled users will lose access to the platform. This action can be reversed by an admin."
                : `Disable ${dialogUser?.name || dialogUser?.email}? They will lose access to the platform. This action can be reversed by an admin.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button variant="destructive" onClick={confirmDisable}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- Admin Page ---
export default function AdminPage() {
  const { sessionExpiresAt, sessionRenewAfter } = useLoaderData() as Awaited<
    ReturnType<typeof loader>
  >
  useSessionRenewal(sessionExpiresAt, sessionRenewAfter)
  const [tab, setTab] = useState("scoring")

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <Link
          to="/app"
          prefetch="intent"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to app
        </Link>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="scoring">Scoring</TabsTrigger>
            <TabsTrigger value="ai-config">AI Config</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "scoring" && <ScoringTab />}
        {tab === "ai-config" && <AIConfigTab />}
        {tab === "accounts" && <AccountsTab />}
        {tab === "features" && <FeaturesTab />}
      </div>
    </div>
  )
}
