const SCROLL_KEYS = new Set([
  " ",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
])

function isTourInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest(".driver-popover,.driver-active-element")) return true
  return (
    target.closest(
      "input,textarea,select,[contenteditable],button,a,[role=button]",
    ) !== null
  )
}

export function lockOnboardingScroll(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(event.key) || event.defaultPrevented) return
    if (isTourInteractive(event.target)) return
    event.preventDefault()
  }
  document.addEventListener("keydown", onKeyDown)
  return () => document.removeEventListener("keydown", onKeyDown)
}
