import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

mock.module("~/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <>{children}</> : null),
  DialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

const { CreateProjectDialog } = await import(
  "~/components/app-navbar/dialogs"
)
import { flushTestDom } from "~/lib/dom-test-setup"

type DialogProps = Parameters<typeof CreateProjectDialog>[0]

const baseProps: DialogProps = {
  createProjectError: "",
  isCreatingProject: false,
  isOpen: true,
  projectBaseUrl: "https://acme.example",
  projectName: "Acme",
  onBaseUrlChange: () => undefined,
  onNameChange: () => undefined,
  onOpenChange: () => undefined,
  onSubmit: (event) => event.preventDefault(),
}

describe("CreateProjectDialog rename mode", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  async function renderDialog(props: Partial<DialogProps>) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(<CreateProjectDialog {...baseProps} {...props} />)
      await flushTestDom()
    })
  }

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    document.body.innerHTML = ""
  })

  test("rename reuses the form with prefilled name and locked URL", async () => {
    await renderDialog({ isRenameMode: true })

    expect(document.body.textContent).toContain("Rename project")
    expect(document.body.textContent).toContain("Only the name changes")

    const nameInput = document.querySelector(
      "#project-name",
    ) as HTMLInputElement | null
    const urlInput = document.querySelector(
      "#project-base-url",
    ) as HTMLInputElement | null
    expect(nameInput?.value).toBe("Acme")
    expect(urlInput?.value).toBe("https://acme.example")
    expect(urlInput?.readOnly).toBe(true)

    const submit = document.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement | null
    expect(submit?.textContent).toContain("Save changes")
  })

  test("rename hides the create onboarding selector", async () => {
    await renderDialog({ isRenameMode: true })
    expect(
      document.querySelector('[data-tour="onboarding-create-form"]'),
    ).toBe(null)
  })

  test("pending rename disables cancel and submit without double submit", async () => {
    await renderDialog({ isRenameMode: true, isCreatingProject: true })

    const buttons = Array.from(document.querySelectorAll("button"))
    const cancel = buttons.find(
      (button) => button.textContent === "Cancel",
    ) as HTMLButtonElement | undefined
    const submit = document.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement | null
    expect(submit?.textContent).toContain("Saving...")
    expect(submit?.disabled).toBe(true)
    expect(cancel?.disabled).toBe(true)
  })

  test("create mode keeps title, editable URL, and tour selector", async () => {
    await renderDialog({})

    expect(document.body.textContent).toContain("Create project")
    const urlInput = document.querySelector(
      "#project-base-url",
    ) as HTMLInputElement | null
    expect(urlInput?.readOnly).toBe(false)
    expect(
      document.querySelector('[data-tour=onboarding-create-form]') !== null,
    ).toBe(true)
    const submit = document.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement | null
    expect(submit?.textContent).toContain("Create project")
  })
})
