import { afterEach, describe, expect, mock, test } from "bun:test"
import { installTestDom } from "~/lib/dom-test-setup"

installTestDom()

mock.module("~/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: any) => <>{children}</>,
  ContextMenuTrigger: ({ children }: any) => <>{children}</>,
  ContextMenuContent: ({ children }: any) => <>{children}</>,
  ContextMenuGroup: ({ children }: any) => <>{children}</>,
  ContextMenuItem: ({ children, onClick, render, ...rest }: any) =>
    render ? (
      <a {...render.props} onClick={onClick}>
        {children}
      </a>
    ) : (
      <button onClick={onClick} {...rest}>
        {children}
      </button>
    ),
  ContextMenuSeparator: () => <hr />,
}))

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { ProjectResponse } from "~/lib/api.types"

const { ProjectPanelList } = await import(
  "~/components/workspace-dock-nav"
)
import { flushTestDom } from "~/lib/dom-test-setup"

const safeProject: ProjectResponse = {
  id: "p-safe",
  organization_id: "org-1",
  name: "Acme",
  base_url: "https://acme.example",
}

const unsafeProject: ProjectResponse = {
  id: "p-unsafe",
  organization_id: "org-1",
  name: "Evil",
  base_url: "javascript:alert(1)",
}

function menuButtons(label: string) {
  return Array.from(document.querySelectorAll("button")).filter((button) =>
    button.textContent?.includes(label),
  )
}

describe("dock project right-click menu", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  async function renderList() {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <ProjectPanelList
          activeProjectId="p-safe"
          onContextOpenChange={() => undefined}
          onCreateProject={() => undefined}
          onDeleteProject={() => undefined}
          onRenameProject={(project) => renamed.push(project)}
          onSelectProject={() => undefined}
          projects={[safeProject, unsafeProject]}
        />,
      )
      await flushTestDom()
    })
  }

  const renamed: ProjectResponse[] = []

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    document.body.innerHTML = ""
    renamed.length = 0
  })

  test("rename fires with the right-clicked project", async () => {
    await renderList()

    const renameButtons = menuButtons("Rename project")
    expect(renameButtons.length).toBe(2)
    await act(async () => {
      renameButtons[1]?.click()
      await flushTestDom()
    })
    expect(renamed.length).toBe(1)
    expect(renamed[0]?.id).toBe("p-unsafe")
  })

  test("open website uses a safe new-tab anchor, hidden for unsafe URLs", async () => {
    await renderList()

    const websiteLinks = Array.from(
      document.querySelectorAll('a[target="_blank"]'),
    ).filter((link) => link.textContent?.includes("Open website"))
    expect(websiteLinks.length).toBe(1)
    expect(websiteLinks[0]?.getAttribute("href")).toBe("https://acme.example/")
    expect(websiteLinks[0]?.getAttribute("rel")).toBe("noopener noreferrer")
  })

  test("delete project stays available", async () => {
    await renderList()
    expect(menuButtons("Delete project").length).toBe(2)
  })
})
