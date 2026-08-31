import { clientApiFetch } from "~/lib/api"
import type { ScoreBreakdownIssueURLsResponse } from "~/lib/api.types"
import type { IssueWorkStateResponse } from "~/components/summary/issue-workspace.types"

import type { BucketScope, MergedIssueUrlRow } from "./types"

export type WorkStatusFilter = "all" | "needs_action" | "marked_done"

type UrlRowWork = NonNullable<MergedIssueUrlRow["work"]>

export function workFromMarkResponse(
  response: IssueWorkStateResponse
): UrlRowWork {
  return {
    attempt_id: response.attempt_id,
    status: response.status,
    locked: response.locked,
    contributed_by_me: true,
  }
}

export function workFromUndoResponse(
  response: IssueWorkStateResponse
): UrlRowWork | undefined {
  if (!response.contributors.length) return undefined
  return {
    attempt_id: response.attempt_id,
    status: response.status,
    locked: response.locked,
    contributed_by_me: false,
  }
}

export function matchesWorkStatusFilter(
  work: MergedIssueUrlRow["work"],
  filter: WorkStatusFilter
): boolean {
  if (filter === "all") return true
  const status = work?.status
  if (filter === "marked_done") {
    return status === "awaiting_verification" || status === "not_verified"
  }
  return (
    !status || (status !== "awaiting_verification" && status !== "not_verified")
  )
}

function applyWorkToRow(
  row: MergedIssueUrlRow,
  issueId: string,
  work: MergedIssueUrlRow["work"]
): MergedIssueUrlRow {
  if (row.issue_id !== issueId) return row
  return { ...row, work }
}

/** Stable selection key for a URL row (a URL may appear under multiple issue types). */
export function urlRowKey(row: MergedIssueUrlRow) {
  return `${row.issueTypeId}::${row.url}`
}

export function urlFromRowKey(key: string) {
  const separatorIndex = key.indexOf("::")
  return separatorIndex === -1 ? key : key.slice(separatorIndex + 2)
}

export const MAX_RECOMMEND_FIXES_URLS = 10

export function buildRecommendFixesPrompt({
  pillarLabel,
  bucketLabel,
  issueTypeLabel,
  urls,
}: {
  pillarLabel: string
  bucketLabel: string
  issueTypeLabel: string
  urls: string[]
}) {
  const scope = `${pillarLabel} -> ${bucketLabel} -> ${issueTypeLabel}`
  const urlPhrase = urls.length === 1 ? "this url" : "these urls"
  const list = urls.map((url) => `- ${url}`).join("\n")
  return `Help me fix ${scope} issues for ${urlPhrase}:\n${list}`
}

export function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

/** Fetches one page of affected URLs for a single issue type, tagged with its issue type. */
async function fetchIssueTypeUrlsPage(
  crawlId: string,
  bucketScope: BucketScope,
  issueTypeId: string,
  issueTypeLabel: string,
  limit: number,
  offset: number,
  workStatus: WorkStatusFilter,
  signal?: AbortSignal
): Promise<{
  rows: MergedIssueUrlRow[]
  total: number
  workActionsEnabled: boolean
}> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  if (workStatus !== "all") params.set("work_status", workStatus)
  const response = await clientApiFetch<ScoreBreakdownIssueURLsResponse>(
    `/crawls/${crawlId}/score-breakdown/${bucketScope.pillarId}/${bucketScope.bucketId}/${issueTypeId}/urls?${params.toString()}`,
    { signal }
  )

  return {
    total: response.pagination.total,
    workActionsEnabled: response.work_actions_enabled ?? true,
    rows: response.urls.map((row) => ({
      ...row,
      source: issueTypeLabel,
      pillarId: bucketScope.pillarId,
      pillarLabel: bucketScope.pillarLabel,
      bucketId: bucketScope.bucketId,
      bucketLabel: bucketScope.bucketLabel,
      issueTypeId,
      issueTypeLabel,
    })),
  }
}

type IssueTypeCursor = {
  issueTypeId: string
  issueTypeLabel: string
  offset: number
  total: number | null
  buffer: MergedIssueUrlRow[]
  exhausted: boolean
}

/**
 * Lazily merges the paginated (url-sorted) URL lists of every issue type in a
 * bucket, fetching only as many pages from the server as are needed to
 * satisfy the requested page/page-size — instead of loading every URL for
 * every issue type up front.
 */
