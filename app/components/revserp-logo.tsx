import { Link } from "react-router"
import { Asterisk } from "lucide-react"

import { cn } from "~/lib/utils"

export function RevserpLogo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-medium", className)}>
      <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Asterisk />
      </div>
      Revserp.ai
    </span>
  )
}

export function RevserpLogoLink({
  className,
  to = "/",
}: {
  className?: string
  to?: string
}) {
  return (
    <Link
      to={to}
      prefetch="intent"
      className={cn("flex items-center gap-2 font-medium", className)}
    >
      <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Asterisk />
      </div>
      Revserp.ai
    </Link>
  )
}
