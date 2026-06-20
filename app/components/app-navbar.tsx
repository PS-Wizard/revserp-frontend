"use client"

import { useMemo, useState, useEffect } from "react"
import type { FormEvent } from "react"
import { useLocation, useNavigate, useRevalidator } from "react-router"
import { ChevronsUpDownIcon, SearchIcon, MessageSquareIcon, PlusIcon } from "lucide-react"

import { BusinessProfileDrawer } from "~/components/app-navbar/business-profile-drawer"
import {
  CreateProjectDialog,
  DeleteCrawlDialog,
  DeleteProjectDialog,
  InviteMembersDialog,
  LeaveWorkspaceDialog,
} from "~/components/app-navbar/dialogs"
import { ProfileMenu } from "~/components/app-navbar/profile-menu"
import { ProjectPickerDialog } from "~/components/app-navbar/project-picker-dialog"
import { RunCrawlPopover } from "~/components/app-navbar/run-crawl-popover"
import type { AppNavbarProps, DashboardView, ExportFormat } from "~/components/app-navbar/types"
import {
  formatCrawlDate,
  getCrawlTimestamp,
  getDefaultInviteExpiryValue,
  getExportFilename,
  getInitials,
  readExportError,
} from "~/components/app-navbar/utils"
import { Button } from "~/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { buildApiUrl, clientApiDelete, clientApiFetch, clientApiPost, clientApiPut, ApiError } from "~/lib/api"
import type {
  AIConversationResponse,
  AIConversationsResponse,
  CrawlResponse,
  CreateOrganizationInviteResponse,
  MeResponse,
  ProjectBusinessProfileResponse,
  ProjectBusinessProfileStatusResponse,
  ProjectResponse,
} from "~/lib/api.types"
import { clearSupabaseBrowserSession } from "~/lib/auth.client"

