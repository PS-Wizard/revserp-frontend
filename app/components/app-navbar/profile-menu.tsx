import { useNavigate } from "react-router"
import { useEffect, useRef, useState } from "react"

import {
  DoorOpenIcon,
  DownloadIcon,
  LogOutIcon,
  MoonIcon,
  SendIcon,
  SettingsIcon,
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
import { useFeatures } from "~/lib/features"
import { HoverPill } from "~/components/ui/hover-pill"
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

function isStandaloneMode() {
  if (typeof window === "undefined") return false
  const iosNavigator = navigator as Navigator & { standalone?: boolean }
  return (
    (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false) ||
    iosNavigator.standalone === true
  )
}

function isIOSSafari() {
  if (typeof window === "undefined") return false
  const { navigator } = window
  const isAppleMobile =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  return (
    isAppleMobile &&
    /Safari/i.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent)
  )
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
  const features = useFeatures()
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
  const [isStandalone, setIsStandalone] = useState(false)
  const [profilePill, setProfilePill] = useState<{
    height: number
    top: number
  } | null>(null)
  const profileItemRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    setIsStandalone(isStandaloneMode())
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const clearInstallPrompt = () => {
      setInstallPrompt(null)
      setIsStandalone(true)
    }
    window.addEventListener("beforeinstallprompt", handleInstallPrompt)
    window.addEventListener("appinstalled", clearInstallPrompt)
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt)
      window.removeEventListener("appinstalled", clearInstallPrompt)
    }
  }, [])

  const handleInstall = () => {
    if (isStandalone) return
    if (installPrompt) {
      void installPrompt
        .prompt()
        .then(() => installPrompt.userChoice)
        .then(() => setInstallPrompt(null))
        .catch(() => setInstallPrompt(null))
      return
    }
    if (isIOSSafari()) {
      toast("Install Revserp", {
        description: "Tap Share, then Add to Home Screen.",
      })
      return
    }
    toast("Install Revserp", {
      description: "Use your browser menu: Install app / Add to Home Screen.",
    })
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
                : "gap-3 rounded-md border border-border/60 bg-card px-2 py-1.5 text-left hover:bg-muted/50"
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
        <HoverPill pill={profilePill} />
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
        {isStandalone ? null : (
          <>
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
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              className="relative z-10 focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground data-popup-open:bg-transparent data-popup-open:text-current data-open:bg-transparent data-open:text-current"
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
          {features.integrations !== false ? (
            <DropdownMenuItem
              className="focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={() => {
                navigate("/app/settings/integrations")
              }}
              onMouseEnter={() => showProfilePill(4)}
              ref={(element) => {
                profileItemRefs.current[4] = element
              }}
              variant="default"
            >
              <SettingsIcon />
              Integrations
            </DropdownMenuItem>
          ) : null}
          {isPlatformAdmin ? (
            <DropdownMenuItem
              className="focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={() => {
                navigate("/app/admin")
              }}
              onMouseEnter={() => showProfilePill(5)}
              ref={(element) => {
                profileItemRefs.current[5] = element
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
          onMouseEnter={() => showProfilePill(6)}
          ref={(element) => {
            profileItemRefs.current[6] = element
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
