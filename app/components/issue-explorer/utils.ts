import { clientApiFetch } from "~/lib/api"
import type { ScoreBreakdownIssueURLsResponse } from "~/lib/api.types"

import type { IssueScope, MergedIssueUrlRow } from "./types"

export function formatPenalty(value: number) {
  return Number(value.toFixed(2)).toString()
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

export function getSelectionLabel(values: string[], fallback: string) {
  if (!values.length) {
    return fallback
  }

  if (values.length === 1) {
    return values[0]
  }

  return `${values.length} selected`
}

export function toggleSelection(
  value: string,
  selectedValues: string[],
  setSelectedValues: (values: string[]) => void,
  allowEmpty: boolean
) {
  const isSelected = selectedValues.includes(value)

  if (isSelected) {
    if (!allowEmpty && selectedValues.length === 1) {
      return
    }

    setSelectedValues(selectedValues.filter((item) => item !== value))
    return
  }

  setSelectedValues([...selectedValues, value])
}

export async function fetchAllIssueUrls(
  crawlId: string,
  issueScope: IssueScope
) {
  const pageSize = 100
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  const rows: MergedIssueUrlRow[] = []

  while (offset < total) {
    const response = await clientApiFetch<ScoreBreakdownIssueURLsResponse>(
      `/crawls/${crawlId}/score-breakdown/${issueScope.pillarId}/${issueScope.bucketId}/${issueScope.issueTypeId}/urls?limit=${pageSize}&offset=${offset}`
    )

    total = response.pagination.total
    rows.push(
      ...response.urls.map((row) => ({
        ...row,
        source: `${issueScope.pillarLabel} / ${issueScope.bucketLabel} / ${issueScope.issueTypeLabel}`,
        pillarId: issueScope.pillarId,
        pillarLabel: issueScope.pillarLabel,
        bucketId: issueScope.bucketId,
        bucketLabel: issueScope.bucketLabel,
        issueTypeId: issueScope.issueTypeId,
        issueTypeLabel: issueScope.issueTypeLabel,
      }))
    )
    offset += response.urls.length

    if (!response.urls.length) {
      break
    }
  }

  return rows
}
