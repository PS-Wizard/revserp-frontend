import { describe, expect, test } from "bun:test"

import {
  canManageActiveOrganization,
  canManageOrganization,
  DEFAULT_ORGANIZATION_INVITE_ROLE,
  isActiveOrganizationOwner,
  isOrganizationInviteRole,
  isOrganizationOwner,
} from "~/lib/organization-access"

function me(role: string | null, is_platform_admin: boolean) {
  return {
    active_org_id: "org-1",
    is_platform_admin,
    organizations: [{ id: "org-1", name: "Acme", role }],
  }
}

describe("canManageOrganization", () => {
  test("owner manages with or without the platform flag", () => {
    expect(canManageOrganization("owner", false)).toBe(true)
    expect(canManageOrganization("owner", true)).toBe(true)
    expect(isOrganizationOwner("owner")).toBe(true)
  })

  test("manager manages without the platform flag", () => {
    expect(canManageOrganization("manager", false)).toBe(true)
    expect(canManageOrganization("manager", true)).toBe(true)
    expect(isOrganizationOwner("manager")).toBe(false)
  })

  test("normal member stays restricted", () => {
    expect(canManageOrganization("member", false)).toBe(false)
    expect(isOrganizationOwner("member")).toBe(false)
  })

  test("platform-admin member manages; outsider does not", () => {
    expect(canManageOrganization("member", true)).toBe(true)
    expect(canManageOrganization(undefined, true)).toBe(false)
    expect(canManageOrganization(null, true)).toBe(false)
    expect(canManageOrganization("", true)).toBe(false)
    expect(canManageOrganization("", false)).toBe(false)
  })

  test("unknown roles fail closed with or without the platform flag", () => {
    for (const role of ["admin", "superadmin", "OWNER", "billing", "viewer"]) {
      expect(canManageOrganization(role, false)).toBe(false)
      expect(canManageOrganization(role, true)).toBe(false)
      expect(isOrganizationOwner(role)).toBe(false)
    }
    expect(
      canManageActiveOrganization({
        active_org_id: "org-1",
        is_platform_admin: true,
        organizations: [{ id: "org-1", name: "Acme", role: "admin" }],
      })
    ).toBe(false)
  })
})

describe("active organization capability", () => {
  test("owner manages and is the actual owner", () => {
    const state = me("owner", false)
    expect(canManageActiveOrganization(state)).toBe(true)
    expect(isActiveOrganizationOwner(state)).toBe(true)
  })

  test("manager manages but is not the owner, so they may leave", () => {
    const state = me("manager", false)
    expect(canManageActiveOrganization(state)).toBe(true)
    expect(isActiveOrganizationOwner(state)).toBe(false)
  })

  test("platform-admin member manages but is not the owner", () => {
    const state = me("member", true)
    expect(canManageActiveOrganization(state)).toBe(true)
    expect(isActiveOrganizationOwner(state)).toBe(false)
  })

  test("normal member manages nothing and owns nothing", () => {
    const state = me("member", false)
    expect(canManageActiveOrganization(state)).toBe(false)
    expect(isActiveOrganizationOwner(state)).toBe(false)
  })

  test("platform admin outside the org manages nothing", () => {
    expect(
      canManageActiveOrganization({
        active_org_id: "org-1",
        is_platform_admin: true,
        organizations: [{ id: "org-2", name: "Other", role: "member" }],
      })
    ).toBe(false)
    expect(canManageActiveOrganization(null)).toBe(false)
    expect(canManageActiveOrganization(undefined)).toBe(false)
    expect(
      canManageActiveOrganization({
        active_org_id: "org-1",
        is_platform_admin: true,
        organizations: [],
      })
    ).toBe(false)
    expect(
      isActiveOrganizationOwner({
        active_org_id: "org-1",
        is_platform_admin: true,
        organizations: [{ id: "org-2", name: "Other", role: "owner" }],
      })
    ).toBe(false)
  })
})

describe("invite roles", () => {
  test("default invite role is member with manager as the only upgrade", () => {
    expect(DEFAULT_ORGANIZATION_INVITE_ROLE).toBe("member")
    expect(isOrganizationInviteRole("member")).toBe(true)
    expect(isOrganizationInviteRole("manager")).toBe(true)
    expect(isOrganizationInviteRole("owner")).toBe(false)
    expect(isOrganizationInviteRole("")).toBe(false)
    expect(isOrganizationInviteRole(null)).toBe(false)
  })
})
