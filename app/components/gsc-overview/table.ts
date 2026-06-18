import type { GSCDimensionTab, TableRow, TableSortColumn, TableSortDirection } from "./types"

export type TableSortState = {
  column: TableSortColumn
  direction: TableSortDirection
}

export function filterTableRows(rows: TableRow[], tableSearch: string) {
  const normalizedSearch = tableSearch.trim().toLowerCase()
  if (!normalizedSearch) return rows
  return rows.filter((row) => row.label.toLowerCase().includes(normalizedSearch))
}

export function sortTableRows(rows: TableRow[], tableSort: TableSortState) {
  return [...rows].sort((leftRow, rightRow) => {
    const leftValue = leftRow[tableSort.column]
    const rightValue = rightRow[tableSort.column]

    if (tableSort.column === "label") {
      const comparison = String(leftValue).localeCompare(String(rightValue))
      return tableSort.direction === "asc" ? comparison : -comparison
    }

    const comparison = Number(leftValue) - Number(rightValue)
    return tableSort.direction === "asc" ? comparison : -comparison
  })
}

export function nextTableSortState(
  currentSort: TableSortState,
  column: TableSortColumn
): TableSortState {
  if (currentSort.column === column) {
    return {
      column,
      direction: currentSort.direction === "asc" ? "desc" : "asc",
    }
  }

  return {
    column,
    direction: column === "label" ? "asc" : "desc",
  }
}

export function sortIndicator(currentSort: TableSortState, column: TableSortColumn) {
  if (currentSort.column !== column) return "↕"
  return currentSort.direction === "asc" ? "↑" : "↓"
}

export function dimensionTabLabel(tab: GSCDimensionTab) {
  return tab === "queries"
    ? "Queries"
    : tab === "pages"
      ? "Pages"
      : tab === "countries"
        ? "Countries"
        : "Devices"
}
