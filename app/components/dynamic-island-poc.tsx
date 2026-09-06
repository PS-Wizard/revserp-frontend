"use client"

import { useState, type ReactNode } from "react"

import {
  CheckIcon,
  ChevronDownIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "lucide-react"
import { RevbotDockedAvatar } from "~/components/revbot/revbot-avatar"
import { motion, type Transition } from "motion/react"

import type { AIConversationResponse } from "~/lib/api.types"
import {
  filterConversations,
  RevbotConversationSearchInput,
} from "~/components/revbot/revbot-conversation-search"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { DropdownPillSurface } from "~/components/ui/hover-pill"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"

export type IslandState = "docked" | "minimized" | "maximized"

const ISLAND_LAYOUT_ID = "ai-island"

export const islandDockedSizeClass = "size-[4.5rem]"

/** Traditional chatbot anchor — bottom-right of the viewport. */
const islandAnchorClass = "fixed bottom-6 right-6 z-[100]"

const islandMaximizedAnchorClass =
  "pointer-events-none fixed inset-3 z-[100] flex"

export const islandMinimizedSizeClass =
  "h-[min(560px,72vh)] w-[27rem] max-w-[calc(100vw-1.5rem)]"

const islandMinimizedShadowClass = "shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)]"

const islandPanelClass = "surface-dialog border border-border text-foreground"

const islandPanelHeaderClass = "border-b border-border surface-dialog"

const islandPanelBodyClass = "surface-dialog"

const DOCKED_RADIUS = 36
const PANEL_RADIUS = 12

/** Spring morph — matches the main-branch AI dock. */
export function islandTransition(reducedMotion: boolean): Transition {
  return reducedMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 380, damping: 34, mass: 0.9 }
}

type DockedChromeProps = {
  active?: boolean
  onOpen: () => void
  transition: Transition
}

/** Docked pill — one layoutId element, morphs into the panel. */
export function DynamicIslandDockedChrome({
  active = false,
  onOpen,
  transition,
}: DockedChromeProps) {
  const dockedButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <motion.button
            aria-label="Chat with Revbot (Command or Control + K)"
            className={cn(
              "revbot-docked-launcher pointer-events-auto flex items-center justify-center overflow-hidden rounded-full border border-border surface-dialog",
              islandDockedSizeClass
            )}
            data-active={active ? "true" : undefined}
            layout
            layoutId={ISLAND_LAYOUT_ID}
            onClick={onOpen}
            style={{ borderRadius: DOCKED_RADIUS, willChange: "transform" }}
            transition={transition}
            type="button"
          >
            <RevbotDockedAvatar active={active} />
          </motion.button>
        }
      />
      <TooltipContent side="left">Chat with Revbot</TooltipContent>
    </Tooltip>
  )

  return (
    <div className={cn("pointer-events-none", islandAnchorClass)}>
      {dockedButton}
    </div>
  )
}

type IslandPanelState = "minimized" | "maximized"

type IslandPanelProps = {
  children?: ReactNode
  activeConversationId: string | null
  controlsDisabled?: boolean
  conversations: AIConversationResponse[]
  isConversationActive: (conversationId: string) => boolean
  onDock: () => void
  onDeleteConversation: (conversationId: string) => void
  onMaximize: () => void
  onMinimize: () => void
  onNewChat?: () => void
  onSelectConversation: (conversationId: string) => void
  panelState: IslandPanelState
  title?: string
  transition: Transition
}

