import { useNavigate } from "react-router"
import { useEffect, useRef, useState } from "react"

import {
  DoorOpenIcon,
  DownloadIcon,
  LogOutIcon,
  MoonIcon,
  SendIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react"

import { toast } from "sonner"
import { ThinkingOrb } from "thinking-orbs"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import type { MeResponse } from "~/lib/api.types"
import { cn } from "~/lib/utils"

import { getWorkspaceInitials } from "./utils"

type ProfileMenuProps = {
  activeOrganizationName?: string
  activeProjectId?: string | null
  /** Bare avatar trigger, sized for the command dock's capsule. */
  compact?: boolean
  currentCrawlId?: string | null
  initials: string
  isActiveOrganizationOwner: boolean
  workspaceState: "idle" | "switching" | "leaving" | "logging-out"
  organizationId: string
  organizations: MeResponse["organizations"]
  profileActionError: string
  userName?: string
  isPlatformAdmin: boolean
  onInviteOpen: () => void
  onLeaveWorkspaceOpen: () => void
  onLogout: () => void
  onSelectOrganization: (organizationId: string) => void
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferredInstallPrompt = event as BeforeInstallPromptEvent
  })
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null
  })
}

export function ProfileMenu({
  compact = false,
  initials,
  isActiveOrganizationOwner,
  workspaceState,
  organizationId,
  organizations,
  profileActionError,
  userName,
  isPlatformAdmin,
  onInviteOpen,
  onLeaveWorkspaceOpen,
  onLogout,
  onSelectOrganization,
}: ProfileMenuProps) {
  const navigate = useNavigate()
  const isSwitchingWorkspace = workspaceState === "switching"
  const isLeavingWorkspace = workspaceState === "leaving"
  const isLoggingOut = workspaceState === "logging-out"
  const [isDarkMode, setIsDarkMode] = useState(
    () =>
      typeof document === "undefined" ||
      document.documentElement.classList.contains("dark")
  )
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(() => deferredInstallPrompt)
  const [profilePill, setProfilePill] = useState<{
    height: number
    top: number
  } | null>(null)
  const profileItemRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const clearInstallPrompt = () => setInstallPrompt(null)
    window.addEventListener("beforeinstallprompt", handleInstallPrompt)
    window.addEventListener("appinstalled", clearInstallPrompt)
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt)
      window.removeEventListener("appinstalled", clearInstallPrompt)
    }
  }, [])

  const handleInstall = () => {
    if (installPrompt) {
      void installPrompt.prompt().then(() => setInstallPrompt(null))
      return
    }
    // Chrome may still be evaluating installability (the service worker only
    // just became active). Wait briefly for the event; if it arrives, fire the
    // native prompt immediately. Otherwise fall back to guidance.
    const timeout = window.setTimeout(() => {
      toast("Install Revserp", {
        description:
          "Use your browser's menu: Install app / Add to Home Screen.",
      })
    }, 5000)
    const capture = (event: Event) => {
      window.clearTimeout(timeout)
      window.removeEventListener("beforeinstallprompt", capture)
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      setInstallPrompt(promptEvent)
      void promptEvent.prompt()
    }
    window.addEventListener("beforeinstallprompt", capture)
  }
  function showProfilePill(index: number) {
    const target = profileItemRefs.current[index]
    if (!target) {
      setProfilePill(null)
      return
    }
    setProfilePill({
      height: target.offsetHeight,
      top: target.offsetTop,
    })
  }


  const onDarkModeChange = (enabled: boolean) => {
    setIsDarkMode(enabled)
    document.documentElement.classList.toggle("dark", enabled)
    try {
      localStorage.setItem("revserp-theme", enabled ? "dark" : "light")
    } catch {
      // The theme still changes when browser storage is unavailable.
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label="Open profile and workspace menu"
            className={cn(
              "flex items-center transition data-[popup-open]:bg-muted/50",
              compact
                ? "size-9 shrink-0 justify-center rounded-md hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                : "gap-3 rounded-md bg-card px-2 py-1.5 text-left shadow-xs hover:bg-muted/50"
            )}
            type="button"
          />
        }
      >
        <Avatar
          className={cn("rounded-md after:rounded-md", compact && "size-8")}
        >
          <AvatarFallback className="rounded-md">
            {initials || "R"}
          </AvatarFallback>
        </Avatar>
        {compact ? null : (
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-medium text-foreground">
              {userName || "Revserp User"}
            </span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="relative w-64"
        onMouseLeave={() => setProfilePill(null)}
        side="bottom"
        sideOffset={10}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1 z-0 rounded-[6px] bg-accent"
          style={{
            height: profilePill?.height ?? 0,
            opacity: profilePill ? 1 : 0,
            top: profilePill?.top ?? 0,
            transition:
              "top 150ms cubic-bezier(0.23,1,0.32,1), height 150ms cubic-bezier(0.23,1,0.32,1), opacity 120ms ease",
          }}
        />
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem
            checked={isDarkMode}
            className="focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground"
            onCheckedChange={onDarkModeChange}
            onMouseEnter={() => showProfilePill(0)}
            ref={(element) => {
              profileItemRefs.current[0] = element
            }}
          >
            <MoonIcon />
            Dark mode
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground"
            onClick={handleInstall}
            onMouseEnter={() => showProfilePill(1)}
            ref={(element) => {
              profileItemRefs.current[1] = element
            }}
            variant="default"
          >
            <DownloadIcon />
            Download app
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              className="relative z-10 focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground data-open:bg-transparent data-open:text-current data-popup-open:bg-transparent data-popup-open:text-current"
              disabled={isSwitchingWorkspace}
              onMouseEnter={() => showProfilePill(2)}
              ref={(element) => {
                profileItemRefs.current[2] = element
              }}
            >
              <UsersIcon />
              Switch workspace
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuRadioGroup
                value={organizationId}
                onValueChange={onSelectOrganization}
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
              className="focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={onInviteOpen}
              onMouseEnter={() => showProfilePill(3)}
              ref={(element) => {
                profileItemRefs.current[3] = element
              }}
              variant="default"
            >
              <SendIcon />
              Invite members
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="focus:bg-transparent focus:text-current focus-visible:bg-destructive/10 focus-visible:text-destructive"
              disabled={isLeavingWorkspace}
              onClick={onLeaveWorkspaceOpen}
              onMouseEnter={() => showProfilePill(3)}
              ref={(element) => {
                profileItemRefs.current[3] = element
              }}
              variant="destructive"
            >
              {isLeavingWorkspace ? (
                <ThinkingOrb
                  aria-label="Leaving workspace"
                  className="shrink-0"
                  size={20}
                  state="working"
                  style={{ width: 16, height: 16 }}
                />
              ) : (
                <DoorOpenIcon />
              )}
              Leave workspace
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {isPlatformAdmin ? (
            <DropdownMenuItem
              className="focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={() => {
                navigate("/app/admin")
              }}
              onMouseEnter={() => showProfilePill(4)}
              ref={(element) => {
                profileItemRefs.current[4] = element
              }}
              variant="default"
            >
              <ShieldIcon />
              Admin Settings
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground"
          disabled={isLoggingOut}
          onClick={onLogout}
          onMouseEnter={() => showProfilePill(5)}
          ref={(element) => {
            profileItemRefs.current[5] = element
          }}
          variant="default"
        >
          {isLoggingOut ? (
            <ThinkingOrb
              aria-hidden="true"
              className="shrink-0"
              size={20}
              state="working"
              style={{ width: 16, height: 16 }}
            />
          ) : (
            <LogOutIcon />
          )}
          {isLoggingOut ? "Logging out..." : "Logout"}
        </DropdownMenuItem>
        {profileActionError ? (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-destructive">
              {profileActionError}
            </p>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
