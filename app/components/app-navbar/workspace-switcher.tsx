import { DoorOpenIcon, SendIcon, UsersIcon } from "lucide-react"
import { ThinkingOrb } from "thinking-orbs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  DROPDOWN_PILL_ITEM_CLASS,
  HoverPill,
  useHoverMenu,
  useHoverPill,
} from "~/components/ui/hover-pill"
import type { MeResponse } from "~/lib/api.types"
import { cn } from "~/lib/utils"

import { getWorkspaceInitials } from "./utils"

type WorkspaceSwitcherProps = {
  activeOrganizationName?: string
  isActiveOrganizationOwner: boolean
  /** Workspace-management capability (owner, manager, or admin member). */
  canManageOrganization?: boolean
  workspaceState: "idle" | "switching" | "leaving" | "logging-out"
  organizationId: string
  organizations: MeResponse["organizations"]
  onInviteOpen: () => void
  onLeaveWorkspaceOpen: () => void
  onSelectOrganization: (organizationId: string) => void
  /** Borderless trigger for use inside the navbar breadcrumb pill. */
  bare?: boolean
}

export function WorkspaceSwitcher({
  activeOrganizationName,
  isActiveOrganizationOwner,
  canManageOrganization = isActiveOrganizationOwner,
  workspaceState,
  organizationId,
  organizations,
  onInviteOpen,
  onLeaveWorkspaceOpen,
  onSelectOrganization,
  bare = false,
}: WorkspaceSwitcherProps) {
  const pillMenu = useHoverPill()
  const hoverMenu = useHoverMenu()
  const switchItemProps = pillMenu.getItemProps(0)
  const inviteItemProps = pillMenu.getItemProps(1)
  const leaveItemProps = pillMenu.getItemProps(canManageOrganization ? 2 : 1)
  const isSwitchingWorkspace = workspaceState === "switching"
  const isLeavingWorkspace = workspaceState === "leaving"

  return (
    <DropdownMenu onOpenChange={hoverMenu.onOpenChange} open={hoverMenu.open}>
      <div {...hoverMenu.triggerProps}>
        <DropdownMenuTrigger
          render={
            <button
              aria-label="Switch workspace"
              className={cn(
                "flex items-center gap-2 rounded-lg text-left text-sm transition-colors duration-150 hover:bg-accent",
                bare
                  ? "h-9 max-w-44 px-2 text-foreground"
                  : "max-w-56 border border-border bg-card px-2 py-1.5 text-card-foreground"
              )}
              type="button"
            />
          }
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-micro font-semibold">
            {getWorkspaceInitials(activeOrganizationName ?? "")}
          </span>
          <span className="min-w-0 truncate font-medium">
            {activeOrganizationName || "Select a workspace"}
          </span>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        align="start"
        className="relative w-64"
        onMouseLeave={pillMenu.clearPill}
        onPointerEnter={hoverMenu.contentProps.onPointerEnter}
        onPointerLeave={hoverMenu.contentProps.onPointerLeave}
        side="bottom"
        sideOffset={10}
      >
        <HoverPill pill={pillMenu.pill} />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              className={DROPDOWN_PILL_ITEM_CLASS}
              disabled={isSwitchingWorkspace}
              onMouseEnter={switchItemProps.onMouseEnter}
              ref={switchItemProps.ref}
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
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-micro font-semibold">
                      {getWorkspaceInitials(organization.name)}
                    </span>
                    <span className="truncate">{organization.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {canManageOrganization ? (
            <DropdownMenuItem
              className={DROPDOWN_PILL_ITEM_CLASS}
              onClick={onInviteOpen}
              onMouseEnter={inviteItemProps.onMouseEnter}
              ref={inviteItemProps.ref}
              variant="default"
            >
              <SendIcon />
              Invite members
            </DropdownMenuItem>
          ) : null}
          {!isActiveOrganizationOwner ? (
            <DropdownMenuItem
              className={cn(
                DROPDOWN_PILL_ITEM_CLASS,
                "focus-visible:text-destructive"
              )}
              disabled={isLeavingWorkspace}
              onClick={onLeaveWorkspaceOpen}
              onMouseEnter={leaveItemProps.onMouseEnter}
              ref={leaveItemProps.ref}
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
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
