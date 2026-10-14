export type OrganizationInviteRole = "member" | "manager"

export const ORGANIZATION_INVITE_ROLES: ReadonlyArray<OrganizationInviteRole> = [
  "member",
  "manager",
]

export const DEFAULT_ORGANIZATION_INVITE_ROLE: OrganizationInviteRole =
  "member"

export function isOrganizationInviteRole(
  value: string | null | undefined
): value is OrganizationInviteRole {
  return value === "member" || value === "manager"
}

/** Actual workspace owner. Lifecycle-only: owners cannot leave their org. */
export function isOrganizationOwner(
  role: string | null | undefined
): boolean {
  return role === "owner"
}

/*
 * Workspace-management capability, mirroring the backend whitelist: owner
 * and manager manage by membership alone; member manages only when the
 * user is a platform admin. Unknown, empty, or missing roles fail closed,
 * so a platform admin outside the org never manages from the global flag
 * alone.
 */
export function canManageOrganization(
  role: string | null | undefined,
  isPlatformAdmin: boolean
): boolean {
  if (role === "owner" || role === "manager") return true
  if (role === "member") return isPlatformAdmin === true
  return false
}

type OrganizationAccessSource = {
  organizations?:
    | ReadonlyArray<{ id: string; name?: string; role?: string | null }>
    | null
  active_org_id?: string | null
  is_platform_admin?: boolean | null
}

function activeOrganizationRole(
  me: OrganizationAccessSource | null | undefined
): string | undefined {
  if (!me || !me.active_org_id) return undefined
  return (
    me.organizations?.find(
      (organization) => organization.id === me.active_org_id
    )?.role ?? undefined
  )
}

/** Actual owner of the verified active org; undefined/nonmember is false. */
export function isActiveOrganizationOwner(
  me: OrganizationAccessSource | null | undefined
): boolean {
  return isOrganizationOwner(activeOrganizationRole(me))
}

/*
 * Manager capability for the verified active org (owner, manager, or a
 * platform-admin member). Undefined/nonmember is false.
 */
export function canManageActiveOrganization(
  me: OrganizationAccessSource | null | undefined
): boolean {
  return canManageOrganization(
    activeOrganizationRole(me),
    me?.is_platform_admin === true
  )
}
