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
  ContextMenuCheckboxItem: ({ children }: any) => <>{children}</>,
  ContextMenuRadioGroup: ({ children }: any) => <>{children}</>,
  ContextMenuRadioItem: ({ children }: any) => <>{children}</>,
  ContextMenuLabel: ({ children }: any) => <>{children}</>,
  ContextMenuShortcut: ({ children }: any) => <>{children}</>,
  ContextMenuSub: ({ children }: any) => <>{children}</>,
  ContextMenuSubContent: ({ children }: any) => <>{children}</>,
  ContextMenuSubTrigger: ({ children }: any) => <>{children}</>,
  ContextMenuPortal: ({ children }: any) => <>{children}</>,
}))

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { ProjectResponse } from "~/lib/api.types"

const { ProjectPanel } = await import(
  "~/components/command-dock/project-panel"
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

const renamed: ProjectResponse[] = []

describe("project panel right-click menu", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  async function renderPanel() {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        <ProjectPanel
          activeProjectId="p-safe"
          crawlPanelCrawls={[]}
          currentCrawl={null}
          cancellingCrawlId={null}
          deletingCrawlId={null}
          deletingProjectId={null}
          exportFormat="xlsx"
          exportingCrawlId={null}
          projectActionError=""
          projects={[safeProject, unsafeProject]}
          onCancelCrawl={() => undefined}
          onCreateProjectOpen={() => undefined}
          onDeleteCrawl={() => undefined}
          onDeleteProject={() => undefined}
          onExportCrawl={() => undefined}
          onExportFormatChange={() => undefined}
          onOpenBusinessProfile={() => undefined}
          onProjectHover={() => undefined}
          onRenameProject={(project) => renamed.push(project)}
          onSelectProject={() => undefined}
          reducedMotion
        />,
      )
      await flushTestDom()
    })
  }

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = null
    host?.remove()
    host = null
    document.body.innerHTML = ""
    renamed.length = 0
  })

  test("rename fires with the right-clicked project", async () => {
    await renderPanel()

    const renameButtons = Array.from(
      document.querySelectorAll("button"),
    ).filter((button) => button.textContent?.includes("Rename project"))
    expect(renameButtons.length).toBe(2)
    await act(async () => {
      renameButtons[0]?.click()
      await flushTestDom()
    })
    expect(renamed.length).toBe(1)
    expect(renamed[0]?.id).toBe("p-safe")
  })

  test("open website uses a safe new-tab anchor, hidden for unsafe URLs", async () => {
    await renderPanel()

    const websiteLinks = Array.from(
      document.querySelectorAll('a[target="_blank"]'),
    ).filter((link) => link.textContent?.includes("Open website"))
    expect(websiteLinks.length).toBe(1)
    expect(websiteLinks[0]?.getAttribute("href")).toBe("https://acme.example/")
    expect(websiteLinks[0]?.getAttribute("rel")).toBe("noopener noreferrer")
  })

  test("business profile and delete project stay available", async () => {
    await renderPanel()

    const buttons = Array.from(document.querySelectorAll("button"))
    expect(
      buttons.filter((button) =>
        button.textContent?.includes("Business profile"),
      ).length,
    ).toBe(2)
    expect(
      buttons.filter((button) =>
        button.textContent?.includes("Delete project"),
      ).length,
    ).toBe(2)
  })
})
