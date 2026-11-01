import { getInitials } from "~/components/app-navbar/utils"
import { cn } from "~/lib/utils"

/** Stable 0-359 hue from a string, so one person always gets the same color. */
function hueFromSeed(seed: string) {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return Math.abs(hash) % 360
}

export function AccountAvatar({
  name,
  email,
  className,
}: {
  name?: string
  email: string
  className?: string
}) {
  const initials = getInitials(name?.trim() || email.split("@")[0] || "", "R")
  const hue = hueFromSeed(email.toLowerCase())

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-medium text-white select-none",
        className
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, oklch(0.72 0.13 ${hue}), oklch(0.52 0.15 ${(hue + 40) % 360}))`,
        textShadow: "0 1px 1px rgb(0 0 0 / 0.25)",
      }}
    >
      {initials}
    </span>
  )
}
