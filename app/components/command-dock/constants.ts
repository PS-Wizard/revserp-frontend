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
  "border border-border/70 bg-card/80 p-1.5 backdrop-blur-2xl"

/** Outer height of a capsule: a PILL_BASE row plus the shell's p-1.5. */
export const CAPSULE_HEIGHT = "h-12"

export const CAPSULE_RADIUS = 16

export const PILL_BASE =
  "flex h-9 shrink-0 items-center gap-2 rounded-[11px] px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/** Inner radius of a pill sitting inside a CAPSULE_RADIUS shell with p-1.5. */
export const PILL_RADIUS = 11
