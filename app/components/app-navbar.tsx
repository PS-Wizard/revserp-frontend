"use client"

import { useMemo, useState } from "react"
import { useLocation, useNavigate, useRevalidator } from "react-router"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  DoorOpenIcon,
  DownloadIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  TrashIcon,
  UsersIcon,
} from "lucide-react"

import { buildApiUrl, clientApiDelete, clientApiPost } from "~/lib/api"
import { clearSupabaseBrowserSession } from "~/lib/auth.client"
import type { CrawlResponse, CreateOrganizationInviteResponse, MeResponse, ProjectResponse } from "~/lib/api.types"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { CompileLoader } from "~/components/compile-loader"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "~/components/ui/context-menu"
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"

type DashboardView = "revserp-audit" | "search-console" | "revserp-ai"
type ExportFormat = "csv" | "xlsx"

export function AppNavbar({
  activeProjectId,
  currentCrawl,
  projectCrawls,
  isCrawlRunning,
  onCrawlStart,
  organizationId,
  organizations,
  projects,
  userEmail,
  userName,
  view,
  onViewChange,
}: {
  activeProjectId?: string | null
  currentCrawl: CrawlResponse | null
  projectCrawls: Record<string, CrawlResponse[]>
  isCrawlRunning: boolean
  onCrawlStart: () => void
  organizationId: string
  organizations: MeResponse["organizations"]
  projects: ProjectResponse[]
  userEmail: string
  userName?: string
  view: DashboardView
  onViewChange: (value: DashboardView) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const revalidator = useRevalidator()
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false)
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [projectBaseUrl, setProjectBaseUrl] = useState("")
  const [createProjectError, setCreateProjectError] = useState("")
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [isRunCrawlOpen, setIsRunCrawlOpen] = useState(false)
  const [maxDepth, setMaxDepth] = useState("5")
  const [fetchTimeoutSeconds, setFetchTimeoutSeconds] = useState("10")
  const [runCrawlError, setRunCrawlError] = useState("")
  const [isStartingCrawl, setIsStartingCrawl] = useState(false)
  const [projectActionError, setProjectActionError] = useState("")
  const [projectPendingDelete, setProjectPendingDelete] = useState<ProjectResponse | null>(null)
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [deletingCrawlId, setDeletingCrawlId] = useState<string | null>(null)
  const [exportingCrawlId, setExportingCrawlId] = useState<string | null>(null)
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx")
  const [crawlPendingDelete, setCrawlPendingDelete] = useState<CrawlResponse | null>(null)
  const [isDeleteCrawlOpen, setIsDeleteCrawlOpen] = useState(false)
  const [profileActionError, setProfileActionError] = useState("")
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [inviteExpiresAt, setInviteExpiresAt] = useState(getDefaultInviteExpiryValue())
  const [inviteMaxUses, setInviteMaxUses] = useState("10")
  const [inviteLink, setInviteLink] = useState("")
  const [hasCopiedInviteLink, setHasCopiedInviteLink] = useState(false)
  const [isCreatingInvite, setIsCreatingInvite] = useState(false)
  const [isLeaveWorkspaceOpen, setIsLeaveWorkspaceOpen] = useState(false)
  const [isLeavingWorkspace, setIsLeavingWorkspace] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const initials = useMemo(() => {
    const source = userName?.trim() || userEmail.split("@")[0] || "R"

    return source
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase() ?? "")
      .join("")
  }, [userEmail, userName])

  const activeProject =
    projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null
  const crawlPanelProject =
    projects.find((project) => project.id === hoveredProjectId) ?? activeProject
  const crawlPanelCrawls = crawlPanelProject
    ? [...(projectCrawls[crawlPanelProject.id] ?? [])].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      )
    : []
  const activeOrganization =
    organizations.find((organization) => organization.id === organizationId) ??
    organizations[0] ??
    null
  const isActiveOrganizationOwner = activeOrganization?.role === "owner"

  async function handleSelectProject(projectId: string, crawlId?: string) {
    setIsProjectMenuOpen(false)

    const searchParams = new URLSearchParams(location.search)
    searchParams.set("project", projectId)
    if (crawlId) {
      searchParams.set("crawl", crawlId)
    } else {
      searchParams.delete("crawl")
    }

    await navigate(`${location.pathname}?${searchParams.toString()}`)
  }

  async function handleSelectOrganization(nextOrganizationId: string) {
    if (!nextOrganizationId || nextOrganizationId === organizationId || isSwitchingWorkspace) {
      return
    }

    setProfileActionError("")
    setIsSwitchingWorkspace(true)

    try {
      await clientApiPost<{ ok: boolean; active_org_id: string }>("/me/active-organization", {
        organization_id: nextOrganizationId,
      })
      await navigate("/app")
      revalidator.revalidate()
    } catch (error) {
      setProfileActionError(error instanceof Error ? error.message : "Unable to switch workspace.")
    } finally {
      setIsSwitchingWorkspace(false)
    }
  }

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organizationId || isCreatingInvite) {
      return
    }

    setProfileActionError("")
    setHasCopiedInviteLink(false)

    const expiresAtDate = new Date(inviteExpiresAt)
    const maxUses = Number(inviteMaxUses)

    if (!inviteExpiresAt.trim() || Number.isNaN(expiresAtDate.getTime())) {
      setProfileActionError("Expiry must be a valid date and time.")
      return
    }
    if (expiresAtDate.getTime() <= Date.now()) {
      setProfileActionError("Expiry must be in the future.")
      return
    }
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      setProfileActionError("Max uses must be greater than zero.")
      return
    }

    setIsCreatingInvite(true)

    try {
      const invite = await clientApiPost<CreateOrganizationInviteResponse>(
        `/organizations/${organizationId}/invites`,
        {
          expires_at: expiresAtDate.toISOString(),
          max_uses: maxUses,
        }
      )
      setInviteLink(`${window.location.origin}/invite/${invite.token}`)
    } catch (error) {
      setProfileActionError(error instanceof Error ? error.message : "Unable to create invite link.")
    } finally {
      setIsCreatingInvite(false)
    }
  }

  async function handleCopyInviteLink() {
    if (!inviteLink) {
      return
    }

    await navigator.clipboard.writeText(inviteLink)
    setHasCopiedInviteLink(true)
  }

  async function handleLeaveOrganization() {
    if (!organizationId || isLeavingWorkspace) {
      return
    }

    setProfileActionError("")
    setIsLeavingWorkspace(true)

    try {
      await clientApiPost<{ ok: boolean }>(`/organizations/${organizationId}/leave`, {})
      setIsLeaveWorkspaceOpen(false)
      await navigate("/app")
      revalidator.revalidate()
    } catch (error) {
      setProfileActionError(error instanceof Error ? error.message : "Unable to leave workspace.")
    } finally {
      setIsLeavingWorkspace(false)
    }
  }

  async function handleLogout() {
    if (isLoggingOut) {
      return
    }

    setProfileActionError("")
    setIsLoggingOut(true)

    try {
      await clientApiPost<unknown>("/auth/logout", {})
    } finally {
      try {
        await clearSupabaseBrowserSession()
      } catch {
        // Backend session is already gone.
      }
      await navigate("/login")
      setIsLoggingOut(false)
    }
  }

  function openDeleteProjectDialog(project: ProjectResponse) {
    setProjectActionError("")
    setProjectPendingDelete(project)
    setIsDeleteProjectOpen(true)
  }

  async function handleDeleteProject() {
    if (!projectPendingDelete || deletingProjectId) {
      return
    }

    setProjectActionError("")
    setDeletingProjectId(projectPendingDelete.id)

    try {
      await clientApiDelete<{ ok: boolean }>(`/projects/${projectPendingDelete.id}`)

      const remainingProjects = projects.filter((project) => project.id !== projectPendingDelete.id)
      setProjectPendingDelete(null)
      setIsDeleteProjectOpen(false)
      setIsProjectMenuOpen(false)

      if (projectPendingDelete.id === activeProjectId) {
        const searchParams = new URLSearchParams(location.search)
        const nextProject = remainingProjects[0] ?? null

        if (nextProject) {
          searchParams.set("project", nextProject.id)
        } else {
          searchParams.delete("project")
        }

        await navigate(`${location.pathname}?${searchParams.toString()}`)
      }

      revalidator.revalidate()
    } catch (error) {
      setProjectActionError(error instanceof Error ? error.message : "Unable to delete project.")
    } finally {
      setDeletingProjectId(null)
    }
  }

  function openDeleteCrawlDialog(crawl: CrawlResponse) {
    setProjectActionError("")
    setCrawlPendingDelete(crawl)
    setIsDeleteCrawlOpen(true)
  }

  async function handleDeleteCrawl() {
    if (!crawlPendingDelete || deletingCrawlId) {
      return
    }

    setProjectActionError("")
    setDeletingCrawlId(crawlPendingDelete.id)

    try {
      await clientApiDelete<{ ok: boolean }>(`/crawls/${crawlPendingDelete.id}`)
      setCrawlPendingDelete(null)
      setIsDeleteCrawlOpen(false)

      const searchParams = new URLSearchParams(location.search)
      if (searchParams.get("crawl") === crawlPendingDelete.id) {
        searchParams.delete("crawl")
        await navigate(`${location.pathname}?${searchParams.toString()}`)
      }

      revalidator.revalidate()
    } catch (error) {
      setProjectActionError(error instanceof Error ? error.message : "Unable to delete crawl.")
    } finally {
      setDeletingCrawlId(null)
    }
  }

  async function handleExportCrawl(crawl: CrawlResponse, format: ExportFormat) {
    if (crawl.status !== "completed" || exportingCrawlId) {
      setProjectActionError("Only completed crawls can be exported.")
      return
    }

    setProjectActionError("")
    setExportingCrawlId(crawl.id)

    try {
      const response = await fetch(
        buildApiUrl(`/crawls/${crawl.id}/score-breakdown/export.${format}`),
        { credentials: "include" }
      )

      if (!response.ok) {
        throw new Error(await readExportError(response))
      }

      const blob = await response.blob()
      const project = projects.find((item) => item.id === crawl.project_id)
      const fallbackProjectSegment = (project?.name ?? "project")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
      const filename = getExportFilename(
        response.headers.get("content-disposition"),
        `${fallbackProjectSegment || "project"}-${formatCrawlDate(crawl)}-issues.${format}`
      )
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      setProjectActionError(error instanceof Error ? error.message : "Unable to export crawl issues.")
    } finally {
      setExportingCrawlId(null)
    }
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isCreatingProject) {
      return
    }

    const trimmedName = projectName.trim()
    const trimmedBaseUrl = projectBaseUrl.trim()

    if (!trimmedName || !trimmedBaseUrl) {
      setCreateProjectError("Project name and base URL are required.")
      return
    }

    setCreateProjectError("")
    setIsCreatingProject(true)

    try {
      const createdProject = await clientApiPost<ProjectResponse>(
        `/organizations/${organizationId}/projects`,
        {
          name: trimmedName,
          base_url: trimmedBaseUrl,
        }
      )

      setProjectName("")
      setProjectBaseUrl("")
      setIsCreateProjectOpen(false)
      setIsProjectMenuOpen(false)
      await navigate(`${location.pathname}?project=${createdProject.id}`)
    } catch (error) {
      setCreateProjectError(
        error instanceof Error ? error.message : "Unable to create project."
      )
    } finally {
      setIsCreatingProject(false)
    }
  }

  async function handleRunCrawl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeProjectId || isStartingCrawl || isCrawlRunning) {
      return
    }

    const parsedMaxDepth = Number(maxDepth)
    const parsedFetchTimeoutSeconds = Number(fetchTimeoutSeconds)

    if (!Number.isInteger(parsedMaxDepth) || parsedMaxDepth < 0) {
      setRunCrawlError("Max depth must be zero or greater.")
      return
    }

    if (
      !Number.isInteger(parsedFetchTimeoutSeconds) ||
      parsedFetchTimeoutSeconds <= 0
    ) {
      setRunCrawlError("Fetch timeout must be greater than zero.")
      return
    }

    setRunCrawlError("")
    setIsStartingCrawl(true)

    try {
      await clientApiPost<CrawlResponse>(`/projects/${activeProjectId}/crawls`, {
        config_snapshot: {
          max_depth: parsedMaxDepth,
          fetch_timeout_seconds: parsedFetchTimeoutSeconds,
        },
      })
      onCrawlStart()
      setIsRunCrawlOpen(false)
      revalidator.revalidate()
    } catch (error) {
      setRunCrawlError(
        error instanceof Error ? error.message : "Unable to start crawl."
      )
    } finally {
      setIsStartingCrawl(false)
    }
  }

  return (
    <>
      <header className="w-full">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 py-4">
          <div className="flex min-w-0 items-center">
            <Tabs onValueChange={(value) => onViewChange(value as DashboardView)} value={view}>
              <TabsList>
                <TabsTrigger value="revserp-audit">Revserp Audit</TabsTrigger>
                <TabsTrigger value="search-console">Search Console</TabsTrigger>
                <TabsTrigger value="revserp-ai">Revserp AI</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              className="w-72 justify-between"
              onClick={() => setIsProjectMenuOpen(true)}
              variant="outline"
            >
              <span className="flex min-w-0 items-center gap-2 truncate">
                <SearchIcon data-icon="inline-start" />
                <span className="truncate">
                  {activeProject?.name || "Search projects"}
                </span>
              </span>
              <ChevronsUpDownIcon data-icon="inline-end" />
            </Button>

            <Popover onOpenChange={setIsRunCrawlOpen} open={isRunCrawlOpen}>
              <PopoverTrigger
                render={<Button variant="outline" />}
                disabled={!activeProjectId || isCrawlRunning}
              >
                {isCrawlRunning ? (
                  <CompileLoader className="text-foreground" size={18} />
                ) : null}
                Run Crawl
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <form className="flex flex-col gap-4" onSubmit={handleRunCrawl}>
                  <PopoverHeader>
                    <PopoverTitle>Run Crawl</PopoverTitle>
                    <PopoverDescription>
                      Queue a new crawl for {activeProject?.name || "the selected project"}.
                    </PopoverDescription>
                  </PopoverHeader>

                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="max-depth">Max depth</FieldLabel>
                      <Input
                        id="max-depth"
                        min="0"
                        onChange={(event) => setMaxDepth(event.target.value)}
                        step="1"
                        type="number"
                        value={maxDepth}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="fetch-timeout-seconds">
                        Fetch timeout seconds
                      </FieldLabel>
                      <Input
                        id="fetch-timeout-seconds"
                        min="1"
                        onChange={(event) => setFetchTimeoutSeconds(event.target.value)}
                        step="1"
                        type="number"
                        value={fetchTimeoutSeconds}
                      />
                      <FieldDescription>
                        Recommended defaults are already filled in.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>

                  <FieldError>{runCrawlError}</FieldError>

                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => setIsRunCrawlOpen(false)}
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={isStartingCrawl || !activeProjectId || isCrawlRunning}
                      type="submit"
                    >
                      {isStartingCrawl ? (
                        <CompileLoader className="text-primary-foreground" size={18} />
                      ) : null}
                      {isStartingCrawl ? "Starting..." : "Start crawl"}
                    </Button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="flex items-center gap-3 rounded-full bg-card px-2 py-1.5 text-left shadow-xs transition hover:bg-muted/50 data-[popup-open]:bg-muted/50"
                    type="button"
                  />
                }
              >
                <Avatar>
                  <AvatarFallback>{initials || "R"}</AvatarFallback>
                </Avatar>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {userName || "Revserp User"}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64" sideOffset={10}>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger disabled={isSwitchingWorkspace}>
                      <UsersIcon />
                      Switch workspace
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuRadioGroup
                        value={organizationId}
                        onValueChange={(value) => void handleSelectOrganization(value)}
                      >
                        {organizations.map((organization) => (
                          <DropdownMenuRadioItem
                            disabled={isSwitchingWorkspace}
                            key={organization.id}
                            value={organization.id}
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                              {getWorkspaceInitials(organization.name)}
                            </span>
                            <span className="truncate">{organization.name}</span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  {isActiveOrganizationOwner ? (
                    <DropdownMenuItem
                      onClick={() => {
                        setProfileActionError("")
                        setInviteLink("")
                        setHasCopiedInviteLink(false)
                        setIsInviteDialogOpen(true)
                      }}
                    >
                      <SendIcon />
                      Invite members
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={isLeavingWorkspace}
                      onClick={() => {
                        setProfileActionError("")
                        setIsLeaveWorkspaceOpen(true)
                      }}
                      variant="destructive"
                    >
                      {isLeavingWorkspace ? (
                        <CompileLoader className="text-destructive" size={16} />
                      ) : (
                        <DoorOpenIcon />
                      )}
                      Leave workspace
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={isLoggingOut} onClick={() => void handleLogout()}>
                  {isLoggingOut ? (
                    <CompileLoader className="text-foreground" size={16} />
                  ) : (
                    <LogOutIcon />
                  )}
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </DropdownMenuItem>
                {profileActionError ? (
                  <>
                    <DropdownMenuSeparator />
                    <p className="px-2 py-1.5 text-xs text-destructive">{profileActionError}</p>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Dialog onOpenChange={setIsProjectMenuOpen} open={isProjectMenuOpen}>
        <DialogContent
          className="gap-0 overflow-hidden rounded-xl border-border/50 p-0 shadow-lg sm:max-w-4xl"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Projects</DialogTitle>
            <DialogDescription>Select a project or create a new one.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-[460px] grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] bg-popover">
            <Command className="flex h-full w-full flex-col overflow-hidden border-r border-border/50 bg-popover">
              <div className="border-b border-border/50 px-3 py-3">
                <CommandInput placeholder="Search projects..." />
              </div>
              <CommandList className="max-h-[460px] py-2">
                <CommandEmpty>No projects found.</CommandEmpty>
                <CommandGroup heading="Projects">
                  <CommandItem
                    className="mx-2 rounded-lg py-2.5"
                    onSelect={() => {
                      setCreateProjectError("")
                      setIsCreateProjectOpen(true)
                    }}
                  >
                    <PlusIcon />
                    Create new project
                  </CommandItem>
                  {projects.map((project) => (
                    <ContextMenu key={project.id}>
                      <ContextMenuTrigger>
                        <CommandItem
                          className="mx-2 rounded-lg py-2.5 data-[selected=true]:bg-accent/70"
                          onMouseEnter={() => setHoveredProjectId(project.id)}
                          onSelect={() => void handleSelectProject(project.id)}
                          value={`${project.name} ${project.base_url}`}
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate font-medium">{project.name}</span>
                            <span className="truncate text-muted-foreground">
                              {project.base_url}
                            </span>
                          </div>
                          {project.id === activeProjectId ? <CheckIcon /> : null}
                        </CommandItem>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-44">
                        <ContextMenuGroup>
                          <ContextMenuItem
                            disabled={deletingProjectId !== null}
                            onClick={() => openDeleteProjectDialog(project)}
                            variant="destructive"
                          >
                            {deletingProjectId === project.id ? (
                              <CompileLoader className="text-destructive" size={16} />
                            ) : (
                              <TrashIcon />
                            )}
                            Delete project
                          </ContextMenuItem>
                        </ContextMenuGroup>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>

            <div className="flex min-h-0 flex-col bg-muted/20">
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {crawlPanelCrawls.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {crawlPanelCrawls.map((crawl) => (
                      <CrawlContextRow
                        crawl={crawl}
                        disabled={deletingCrawlId !== null || exportingCrawlId !== null}
                        exportFormat={exportFormat}
                        isActive={crawl.id === currentCrawl?.id}
                        isDeleting={deletingCrawlId === crawl.id}
                        isExporting={exportingCrawlId === crawl.id}
                        key={crawl.id}
                        onDelete={() => openDeleteCrawlDialog(crawl)}
                        onExport={(format) => void handleExportCrawl(crawl, format)}
                        onFormatChange={setExportFormat}
                        onSelect={() => void handleSelectProject(crawl.project_id, crawl.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border/60 text-center text-sm text-muted-foreground">
                    No crawls for this project yet.
                  </div>
                )}
              </div>
            </div>
          </div>
          {projectActionError ? (
            <p className="border-t border-border/50 px-4 py-3 text-sm text-destructive">
              {projectActionError}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setIsCreateProjectOpen} open={isCreateProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Add a project to this workspace and start crawling it.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-6" onSubmit={handleCreateProject}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                <Input
                  id="project-name"
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Revserp.ai"
                  value={projectName}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="project-base-url">Base URL</FieldLabel>
                <Input
                  id="project-base-url"
                  onChange={(event) => setProjectBaseUrl(event.target.value)}
                  placeholder="https://revserp.ai"
                  value={projectBaseUrl}
                />
                <FieldDescription>
                  Use the canonical site URL you want to crawl.
                </FieldDescription>
              </Field>
            </FieldGroup>

            <FieldError>{createProjectError}</FieldError>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setIsCreateProjectOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isCreatingProject} type="submit">
                {isCreatingProject ? (
                  <CompileLoader className="text-primary-foreground" size={18} />
                ) : null}
                {isCreatingProject ? "Creating..." : "Create project"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setIsDeleteProjectOpen} open={isDeleteProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              {projectPendingDelete
                ? `Delete ${projectPendingDelete.name}? This permanently removes the project and related crawl data.`
                : "Delete this project? This permanently removes related crawl data."}
            </DialogDescription>
          </DialogHeader>

          <FieldError>{projectActionError}</FieldError>

          <DialogFooter>
            <Button
              disabled={deletingProjectId !== null}
              onClick={() => setIsDeleteProjectOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deletingProjectId !== null || !projectPendingDelete}
              onClick={() => void handleDeleteProject()}
              type="button"
              variant="destructive"
            >
              {deletingProjectId ? (
                <CompileLoader className="text-destructive-foreground" size={18} />
              ) : null}
              {deletingProjectId ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setIsDeleteCrawlOpen} open={isDeleteCrawlOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete crawl</DialogTitle>
            <DialogDescription>
              {crawlPendingDelete
                ? `Delete crawl from ${formatCrawlDateTime(crawlPendingDelete)}? This permanently removes its pages, issues, and score breakdown.`
                : "Delete this crawl? This permanently removes its pages, issues, and score breakdown."}
            </DialogDescription>
          </DialogHeader>

          <FieldError>{projectActionError}</FieldError>

          <DialogFooter>
            <Button
              disabled={deletingCrawlId !== null}
              onClick={() => setIsDeleteCrawlOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deletingCrawlId !== null || !crawlPendingDelete}
              onClick={() => void handleDeleteCrawl()}
              type="button"
              variant="destructive"
            >
              {deletingCrawlId ? (
                <CompileLoader className="text-destructive-foreground" size={18} />
              ) : null}
              {deletingCrawlId ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          setIsInviteDialogOpen(open)
          if (!open) {
            setProfileActionError("")
            setInviteLink("")
            setHasCopiedInviteLink(false)
            setInviteExpiresAt(getDefaultInviteExpiryValue())
            setInviteMaxUses("10")
          }
        }}
        open={isInviteDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite members</DialogTitle>
            <DialogDescription>
              Create a reusable invite link for {activeOrganization?.name ?? "this workspace"}.
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-6" onSubmit={handleCreateInvite}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invite-expires-at">Expires at</FieldLabel>
                <Input
                  id="invite-expires-at"
                  onChange={(event) => setInviteExpiresAt(event.target.value)}
                  type="datetime-local"
                  value={inviteExpiresAt}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-max-uses">Max uses</FieldLabel>
                <Input
                  id="invite-max-uses"
                  min="1"
                  onChange={(event) => setInviteMaxUses(event.target.value)}
                  step="1"
                  type="number"
                  value={inviteMaxUses}
                />
              </Field>
            </FieldGroup>

            {inviteLink ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Invite link
                </p>
                <p className="mt-2 break-all text-sm">{inviteLink}</p>
              </div>
            ) : null}

            <FieldError>{profileActionError}</FieldError>

            <DialogFooter>
              <Button
                onClick={() => setIsInviteDialogOpen(false)}
                type="button"
                variant="outline"
              >
                Close
              </Button>
              {inviteLink ? (
                <Button onClick={() => void handleCopyInviteLink()} type="button">
                  <CopyIcon />
                  {hasCopiedInviteLink ? "Copied" : "Copy link"}
                </Button>
              ) : (
                <Button disabled={isCreatingInvite} type="submit">
                  {isCreatingInvite ? (
                    <CompileLoader className="text-primary-foreground" size={18} />
                  ) : null}
                  {isCreatingInvite ? "Creating..." : "Create invite link"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setIsLeaveWorkspaceOpen} open={isLeaveWorkspaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave workspace</DialogTitle>
            <DialogDescription>
              Leave {activeOrganization?.name ?? "this workspace"}? You will lose access to its projects, crawls, and invites.
            </DialogDescription>
          </DialogHeader>

          <FieldError>{profileActionError}</FieldError>

          <DialogFooter>
            <Button
              disabled={isLeavingWorkspace}
              onClick={() => setIsLeaveWorkspaceOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isLeavingWorkspace}
              onClick={() => void handleLeaveOrganization()}
              type="button"
              variant="destructive"
            >
              {isLeavingWorkspace ? (
                <CompileLoader className="text-destructive-foreground" size={18} />
              ) : null}
              {isLeavingWorkspace ? "Leaving..." : "Leave workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}

function CrawlContextRow({
  crawl,
  disabled,
  exportFormat,
  isActive,
  isDeleting,
  isExporting,
  onDelete,
  onExport,
  onFormatChange,
  onSelect,
}: {
  crawl: CrawlResponse
  disabled: boolean
  exportFormat: ExportFormat
  isActive: boolean
  isDeleting: boolean
  isExporting: boolean
  onDelete: () => void
  onExport: (format: ExportFormat) => void
  onFormatChange: (format: ExportFormat) => void
  onSelect: () => void
}) {
  const canExport = crawl.status === "completed"
  const canDelete = crawl.status !== "queued" && crawl.status !== "running"

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none data-[active=true]:bg-accent/80 data-[active=true]:text-accent-foreground"
          data-active={isActive}
          onClick={onSelect}
          type="button"
        >
          {isActive ? <CheckIcon className="size-4" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{formatCrawlDateTime(crawl)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {formatCrawlStats(crawl)}
            </p>
          </div>
          <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {crawl.status}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={!canExport || disabled}>
              {isExporting ? (
                <CompileLoader className="text-foreground" size={16} />
              ) : (
                <DownloadIcon />
              )}
              Export
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              <ContextMenuGroup>
                <ContextMenuRadioGroup
                  value={exportFormat}
                  onValueChange={(value) => onFormatChange(value as ExportFormat)}
                >
                  <ContextMenuRadioItem value="xlsx">XLSX</ContextMenuRadioItem>
                  <ContextMenuRadioItem value="csv">CSV</ContextMenuRadioItem>
                </ContextMenuRadioGroup>
                <ContextMenuSeparator />
                <ContextMenuItem disabled={!canExport || disabled} onClick={() => onExport(exportFormat)}>
                  {isExporting ? (
                    <CompileLoader className="text-foreground" size={16} />
                  ) : (
                    <DownloadIcon />
                  )}
                  Export {exportFormat.toUpperCase()}
                </ContextMenuItem>
              </ContextMenuGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!canDelete || disabled}
            onClick={onDelete}
            variant="destructive"
          >
            {isDeleting ? (
              <CompileLoader className="text-destructive" size={16} />
            ) : (
              <TrashIcon />
            )}
            Delete crawl
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function getWorkspaceInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "W"
}

function getDefaultInviteExpiryValue() {
  const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  expiryDate.setSeconds(0, 0)

  return `${expiryDate.getFullYear()}-${String(expiryDate.getMonth() + 1).padStart(2, "0")}-${String(expiryDate.getDate()).padStart(2, "0")}T${String(expiryDate.getHours()).padStart(2, "0")}:${String(expiryDate.getMinutes()).padStart(2, "0")}`
}

function formatCrawlStats(crawl: CrawlResponse) {
  const score = crawl.overall_score === undefined ? "No score" : `${crawl.overall_score}/100`
  return `${score} · ${crawl.urls_crawled} crawled · ${crawl.urls_discovered} discovered`
}

function formatCrawlDate(crawl: CrawlResponse) {
  const timestamp = crawl.completed_at || crawl.started_at || crawl.created_at
  return timestamp.slice(0, 10)
}

function formatCrawlDateTime(crawl: CrawlResponse) {
  const timestamp = crawl.completed_at || crawl.started_at || crawl.created_at
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))
}

function getCrawlTimestamp(crawl: CrawlResponse) {
  return new Date(crawl.completed_at || crawl.started_at || crawl.created_at).getTime()
}

async function readExportError(response: Response) {
  const responseText = await response.text()
  if (!responseText.trim()) {
    return "Unable to export crawl issues."
  }

  try {
    const responseBody = JSON.parse(responseText) as { error?: unknown }
    if (typeof responseBody.error === "string" && responseBody.error.trim()) {
      return responseBody.error
    }
  } catch {
    return responseText
  }

  return "Unable to export crawl issues."
}

function getExportFilename(contentDispositionHeader: string | null, fallbackFilename: string) {
  if (!contentDispositionHeader) {
    return fallbackFilename
  }

  const utf8Match = contentDispositionHeader.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const plainMatch = contentDispositionHeader.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) {
    return plainMatch[1].trim()
  }

  return fallbackFilename
}

export type { DashboardView }
