import { useRef, useState } from "react"
import { Link } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Asterisk,
  BarChart3,
  Bot,
  CheckIcon,
  ChevronsUpDownIcon,
  CogIcon,
  DownloadIcon,
  PanelLeftIcon,
  PlayIcon,
  Search,
  SparklesIcon,
} from "lucide-react"

import { cn } from "~/lib/utils"

type Mode = "audit" | "visibility" | "search"
type AuditTab = "summary" | "seo" | "aeo" | "pagespeed"
type Menu = "project" | "actions" | "account" | null
type ConceptId = "monolith" | "magnetic" | "stack" | "lens" | "liquid" | "final"

type NavProps = {
  mode: Mode
  auditTab: AuditTab
  project: string
  menu: Menu
  chatOpen: boolean
  prompt: string
  reducedMotion: boolean
  onModeChange: (mode: Mode) => void
  onAuditTabChange: (tab: AuditTab) => void
  onProjectChange: (project: string) => void
  onToggleMenu: (menu: Exclude<Menu, null>) => void
  onCloseMenus: () => void
  onToggleChat: () => void
  onPromptChange: (prompt: string) => void
  onSend: () => void
  onNotice: (message: string) => void
}

const PROJECTS = ["Acme Commerce", "Northstar Studio", "Meridian Health"]

const MODES: Array<{
  id: Mode
  label: string
  short: string
  icon: typeof Search
}> = [
  { id: "audit", label: "Revserp Audit", short: "Audit", icon: BarChart3 },
  {
    id: "visibility",
    label: "Revserp Visibility",
    short: "Visibility",
    icon: Bot,
  },
  { id: "search", label: "Search Console", short: "Console", icon: Search },
]

const AUDIT_TABS: Array<{ id: AuditTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "seo", label: "SEO" },
  { id: "aeo", label: "AEO" },
  { id: "pagespeed", label: "PageSpeed" },
]

const CONCEPTS: Array<{
  id: ConceptId
  number: number
  name: string
  summary: string
}> = [
  {
    id: "monolith",
    number: 1,
    name: "Monolith",
    summary: "One continuous shell: modes, Audit context, actions, and AI.",
  },
  {
    id: "magnetic",
    number: 2,
    name: "Magnetic Split",
    summary: "Purposeful neighboring droplets with a satellite context shelf.",
  },
  {
    id: "stack",
    number: 3,
    name: "Context Stack",
    summary: "A hierarchical two-level deck that yields its upper layer to AI.",
  },
  {
    id: "lens",
    number: 4,
    name: "Command Lens",
    summary:
      "A calm location bar with a progressive disclosure navigation lens.",
  },
  {
    id: "liquid",
    number: 5,
    name: "Liquid Rail",
    summary:
      "An asymmetric editorial rail with an in-line moving active treatment.",
  },
  {
    id: "final",
    number: 6,
    name: "Final",
    summary:
      "The composed recommendation: a full-width Liquid Rail with detached Audit context and AI.",
  },
]

const SOFT_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 36,
  mass: 0.85,
}
const STILL = { duration: 0 }

function motionTransition(reducedMotion: boolean) {
  return reducedMotion ? STILL : SOFT_SPRING
}

function modeLabel(mode: Mode) {
  return MODES.find((item) => item.id === mode)?.label ?? "Revserp Audit"
}

function auditLabel(tab: AuditTab) {
  return AUDIT_TABS.find((item) => item.id === tab)?.label ?? "Summary"
}

