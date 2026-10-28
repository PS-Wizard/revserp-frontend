"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import {
  ArrowUpIcon,
  EllipsisIcon,
  FileTextIcon,
  Loader2Icon,
  PenLineIcon,
  TrashIcon,
} from "lucide-react"

import type { ProjectResponse } from "~/lib/api.types"
import {
  contentDraftsQueryOptions,
  deleteContentDraft,
  draftDisplayTitle,
} from "~/lib/content-drafts-api"
import { keywordsQueryOptions } from "~/components/keywords/keywords-coverage"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty"
import { HoverPill, useHoverPill } from "~/components/ui/hover-pill"
import { Skeleton } from "~/components/ui/skeleton"
import { Textarea } from "~/components/ui/textarea"

/**
 * Draft library: hero prompt box on top, keyword-gap chips, then quiet
 * draft rows with a sliding hover pill.
 */
export function ContentLibrary({
  project,
  creating,
  initialPrompt = null,
  onInitialPromptConsumed,
  onCreateDraft,
  onOpenDraft,
}: {
  project: ProjectResponse
  creating: boolean
  /** Prefill for the prompt box (e.g. from keyword coverage). Never auto-sent. */
  initialPrompt?: string | null
  onInitialPromptConsumed?: () => void
  onCreateDraft: (prompt: string) => void
  onOpenDraft: (draftId: string) => void
}) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState("")

  // A coverage "Write content" hop lands here with ?contentPrompt=…: fill
  // the box once, then clear the param so back/forward never re-fills it.
  useEffect(() => {
    if (!initialPrompt) return
    setPrompt(initialPrompt)
    onInitialPromptConsumed?.()
  }, [initialPrompt, onInitialPromptConsumed])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const rowsPill = useHoverPill()

  const draftsQuery = useQuery(contentDraftsQueryOptions(project.id))
  const coverageQuery = useQuery(keywordsQueryOptions(project.id))

  const gapChips = useMemo(() => {
    const seeds = coverageQuery.data?.seeds ?? []
    return seeds
      .filter((seed) => seed.state === "no_landing_page")
      .map((seed) => seed.keyword)
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 6)
  }, [coverageQuery.data])

  const drafts = useMemo(() => {
    const list = draftsQuery.data ?? []
    return [...list].sort(
      (left, right) =>
        new Date(right.updated_at).getTime() -
        new Date(left.updated_at).getTime()
    )
  }, [draftsQuery.data])

  const canSubmit = prompt.trim().length > 0 && !creating

  const submit = () => {
    if (!canSubmit) return
    onCreateDraft(prompt.trim())
  }

  const handleDelete = async (draftId: string) => {
    if (deletingId) return
    setDeletingId(draftId)
    try {
      await deleteContentDraft(draftId)
      await queryClient.invalidateQueries({
        queryKey: contentDraftsQueryOptions(project.id).queryKey,
      })
      toast.success("Draft deleted")
    } catch {
      toast.error("Couldn't delete the draft.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-8 py-8 md:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div className="surface-dialog rounded-[1.75rem] border border-border p-3 shadow-lg">
          <Textarea
            aria-label="What do you want to write?"
            className="min-h-28 resize-none border-0 bg-transparent text-[15px] shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder="What do you want to write?"
            value={prompt}
          />
          <div className="flex items-center justify-between gap-2 px-1 pt-1 pb-0.5">
            <p className="hidden text-xs text-muted-foreground sm:block">
              e.g. a guide to local SEO for dentists
            </p>
            <Button
              className="rounded-full"
              disabled={!canSubmit}
              onClick={submit}
              size="sm"
              type="button"
            >
              {creating ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : (
                <ArrowUpIcon aria-hidden="true" />
              )}
              {creating ? "Creating…" : "Write with Revbot"}
            </Button>
          </div>
        </div>

        {gapChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-xs text-muted-foreground">
              Uncovered keywords
            </span>
            {gapChips.map((keyword) => (
              <Badge
                className="max-w-56 cursor-pointer truncate bg-foreground/10 font-normal text-muted-foreground hover:bg-foreground/15 hover:text-foreground"
                key={keyword}
                onClick={() =>
                  setPrompt(`Write a blog post targeting "${keyword}"`)
                }
                render={<button type="button" />}
                title={keyword}
                variant="secondary"
              >
                {keyword}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-1">
        <h2 className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Drafts
        </h2>
        {draftsQuery.isLoading && drafts.length === 0 ? (
          <div className="flex flex-col gap-1 px-2">
            {[0, 1, 2].map((index) => (
              <Skeleton className="h-14 w-full rounded-lg" key={index} />
            ))}
          </div>
        ) : draftsQuery.isError ? (
          <Card className="p-6">
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>Couldn't load drafts</EmptyTitle>
                <EmptyDescription>
                  {draftsQuery.error instanceof Error
                    ? draftsQuery.error.message
                    : "Something went wrong."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  onClick={() => void draftsQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Try again
                </Button>
              </EmptyContent>
            </Empty>
          </Card>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-accent text-muted-foreground">
              <PenLineIcon aria-hidden="true" className="size-5" />
            </span>
            <p className="text-sm font-medium">No drafts yet</p>
            <p className="max-w-64 text-[13px] leading-relaxed text-muted-foreground">
              Describe the post you want above, and Revbot will draft it with
              you.
            </p>
          </div>
        ) : (
          <ul
            className="relative flex flex-col"
            onMouseLeave={rowsPill.clearPill}
          >
            <HoverPill pill={rowsPill.pill} />
            {drafts.map((item, index) => {
              const itemProps = rowsPill.getItemProps(index)
              return (
                <li
                  {...itemProps}
                  className="group relative z-10 flex items-center gap-1 rounded-xl px-2 py-1"
                  key={item.id}
                >
                  <button
                    className="flex min-h-14 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 rounded-lg px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => onOpenDraft(item.id)}
                    onMouseEnter={itemProps.onMouseEnter}
                    type="button"
                  >
                    <span className="w-full truncate text-[15px] font-medium tracking-tight">
                      {draftDisplayTitle(item)}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                      {item.target_keyword ? (
                        <span className="max-w-48 truncate">
                          {item.target_keyword}
                        </span>
                      ) : null}
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatDistanceToNow(new Date(item.updated_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label={`Actions for ${draftDisplayTitle(item)}`}
                          className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <EllipsisIcon aria-hidden="true" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          disabled={deletingId === item.id}
                          onClick={() => void handleDelete(item.id)}
                          variant="destructive"
                        >
                          {deletingId === item.id ? (
                            <Loader2Icon
                              aria-hidden="true"
                              className="animate-spin"
                            />
                          ) : (
                            <TrashIcon aria-hidden="true" />
                          )}
                          Delete draft
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
