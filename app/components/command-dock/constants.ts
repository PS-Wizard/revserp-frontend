import type { AuditTab, DashboardView } from "~/components/app-navbar/types"

const DOCK_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.9,
}

const INSTANT = { duration: 0 }

export function dockTransition(reducedMotion: boolean) {
  return reducedMotion ? INSTANT : DOCK_SPRING
}

/**
 * Panel contents fade in only after the morphing box has mostly settled;
 * animating them in lockstep with the layout projection reads as a squish.
 */
export function panelContentMotion(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
    }
  }
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { delay: 0.09, duration: 0.16 } },
    exit: { opacity: 0, transition: { duration: 0.07 } },
  }
}

/** Shell of a dock capsule. Radius is applied inline so motion can tween it. */
export const CAPSULE_SHELL =
  "border border-border/70 bg-card/80 p-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl"

/** Outer height of a capsule: a PILL_BASE row plus the shell's p-1.5. */
export const CAPSULE_HEIGHT = "h-12"

/**
 * Card surface shared by the Revserp AI button and the panel it morphs into.
 * They must match exactly — only one is mounted at a time, so the layoutId
 * hand-off animates geometry but swaps styles in a single frame.
 */
export const PANEL_SURFACE =
  "border border-border/70 bg-card/95 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl"

export const CAPSULE_RADIUS = 16

export const PILL_BASE =
  "flex h-9 shrink-0 items-center gap-2 rounded-[11px] px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/** Inner radius of a pill sitting inside a CAPSULE_RADIUS shell with p-1.5. */
export const PILL_RADIUS = 11

/** Hides the scrollbar on the horizontally scrolling mode rail. */
export const HIDE_SCROLLBAR =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

export const DOCK_MODES: ReadonlyArray<{ id: DashboardView; label: string }> = [
  { id: "revserp-audit", label: "Audit" },
  { id: "revserp-visibility", label: "Visibility" },
  { id: "search-console", label: "Search Console" },
]

/**
 * Grace period before a hover-opened audit flyout closes, so the pointer can
 * cross the gap between the Audit pill and the flyout without it collapsing.
 */
export const AUDIT_FLYOUT_CLOSE_DELAY_MS = 140

export const DOCK_AUDIT_TABS: ReadonlyArray<{ id: AuditTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "seo", label: "SEO" },
  { id: "aeo", label: "AEO" },
  { id: "pagespeed", label: "PageSpeed" },
  { id: "site-graph", label: "Site-Graph" },
]