function ProjectControl({
  project,
  menu,
  reducedMotion,
  onToggleMenu,
  onProjectChange,
  className,
  compact = false,
}: Pick<
  NavProps,
  "project" | "menu" | "reducedMotion" | "onToggleMenu" | "onProjectChange"
> & {
  className?: string
  compact?: boolean
}) {
  const isOpen = menu === "project"

  return (
    <div className={cn("relative", className)}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Choose project"
        className={cn(
          "flex h-10 min-w-0 items-center gap-2 rounded-full border border-border/70 bg-background/45 px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          compact && "h-9 px-2.5 text-xs"
        )}
        onClick={() => onToggleMenu("project")}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] text-primary">
          A
        </span>
        <span className="min-w-0 flex-1 truncate">{project}</span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      <AnimatePresence initial={!reducedMotion}>
        {isOpen ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            aria-label="Projects"
            className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-2xl shadow-black/50"
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            role="menu"
            transition={motionTransition(reducedMotion)}
          >
            <p className="px-2.5 py-2 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Projects
            </p>
            {PROJECTS.map((item) => {
              const selected = item === project
              return (
                <button
                  aria-current={selected ? "true" : undefined}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  key={item}
                  onClick={() => onProjectChange(item)}
                  role="menuitem"
                  type="button"
                >
                  <span className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-xs">
                    {item.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item}</span>
                  {selected ? (
                    <CheckIcon className="size-4 text-primary" />
                  ) : null}
                </button>
              )
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ActionControl({
  menu,
  reducedMotion,
  onToggleMenu,
  onCloseMenus,
  onNotice,
  iconOnly = false,
  className,
}: Pick<
  NavProps,
  "menu" | "reducedMotion" | "onToggleMenu" | "onCloseMenus" | "onNotice"
> & {
  iconOnly?: boolean
  className?: string
}) {
  const isOpen = menu === "actions"

  function runAction(message: string) {
    onNotice(message)
    onCloseMenus()
  }

  return (
    <div className={cn("relative", className)}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Open actions"
        className={cn(
          "flex h-10 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/45 px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          iconOnly && "size-10 px-0"
        )}
        onClick={() => onToggleMenu("actions")}
        type="button"
      >
        <CogIcon className="size-4" />
        {iconOnly ? null : <span>Actions</span>}
      </button>
      <AnimatePresence initial={!reducedMotion}>
        {isOpen ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            aria-label="Actions"
            className="absolute right-0 bottom-full z-50 mb-2 w-48 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-2xl shadow-black/50"
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            role="menu"
            transition={motionTransition(reducedMotion)}
          >
            <button
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() =>
                runAction("Crawl queued for this concept preview.")
              }
              role="menuitem"
              type="button"
            >
              <PlayIcon className="size-4" />
              Run Crawl
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => runAction("Audit export is ready in this mock.")}
              role="menuitem"
              type="button"
            >
              <DownloadIcon className="size-4" />
              Export audit
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function AvatarControl({
  menu,
  reducedMotion,
  onToggleMenu,
  tonal = false,
}: Pick<NavProps, "menu" | "reducedMotion" | "onToggleMenu"> & {
  tonal?: boolean
}) {
  const isOpen = menu === "account"

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Open account menu"
        className={cn(
          "flex items-center justify-center rounded-full border border-border/70 text-xs font-semibold shadow-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          tonal
            ? "size-9 bg-muted/80 text-foreground hover:bg-muted"
            : "size-10 bg-gradient-to-br from-primary/80 to-primary/30 text-primary-foreground"
        )}
        onClick={() => onToggleMenu("account")}
        type="button"
      >
        RV
      </button>
      <AnimatePresence initial={!reducedMotion}>
        {isOpen ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 bottom-full z-50 mb-2 w-52 rounded-2xl border border-border bg-popover p-3 shadow-2xl shadow-black/50"
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            role="menu"
            transition={motionTransition(reducedMotion)}
          >
            <p className="text-sm font-medium">Riley Vance</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Acme workspace
            </p>
            <button
              className="mt-3 w-full rounded-lg border border-border/70 px-2.5 py-2 text-left text-xs font-medium hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              role="menuitem"
              type="button"
            >
              Account settings
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function AuditDestinations({
  auditTab,
  onAuditTabChange,
  className,
  showKicker = false,
  animated = false,
  reducedMotion = false,
}: Pick<NavProps, "auditTab" | "onAuditTabChange"> & {
  className?: string
  showKicker?: boolean
  animated?: boolean
  reducedMotion?: boolean
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {showKicker ? (
        <span className="mr-1 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Audit
        </span>
      ) : null}
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {AUDIT_TABS.map((tab) => {
          const selected = tab.id === auditTab
          return (
            <button
              aria-current={selected ? "page" : undefined}
              aria-pressed={selected}
              className={cn(
                "relative isolate shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected
                  ? animated
                    ? "text-background"
                    : "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              key={tab.id}
              onClick={() => onAuditTabChange(tab.id)}
              type="button"
            >
              {animated && selected ? (
                <motion.span
                  layoutId="final-active-audit"
                  className="absolute inset-0 -z-10 rounded-full bg-foreground shadow-[0_6px_18px_rgb(0_0_0_/_0.18)]"
                  transition={motionTransition(reducedMotion)}
                />
              ) : null}
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ModeRail({
  mode,
  onModeChange,
  className,
  dense = false,
}: Pick<NavProps, "mode" | "onModeChange"> & {
  className?: string
  dense?: boolean
}) {
  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="navigation"
      aria-label="Primary navigation"
    >
      {MODES.map((item) => {
        const selected = item.id === mode
        const Icon = item.icon
        return (
          <button
            aria-current={selected ? "page" : undefined}
            aria-pressed={selected}
            className={cn(
              "flex h-10 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              dense && "px-2.5"
            )}
            key={item.id}
            onClick={() => onModeChange(item.id)}
            type="button"
          >
            <Icon className="size-3.5 shrink-0" />
            <span className={cn(dense && "hidden xl:inline")}>
              {dense ? item.short : item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function EmbeddedChat({
  prompt,
  onPromptChange,
  onSend,
  onClose,
  autoFocus = false,
}: Pick<NavProps, "prompt" | "onPromptChange" | "onSend"> & {
  onClose: () => void
  autoFocus?: boolean
}) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSend()
  }

  return (
    <div className="flex min-h-48 flex-col p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary">
          <SparklesIcon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Revserp AI</p>
          <p className="text-[11px] text-muted-foreground">
            Scoped to this crawl
          </p>
        </div>
        <button
          aria-label="Close AI chat"
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={onClose}
          type="button"
        >
          <span aria-hidden className="text-lg leading-none">
            ×
          </span>
        </button>
      </div>
      <div className="mb-3 max-w-[92%] rounded-2xl rounded-tl-sm border border-border/60 bg-muted/45 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        I can prioritize the 12 pages losing internal-link equity, or draft a
        fix brief.
      </div>
      <form
        className="mt-auto flex items-end gap-2 rounded-2xl border border-border/70 bg-background/55 p-1.5"
        onSubmit={submit}
      >
        <textarea
          aria-label="Ask Revserp AI"
          autoFocus={autoFocus}
          className="min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          placeholder="Ask about this audit…"
          rows={1}
          value={prompt}
        />
        <button
          aria-label="Send AI message"
          className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          disabled={!prompt.trim()}
          type="submit"
        >
          <SparklesIcon className="size-3.5" />
        </button>
      </form>
    </div>
  )
}

function MonolithNav(props: NavProps) {
  const transition = motionTransition(props.reducedMotion)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:pb-5">
      <motion.div
        layout
        className="pointer-events-auto w-full max-w-[1040px] overflow-visible rounded-[28px] border border-border/80 bg-card/95 p-1.5 shadow-2xl shadow-black/55 backdrop-blur-2xl"
        transition={transition}
      >
        <AnimatePresence initial={!props.reducedMotion} mode="popLayout">
          {props.chatOpen ? (
            <motion.div
              layout
              layoutId="monolith-ai"
              animate={{ opacity: 1, height: "auto" }}
              className="overflow-hidden rounded-[22px] border border-border/60 bg-background/50"
              exit={{ opacity: 0, height: 0 }}
              initial={{ opacity: 0, height: 0 }}
              transition={transition}
            >
              <EmbeddedChat
                onClose={props.onToggleChat}
                onPromptChange={props.onPromptChange}
                onSend={props.onSend}
                prompt={props.prompt}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        {props.mode === "audit" ? (
          <motion.div
            layout
            className="mx-1 mt-1 flex min-w-0 items-center justify-center overflow-hidden rounded-[18px] bg-muted/45 px-2 py-1"
            transition={transition}
          >
            <AuditDestinations
              auditTab={props.auditTab}
              onAuditTabChange={props.onAuditTabChange}
              showKicker
            />
          </motion.div>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-1 overflow-visible px-1 py-1">
          <ProjectControl {...props} compact />
          <div className="mx-1 h-6 w-px shrink-0 bg-border/80" />
          <ModeRail {...props} className="min-w-max flex-1" dense />
          <button
            aria-label="Run crawl"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() =>
              props.onNotice("Crawl queued for this concept preview.")
            }
            type="button"
          >
            <PlayIcon className="size-3.5" />
            <span className="hidden lg:inline">Run Crawl</span>
          </button>
          <ActionControl {...props} iconOnly />
          <AvatarControl {...props} />
          <AnimatePresence initial={!props.reducedMotion} mode="popLayout">
            {props.chatOpen ? null : (
              <motion.button
                layoutId="monolith-ai"
                aria-label="Open Revserp AI"
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-violet-500 px-3 text-xs font-medium text-primary-foreground shadow-lg shadow-violet-950/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={props.onToggleChat}
                transition={transition}
                type="button"
              >
                <SparklesIcon className="size-3.5" />
                <span className="hidden sm:inline">AI</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

function MagneticSplitNav(props: NavProps) {
  const transition = motionTransition(props.reducedMotion)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:pb-5">
      <div className="pointer-events-auto flex max-w-full flex-col items-center gap-2">
        <AnimatePresence initial={!props.reducedMotion}>
          {props.mode === "audit" ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="rounded-full border border-border/70 bg-card/95 px-2 py-1 shadow-xl shadow-black/40 backdrop-blur-xl"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={transition}
            >
              <AuditDestinations
                auditTab={props.auditTab}
                onAuditTabChange={props.onAuditTabChange}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex max-w-full flex-wrap items-end justify-center gap-2 overflow-visible pb-1">
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-card/95 p-1 shadow-xl shadow-black/40 backdrop-blur-xl">
            <ProjectControl {...props} compact />
            <ActionControl {...props} iconOnly />
          </div>
          <div className="shrink-0 rounded-full border border-border/70 bg-card/95 p-1 shadow-xl shadow-black/40 backdrop-blur-xl">
            <ModeRail {...props} dense />
          </div>
          <AvatarControl {...props} />
          <AnimatePresence initial={!props.reducedMotion} mode="popLayout">
            {props.chatOpen ? (
              <motion.div
                layout
                layoutId="magnetic-ai"
                animate={{ opacity: 1, y: 0 }}
                className="w-[min(22rem,calc(100vw-1.5rem))] shrink-0 overflow-hidden rounded-[26px] border border-border/80 bg-card/95 shadow-2xl shadow-black/50 backdrop-blur-2xl"
                exit={{ opacity: 0, y: 8 }}
                initial={{ opacity: 0, y: 8 }}
                transition={transition}
              >
                <EmbeddedChat
                  onClose={props.onToggleChat}
                  onPromptChange={props.onPromptChange}
                  onSend={props.onSend}
                  prompt={props.prompt}
                />
              </motion.div>
            ) : (
              <motion.button
                layoutId="magnetic-ai"
                aria-label="Open Revserp AI"
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-violet-300/20 bg-gradient-to-br from-violet-500 to-primary text-primary-foreground shadow-xl shadow-violet-950/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={props.onToggleChat}
                transition={transition}
                type="button"
              >
                <SparklesIcon className="size-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function ContextStackNav(props: NavProps) {
  const transition = motionTransition(props.reducedMotion)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:pb-5">
      <div className="pointer-events-auto flex w-full max-w-[820px] flex-col items-center gap-2">
        <AnimatePresence initial={!props.reducedMotion} mode="popLayout">
          {props.chatOpen ? (
            <motion.div
              layout
              layoutId="context-secondary"
              animate={{ opacity: 1, y: 0 }}
              className="w-full overflow-hidden rounded-[24px] border border-border/80 bg-card/95 shadow-2xl shadow-black/55 backdrop-blur-2xl"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={transition}
            >
              <motion.div layoutId="context-ai" transition={transition}>
                <EmbeddedChat
                  onClose={props.onToggleChat}
                  onPromptChange={props.onPromptChange}
                  onSend={props.onSend}
                  prompt={props.prompt}
                />
              </motion.div>
            </motion.div>
          ) : props.mode === "audit" ? (
            <motion.div
              layout
              layoutId="context-secondary"
              animate={{ opacity: 1, y: 0 }}
              className="flex w-full items-center gap-2 overflow-visible rounded-[22px] border border-border/75 bg-card/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur-xl"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={transition}
            >
              <AuditDestinations
                auditTab={props.auditTab}
                className="flex-1"
                onAuditTabChange={props.onAuditTabChange}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <motion.div
          layout
          className="flex w-full flex-wrap items-center gap-1 overflow-visible rounded-[26px] border border-border/80 bg-card/95 p-1.5 shadow-2xl shadow-black/55 backdrop-blur-2xl"
          transition={transition}
        >
          <span className="hidden pl-3 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase sm:inline">
            Workspace
          </span>
          <ProjectControl {...props} compact />
          <ActionControl {...props} iconOnly />
          <ModeRail {...props} className="min-w-max flex-1" dense />
          <AvatarControl {...props} />
          {props.chatOpen ? null : (
            <motion.button
              layoutId="context-ai"
              aria-label="Open Revserp AI"
              className="flex h-10 shrink-0 items-center gap-2 rounded-[18px] bg-primary px-3 text-xs font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={props.onToggleChat}
              transition={transition}
              type="button"
            >
              <SparklesIcon className="size-3.5" />
              <span>Ask AI</span>
            </motion.button>
          )}
        </motion.div>
      </div>
    </div>
  )
}

function CommandLensNav(props: NavProps) {
  const [lensOpen, setLensOpen] = useState(false)
  const [lensPanelReady, setLensPanelReady] = useState(false)
  const transition = motionTransition(props.reducedMotion)

  function toggleLens() {
    setLensPanelReady(false)
    setLensOpen((open) => !open)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:pb-5">
      <motion.div
        layout
        className="pointer-events-auto w-full max-w-[700px] overflow-visible rounded-[26px] border border-border/80 bg-card/95 p-1.5 shadow-2xl shadow-black/55 backdrop-blur-2xl"
        transition={transition}
      >
        <AnimatePresence
          initial={!props.reducedMotion}
          mode="popLayout"
          onExitComplete={() => setLensPanelReady(false)}
        >
          {lensOpen ? (
            <motion.div
              layout
              animate={{ opacity: 1, height: "auto" }}
              className={cn(
                "rounded-[20px] border border-border/60 bg-background/45 p-3",
                lensPanelReady ? "overflow-visible" : "overflow-hidden"
              )}
              onAnimationComplete={() => setLensPanelReady(true)}
              exit={{ opacity: 0, height: 0 }}
              initial={{ opacity: 0, height: 0 }}
              transition={transition}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Navigate workspace</p>
                  <p className="text-xs text-muted-foreground">
                    Choose a destination or command.
                  </p>
                </div>
                <span className="rounded-full border border-border/70 px-2 py-1 text-[10px] text-muted-foreground">
                  ⌘ K
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr]">
                <div className="rounded-2xl border border-border/60 bg-card/60 p-2">
                  <p className="px-2 py-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                    Modes
                  </p>
                  <ModeRail {...props} className="flex-col items-stretch" />
                </div>
                <div className="space-y-2">
                  <div className="rounded-2xl border border-border/60 bg-card/60 p-2">
                    <p className="px-2 py-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      Workspace
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      <ProjectControl {...props} compact />
                      <ActionControl {...props} iconOnly />
                    </div>
                  </div>
                  {props.mode === "audit" ? (
                    <div className="rounded-2xl border border-border/60 bg-card/60 p-2">
                      <p className="px-2 py-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                        Audit destination
                      </p>
                      <AuditDestinations
                        auditTab={props.auditTab}
                        className="flex-wrap"
                        onAuditTabChange={props.onAuditTabChange}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence initial={!props.reducedMotion} mode="popLayout">
          {props.chatOpen ? (
            <motion.div
              layout
              layoutId="lens-ai"
              animate={{ opacity: 1, height: "auto" }}
              className="overflow-hidden rounded-[20px] border border-border/60 bg-background/45"
              exit={{ opacity: 0, height: 0 }}
              initial={{ opacity: 0, height: 0 }}
              transition={transition}
            >
              <EmbeddedChat
                onClose={props.onToggleChat}
                onPromptChange={props.onPromptChange}
                onSend={props.onSend}
                prompt={props.prompt}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex flex-wrap items-center gap-1 overflow-visible p-1">
          <button
            aria-expanded={lensOpen}
            aria-label="Open command lens"
            className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[18px] bg-muted/70 px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={toggleLens}
            type="button"
          >
            <PanelLeftIcon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {modeLabel(props.mode)}
              {props.mode === "audit" ? ` · ${auditLabel(props.auditTab)}` : ""}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              Browse
            </span>
          </button>
          <span className="hidden shrink-0 rounded-full border border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground sm:inline">
            {props.project}
          </span>
          <AvatarControl {...props} />
          {props.chatOpen ? null : (
            <motion.button
              layoutId="lens-ai"
              aria-label="Open Revserp AI"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={props.onToggleChat}
              transition={transition}
              type="button"
            >
              <SparklesIcon className="size-4" />
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function LiquidRailNav(props: NavProps) {
  const transition = motionTransition(props.reducedMotion)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:pb-5">
      <div className="pointer-events-auto flex w-full max-w-[1120px] flex-col items-end gap-2">
        <AnimatePresence initial={!props.reducedMotion} mode="popLayout">
          {props.chatOpen ? (
            <motion.div
              layout
              layoutId="liquid-ai"
              animate={{ opacity: 1, x: 0 }}
              className="w-[min(27rem,calc(100vw-1.5rem))] overflow-hidden rounded-[26px] border border-border/80 bg-card/95 shadow-2xl shadow-black/55 backdrop-blur-2xl"
              exit={{ opacity: 0, x: 12 }}
              initial={{ opacity: 0, x: 12 }}
              transition={transition}
            >
              <EmbeddedChat
                onClose={props.onToggleChat}
                onPromptChange={props.onPromptChange}
                onSend={props.onSend}
                prompt={props.prompt}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <motion.div
          layout
          className="flex w-full flex-wrap items-center gap-1 overflow-visible rounded-[24px] border border-border/80 bg-card/95 p-1.5 shadow-2xl shadow-black/55 backdrop-blur-2xl"
          transition={transition}
        >
          <ProjectControl {...props} compact />
          <div className="mx-1 h-7 w-px shrink-0 bg-border/80" />
          <div
            className="relative flex h-10 items-center gap-1 rounded-[16px] bg-muted/45 p-1"
            role="navigation"
            aria-label="Primary navigation"
          >
            {MODES.map((item) => {
              const selected = item.id === props.mode
              return (
                <button
                  aria-current={selected ? "page" : undefined}
                  aria-pressed={selected}
                  className={cn(
                    "relative z-10 h-8 shrink-0 rounded-xl px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    selected
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  key={item.id}
                  onClick={() => props.onModeChange(item.id)}
                  type="button"
                >
                  {selected ? (
                    <motion.span
                      layoutId="liquid-active"
                      className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-primary via-violet-500 to-primary shadow-lg shadow-violet-950/30"
                      transition={transition}
                    />
                  ) : null}
                  {item.short}
                </button>
              )
            })}
          </div>
          {props.mode === "audit" ? (
            <>
              <div className="mx-1 h-7 w-px shrink-0 bg-border/80" />
              <AuditDestinations
                auditTab={props.auditTab}
                onAuditTabChange={props.onAuditTabChange}
              />
            </>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              aria-label="Run crawl"
              className="flex size-10 items-center justify-center rounded-[15px] bg-muted/60 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() =>
                props.onNotice("Crawl queued for this concept preview.")
              }
              type="button"
            >
              <PlayIcon className="size-3.5" />
            </button>
            <ActionControl {...props} iconOnly />
            <AvatarControl {...props} />
            {props.chatOpen ? null : (
              <motion.button
                layoutId="liquid-ai"
                aria-label="Open Revserp AI"
                className="flex h-10 items-center gap-2 rounded-[15px] bg-gradient-to-r from-primary to-violet-500 px-3 text-xs font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={props.onToggleChat}
                transition={transition}
                type="button"
              >
                <SparklesIcon className="size-3.5" />
                <span className="hidden sm:inline">AI</span>
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function FinalModeRail({
  mode,
  onModeChange,
  reducedMotion,
  className,
}: Pick<NavProps, "mode" | "onModeChange" | "reducedMotion"> & {
  className?: string
}) {
  return (
    <div
      aria-label="Primary navigation"
      className={cn(
        "flex w-max max-w-full items-center gap-1 overflow-x-auto rounded-[16px] bg-muted/45 p-1",
        className
      )}
      role="navigation"
    >
      {MODES.map((item) => {
        const selected = item.id === mode
        const label = item.id === "search" ? "Search Console" : item.short

        return (
          <button
            aria-current={selected ? "page" : undefined}
            aria-pressed={selected}
            className={cn(
              "relative isolate flex h-9 shrink-0 items-center rounded-xl px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              selected
                ? "text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={item.id}
            onClick={() => onModeChange(item.id)}
            type="button"
          >
            {selected ? (
              <motion.span
                layoutId="final-active-mode"
                className="absolute inset-0 -z-10 rounded-xl bg-foreground shadow-[0_6px_18px_rgb(0_0_0_/_0.18)]"
                transition={motionTransition(reducedMotion)}
              />
            ) : null}
            {label}
          </button>
        )
      })}
    </div>
  )
}

function FinalNav(props: NavProps) {
  const transition = motionTransition(props.reducedMotion)
  const aiButtonRef = useRef<HTMLButtonElement>(null)

  function closeChat() {
    props.onToggleChat()
    requestAnimationFrame(() => aiButtonRef.current?.focus())
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:pb-5">
      <div className="pointer-events-auto flex w-full max-w-[1120px] flex-col items-start gap-2">
        <div className="flex w-full flex-col-reverse items-end gap-2 sm:flex-row sm:items-end">
          <AnimatePresence initial={!props.reducedMotion} mode="popLayout">
            {props.mode === "audit" ? (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="max-w-full self-start rounded-full border border-border/70 bg-card/95 px-2 py-1 shadow-xl shadow-black/35 backdrop-blur-xl sm:self-auto"
                exit={{ opacity: 0, y: 8 }}
                initial={{ opacity: 0, y: 8 }}
                layout
                transition={transition}
              >
                <AuditDestinations
                  animated
                  auditTab={props.auditTab}
                  onAuditTabChange={props.onAuditTabChange}
                  reducedMotion={props.reducedMotion}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={!props.reducedMotion} mode="popLayout">
            {props.chatOpen ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                aria-label="Revserp AI"
                className="ml-auto w-[min(27rem,calc(100vw-1.5rem))] max-w-full overflow-hidden rounded-[24px] border border-border/80 bg-card/95 shadow-2xl shadow-black/45 backdrop-blur-2xl"
                exit={{ opacity: 0, y: 8 }}
                id="final-revserp-ai-panel"
                initial={{ opacity: 0, y: 8 }}
                layout
                layoutId="final-ai"
                transition={transition}
              >
                <EmbeddedChat
                  autoFocus
                  onClose={closeChat}
                  onPromptChange={props.onPromptChange}
                  onSend={props.onSend}
                  prompt={props.prompt}
                />
              </motion.section>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex w-full min-w-0 flex-col items-stretch gap-1 sm:flex-row sm:items-stretch">
          <motion.div
            className="min-w-0 flex-1 overflow-visible rounded-[24px] border border-border/80 bg-card/95 p-1.5 shadow-2xl shadow-black/55 backdrop-blur-2xl"
            layout
            transition={transition}
          >
            <div className="grid w-full grid-cols-1 items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-3">
              <FinalModeRail
                className="order-3 w-full sm:order-none sm:w-max"
                mode={props.mode}
                onModeChange={props.onModeChange}
                reducedMotion={props.reducedMotion}
              />
              <ProjectControl
                {...props}
                compact
                className="order-1 w-full min-w-0 sm:order-none [&>button]:w-full"
              />
              <div className="order-2 flex items-center gap-1 justify-self-end sm:order-none">
                <ActionControl {...props} iconOnly />
                <button
                  aria-label="Run crawl"
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-[15px] bg-muted/70 px-3 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  onClick={() =>
                    props.onNotice("Crawl queued for this concept preview.")
                  }
                  type="button"
                >
                  <PlayIcon className="size-3.5" />
                  <span className="hidden sm:inline">Run Crawl</span>
                </button>
                <AvatarControl {...props} tonal />
              </div>
            </div>
          </motion.div>

          <div className="relative z-10 w-[11rem] shrink-0 self-end sm:self-auto">
            <AnimatePresence initial={!props.reducedMotion} mode="popLayout">
              {props.chatOpen ? (
                <div
                  aria-hidden="true"
                  className="flex h-full min-h-10 w-full items-center justify-center gap-1.5 rounded-[18px] border border-border/80 bg-muted/70 px-2 text-[11px] font-medium text-muted-foreground shadow-lg shadow-black/10"
                >
                  <SparklesIcon className="size-3 text-primary" />
                  <span>AI open</span>
                </div>
              ) : (
                <motion.button
                  aria-controls="final-revserp-ai-panel"
                  aria-expanded={props.chatOpen}
                  aria-label="Open Revserp AI"
                  className="flex h-full min-h-10 w-full items-center justify-center gap-2 rounded-[18px] border border-border/80 bg-foreground px-3 text-xs font-medium text-background shadow-lg shadow-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  layoutId="final-ai"
                  ref={aiButtonRef}
                  onClick={props.onToggleChat}
                  transition={transition}
                  type="button"
                >
                  <SparklesIcon className="size-3.5" />
                  <span>Ask Revserp AI</span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockDashboard({
  mode,
  auditTab,
}: Pick<NavProps, "mode" | "auditTab">) {
  const isAudit = mode === "audit"
  const pageTitle = isAudit ? `${auditLabel(auditTab)} audit` : modeLabel(mode)
  const pageSubtitle = isAudit
    ? "Last crawl completed 14 minutes ago · 1,248 URLs analyzed"
    : mode === "visibility"
      ? "How answer engines and search surfaces see your brand"
      : "Organic performance, queries, and technical opportunities"

  return (
    <div className="relative mx-auto max-w-7xl px-4 pt-5 pb-44 sm:px-6 sm:pt-7 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(ellipse_at_50%_-20%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_62%)]" />
      <header className="mb-7 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-xl border border-border/70 bg-card shadow-sm">
            <Asterisk className="size-4 text-primary" />
          </span>
          <span className="hidden sm:inline">Acme Commerce</span>
          <span className="text-border">/</span>
          <span>{modeLabel(mode)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground sm:inline">
            Crawl #184
          </span>
          <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,.7)]" />
        </div>
      </header>

      <section className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Overview
          </p>
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            {pageTitle}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{pageSubtitle}</p>
        </div>
        <button
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          type="button"
        >
          <DownloadIcon className="size-4" />
          Share report
        </button>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard
          accent="from-violet-500/30"
          label={isAudit ? "Overall score" : "Visibility score"}
          value={isAudit ? "84" : "72"}
          trend="+4.2%"
        />
        <MetricCard
          accent="from-sky-500/25"
          label={isAudit ? "SEO health" : "Cited answers"}
          value={isAudit ? "88" : "146"}
          trend="+2.8%"
        />
        <MetricCard
          accent="from-emerald-500/25"
          label={isAudit ? "Pages passing" : "Tracked queries"}
          value={isAudit ? "1,094" : "382"}
          trend="+18"
        />
        <MetricCard
          accent="from-amber-500/25"
          label={isAudit ? "Needs attention" : "Opportunities"}
          value={isAudit ? "154" : "29"}
          trend="−12"
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_.9fr]">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <p className="text-sm font-medium">
                {isAudit ? "Score trajectory" : "Signal trajectory"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Past 30 days
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              Healthy
            </span>
          </div>
          <div className="relative h-60 overflow-hidden p-5">
            <div className="absolute inset-5 bg-[linear-gradient(color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px)] bg-[size:100%_25%,25%_100%]" />
            <svg
              aria-label="Score trend chart"
              className="relative h-full w-full overflow-visible"
              preserveAspectRatio="none"
              role="img"
              viewBox="0 0 500 160"
            >
              <defs>
                <linearGradient id="nav-lab-chart" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--primary)"
                    stopOpacity=".35"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--primary)"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              <path
                d="M0,125 C42,116 55,132 92,105 S150,115 188,82 S244,98 282,64 S336,78 378,47 S435,61 500,18 L500,160 L0,160 Z"
                fill="url(#nav-lab-chart)"
              />
              <path
                d="M0,125 C42,116 55,132 92,105 S150,115 188,82 S244,98 282,64 S336,78 378,47 S435,61 500,18"
                fill="none"
                stroke="var(--primary)"
                strokeLinecap="round"
                strokeWidth="3"
              />
              <circle cx="500" cy="18" fill="var(--primary)" r="5" />
            </svg>
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-xl shadow-black/10">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Priority queue</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Recommended next moves
              </p>
            </div>
            <span className="text-xs text-primary">View all</span>
          </div>
          <div className="space-y-3">
            {[
              ["Fix orphaned collection pages", "High", "bg-rose-400"],
              ["Expand entity coverage", "Medium", "bg-amber-400"],
              ["Improve LCP on category templates", "Medium", "bg-sky-400"],
            ].map(([title, priority, color]) => (
              <div
                className="flex items-center gap-3 rounded-xl border border-border/55 bg-background/30 p-3"
                key={title}
              >
                <span className={cn("size-2 rounded-full", color)} />
                <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  trend,
  accent,
}: {
  label: string
  value: string
  trend: string
  accent: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-4 shadow-lg shadow-black/10">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-16 bg-gradient-to-b to-transparent",
          accent
        )}
      />
      <p className="relative text-xs text-muted-foreground">{label}</p>
      <div className="relative mt-3 flex items-end justify-between">
        <strong className="text-3xl font-medium tracking-tight">{value}</strong>
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300">
          {trend}
        </span>
      </div>
    </div>
  )
}

function ConceptPicker({
  concept,
  onConceptChange,
}: {
  concept: ConceptId
  onConceptChange: (concept: ConceptId) => void
}) {
  const active = CONCEPTS.find((item) => item.id === concept) ?? CONCEPTS[0]

  return (
    <div className="relative z-20 mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-3 shadow-xl shadow-black/20 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            aria-label="Back to application"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/50 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            to="/app"
          >
            ←
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">
                Bottom navigation concept lab
              </p>
              <span className="hidden rounded-full border border-violet-300/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-200 sm:inline">
                isolated preview
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Try every control, then report or approve{" "}
              <strong className="text-foreground">“6. Final”</strong>.
            </p>
          </div>
        </div>
        <div
          className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1"
          role="tablist"
          aria-label="Navigation concepts"
        >
          {CONCEPTS.map((item) => {
            const selected = item.id === concept
            return (
              <button
                aria-current={selected ? "page" : undefined}
                aria-selected={selected}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={item.id}
                onClick={() => onConceptChange(item.id)}
                role="tab"
                type="button"
              >
                <span className="text-muted-foreground">{item.number}</span>
                {item.name}
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-2 pl-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {active.number}. {active.name}
        </span>{" "}
        — {active.summary}
      </p>
    </div>
  )
}

export default function NavLabPage() {
  const [concept, setConcept] = useState<ConceptId>("final")
  const [mode, setMode] = useState<Mode>("audit")
  const [auditTab, setAuditTab] = useState<AuditTab>("summary")
  const [project, setProject] = useState(PROJECTS[0])
  const [menu, setMenu] = useState<Menu>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [notice, setNotice] = useState(
    "Try each navigation direction in context."
  )
  const reducedMotion = useReducedMotion() ?? false

  function changeConcept(nextConcept: ConceptId) {
    setConcept(nextConcept)
    setMenu(null)
    setChatOpen(false)
    setNotice(
      `Concept ${CONCEPTS.find((item) => item.id === nextConcept)?.number} selected.`
    )
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode)
    setMenu(null)
    setNotice(`${modeLabel(nextMode)} selected.`)
  }

  function changeProject(nextProject: string) {
    setProject(nextProject)
    setMenu(null)
    setNotice(`Switched to ${nextProject}.`)
  }

  function toggleMenu(nextMenu: Exclude<Menu, null>) {
    setMenu((current) => (current === nextMenu ? null : nextMenu))
  }

  function toggleChat() {
    setChatOpen((open) => !open)
    setMenu(null)
  }

  function sendPrompt() {
    if (!prompt.trim()) return
    setNotice("AI draft sent in this preview.")
    setPrompt("")
  }

  const navProps: NavProps = {
    mode,
    auditTab,
    project,
    menu,
    chatOpen,
    prompt,
    reducedMotion,
    onModeChange: changeMode,
    onAuditTabChange: setAuditTab,
    onProjectChange: changeProject,
    onToggleMenu: toggleMenu,
    onCloseMenus: () => setMenu(null),
    onToggleChat: toggleChat,
    onPromptChange: setPrompt,
    onSend: sendPrompt,
    onNotice: setNotice,
  }

  return (
    <main className="min-h-svh overflow-x-clip bg-background text-foreground">
      <ConceptPicker concept={concept} onConceptChange={changeConcept} />
      <MockDashboard auditTab={auditTab} mode={mode} />
      <p
        aria-live="polite"
        className="fixed right-4 bottom-28 z-20 max-w-64 rounded-full border border-border/70 bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-lg shadow-black/20 backdrop-blur-xl sm:right-6"
      >
        {notice}
      </p>
      {concept === "monolith" ? <MonolithNav {...navProps} /> : null}
      {concept === "magnetic" ? <MagneticSplitNav {...navProps} /> : null}
      {concept === "stack" ? <ContextStackNav {...navProps} /> : null}
      {concept === "lens" ? <CommandLensNav {...navProps} /> : null}
      {concept === "liquid" ? <LiquidRailNav {...navProps} /> : null}
      {concept === "final" ? <FinalNav {...navProps} /> : null}
    </main>
  )
}
