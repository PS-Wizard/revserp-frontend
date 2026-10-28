"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { FileTextIcon } from "lucide-react"

import type {
  AIReasoningEffort,
  ProjectResponse,
} from "~/lib/api.types"
import {
  contentDraftsQueryKey,
  createContentDraft,
} from "~/lib/content-drafts-api"
import { useFeatures } from "~/lib/features"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { CONTENT_PROMPT_PARAM } from "~/components/keywords/keywords-coverage"
import { ContentDraftPage } from "./content-draft-page"
import { ContentLibrary } from "./content-library"

function draftIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("draft")
}

/**
 * Content tab root. Library when no draft is selected, split draft workspace
 * otherwise. Deep-linkable via `?project=<id>&draft=<id>#content`.
 */
export function ContentView({
  project,
  allowedEfforts,
  canManageOrganization,
}: {
  project: ProjectResponse | null
  allowedEfforts: AIReasoningEffort[]
  canManageOrganization: boolean
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const features = useFeatures()
  const [creating, setCreating] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const previousProjectIdRef = useRef(project?.id ?? null)

  const draftId = draftIdFromSearch(location.search)
  // Prefill from a coverage "Write content" hop (?contentPrompt=…). Read live
  // from the URL so same-project navigation fills the box; the library
  // clears the param once consumed so it never sticks or auto-sends.
  const contentPrompt = new URLSearchParams(location.search).get(
    CONTENT_PROMPT_PARAM
  )

  const clearContentPrompt = useCallback(() => {
    const params = new URLSearchParams(location.search)
    if (!params.has(CONTENT_PROMPT_PARAM)) return
    params.delete(CONTENT_PROMPT_PARAM)
    const search = params.toString()
    void navigate(
      `${location.pathname}${search ? `?${search}` : ""}${location.hash || "#content"}`,
      { replace: true }
    )
  }, [location.pathname, location.search, location.hash, navigate])

  // A project switch drops the draft deep link instead of showing a
  // draft from another project.
  useEffect(() => {
    const previous = previousProjectIdRef.current
    previousProjectIdRef.current = project?.id ?? null
    if (previous === null || previous === project?.id) return
    setPendingPrompt(null)
    const params = new URLSearchParams(location.search)
    if (!params.has("draft")) return
    params.delete("draft")
    const search = params.toString()
    void navigate(
      `${location.pathname}${search ? `?${search}` : ""}${location.hash}`,
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const setDraftParam = useCallback(
    (nextDraftId: string | null) => {
      const params = new URLSearchParams(location.search)
      if (nextDraftId) params.set("draft", nextDraftId)
      else params.delete("draft")
      const search = params.toString()
      const hash = location.hash || "#content"
      void navigate(
        `${location.pathname}${search ? `?${search}` : ""}${hash}`
      )
    },
    [location.pathname, location.search, location.hash, navigate]
  )

  const handleCreateDraft = useCallback(
    async (prompt: string) => {
      if (!project || creating) return
      const text = prompt.trim()
      if (!text) return
      setCreating(true)
      try {
        const created = await createContentDraft(project.id, {
          title: text.replace(/\s+/g, " ").slice(0, 80),
        })
        await queryClient.invalidateQueries({
          queryKey: contentDraftsQueryKey(project.id),
        })
        setPendingPrompt(text)
        setDraftParam(created.id)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Couldn't create the draft."
        )
      } finally {
        setCreating(false)
      }
    },
    [project, creating, queryClient, setDraftParam]
  )

  if (!features.ai_chat) {
    return (
      <div className="flex min-h-full items-center justify-center py-16">
        <Card className="max-w-md p-6">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Content isn't available</EmptyTitle>
              <EmptyDescription>
                AI chat is disabled for this workspace.
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex items-center justify-center">
              <Button
                onClick={() =>
                  void navigate({
                    pathname: location.pathname,
                    search: location.search,
                    hash: "#overview-tab",
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Back to dashboard
              </Button>
            </div>
          </Empty>
        </Card>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex min-h-full items-center justify-center py-16">
        <Card className="max-w-md p-6">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No project selected</EmptyTitle>
              <EmptyDescription>
                Select a project to write content drafts.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      </div>
    )
  }

  if (draftId) {
    return (
      <ContentDraftPage
        key={draftId}
        project={project}
        draftId={draftId}
        allowedEfforts={allowedEfforts}
        canManageOrganization={canManageOrganization}
        initialPrompt={pendingPrompt}
        onInitialPromptConsumed={() => setPendingPrompt(null)}
        onBack={() => {
          setPendingPrompt(null)
          setDraftParam(null)
        }}
      />
    )
  }

  return (
    <ContentLibrary
      project={project}
      creating={creating}
      initialPrompt={contentPrompt}
      onInitialPromptConsumed={clearContentPrompt}
      onCreateDraft={(prompt) => void handleCreateDraft(prompt)}
      onOpenDraft={(id) => {
        setPendingPrompt(null)
        setDraftParam(id)
      }}
    />
  )
}
