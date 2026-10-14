import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

mock.module("~/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <>{children}</> : null),
  DialogContent: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

const { InviteMembersDialog } = await import(
  "~/components/app-navbar/dialogs"
)

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  document.body.innerHTML = ""
})

function renderDialog(inviteRole: "member" | "manager", onRoleChange: (v: any) => void) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <InviteMembersDialog
        activeOrganizationName="Acme"
        hasCopiedInviteLink={false}
        inviteExpiresAt=""
        inviteLink=""
        inviteMaxUses="10"
        inviteRole={inviteRole}
        isCreatingInvite={false}
        isOpen
        profileActionError=""
        onCopyInviteLink={() => {}}
        onExpiresAtChange={() => {}}
        onMaxUsesChange={() => {}}
        onRoleChange={onRoleChange}
        onOpenChange={() => {}}
        onSubmit={(event) => event.preventDefault()}
      />
    )
  })
  return host
}

describe("invite members dialog roles", () => {
  test("member is the default with manager as the only other choice", () => {
    const host = renderDialog("member", () => {})
    const radios = [...host.querySelectorAll('input[name="invite-role"]')]
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual([
      "member",
      "manager",
    ])
    expect(
      (host.querySelector('input[value="member"]') as HTMLInputElement).checked
    ).toBe(true)
    expect(document.body.textContent).toContain(
      "never platform admin settings"
    )
  })

  test("picking manager reports the manager role", () => {
    let picked: string | null = null
    const host = renderDialog("member", (value) => {
      picked = value
    })
    const manager = host.querySelector(
      'input[value="manager"]'
    ) as HTMLInputElement
    act(() => {
      manager.click()
    })
    expect(picked).toBe("manager")
  })
})
