import { useNavigate } from "react-router"
import { useEffect, useRef, useState } from "react"

import { DownloadIcon, LogOutIcon, MoonIcon, ShieldIcon } from "lucide-react"

import { toast } from "sonner"
import { ThinkingOrb } from "thinking-orbs"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { HoverPill, useHoverMenu } from "~/components/ui/hover-pill"
import { cn } from "~/lib/utils"
import {
  clearInstallPrompt,
  getInstallPrompt,
  subscribeInstallPrompt,
  type BeforeInstallPromptEvent,
} from "~/lib/pwa-install"

type ProfileMenuProps = {
  /** Bare avatar trigger, sized for the command dock's capsule. */
  compact?: boolean
  initials: string
  workspaceState: "idle" | "switching" | "leaving" | "logging-out"
  profileActionError: string
  userName?: string
  isPlatformAdmin: boolean
  onLogout: () => void
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

export function ProfileMenu({
  compact = false,
  initials,
  workspaceState,
  profileActionError,
  userName,
  isPlatformAdmin,
  onLogout,
}: ProfileMenuProps) {
  const navigate = useNavigate()
  const isLoggingOut = workspaceState === "logging-out"
  const [isDarkMode, setIsDarkMode] = useState(
    () =>
      typeof document === "undefined" ||
      document.documentElement.classList.contains("dark")
  )
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(getInstallPrompt)
  const [isStandalone, setIsStandalone] = useState(false)
  const [profilePill, setProfilePill] = useState<{
    height: number
    top: number
  } | null>(null)
  const profileItemRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    setIsStandalone(isStandaloneMode())
    const unsubscribe = subscribeInstallPrompt(setInstallPrompt)
    const handleInstalled = () => setIsStandalone(true)
    window.addEventListener("appinstalled", handleInstalled)
    return () => {
      unsubscribe()
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [])

  const handleInstall = () => {
    if (isStandalone) return
    if (installPrompt) {
      void installPrompt
        .prompt()
        .then(() => installPrompt.userChoice)
        .then(clearInstallPrompt)
        .catch(clearInstallPrompt)
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

  const hoverMenu = useHoverMenu()

  return (
    <DropdownMenu onOpenChange={hoverMenu.onOpenChange} open={hoverMenu.open}>
      <div {...hoverMenu.triggerProps}>
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
      </div>
      <DropdownMenuContent
        align="end"
        className="relative w-64"
        onMouseLeave={() => setProfilePill(null)}
        onPointerEnter={hoverMenu.contentProps.onPointerEnter}
        onPointerLeave={hoverMenu.contentProps.onPointerLeave}
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
          {isPlatformAdmin ? (
            <DropdownMenuItem
              className="focus:bg-transparent focus:text-current focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={() => {
                navigate("/app/admin")
              }}
              onMouseEnter={() => showProfilePill(2)}
              ref={(element) => {
                profileItemRefs.current[2] = element
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
          onMouseEnter={() => showProfilePill(3)}
          ref={(element) => {
            profileItemRefs.current[3] = element
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
