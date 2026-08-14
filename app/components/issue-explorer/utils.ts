import { clientApiFetch } from "~/lib/api"
import type { ScoreBreakdownIssueURLsResponse } from "~/lib/api.types"

import type { BucketScope, MergedIssueUrlRow } from "./types"

/** Stable selection key for a URL row (a URL may appear under multiple issue types). */
export function urlRowKey(row: MergedIssueUrlRow) {
  return `${row.issueTypeId}::${row.url}`
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
  signal?: AbortSignal
): Promise<{ rows: MergedIssueUrlRow[]; total: number }> {
  const response = await clientApiFetch<ScoreBreakdownIssueURLsResponse>(
    `/crawls/${crawlId}/score-breakdown/${bucketScope.pillarId}/${bucketScope.bucketId}/${issueTypeId}/urls?limit=${limit}&offset=${offset}`,
    { signal }
  )

  return {
    total: response.pagination.total,
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

  constructor(
    private crawlId: string,
    private bucketScope: BucketScope,
    private signal?: AbortSignal
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

  private async fillCursor(cursor: IssueTypeCursor, limit: number) {
    const { rows, total } = await fetchIssueTypeUrlsPage(
      this.crawlId,
      this.bucketScope,
      cursor.issueTypeId,
      cursor.issueTypeLabel,
      limit,
      cursor.offset,
      this.signal
    )
    cursor.total = total
    cursor.offset += rows.length
    cursor.buffer = rows
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
  ): Promise<{ rows: MergedIssueUrlRow[]; total: number }> {
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
    }
  }

  /** Fetches and merges every remaining URL (used for explicit "select all"). */
  async loadAll(
    chunkSize = 100
  ): Promise<{ rows: MergedIssueUrlRow[]; total: number }> {
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
    return { rows: this.merged, total }
  }
}
