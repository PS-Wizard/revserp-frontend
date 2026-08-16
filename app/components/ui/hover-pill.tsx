import type { CSSProperties, ReactNode } from "react"
import { useRef, useState } from "react"

import {
  DropdownMenuContent,
} from "~/components/ui/dropdown-menu"
import { cn } from "~/lib/utils"

export const HOVER_PILL_TRANSITION =
  "top 150ms cubic-bezier(0.23,1,0.32,1), height 150ms cubic-bezier(0.23,1,0.32,1), opacity 120ms ease"

export const DROPDOWN_PILL_ITEM_CLASS =
  "relative z-10 focus:bg-transparent focus:text-current data-highlighted:bg-transparent data-highlighted:text-current focus-visible:bg-accent focus-visible:text-accent-foreground"

export type HoverPillRect = { height: number; top: number } | null

export function hoverPillMotionStyle(pill: HoverPillRect): CSSProperties {
  return {
    height: pill?.height ?? 0,
    opacity: pill ? 1 : 0,
    top: pill?.top ?? 0,
    transition: HOVER_PILL_TRANSITION,
  }
}

export function HoverPill({
  className,
  pill,
}: {
  className?: string
  pill: HoverPillRect
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-1 z-0 rounded-[6px] bg-accent",
        className
      )}
      style={hoverPillMotionStyle(pill)}
    />
  )
}

export function useHoverPill() {
  const [pill, setPill] = useState<HoverPillRect>(null)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  function showPill(index: number) {
    const target = itemRefs.current[index]
    if (!target) {
      setPill(null)
      return
    }
    setPill({
      height: target.offsetHeight,
      top: target.offsetTop,
    })
  }

  function clearPill() {
    setPill(null)
  }

  function getItemProps(index: number) {
    return {
      className: DROPDOWN_PILL_ITEM_CLASS,
      onMouseEnter: () => showPill(index),
      ref: (element: HTMLElement | null) => {
        itemRefs.current[index] = element
      },
    }
  }

  return { clearPill, getItemProps, pill, showPill }
}

/** Sidebar / keyed menus — pill state stays inside the nav subtree. */
export function useKeyedHoverPill() {
  const [pill, setPill] = useState<HoverPillRect>(null)
  const itemRefs = useRef<Record<string, HTMLElement | null>>({})

  function showPill(id: string) {
    const target = itemRefs.current[id]
    if (!target) {
      setPill(null)
      return
    }
    setPill({
      height: target.offsetHeight,
      top: target.offsetTop,
    })
  }

  function clearPill() {
    setPill(null)
  }

  function setItemRef(id: string) {
    return (element: HTMLElement | null) => {
      itemRefs.current[id] = element
    }
  }

  return { clearPill, pill, setItemRef, showPill }
}

export type HoverPillMenu = ReturnType<typeof useHoverPill>

/** Dropdown content with isolated pill state — hover won't re-render the shell. */
export function DropdownPillSurface({
  children,
  className,
  pillClassName,
  ...contentProps
}: Omit<React.ComponentProps<typeof DropdownMenuContent>, "children"> & {
  children: (menu: HoverPillMenu) => ReactNode
  pillClassName?: string
}) {
  const menu = useHoverPill()

  return (
    <DropdownMenuContent
      className={cn("relative", className)}
      onMouseLeave={menu.clearPill}
      {...contentProps}
    >
      <HoverPill className={pillClassName} pill={menu.pill} />
      {children(menu)}
    </DropdownMenuContent>
  )
}

export function useTablePill() {
  const [pill, setPill] = useState<HoverPillRect>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])

  function showPill(index: number) {
    const container = containerRef.current
    const row = rowRefs.current[index]
    if (!container || !row) {
      setPill(null)
      return
    }
    const containerBox = container.getBoundingClientRect()
    const rowBox = row.getBoundingClientRect()
    setPill({ height: rowBox.height, top: rowBox.top - containerBox.top })
  }

  function clearPill() {
    setPill(null)
  }

  return { clearPill, containerRef, pill, rowRefs, showPill }
}

export function TableHoverPill({
  pill,
}: {
  pill: HoverPillRect
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-0 bg-accent"
      style={hoverPillMotionStyle(pill)}
    />
  )
}
