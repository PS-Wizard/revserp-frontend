"use client"

import type { Ref } from "react"

import { Blobatar } from "@blobatar/react"
import { useGaze } from "@blobatar/react/gaze"
import { surprised, thinking } from "blobatar/expression"
import "blobatar/gaze.css"
import "blobatar/motion.css"

import { cn } from "~/lib/utils"

export const REVBOT_AVATAR_NAME = "revbot"

/** White blob across docked, message, and empty-state avatars. */
const REVBOT_PALETTE = {
  head: "#ffffff",
  eye: "#0a0a0a",
} as const

/** Round idle blob for message bubbles and empty state. */
const REVBOT_IDLE_TRAITS = { shape: 0.11 } as const

/** Slightly boxier silhouette so the working state reads at a glance. */
const REVBOT_ACTIVE_TRAITS = { shape: 0.38, "eye.ratio": 0.1 } as const

/** Boxy silhouette for the docked launcher. */
const REVBOT_DOCKED_TRAITS = { shape: 0.54 } as const

type RevbotAvatarCoreProps = {
  active?: boolean
  animate?: "always" | "hover"
  className?: string
  ref?: Ref<SVGSVGElement>
  size?: number
}

function RevbotAvatarCore({
  active = false,
  animate,
  className,
  ref,
  size = 32,
}: RevbotAvatarCoreProps) {
  return (
    <Blobatar
      ref={ref}
      animate={active ? "always" : animate}
      aria-hidden
      className={cn("shrink-0", className)}
      expression={active ? thinking : surprised}
      name={REVBOT_AVATAR_NAME}
      palette={REVBOT_PALETTE}
      size={size}
      traits={active ? REVBOT_ACTIVE_TRAITS : REVBOT_IDLE_TRAITS}
    />
  )
}

function RevbotActiveRing({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -inset-1 rounded-full border border-white/30 motion-safe:animate-pulse",
        className
      )}
    />
  )
}

type RevbotDockedAvatarProps = {
  active?: boolean
  size?: number
}

/** Bottom-right docked icon — cursor gaze, boxy blob matching in-chat avatars. */
export function RevbotDockedAvatar({
  active = false,
  size = 52,
}: RevbotDockedAvatarProps) {
  const { ref } = useGaze({ travel: 3, lookAt: "pointer" })

  return (
    <Blobatar
      ref={ref}
      animate="always"
      aria-hidden
      background={false}
      className="shrink-0"
      expression={active ? thinking : surprised}
      name={REVBOT_AVATAR_NAME}
      palette={REVBOT_PALETTE}
      size={size}
      traits={REVBOT_DOCKED_TRAITS}
    />
  )
}

type RevbotMessageAvatarProps = {
  active?: boolean
  className?: string
  size?: number
}

/** Profile bubble beside assistant messages in maximized chat. */
export function RevbotMessageAvatar({
  active = false,
  className,
  size = 32,
}: RevbotMessageAvatarProps) {
  return (
    <div
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] shadow-sm ring-1 ring-white/10",
        active && "ring-white/25",
        className
      )}
    >
      {active ? <RevbotActiveRing className="-inset-0.5 border-white/35" /> : null}
      <RevbotAvatarCore active={active} size={size} />
    </div>
  )
}

/** Hero avatar in the empty chat state. */
export function RevbotEmptyAvatar({ size = 48 }: { size?: number }) {
  const { ref } = useGaze({ travel: 3, lookAt: "pointer" })

  return (
    <RevbotAvatarCore animate="always" ref={ref} size={size} />
  )
}
