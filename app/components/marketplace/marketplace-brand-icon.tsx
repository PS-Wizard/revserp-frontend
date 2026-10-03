import { useState } from "react"
import { PlugIcon } from "lucide-react"

import { cn } from "~/lib/utils"
import { MARKETPLACE_BRAND_INITIALS } from "./marketplace-catalog"

/**
 * Brand mark for a catalogue row or connection. A known provider without a
 * usable asset shows its initials; anything else shows a plug.
 */
export function MarketplaceBrandIcon({
  id,
  logo,
  className,
}: {
  id?: string
  logo?: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!logo || failed) {
    const initials = id ? MARKETPLACE_BRAND_INITIALS[id] : undefined
    if (initials) {
      return (
        <span
          aria-hidden="true"
          className={cn(
            "text-[0.625rem] leading-none font-semibold tracking-tight text-muted-foreground",
            className
          )}
        >
          {initials}
        </span>
      )
    }
    return (
      <PlugIcon
        aria-hidden="true"
        className={cn("size-4 text-muted-foreground", className)}
      />
    )
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("size-5 object-contain", className)}
      onError={() => setFailed(true)}
      src={logo}
    />
  )
}
