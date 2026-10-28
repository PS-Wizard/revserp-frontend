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

const { InviteMembersDialog } = await import("~/components/app-navbar/dialogs")

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  document.body.innerHTML = ""
})

function renderDialog(
  inviteRole: "member" | "manager",
  onRoleChange: (v: any) => void
) {
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
    expect(document.body.textContent).toContain("never platform admin settings")
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

describe("invite members dialog email input", () => {
  function renderEmailDialog(overrides: Record<string, any> = {}) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    const calls: { commits: string[]; pops: number; sends: number } = {
      commits: [],
      pops: 0,
      sends: 0,
    }
    act(() => {
      root?.render(
        <InviteMembersDialog
          activeOrganizationName="Acme"
          hasCopiedInviteLink
          inviteExpiresAt=""
          inviteLink="https://beta.revserp.ai/invite/tok"
          inviteMaxUses="10"
          inviteRole="member"
          isCreatingInvite={false}
          isOpen
          profileActionError=""
          inviteEmailDraft=""
          inviteRecipients={[]}
          isSendingInviteEmails={false}
          inviteEmailResult=""
          onCopyInviteLink={() => {}}
          onExpiresAtChange={() => {}}
          onMaxUsesChange={() => {}}
          onRoleChange={() => {}}
          onOpenChange={() => {}}
          onSubmit={(event) => event.preventDefault()}
          onEmailDraftChange={() => {}}
          onEmailCommit={(value: string) => {
            calls.commits.push(value)
          }}
          onRemoveEmailRecipient={() => {}}
          onPopEmailRecipient={() => {
            calls.pops += 1
          }}
          onSendInviteEmails={() => {
            calls.sends += 1
          }}
          {...overrides}
        />
      )
    })
    return { host: host as HTMLDivElement, calls }
  }

  test("enter commits the draft", () => {
    const { host, calls } = renderEmailDialog({ inviteEmailDraft: "a@b.com" })
    const input = host.querySelector("#invite-emails") as HTMLInputElement
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      )
    })
    expect(calls.commits).toEqual(["a@b.com"])
  })

  test("backspace on an empty draft pops the last chip", () => {
    const { host, calls } = renderEmailDialog()
    const input = host.querySelector("#invite-emails") as HTMLInputElement
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Backspace",
          bubbles: true,
          cancelable: true,
        })
      )
    })
    expect(calls.pops).toBe(1)
  })

  test("invalid recipients are visibly marked and send reports the result", () => {
    const { host, calls } = renderEmailDialog({
      inviteRecipients: [
        { value: "good@example.com", valid: true },
        { value: "not-an-email", valid: false },
      ],
      inviteEmailResult: "Invite sent to good@example.com.",
    })
    expect(host.textContent).toContain("not-an-email")
    const badChip = Array.from(host.querySelectorAll("*" as any)).find(
      (el) =>
        el instanceof HTMLElement &&
        el.textContent === "not-an-email" &&
        /destructive/.test(el.className)
    ) as HTMLElement | undefined
    expect(badChip !== undefined).toBe(true)
    expect(host.textContent).toContain("Invite sent to good@example.com.")
    const send = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Send"
    ) as HTMLButtonElement
    act(() => {
      send.click()
    })
    expect(calls.sends).toBe(1)
  })
})
