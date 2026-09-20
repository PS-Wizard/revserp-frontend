import { Link } from "react-router"

import { cn } from "~/lib/utils"

export function RevserpLogo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-medium", className)}>
      <img
        alt=""
        aria-hidden="true"
        className="size-6 rounded-md"
        height={24}
        src="/icons/favicon-32.png"
        width={24}
      />
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
      <img
        alt=""
        aria-hidden="true"
        className="size-6 rounded-md"
        height={24}
        src="/icons/favicon-32.png"
        width={24}
      />
      Revserp.ai
    </Link>
  )
}
