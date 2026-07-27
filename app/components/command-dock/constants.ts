import type { AuditTab, DashboardView } from "~/components/app-navbar/types"

/**
 * Mutually exclusive dock states. Opening one panel closes the other by
 * construction — there is no separate "is project open" / "is AI open" flag.
 */
export type DockView = "idle" | "project" | "ai-mini" | "ai-max"

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

// Deliberately no `filter: blur()` here: these capsules also carry a
// backdrop-filter, and animating both together forces a full re-rasterize of
// the blurred backdrop every frame.
export const CAPSULE_SHOWN = { opacity: 1, y: 0, scale: 1 }
export const CAPSULE_HIDDEN = { opacity: 0, y: 6, scale: 0.96 }

/** Capsules that only fade (no layoutId morph) exit faster than they enter. */
export const CAPSULE_EXIT_TRANSITION = {
  duration: 0.16,
  ease: "easeIn" as const,
}

/** Shell of a dock capsule. Radius is applied inline so motion can tween it. */
export const CAPSULE_SHELL =
  "border border-border/70 bg-card/80 p-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl"

export const CAPSULE_RADIUS = 20

export const PILL_BASE =
  "flex h-11 shrink-0 items-center gap-2 rounded-[15px] px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/** Inner radius of a pill sitting inside a CAPSULE_RADIUS shell with p-1.5. */
export const PILL_RADIUS = 15

/** Hides the scrollbar on the horizontally scrolling mode rail. */
export const HIDE_SCROLLBAR =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

export const DOCK_MODES: ReadonlyArray<{ id: DashboardView; label: string }> = [
  { id: "revserp-audit", label: "Audit" },
  { id: "revserp-visibility", label: "Visibility" },
  { id: "search-console", label: "Search Console" },
]

export const DOCK_AUDIT_TABS: ReadonlyArray<{ id: AuditTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "seo", label: "SEO" },
  { id: "aeo", label: "AEO" },
  { id: "pagespeed", label: "PageSpeed" },
  { id: "site-graph", label: "Site-Graph" },
]
