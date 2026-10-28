import { afterEach, describe, expect, test } from "bun:test"

import {
  CONTENT_DRAFT_MUTATING_TOOLS,
  contentDraftQueryKey,
  contentDraftsQueryKey,
  createContentDraft,
  deleteContentDraft,
  draftDisplayTitle,
  fetchContentDraft,
  fetchContentDrafts,
  patchContentDraft,
} from "./content-drafts-api"

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function installFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === "string" ? input : input.toString()
    calls.push({ url, init })
    return Response.json(handler(url, init))
  }) as typeof fetch
  return calls
}

const draft = {
  id: "draft-1",
  project_id: "project-1",
  conversation_id: "conv-1",
  title: "Local SEO for dentists",
  meta_title: "",
  meta_description: "",
  target_keyword: "local seo dentists",
  body: "# Hello",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
}

describe("content drafts api", () => {
  test("query keys scope project lists and drafts separately", () => {
    expect(contentDraftsQueryKey("p1")).toEqual(["content-drafts", "p1"])
    expect(contentDraftQueryKey("d1")).toEqual(["content-draft", "d1"])
  })

  test("list reads the drafts array", async () => {
    const calls = installFetch(() => ({
      drafts: [
        {
          id: "draft-1",
          title: "",
          target_keyword: "kw",
          conversation_id: "conv-1",
          updated_at: draft.updated_at,
        },
      ],
    }))
    const drafts = await fetchContentDrafts("project-1")
    expect(drafts).toHaveLength(1)
    expect(calls[0].url).toContain("/projects/project-1/content/drafts")
    expect(calls[0].init?.method ?? "GET").toBe("GET")
  })

  test("create posts an empty object when no title is given", async () => {
    const calls = installFetch(() => draft)
    await createContentDraft("project-1")
    expect(calls[0].url).toContain("/projects/project-1/content/drafts")
    expect(calls[0].init?.method).toBe("POST")
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({})
  })

  test("patch sends only the changed subset", async () => {
    const calls = installFetch(() => draft)
    await patchContentDraft("draft-1", {
      body: "# Updated",
      meta_title: "T",
    })
    expect(calls[0].url).toContain("/content/drafts/draft-1")
    expect(calls[0].init?.method).toBe("PATCH")
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      body: "# Updated",
      meta_title: "T",
    })
  })

  test("detail and delete hit the draft endpoint", async () => {
    const calls = installFetch(() => draft)
    await fetchContentDraft("draft-1")
    expect(calls[0].url).toContain("/content/drafts/draft-1")
    globalThis.fetch = realFetch
    const deletes = installFetch(() => null)
    await deleteContentDraft("draft-1")
    expect(deletes[0].url).toContain("/content/drafts/draft-1")
    expect(deletes[0].init?.method).toBe("DELETE")
  })

  test("untitled drafts fall back to a placeholder label", () => {
    expect(draftDisplayTitle({ title: "  " })).toBe("Untitled draft")
    expect(draftDisplayTitle({ title: " Guide " })).toBe("Guide")
  })

  test("only the draft-writing tools trigger a refetch", () => {
    expect(CONTENT_DRAFT_MUTATING_TOOLS.has("set_outline")).toBe(true)
    expect(CONTENT_DRAFT_MUTATING_TOOLS.has("write_section")).toBe(true)
    expect(CONTENT_DRAFT_MUTATING_TOOLS.has("edit_draft")).toBe(true)
    expect(CONTENT_DRAFT_MUTATING_TOOLS.has("read_draft")).toBe(false)
    expect(CONTENT_DRAFT_MUTATING_TOOLS.has("search_console")).toBe(false)
  })
})
