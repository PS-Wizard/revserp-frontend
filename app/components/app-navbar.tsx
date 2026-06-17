"use client"

import { useMemo, useState } from "react"
import { useLocation, useNavigate, useRevalidator } from "react-router"
import { ChevronsUpDownIcon, PlusIcon, SearchIcon } from "lucide-react"

import { clientApiPost } from "~/lib/api"
import type { CrawlResponse, ProjectResponse } from "~/lib/api.types"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
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

export function AppNavbar({
  activeProjectId,
  isCrawlRunning,
  organizationId,
  projects,
  userEmail,
  userName,
  view,
  onViewChange,
}: {
  activeProjectId?: string | null
  isCrawlRunning: boolean
  organizationId: string
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

  async function handleSelectProject(projectId: string) {
    setIsProjectMenuOpen(false)

    const searchParams = new URLSearchParams(location.search)
    searchParams.set("project", projectId)

    await navigate(`${location.pathname}?${searchParams.toString()}`)
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
            <button className="flex items-center gap-3 rounded-full bg-card px-2 py-1.5 text-left shadow-xs transition hover:bg-muted/50" type="button">
              <Avatar>
                <AvatarFallback>{initials || "R"}</AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-sm font-medium text-foreground">
                  {userName || "Revserp User"}
                </span>
              </span>
            </button>
          </div>
        </div>
      </header>

      <Dialog onOpenChange={setIsProjectMenuOpen} open={isProjectMenuOpen}>
        <DialogContent
          className="gap-0 overflow-hidden rounded-xl border-border/50 p-0 shadow-lg sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Projects</DialogTitle>
            <DialogDescription>Select a project or create a new one.</DialogDescription>
          </DialogHeader>
          <Command className="flex h-full w-full flex-col overflow-hidden bg-popover">
            <div className="border-b border-border/50 px-3 py-3">
              <CommandInput placeholder="Search projects..." />
            </div>
            <CommandList className="max-h-[400px] py-2">
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
                  <CommandItem
                    className="mx-2 rounded-lg py-2.5"
                    key={project.id}
                    onSelect={() => void handleSelectProject(project.id)}
                    value={`${project.name} ${project.base_url}`}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{project.name}</span>
                      <span className="truncate text-muted-foreground">
                        {project.base_url}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
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
    </>
  )
}

export type { DashboardView }
