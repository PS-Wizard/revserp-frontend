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

export const CAPSULE_RADIUS = 16