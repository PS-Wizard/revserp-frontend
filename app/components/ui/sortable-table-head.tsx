import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import type { ReactNode } from "react"

import { TableHead } from "~/components/ui/table"

export type SortableTableDirection = "asc" | "desc"

/**
 * Smallest shared sortable `th`: GSC/GA button styling with `aria-sort`.
 * Pass `indicator` only to keep a legacy glyph (GSC uses its ↕/↑/↓ text);
 * otherwise an arrow icon shows on the active column.
 */
export function SortableTableHead({
  active,
  direction,
  onToggle,
  className,
  indicator,
  children,
}: {
  active: boolean
  direction: SortableTableDirection
  onToggle: () => void
  className?: string
  indicator?: ReactNode
  children: ReactNode
}) {
  return (
    <TableHead
      aria-sort={
        active
          ? direction === "desc"
            ? "descending"
            : "ascending"
          : "none"
      }
      className={className}
    >
      <button
        className="inline-flex items-center gap-2"
        onClick={onToggle}
        type="button"
      >
        {children}
        {indicator ??
          (active ? (
            direction === "desc" ? (
              <ArrowDownIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <ArrowUpIcon aria-hidden="true" className="size-3.5" />
            )
          ) : null)}
      </button>
    </TableHead>
  )
}
