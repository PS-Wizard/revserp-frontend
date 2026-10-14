import { afterEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { cloneElement, createContext, useContext, useState } from "react"
import { flushTestDom, installTestDom } from "~/lib/dom-test-setup"

installTestDom()

const OpenContext = createContext<{ open: boolean; toggle: () => void }>({
  open: false,
  toggle: () => {},
})

// Local menu stand-in: the shared mock lacks the submenu/radio pieces this
// switcher uses, and the shared file belongs to other suites.
mock.module("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => {
    const [open, setOpen] = useState(false)
    return (
      <OpenContext.Provider value={{ open, toggle: () => setOpen((v) => !v) }}>
        {children}
      </OpenContext.Provider>
    )
  },
  DropdownMenuTrigger: ({ render }: any) => {
    const { toggle } = useContext(OpenContext)
    return cloneElement(render, { onClick: toggle })
  },
  DropdownMenuContent: ({ children }: any) => {
    const { open } = useContext(OpenContext)
    return open ? <div role="menu">{children}</div> : null
  },
  DropdownMenuGroup: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <div role="menuitem" onClick={onClick}>
      {children}
    </div>
  ),
  DropdownMenuSub: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuRadioGroup: ({ children }: any) => <div>{children}</div>,
  DropdownMenuRadioItem: ({ children }: any) => <div>{children}</div>,
}))

const { WorkspaceSwitcher } = await import(
  "~/components/app-navbar/workspace-switcher"
)

const ORGANIZATIONS = [{ id: "org-1", name: "Acme", role: "member" }]

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  document.body.innerHTML = ""
})

async function openMenu(props: {
  isActiveOrganizationOwner: boolean
  canManageOrganization?: boolean
}) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <WorkspaceSwitcher
        activeOrganizationName="Acme"
        isActiveOrganizationOwner={props.isActiveOrganizationOwner}
        canManageOrganization={props.canManageOrganization}
        workspaceState="idle"
        organizationId="org-1"
        organizations={ORGANIZATIONS}
        onInviteOpen={() => {}}
        onLeaveWorkspaceOpen={() => {}}
        onSelectOrganization={() => {}}
      />
    )
  })
  const trigger = document.body.querySelector(
    'button[aria-label="Switch workspace"]'
  ) as HTMLButtonElement
  await act(async () => {
    trigger.click()
    await flushTestDom()
  })
  return document.body.textContent ?? ""
}

describe("workspace switcher management access", () => {
  test("owner may invite and cannot leave", async () => {
    const text = await openMenu({
      isActiveOrganizationOwner: true,
      canManageOrganization: true,
    })
    expect(text).toContain("Invite members")
    expect(text.includes("Leave workspace")).toBe(false)
  })

  test("normal member may leave but not invite", async () => {
    const text = await openMenu({
      isActiveOrganizationOwner: false,
      canManageOrganization: false,
    })
    expect(text.includes("Invite members")).toBe(false)
    expect(text).toContain("Leave workspace")
  })

  test("manager may invite and may still leave", async () => {
    const text = await openMenu({
      isActiveOrganizationOwner: false,
      canManageOrganization: true,
    })
    expect(text).toContain("Invite members")
    expect(text).toContain("Leave workspace")
  })

  test("platform-admin member may invite and may still leave", async () => {
    const text = await openMenu({
      isActiveOrganizationOwner: false,
      canManageOrganization: true,
    })
    expect(text).toContain("Invite members")
    expect(text).toContain("Leave workspace")
  })
})
