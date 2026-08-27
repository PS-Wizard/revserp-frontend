"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"

import { IssueWorkspaceView } from "./issue-workspace-view"
import type { IssueWorkspaceBrowseTarget } from "./issue-workspace.types"
import { invalidateIssueWorkspaceForCrawl } from "./use-issue-work-mutations"

type IssueWorkspacePanelContextValue = {
  openPanel: (target: IssueWorkspaceBrowseTarget) => void
}

const IssueWorkspacePanelContext =
  createContext<IssueWorkspacePanelContextValue | null>(null)

export function useIssueWorkspacePanel() {
  const context = useContext(IssueWorkspacePanelContext)
  if (!context) {
    throw new Error(
      "useIssueWorkspacePanel must be used within IssueWorkspacePanelProvider"
    )
  }
  return context
}

export function useIssueWorkspacePanelOptional() {
  return useContext(IssueWorkspacePanelContext)
}

export function IssueWorkspacePanelProvider({
  children,
  crawlId,
  currentUserId,
}: {
  children: ReactNode
  crawlId: string | null
  currentUserId: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [browseTarget, setBrowseTarget] = useState<IssueWorkspaceBrowseTarget>({
    kind: "verified-fixes",
  })
  const queryClient = useQueryClient()

  const openPanel = useCallback((target: IssueWorkspaceBrowseTarget) => {
    setBrowseTarget(target)
    setIsClosing(false)
    setIsOpen(true)
  }, [])

  const closePanel = useCallback(() => {
    setIsClosing(true)
    setIsOpen(false)
    if (crawlId) {
      void invalidateIssueWorkspaceForCrawl(queryClient, crawlId)
    }
  }, [crawlId, queryClient])

  useEffect(() => {
    if (!crawlId) {
      setIsOpen(false)
      setIsClosing(false)
    }
  }, [crawlId])

  useEffect(() => {
    if (!isOpen) setIsClosing(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [closePanel, isOpen])

  const showContent = isOpen || isClosing

  return (
    <IssueWorkspacePanelContext.Provider value={{ openPanel }}>
      {children}
      {crawlId ? (
        <div
          aria-hidden={!isOpen || isClosing}
          className="issue-workspace-shell fixed inset-3 z-[90] flex"
          data-open={isOpen && !isClosing}
          inert={!isOpen || isClosing ? true : undefined}
        >
          <section
            aria-label="Issue workspace"
            aria-modal="true"
            className="surface-dialog relative h-full w-full flex-1 overflow-hidden rounded-xl border border-border text-foreground"
            role="dialog"
          >
            <div className="flex h-full min-h-0 flex-col">
              {showContent ? (
                <IssueWorkspaceView
                  crawlId={crawlId}
                  currentUserId={currentUserId}
                  onClose={closePanel}
                  requestedBrowseTarget={browseTarget}
                />
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </IssueWorkspacePanelContext.Provider>
  )
}
