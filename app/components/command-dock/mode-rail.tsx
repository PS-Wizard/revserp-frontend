"use client"

import { memo } from "react"
import { motion } from "motion/react"

import type { DashboardView } from "~/components/app-navbar/types"
import { cn } from "~/lib/utils"

import {
  DOCK_MODES,
  HIDE_SCROLLBAR,
  PILL_BASE,
  dockTransition,
} from "./constants"

type ModeRailProps = {
  view: DashboardView
  onViewChange: (view: DashboardView) => void
  /** Present only while a comparison is open. */
  compareLabel: string | null
  reducedMotion: boolean
}

export const ModeRail = memo(function ModeRail({
  view,
  onViewChange,
  compareLabel,
  reducedMotion,
}: ModeRailProps) {
  const modes = compareLabel
    ? [...DOCK_MODES, { id: "compare" as DashboardView, label: compareLabel }]
    : DOCK_MODES

  return (
    <div
      aria-label="Primary navigation"
      className={cn(
        "flex h-full min-w-0 items-center gap-1 overflow-x-auto",
        HIDE_SCROLLBAR
      )}
      role="navigation"
    >
      {modes.map((mode) => {
        const selected = mode.id === view
        return (
          <button
            aria-current={selected ? "page" : undefined}
            aria-pressed={selected}
            className={cn(
              "relative isolate max-w-40",
              PILL_BASE,
              selected
                ? "text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={mode.id}
            onClick={() => onViewChange(mode.id)}
            type="button"
          >
            {selected ? (
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-[15px] bg-foreground shadow-[0_6px_18px_rgb(0_0_0_/_0.18)]"
                layoutId="dock-active-mode"
                transition={dockTransition(reducedMotion)}
              />
            ) : null}
            <span className="truncate">{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
})
