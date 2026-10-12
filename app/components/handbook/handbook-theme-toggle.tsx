import { useEffect, useState } from "react"

import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "~/components/ui/button"

export function HandbookThemeToggle() {
  // SSR-stable dark default matches <html class="dark">; synced to the real DOM after hydration.
  const [isDarkMode, setIsDarkMode] = useState(true)

  useEffect(() => {
    const root = document.documentElement
    const syncHandbookTheme = () =>
      setIsDarkMode(root.classList.contains("dark"))
    syncHandbookTheme()
    const observer = new MutationObserver(syncHandbookTheme)
    observer.observe(root, { attributeFilter: ["class"], attributes: true })
    return () => observer.disconnect()
  }, [])

  return (
    <Button
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const nextIsDark =
          !document.documentElement.classList.contains("dark")
        document.documentElement.classList.toggle("dark", nextIsDark)
        try {
          localStorage.setItem(
            "revserp-theme",
            nextIsDark ? "dark" : "light"
          )
        } catch {
          // The theme still changes when browser storage is unavailable.
        }
      }}
      size="icon-lg"
      variant="ghost"
    >
      {isDarkMode ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
