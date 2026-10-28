import { clientApiDelete, clientApiFetch, clientApiPost } from "~/lib/api"

/** One blog draft. Mirrors the backend content-drafts contract exactly. */
export type ContentDraft = {
  id: string
  project_id: string
  conversation_id: string
  title: string
  meta_title: string
  meta_description: string
  target_keyword: string
  /** Document body as markdown. */
  body: string
  created_at: string
  updated_at: string
}

export type ContentDraftSummary = {
  id: string
  title: string
  target_keyword: string
  conversation_id: string
  updated_at: string
}

export type ContentDraftsResponse = {
  drafts: ContentDraftSummary[]
}

export type ContentDraftPatch = Partial<
  Pick<
    ContentDraft,
    "title" | "meta_title" | "meta_description" | "target_keyword" | "body"
  >
>

export function contentDraftsQueryKey(projectId: string) {
  return ["content-drafts", projectId] as const
}

export function contentDraftQueryKey(draftId: string) {
  return ["content-draft", draftId] as const
}

export function fetchContentDrafts(projectId: string) {
  return clientApiFetch<ContentDraftsResponse>(
    `/projects/${projectId}/content/drafts`
  ).then((response) => response.drafts ?? [])
}

export function contentDraftsQueryOptions(projectId: string | null) {
  return {
    queryKey: contentDraftsQueryKey(projectId ?? ""),
    queryFn: () => fetchContentDrafts(projectId!),
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
    enabled: Boolean(projectId),
  }
}

export function fetchContentDraft(draftId: string) {
  return clientApiFetch<ContentDraft>(`/content/drafts/${draftId}`)
}

export function contentDraftQueryOptions(draftId: string | null) {
  return {
    queryKey: contentDraftQueryKey(draftId ?? ""),
    queryFn: () => fetchContentDraft(draftId!),
    staleTime: 10_000,
    gcTime: 60_000,
    retry: false,
    enabled: Boolean(draftId),
  }
}

export function createContentDraft(
  projectId: string,
  body?: { title?: string }
) {
  return clientApiPost<ContentDraft>(
    `/projects/${projectId}/content/drafts`,
    body ?? {}
  )
}

export function patchContentDraft(draftId: string, patch: ContentDraftPatch) {
  return clientApiFetch<ContentDraft>(`/content/drafts/${draftId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
}

export function deleteContentDraft(draftId: string) {
  return clientApiDelete<void>(`/content/drafts/${draftId}`)
}

/**
 * Revbot tool names whose completion means the draft changed server-side.
 * The draft page refetches on these (plus every settled turn).
 */
export const CONTENT_DRAFT_MUTATING_TOOLS: ReadonlySet<string> = new Set([
  "set_outline",
  "write_section",
  "edit_draft",
])

/** List rows show the title, or a placeholder when the draft is untitled. */
export function draftDisplayTitle(draft: { title: string }): string {
  const title = draft.title.trim()
  return title ? title : "Untitled draft"
}
