"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { MAX_PROJECT_KEYWORDS_PER_SOURCE } from "~/components/keyword-management/project-keyword-cards"

import { keywordErrorMessage } from "~/components/keyword-management/keyword-card-parts"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  applyProjectKeywordListsResponse,
  createProjectKeyword,
  normalizeProjectKeywordLists,
  projectKeywordListsQueryOptions,
} from "~/lib/project-keywords-query"

const MAX_NON_BRAND_KEYWORDS = MAX_PROJECT_KEYWORDS_PER_SOURCE.non_brand

const revealClass =
  "shrink-0 self-center rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"

/** Hover-revealed "+" that saves a keyword to our project's non-brand list. Hidden without manage rights. */
export function AddNonBrandKeywordButton({
  projectId,
  keyword,
}: {
  projectId: string
  keyword: string
}) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const { data } = useQuery(projectKeywordListsQueryOptions(projectId))
  const lists = normalizeProjectKeywordLists(data)
  if (!lists.can_manage_keywords) return null

  const key = keyword.trim().toLowerCase()
  const added = lists.combined.some((row) => row.keyword.toLowerCase() === key)
  const full =
    lists.user_defined.filter((row) => row.kind === "non_brand").length >=
    MAX_NON_BRAND_KEYWORDS

  async function add() {
    if (busy) return
    setBusy(true)
    try {
      const response = await createProjectKeyword(projectId, {
        keyword: keyword.trim(),
        kind: "non_brand",
      })
      await applyProjectKeywordListsResponse(queryClient, projectId, response)
      // Compare-tab coverage cards are built from our non-brand list.
      void queryClient.invalidateQueries({ queryKey: ["competitor-gap"] })
      toast.success(`Added "${keyword}" to non-brand keywords`)
    } catch (error) {
      toast.error(keywordErrorMessage(error, "Could not add keyword."))
    } finally {
      setBusy(false)
    }
  }

  const unavailable = added || full
  const label = added
    ? "Already in your keywords"
    : full
      ? `Non-brand keyword list is full (${MAX_NON_BRAND_KEYWORDS} max)`
      : "Add to non-brand keywords"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-disabled={unavailable || busy}
            aria-label={
              added || full ? label : `Add "${keyword}" to non-brand keywords`
            }
            className={`${revealClass} ${unavailable || busy ? "cursor-not-allowed" : ""}`}
            onClick={(event) => {
              event.stopPropagation()
              if (!unavailable) void add()
            }}
            type="button"
          />
        }
      >
        {added ? (
          <CheckIcon aria-hidden="true" className="size-3.5" />
        ) : (
          <PlusIcon aria-hidden="true" className="size-3.5" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
