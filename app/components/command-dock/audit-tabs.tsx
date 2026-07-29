"use client"

import { memo, startTransition, useEffect, useState } from "react"
import { motion } from "motion/react"

import type { AuditTab, DashboardView } from "~/components/app-navbar/types"
import { cn } from "~/lib/utils"

import { DOCK_AUDIT_TABS, HIDE_SCROLLBAR, dockTransition } from "./constants"

type AuditTabsProps = {
  auditTab: AuditTab
  onAuditTabChange: (tab: AuditTab) => void
  /** Picking a sub-tab from another view also switches into the audit view. */
  onViewChange: (view: DashboardView) => void
  onHoverStart: () => void
  onHoverEnd: () => void
  reducedMotion: boolean
}

/**
 * Audit sub-tabs, rendered as a flyout anchored under the Audit pill. The
 * top padding is part of this element rather than the anchor so the gap
 * between pill and flyout is still a hover target — moving the pointer down
 * lands inside a descendant and never triggers the anchor's pointerleave.
 */
export const AuditTabs = memo(function AuditTabs({
  auditTab,
  onAuditTabChange,
  onViewChange,
  onHoverStart,
  onHoverEnd,
  reducedMotion,
}: AuditTabsProps) {
  // Move the indicator on click rather than waiting for the (transitioned)
  // parent state, so the flyout feels immediate even when the panel behind it
  // takes a moment to swap.
  const [visualTab, setVisualTab] = useState(auditTab)

  useEffect(() => {
    setVisualTab(auditTab)
  }, [auditTab])

  const activeIndex = Math.max(
    0,
    DOCK_AUDIT_TABS.findIndex((tab) => tab.id === visualTab)
  )

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      // pointer-events-auto covers the pt-2 strip too, so the gap between pill
      // and flyout is a real hit target rather than relying on the close grace.
      className="pointer-events-auto absolute top-full left-0 z-20 pt-2"
      exit={{ opacity: 0, y: -6 }}
      initial={{ opacity: 0, y: -6 }}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      transition={dockTransition(reducedMotion)}
    >
      <div
        aria-label="Audit sections"
        // Lighter than CAPSULE_SHELL so a floating menu reads as raised rather
        // than painted on the page, but kept on the muted token: a flat literal
        // grey light enough to stand out on its own just looks washed out.
        // The inset top highlight carries most of the elevation cue.
        className={cn(
          "max-w-[calc(100vw-2rem)] overflow-x-auto rounded-[14px] border border-input bg-muted/90 p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl",
          HIDE_SCROLLBAR
        )}
        role="group"
      >
        {/* Equal columns sized to the widest label, not to a fixed rem: `w-max`
            resolves each 1fr track to the largest max-content contribution, so
            no label can be clipped or wrapped no matter how long it is. The
            minmax floor keeps short labels (SEO, AEO) from looking cramped. */}
        <div
          className="relative grid w-max"
          style={{
            gridTemplateColumns: `repeat(${DOCK_AUDIT_TABS.length}, minmax(4.5rem, 1fr))`,
          }}
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 rounded-[9px] bg-foreground shadow-[0_6px_18px_rgb(0_0_0_/_0.18)] transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
              reducedMotion && "transition-none"
            )}
            style={{
              // One column wide, stepped a whole column at a time. Derived from
              // the tab count so adding a tab cannot desync the indicator.
              width: `${100 / DOCK_AUDIT_TABS.length}%`,
              transform: `translate3d(${activeIndex * 100}%, 0, 0)`,
            }}
          />
          {DOCK_AUDIT_TABS.map((tab) => {
            const selected = tab.id === visualTab
            return (
              <button
                aria-current={selected ? "page" : undefined}
                aria-pressed={selected}
                className={cn(
                  "relative z-10 flex h-8 items-center justify-center rounded-[9px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selected
                    ? "text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={tab.id}
                onClick={() => {
                  setVisualTab(tab.id)
                  startTransition(() => {
                    onViewChange("revserp-audit")
                    onAuditTabChange(tab.id)
                  })
                }}
                type="button"
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
})