export class BucketUrlPager {
  private cursors: IssueTypeCursor[]
  private merged: MergedIssueUrlRow[] = []
  private workActionsEnabled: boolean | null = null

  constructor(
    private crawlId: string,
    private bucketScope: BucketScope,
    private signal?: AbortSignal,
    private workStatus: WorkStatusFilter = "all"
  ) {
    this.cursors = bucketScope.bucket.issues.map((issueType) => ({
      issueTypeId: issueType.id,
      issueTypeLabel: issueType.label,
      offset: 0,
      total: null,
      buffer: [],
      exhausted: false,
    }))
  }

  /** URL rows fetched so far, in ascending URL order. */
  get loadedRows(): MergedIssueUrlRow[] {
    return this.merged
  }

  get workEnabled(): boolean {
    return this.workActionsEnabled ?? true
  }

  private async fillCursor(cursor: IssueTypeCursor, limit: number) {
    const { rows, total, workActionsEnabled } = await fetchIssueTypeUrlsPage(
      this.crawlId,
      this.bucketScope,
      cursor.issueTypeId,
      cursor.issueTypeLabel,
      limit,
      cursor.offset,
      this.workStatus,
      this.signal
    )
    cursor.total = total
    cursor.offset += rows.length
    cursor.buffer = rows
    if (this.workActionsEnabled === null)
      this.workActionsEnabled = workActionsEnabled
    if (!rows.length || cursor.offset >= total) cursor.exhausted = true
  }

  private async mergeUntil(predicate: () => boolean, chunkSize: number) {
    while (
      !predicate() &&
      this.cursors.some((cursor) => !cursor.exhausted || cursor.buffer.length)
    ) {
      if (this.signal?.aborted) break

      await Promise.all(
        this.cursors
          .filter((cursor) => !cursor.exhausted && !cursor.buffer.length)
          .map((cursor) => this.fillCursor(cursor, chunkSize))
      )

      const candidates = this.cursors.filter((cursor) => cursor.buffer.length)
      if (!candidates.length) break

      const next = candidates.reduce((min, cursor) =>
        cursor.buffer[0].url.localeCompare(min.buffer[0].url) < 0 ? cursor : min
      )
      this.merged.push(next.buffer.shift() as MergedIssueUrlRow)
    }
  }

  /** Returns the rows for `pageIndex` (0-based) and the total URL count across all issue types. */
  async getPage(
    pageIndex: number,
    pageSize: number
  ): Promise<{
    rows: MergedIssueUrlRow[]
    total: number
    workActionsEnabled: boolean
  }> {
    const requiredCount = (pageIndex + 1) * pageSize
    await this.mergeUntil(() => this.merged.length >= requiredCount, pageSize)

    const total = this.cursors.reduce(
      (sum, cursor) => sum + (cursor.total ?? 0),
      0
    )
    return {
      rows: this.merged.slice(
        pageIndex * pageSize,
        pageIndex * pageSize + pageSize
      ),
      total,
      workActionsEnabled: this.workEnabled,
    }
  }

  /** Fetches and merges every remaining URL (used for explicit "select all"). */
  async loadAll(chunkSize = 100): Promise<{
    rows: MergedIssueUrlRow[]
    total: number
    workActionsEnabled: boolean
  }> {
    await this.mergeUntil(
      () =>
        this.cursors.every(
          (cursor) => cursor.exhausted && !cursor.buffer.length
        ),
      chunkSize
    )
    const total = this.cursors.reduce(
      (sum, cursor) => sum + (cursor.total ?? 0),
      0
    )
    return { rows: this.merged, total, workActionsEnabled: this.workEnabled }
  }

  /** Keep pager cache aligned after a work mutation without resetting pagination. */
  patchWorkForIssue(
    issueId: string,
    work: MergedIssueUrlRow["work"],
    filter: WorkStatusFilter
  ) {
    const updateRows = (rows: MergedIssueUrlRow[]) =>
      rows
        .map((row) => applyWorkToRow(row, issueId, work))
        .filter((row) => matchesWorkStatusFilter(row.work, filter))

    this.merged = updateRows(this.merged)
    for (const cursor of this.cursors) {
      cursor.buffer = updateRows(cursor.buffer)
    }
  }
}
