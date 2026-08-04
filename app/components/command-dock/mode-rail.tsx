"use client"

import { memo } from "react"
import { motion } from "motion/react"

import type { AuditTab, DashboardView } from "~/components/app-navbar/types"
import { useFeatures } from "~/lib/features"
import { cn } from "~/lib/utils"

import {
  DOCK_AUDIT_TABS,
  DOCK_MODES,
  HIDE_SCROLLBAR,
  PILL_BASE,
  dockTransition,
} from "./constants"

type ModeRailProps = {
  view: DashboardView
  onViewChange: (view: DashboardView) => void
  /** Appended to the Audit pill while the audit view is the active one. */
  auditTab: AuditTab
  /** Present only while a comparison is open. */
  compareLabel: string | null
  /** True while the audit sub-tab flyout is showing, for aria-expanded. */
  auditFlyoutOpen: boolean
  onAuditHoverStart: () => void
  onAuditHoverEnd: () => void
  reducedMotion: boolean
}

export const ModeRail = memo(function ModeRail({
  view,
  onViewChange,
  auditTab,
  compareLabel,
  auditFlyoutOpen,
  onAuditHoverStart,
  onAuditHoverEnd,
  reducedMotion,
}: ModeRailProps) {
  const features = useFeatures()

  // Search Console is gated per workspace. Its routes reject independently, so
  // dropping the pill only spares the user a dead end.
  const availableModes = features.gsc_connector
    ? DOCK_MODES
    : DOCK_MODES.filter((mode) => mode.id !== "search-console")

  const modes = compareLabel
    ? [
        ...availableModes,
        { id: "compare" as DashboardView, label: compareLabel },
      ]
    : availableModes

  // Only while audit is the active view: on another view no audit sub-tab is
  // current, so claiming one in the rail would misreport where you are.
  const activeAuditLabel =
    view === "revserp-audit"
      ? DOCK_AUDIT_TABS.find((tab) => tab.id === auditTab)?.label
      : undefined

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
        // Audit owns the sub-tab flyout, so it also reports its expanded state
        // and drives the hover intent. Focus counts as hover intent so the
        // flyout is reachable without a pointer.
        const isAudit = mode.id === "revserp-audit"
        return (
          <button
            aria-current={selected ? "page" : undefined}
            aria-expanded={isAudit ? auditFlyoutOpen : undefined}
            aria-pressed={selected}
            className={cn(
              "relative isolate",
              // Audit carries two labels and a separator, so it needs more room
              // before truncation kicks in.
              isAudit ? "max-w-60" : "max-w-40",
              PILL_BASE,
              selected
                ? "text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={mode.id}
            onClick={() => onViewChange(mode.id)}
            onFocus={isAudit ? onAuditHoverStart : undefined}
            onPointerEnter={isAudit ? onAuditHoverStart : onAuditHoverEnd}
            onPointerLeave={isAudit ? onAuditHoverEnd : undefined}
            type="button"
          >
            {selected ? (
              <motion.span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-[11px] bg-foreground shadow-[0_6px_18px_rgb(0_0_0_/_0.18)]"
                layoutId="dock-active-mode"
                transition={dockTransition(reducedMotion)}
              />
            ) : null}
            {isAudit && activeAuditLabel ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span>{mode.label}</span>
                {/* bg-current so the dot follows the pill's own text colour,
                    inverting with it when the pill becomes active. */}
                <span
                  aria-hidden
                  className="size-1 shrink-0 rounded-full bg-current opacity-55"
                />
                <span className="truncate">{activeAuditLabel}</span>
              </span>
            ) : (
              <span className="truncate">{mode.label}</span>
            )}
          </button>
        )
      })}
    </div>
  )
})