const EMPTY_SEED_PROMPTS = ["", "", "", "", ""]

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
  onSelectConversation,
}: AppNavbarProps) {
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
  const [businessProfileProject, setBusinessProfileProject] = useState<ProjectResponse | null>(null)
  const [businessProfileStatus, setBusinessProfileStatus] = useState<ProjectBusinessProfileStatusResponse | null>(null)
  const [brandName, setBrandName] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [primaryCategory, setPrimaryCategory] = useState("")
  const [primaryLocation, setPrimaryLocation] = useState("")
  const [businessDescription, setBusinessDescription] = useState("")
  const [seedPrompts, setSeedPrompts] = useState(EMPTY_SEED_PROMPTS)
  const [businessProfileError, setBusinessProfileError] = useState("")
  const [isLoadingBusinessProfile, setIsLoadingBusinessProfile] = useState(false)
  const [isSavingBusinessProfile, setIsSavingBusinessProfile] = useState(false)
  const [profileActionError, setProfileActionError] = useState("")
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [inviteExpiresAt, setInviteExpiresAt] = useState(getDefaultInviteExpiryValue)
  const [inviteMaxUses, setInviteMaxUses] = useState("10")
  const [inviteLink, setInviteLink] = useState("")
  const [hasCopiedInviteLink, setHasCopiedInviteLink] = useState(false)
  const [isCreatingInvite, setIsCreatingInvite] = useState(false)
  const [isLeaveWorkspaceOpen, setIsLeaveWorkspaceOpen] = useState(false)
  const [isLeavingWorkspace, setIsLeavingWorkspace] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [aiConversations, setAiConversations] = useState<AIConversationResponse[]>([])
  const [isLoadingAiConversations, setIsLoadingAiConversations] = useState(false)
  const [isAiChatMenuOpen, setIsAiChatMenuOpen] = useState(false)

  const initials = useMemo(() => {
    const source = userName?.trim() || userEmail.split("@")[0] || "R"
    return getInitials(source, "R")
  }, [userEmail, userName])

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null
  const crawlPanelProject = projects.find((project) => project.id === hoveredProjectId) ?? activeProject
  const crawlPanelCrawls = crawlPanelProject
    ? [...(projectCrawls[crawlPanelProject.id] ?? [])].sort(
        (left, right) => getCrawlTimestamp(right) - getCrawlTimestamp(left)
      )
    : []
  const activeOrganization =
    organizations.find((organization) => organization.id === organizationId) ?? organizations[0] ?? null
  const isActiveOrganizationOwner = activeOrganization?.role === "owner"
  const canManageBusinessProfile = businessProfileStatus?.can_manage_profile === true

  async function fetchAiConversations() {
    if (!activeProjectId) return
    setIsLoadingAiConversations(true)
    try {
      const response = await clientApiFetch<AIConversationsResponse>(
        `/projects/${activeProjectId}/ai/conversations`
      )
      setAiConversations(response.conversations)
    } catch (error) {
      console.error("Failed to fetch AI conversations:", error)
      setAiConversations([])
    } finally {
      setIsLoadingAiConversations(false)
    }
  }

  function handleAiTabMouseEnter() {
    setIsAiChatMenuOpen(true)
    void fetchAiConversations()
  }

  function handleAiTabMouseLeave() {
    setIsAiChatMenuOpen(false)
  }

  function handleAiConversationSelect(conversationId: string) {
    setIsAiChatMenuOpen(false)
    onSelectConversation?.(conversationId)
    onViewChange("revserp-ai")
  }

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

  async function handleCreateInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organizationId || isCreatingInvite) {
      return
    }

    setProfileActionError("")
    setHasCopiedInviteLink(false)

    const expiresAtDate = new Date(inviteExpiresAt)
    const maxUses = Number(inviteMaxUses)
    const validationError = getInviteValidationError(inviteExpiresAt, expiresAtDate, maxUses)
    if (validationError) {
      setProfileActionError(validationError)
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

  async function openBusinessProfileDrawer(project: ProjectResponse) {
    setProjectActionError("")
    setBusinessProfileProject(project)
    setBusinessProfileStatus(null)
    setBusinessProfileError("")
    applyBusinessProfile(undefined, project)
    setIsProjectMenuOpen(false)
    setIsLoadingBusinessProfile(true)

    try {
      const status = await clientApiFetch<ProjectBusinessProfileStatusResponse>(
        `/projects/${project.id}/business-profile`
      )
      setBusinessProfileStatus(status)
      applyBusinessProfile(status.business_profile, project)
    } catch (error) {
      setBusinessProfileError(error instanceof Error ? error.message : "Unable to load business profile.")
    } finally {
      setIsLoadingBusinessProfile(false)
    }
  }

  function closeBusinessProfileDrawer() {
    setBusinessProfileProject(null)
    setBusinessProfileStatus(null)
    setBusinessProfileError("")
  }

  function applyBusinessProfile(profile: ProjectBusinessProfileResponse | undefined, project: ProjectResponse) {
    setBrandName(profile?.brand_name ?? "")
    setWebsiteUrl(profile?.website_url?.trim() || project.base_url)
    setPrimaryCategory(profile?.primary_category ?? "")
    setPrimaryLocation(profile?.primary_location ?? "")
    setBusinessDescription(profile?.business_description ?? "")
    setSeedPrompts(Array.from({ length: 5 }, (_, index) => profile?.seed_prompts?.[index] ?? ""))
  }

  function updateSeedPrompt(index: number, value: string) {
    setSeedPrompts((current) =>
      current.map((prompt, promptIndex) => (promptIndex === index ? value : prompt))
    )
  }

  async function handleSaveBusinessProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!businessProfileProject || !businessProfileStatus?.can_manage_profile || isSavingBusinessProfile) {
      return
    }

    setBusinessProfileError("")
    setIsSavingBusinessProfile(true)

    try {
      const profile = await clientApiPut<ProjectBusinessProfileResponse>(
        `/projects/${businessProfileProject.id}/business-profile`,
        {
          brand_name: brandName,
          website_url: websiteUrl,
          primary_category: primaryCategory,
          primary_location: primaryLocation,
          business_description: businessDescription,
          seed_prompts: seedPrompts.flatMap((prompt) => {
            const trimmedPrompt = prompt.trim()
            return trimmedPrompt ? [trimmedPrompt] : []
          }),
        }
      )

      setBusinessProfileStatus({
        has_profile: true,
        can_manage_profile: businessProfileStatus.can_manage_profile,
        business_profile: profile,
      })
      applyBusinessProfile(profile, businessProfileProject)
      closeBusinessProfileDrawer()
    } catch (error) {
      setBusinessProfileError(error instanceof Error ? error.message : "Unable to save business profile.")
    } finally {
      setIsSavingBusinessProfile(false)
    }
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
        await navigateToNextProject(remainingProjects)
      }

      revalidator.revalidate()
    } catch (error) {
      setProjectActionError(error instanceof Error ? error.message : "Unable to delete project.")
    } finally {
      setDeletingProjectId(null)
    }
  }

  async function navigateToNextProject(remainingProjects: ProjectResponse[]) {
    const searchParams = new URLSearchParams(location.search)
    const nextProject = remainingProjects[0] ?? null

    if (nextProject) {
      searchParams.set("project", nextProject.id)
    } else {
      searchParams.delete("project")
    }

    await navigate(`${location.pathname}?${searchParams.toString()}`)
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
      const response = await fetch(buildApiUrl(`/crawls/${crawl.id}/score-breakdown/export.${format}`), {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error(await readExportError(response))
      }

      const blob = await response.blob()
      const project = projects.find((item) => item.id === crawl.project_id)
      const filename = getExportFilename(
        response.headers.get("content-disposition"),
        `${getProjectFilenameSegment(project)}-${formatCrawlDate(crawl)}-issues.${format}`
      )
      downloadBlob(blob, filename)
    } catch (error) {
      setProjectActionError(error instanceof Error ? error.message : "Unable to export crawl issues.")
    } finally {
      setExportingCrawlId(null)
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
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
      const createdProject = await clientApiPost<ProjectResponse>(`/organizations/${organizationId}/projects`, {
        name: trimmedName,
        base_url: trimmedBaseUrl,
      })

      setProjectName("")
      setProjectBaseUrl("")
      setIsCreateProjectOpen(false)
      setIsProjectMenuOpen(false)
      await navigate(`${location.pathname}?project=${createdProject.id}`)
    } catch (error) {
      setCreateProjectError(error instanceof Error ? error.message : "Unable to create project.")
    } finally {
      setIsCreatingProject(false)
    }
  }

  async function handleRunCrawl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeProjectId || isStartingCrawl || isCrawlRunning) {
      return
    }

    const parsedMaxDepth = Number(maxDepth)
    const parsedFetchTimeoutSeconds = Number(fetchTimeoutSeconds)
    const validationError = getCrawlValidationError(parsedMaxDepth, parsedFetchTimeoutSeconds)
    if (validationError) {
      setRunCrawlError(validationError)
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
      setRunCrawlError(error instanceof Error ? error.message : "Unable to start crawl.")
    } finally {
      setIsStartingCrawl(false)
    }
  }

  function openInviteDialog() {
    setProfileActionError("")
    setInviteLink("")
    setHasCopiedInviteLink(false)
    setIsInviteDialogOpen(true)
  }

  function closeInviteDialog(open: boolean) {
    setIsInviteDialogOpen(open)
    if (open) {
      return
    }

    setProfileActionError("")
    setInviteLink("")
    setHasCopiedInviteLink(false)
    setInviteExpiresAt(getDefaultInviteExpiryValue())
    setInviteMaxUses("10")
  }

  function openLeaveWorkspaceDialog() {
    setProfileActionError("")
    setIsLeaveWorkspaceOpen(true)
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
<DropdownMenu open={isAiChatMenuOpen} onOpenChange={setIsAiChatMenuOpen}>
<DropdownMenuTrigger
  render={
    <TabsTrigger
      value="revserp-ai"
      onMouseEnter={handleAiTabMouseEnter}
      onMouseLeave={handleAiTabMouseLeave}
      onClick={() => {
        onViewChange("revserp-ai")
        if (aiConversations.length > 0) {
          onSelectConversation?.(aiConversations[0].id)
        }
      }}
    />
  }
>
  Revserp AI
</DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="max-h-96 w-80 overflow-y-auto rounded-2xl p-1.5"
                    onMouseEnter={() => setIsAiChatMenuOpen(true)}
                    onMouseLeave={handleAiTabMouseLeave}
                  >
                    <DropdownMenuItem
                      onClick={() => {
                        setIsAiChatMenuOpen(false)
                        onViewChange("revserp-ai")
                      }}
                    >
                      <PlusIcon className="size-4" />
                      New chat
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isLoadingAiConversations ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        Loading chats...
                      </div>
                    ) : aiConversations.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No saved chats yet
                      </div>
                    ) : (
                      groupAiConversationsByDate(aiConversations).map((group) => (
                        <DropdownMenuGroup key={group.label}>
                          <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                          {group.conversations.map((conv) => (
                            <DropdownMenuItem
                              key={conv.id}
                              onClick={() => handleAiConversationSelect(conv.id)}
                              className="items-start gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm">
                                  {conv.title || "Untitled chat"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatAiConversationTime(conv.updated_at)}
                                </div>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button className="w-72 justify-between" onClick={() => setIsProjectMenuOpen(true)} variant="outline">
              <span className="flex min-w-0 items-center gap-2 truncate">
                <SearchIcon data-icon="inline-start" />
                <span className="truncate">{activeProject?.name || "Search projects"}</span>
              </span>
              <ChevronsUpDownIcon data-icon="inline-end" />
            </Button>

            <RunCrawlPopover
              activeProject={activeProject}
              activeProjectId={activeProjectId}
              fetchTimeoutSeconds={fetchTimeoutSeconds}
              isCrawlRunning={isCrawlRunning}
              isOpen={isRunCrawlOpen}
              isStartingCrawl={isStartingCrawl}
              maxDepth={maxDepth}
              runCrawlError={runCrawlError}
              onFetchTimeoutSecondsChange={setFetchTimeoutSeconds}
              onMaxDepthChange={setMaxDepth}
              onOpenChange={setIsRunCrawlOpen}
              onSubmit={handleRunCrawl}
            />
          </div>

          <div className="flex justify-end">
            <ProfileMenu
              activeProjectId={activeProjectId}
              currentCrawlId={currentCrawl?.id ?? null}
              initials={initials}
              isActiveOrganizationOwner={isActiveOrganizationOwner}
              isLeavingWorkspace={isLeavingWorkspace}
              isLoggingOut={isLoggingOut}
              isSwitchingWorkspace={isSwitchingWorkspace}
              organizationId={organizationId}
              organizations={organizations}
              profileActionError={profileActionError}
              userName={userName}
              onInviteOpen={openInviteDialog}
              onLeaveWorkspaceOpen={openLeaveWorkspaceDialog}
              onLogout={() => void handleLogout()}
              onSelectOrganization={(value) => void handleSelectOrganization(value)}
            />
          </div>
        </div>
      </header>

      <ProjectPickerDialog
        activeProjectId={activeProjectId}
        crawlPanelCrawls={crawlPanelCrawls}
        currentCrawl={currentCrawl}
        deletingCrawlId={deletingCrawlId}
        deletingProjectId={deletingProjectId}
        exportFormat={exportFormat}
        exportingCrawlId={exportingCrawlId}
        isOpen={isProjectMenuOpen}
        projectActionError={projectActionError}
        projects={projects}
        onCreateProjectOpen={() => {
          setCreateProjectError("")
          setIsCreateProjectOpen(true)
        }}
        onDeleteCrawl={openDeleteCrawlDialog}
        onDeleteProject={openDeleteProjectDialog}
        onExportCrawl={(crawl, format) => void handleExportCrawl(crawl, format)}
        onExportFormatChange={setExportFormat}
        onOpenBusinessProfile={(project) => void openBusinessProfileDrawer(project)}
        onOpenChange={setIsProjectMenuOpen}
        onProjectHover={setHoveredProjectId}
        onSelectProject={(projectId, crawlId) => void handleSelectProject(projectId, crawlId)}
      />

      <BusinessProfileDrawer
        brandName={brandName}
        businessDescription={businessDescription}
        businessProfileError={businessProfileError}
        businessProfileProject={businessProfileProject}
        canManageBusinessProfile={canManageBusinessProfile}
        isLoadingBusinessProfile={isLoadingBusinessProfile}
        isSavingBusinessProfile={isSavingBusinessProfile}
        primaryCategory={primaryCategory}
        primaryLocation={primaryLocation}
        seedPrompts={seedPrompts}
        websiteUrl={websiteUrl}
        onBrandNameChange={setBrandName}
        onBusinessDescriptionChange={setBusinessDescription}
        onClose={closeBusinessProfileDrawer}
        onPrimaryCategoryChange={setPrimaryCategory}
        onPrimaryLocationChange={setPrimaryLocation}
        onSeedPromptChange={updateSeedPrompt}
        onSubmit={handleSaveBusinessProfile}
        onWebsiteUrlChange={setWebsiteUrl}
      />

      <CreateProjectDialog
        createProjectError={createProjectError}
        isCreatingProject={isCreatingProject}
        isOpen={isCreateProjectOpen}
        projectBaseUrl={projectBaseUrl}
        projectName={projectName}
        onBaseUrlChange={setProjectBaseUrl}
        onNameChange={setProjectName}
        onOpenChange={setIsCreateProjectOpen}
        onSubmit={handleCreateProject}
      />

      <DeleteProjectDialog
        deletingProjectId={deletingProjectId}
        isOpen={isDeleteProjectOpen}
        projectActionError={projectActionError}
        projectPendingDelete={projectPendingDelete}
        onDelete={() => void handleDeleteProject()}
        onOpenChange={setIsDeleteProjectOpen}
      />

      <DeleteCrawlDialog
        crawlPendingDelete={crawlPendingDelete}
        deletingCrawlId={deletingCrawlId}
        isOpen={isDeleteCrawlOpen}
        projectActionError={projectActionError}
        onDelete={() => void handleDeleteCrawl()}
        onOpenChange={setIsDeleteCrawlOpen}
      />

      <InviteMembersDialog
        activeOrganizationName={activeOrganization?.name}
        hasCopiedInviteLink={hasCopiedInviteLink}
        inviteExpiresAt={inviteExpiresAt}
        inviteLink={inviteLink}
        inviteMaxUses={inviteMaxUses}
        isCreatingInvite={isCreatingInvite}
        isOpen={isInviteDialogOpen}
        profileActionError={profileActionError}
        onCopyInviteLink={() => void handleCopyInviteLink()}
        onExpiresAtChange={setInviteExpiresAt}
        onMaxUsesChange={setInviteMaxUses}
        onOpenChange={closeInviteDialog}
        onSubmit={handleCreateInvite}
      />

      <LeaveWorkspaceDialog
        activeOrganizationName={activeOrganization?.name}
        isLeavingWorkspace={isLeavingWorkspace}
        isOpen={isLeaveWorkspaceOpen}
        profileActionError={profileActionError}
        onLeave={() => void handleLeaveOrganization()}
        onOpenChange={setIsLeaveWorkspaceOpen}
      />
    </>
  )
}

function getInviteValidationError(inviteExpiresAt: string, expiresAtDate: Date, maxUses: number) {
  if (!inviteExpiresAt.trim() || Number.isNaN(expiresAtDate.getTime())) {
    return "Expiry must be a valid date and time."
  }

  if (expiresAtDate.getTime() <= Date.now()) {
    return "Expiry must be in the future."
  }

  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    return "Max uses must be greater than zero."
  }

  return ""
}

function getCrawlValidationError(maxDepth: number, fetchTimeoutSeconds: number) {
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    return "Max depth must be zero or greater."
  }

  if (!Number.isInteger(fetchTimeoutSeconds) || fetchTimeoutSeconds <= 0) {
    return "Fetch timeout must be greater than zero."
  }

  return ""
}

function getProjectFilenameSegment(project: ProjectResponse | undefined) {
  const projectName = project?.name ?? "project"
  const normalizedProjectName = projectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return normalizedProjectName || "project"
}

function downloadBlob(blob: Blob, filename: string) {
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = downloadUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)
}

type AiConversationGroup = {
  label: string
  conversations: AIConversationResponse[]
}

function formatAiConversationDate(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatAiConversationTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}

function groupAiConversationsByDate(
  conversations: AIConversationResponse[]
): AiConversationGroup[] {
  const groups: AiConversationGroup[] = []
  const groupByLabel = new Map<string, AIConversationResponse[]>()

  for (const conversation of conversations) {
    const label = formatAiConversationDate(conversation.updated_at)
    const group = groupByLabel.get(label)
    if (group) {
      group.push(conversation)
      continue
    }
    const conversationsForDate = [conversation]
    groupByLabel.set(label, conversationsForDate)
    groups.push({ label, conversations: conversationsForDate })
  }

  return groups
}


export type { DashboardView }