/** Chat panel — same layoutId as the docked pill for FLIP morphs. */
export function DynamicIslandPanel({
  children,
  activeConversationId,
  controlsDisabled = false,
  conversations,
  isConversationActive,
  onDock,
  onDeleteConversation,
  onMaximize,
  onMinimize,
  onNewChat,
  onSelectConversation,
  panelState,
  title = "New chat",
  transition,
}: IslandPanelProps) {
  const [historySearch, setHistorySearch] = useState("")
  const [panelShadow, setPanelShadow] = useState(false)
  const isMaximized = panelState === "maximized"
  const borderRadius = PANEL_RADIUS
  const shortTitle = title.split(/\s+/).slice(0, 3).join(" ")
  const displayTitle = shortTitle === title ? title : `${shortTitle}…`
  const filteredConversations = filterConversations(
    conversations,
    historySearch
  )

  return (
    <div
      className={
        isMaximized
          ? islandMaximizedAnchorClass
          : cn("pointer-events-none", islandAnchorClass)
      }
    >
      <motion.div
        aria-label="Revbot"
        aria-modal={isMaximized ? "true" : undefined}
        className={cn(
          "pointer-events-auto min-h-0 overflow-hidden",
          islandPanelClass,
          isMaximized ? "h-full w-full flex-1" : islandMinimizedSizeClass,
          !isMaximized && panelShadow && islandMinimizedShadowClass
        )}
        layout
        layoutId={ISLAND_LAYOUT_ID}
        onLayoutAnimationComplete={() => {
          if (!isMaximized) setPanelShadow(true)
        }}
        onLayoutAnimationStart={() => {
          setPanelShadow(false)
        }}
        role="dialog"
        style={{
          borderRadius,
          willChange: isMaximized ? undefined : "transform",
        }}
        transition={transition}
      >
        <div className="flex h-full min-h-0 flex-col">
          <header
            className={cn(
              "grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-2",
              islandPanelHeaderClass
            )}
          >
            <div className="flex min-w-0 items-center">
              {onNewChat ? (
                <button
                  aria-label="New chat"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={controlsDisabled}
                  onClick={onNewChat}
                  type="button"
                >
                  <PlusIcon aria-hidden="true" className="size-3.5" />
                  New chat
                </button>
              ) : null}
            </div>
            <DropdownMenu
              onOpenChange={(open) => {
                if (!open) setHistorySearch("")
              }}
            >
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label="Switch conversation"
                    className="flex max-w-full min-w-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-foreground hover:bg-white/10 data-[popup-open]:bg-white/10"
                    title={title}
                    type="button"
                  />
                }
              >
                <span className="min-w-0 truncate text-sm font-semibold">
                  {displayTitle}
                </span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 data-[popup-open]:rotate-180"
                />
              </DropdownMenuTrigger>
              <DropdownPillSurface
                align="center"
                className="max-h-80 w-64"
                pillClassName="bg-white/10"
                positionerClassName="z-[110]"
                side="bottom"
              >
                {(pill) => (
                  <>
                    <div
                      className="sticky top-0 z-10 surface-dialog p-1.5 pb-2"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <RevbotConversationSearchInput
                        autoFocus
                        inDropdown
                        isDark
                        onChange={setHistorySearch}
                        value={historySearch}
                      />
                    </div>
                    {filteredConversations.length ? (
                      filteredConversations.map((conversation, index) => (
                        <DropdownMenuItem
                          key={conversation.id}
                          {...pill.getItemProps(index)}
                          disabled={controlsDisabled}
                          onClick={() => onSelectConversation(conversation.id)}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {conversation.title}
                          </span>
                          {conversation.id === activeConversationId ? (
                            <CheckIcon
                              aria-hidden="true"
                              className="size-4 shrink-0"
                            />
                          ) : null}
                          <button
                            aria-label={`Delete ${conversation.title}`}
                            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover/dropdown-menu-item:opacity-100 hover:bg-white/10 hover:text-foreground focus-visible:opacity-100"
                            disabled={
                              controlsDisabled ||
                              isConversationActive(conversation.id)
                            }
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              onDeleteConversation(conversation.id)
                            }}
                            type="button"
                          >
                            <TrashIcon
                              aria-hidden="true"
                              className="size-3.5"
                            />
                          </button>
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem {...pill.getItemProps(0)} disabled>
                        {historySearch.trim()
                          ? "No matching conversations"
                          : "No conversations yet"}
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownPillSurface>
            </DropdownMenu>
            <div className="flex min-w-0 shrink-0 items-center justify-end">
              {isMaximized ? (
                <>
                  <button
                    aria-label="Minimize AI island"
                    className="rounded-md p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    onClick={onMinimize}
                    type="button"
                  >
                    <Minimize2Icon aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    aria-label="Dock AI island"
                    className="rounded-md p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    onClick={onDock}
                    type="button"
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    aria-label="Maximize AI island"
                    className="rounded-md p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    onClick={onMaximize}
                    type="button"
                  >
                    <Maximize2Icon aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    aria-label="Dock AI island"
                    className="rounded-md p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    onClick={onDock}
                    type="button"
                  >
                    <MinusIcon aria-hidden="true" className="size-4" />
                  </button>
                </>
              )}
            </div>
          </header>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-hidden",
              islandPanelBodyClass
            )}
          >
            {children}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/** @deprecated Use DynamicIslandPanel */
export const DynamicIslandMaxPanel = DynamicIslandPanel
