import { useNavigate } from "react-router"

import {
  DoorOpenIcon,
  LogOutIcon,
  SendIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react"

import { ThinkingOrb } from "thinking-orbs"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
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
import type { MeResponse } from "~/lib/api.types"

import { getWorkspaceInitials } from "./utils"

type ProfileMenuProps = {
  activeOrganizationName?: string
  activeProjectId?: string | null
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

export function ProfileMenu({
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label="Open profile and workspace menu"
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
            <DropdownMenuItem onClick={onInviteOpen} variant="default">
              <SendIcon />
              Invite members
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={isLeavingWorkspace}
              onClick={onLeaveWorkspaceOpen}
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
              onClick={() => {
                navigate("/app/admin")
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
          disabled={isLoggingOut}
          onClick={onLogout}
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
