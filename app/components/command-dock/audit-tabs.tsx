"use client"

import { memo, startTransition, useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"

import type { AuditTab, DashboardView } from "~/components/app-navbar/types"
import { cn } from "~/lib/utils"

import { DOCK_AUDIT_TABS, HIDE_SCROLLBAR, dockTransition } from "./constants"

type AuditTabsProps = {
  view: DashboardView
  auditTab: AuditTab
  onAuditTabChange: (tab: AuditTab) => void
  /** Hidden while a panel owns the island, so it doesn't float over the morph. */
  visible: boolean
  reducedMotion: boolean
}

export const AuditTabs = memo(function AuditTabs({
  view,
  auditTab,
  onAuditTabChange,
  visible,
  reducedMotion,
}: AuditTabsProps) {
  const [visualTab, setVisualTab] = useState(auditTab)

  useEffect(() => {
    setVisualTab(auditTab)
  }, [auditTab])

  const activeIndex = Math.max(
    0,
    DOCK_AUDIT_TABS.findIndex((tab) => tab.id === visualTab)
  )

  return (
    <AnimatePresence initial={false}>
      {visible && view === "revserp-audit" ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          aria-label="Audit sections"
          className={cn(
            "pointer-events-auto max-w-full self-start overflow-x-auto rounded-[18px] border border-border/70 bg-card/80 p-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl",
            HIDE_SCROLLBAR
          )}
          exit={{ opacity: 0, y: 8 }}
          initial={{ opacity: 0, y: 8 }}
          key="dock-audit-tabs"
          role="group"
          transition={dockTransition(reducedMotion)}
        >
          <div className="relative grid w-max grid-cols-[repeat(5,5.25rem)]">
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 w-[5.25rem] rounded-[13px] bg-foreground shadow-[0_6px_18px_rgb(0_0_0_/_0.18)] transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                reducedMotion && "transition-none"
              )}
              style={{
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
                    "relative z-10 flex h-9 items-center justify-center rounded-[13px] px-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    selected
                      ? "text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  key={tab.id}
                  onClick={() => {
                    setVisualTab(tab.id)
                    startTransition(() => onAuditTabChange(tab.id))
                  }}
                  type="button"
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
})
