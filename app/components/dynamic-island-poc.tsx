"use client"

import type { ReactNode } from "react"

import { XIcon } from "lucide-react"
import { motion, type Transition } from "motion/react"
import { BorderBeam } from "border-beam"
import { ThinkingOrb } from "thinking-orbs"

import { cn } from "~/lib/utils"

export type IslandState = "docked" | "maximized"

const islandSurfaceClass = "border border-border bg-black"

export const islandDockedSizeClass = "h-8 w-[6.25rem]"

const islandMaxPanelClass = "border border-border bg-black"

const islandMaxHeaderClass = "border-b border-border bg-black"

const islandMaxBodyClass = "bg-black"

const maximizedPositionClass = "fixed inset-3 z-[100]"

type MorphShellProps = {
  layoutId?: string
  onLayoutAnimationComplete?: () => void
  transition: Transition
}

/** Empty morph shell — never contains Revbot label/orb. */
export function DynamicIslandMorphShell({
  layoutId = "ai-island",
  onLayoutAnimationComplete,
  state,
  transition,
}: MorphShellProps & { state: IslandState }) {
  if (state === "docked") {
    return (
      <motion.div
        aria-hidden="true"
        className={cn(
          "relative isolate overflow-hidden rounded-md",
          islandDockedSizeClass,
          islandSurfaceClass
        )}
        layout
        layoutId={layoutId}
        onLayoutAnimationComplete={onLayoutAnimationComplete}
        transition={transition}
      />
    )
  }

  return (
    <motion.div
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-md",
        maximizedPositionClass,
        islandMaxPanelClass
      )}
      layout
      layoutId={layoutId}
      onLayoutAnimationComplete={onLayoutAnimationComplete}
      style={{ zIndex: 100 }}
      transition={transition}
    />
  )
}

type DockedChromeProps = {
  active?: boolean
  onOpen: () => void
  visible: boolean
}

/** Fixed docked face — sits above the morph shell, not part of layoutId. */
export function DynamicIslandDockedChrome({
  active = false,
  onOpen,
  visible,
}: DockedChromeProps) {
  if (!visible) return null

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[102]",
        islandDockedSizeClass
      )}
    >
      <button
        aria-label="Open AI island"
        className={cn(
          "pointer-events-auto flex items-center gap-1.5 rounded-md px-2",
          "animate-in fade-in duration-200",
          islandDockedSizeClass
        )}
        onClick={onOpen}
        type="button"
      >
        <ThinkingOrb
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center [&_svg]:size-6"
          paused={!active}
          size={20}
          state="solving"
          theme="dark"
        />
        <span className="truncate text-sm font-medium leading-none text-foreground">
          Revbot
        </span>
      </button>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 animate-in fade-in duration-300"
      >
        <BorderBeam
          active={active}
          brightness={2.4}
          className={cn("rounded-md", islandDockedSizeClass)}
          colorVariant="colorful"
          duration={1.2}
          hueRange={180}
          size="pulse-outside"
          saturation={2}
          strength={1}
          theme="dark"
        >
          <span className="block size-full" />
        </BorderBeam>
      </div>
    </div>
  )
}

type MaxPanelProps = {
  children?: ReactNode
  /** Keep chat mounted while hidden so durable turns keep streaming. */
  keepMounted?: boolean
  onDock: () => void
  title?: string
  revealTransition: Transition
  visible: boolean
}

/** Expanded overlay chrome — separate from the morph shell. */
export function DynamicIslandMaxPanel({
  children,
  keepMounted = false,
  onDock,
  title = "New chat",
  revealTransition,
  visible,
}: MaxPanelProps) {
  if (!visible && !keepMounted) return null

  return (
    <motion.div
      animate={{ opacity: visible ? 1 : 0 }}
      aria-hidden={!visible}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-md",
        visible
          ? cn(
              "pointer-events-auto",
              maximizedPositionClass,
              islandMaxPanelClass
            )
          : "pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
      )}
      initial={false}
      style={visible ? { zIndex: 101 } : undefined}
      transition={revealTransition}
    >
      <header
        className={cn(
          "grid h-11 shrink-0 grid-cols-[2.5rem_1fr_2.5rem] items-center px-1",
          islandMaxHeaderClass,
          !visible && "hidden"
        )}
      >
        <span aria-hidden="true" />
        <h2 className="min-w-0 truncate text-center text-sm font-semibold text-foreground">
          {title}
        </h2>
        <button
          aria-label="Dock AI island"
          className="justify-self-end rounded-md p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          onClick={onDock}
          type="button"
          tabIndex={visible ? 0 : -1}
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div className={cn("min-h-0 flex-1 overflow-hidden", islandMaxBodyClass)}>
        {children}
      </div>
    </motion.div>
  )
}
