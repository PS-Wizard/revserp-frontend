"use client"

import { useRef, type RefObject } from "react"
import { motion } from "motion/react"
import { BorderBeam } from "border-beam"
import {
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PanelLeftIcon,
  SparklesIcon,
} from "lucide-react"
import { ThinkingOrb } from "thinking-orbs"

import { AIComposer } from "~/components/ai-dock/ai-composer"
import { AIMessageList } from "~/components/ai-dock/ai-message-list"
import { ConversationMinimap } from "~/components/ai-dock/conversation-minimap"
import { ConversationHistory } from "~/components/ai-dock/conversation-history"
import type { useAIChat } from "~/components/ai-dock/use-ai-chat"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

import {
  CAPSULE_RADIUS,
  PANEL_SURFACE,
  PANEL_SURFACE_OPAQUE,
  dockTransition,
  panelContentMotion,
} from "./constants"

const EMPTY_HINT =
  "Ask about your audit issues, scores, or pages — I can also navigate, run crawls, and export reports for you."

type AIChat = ReturnType<typeof useAIChat>

type AICapsuleProps = {
  isSending: boolean
  onOpen: () => void
  buttonRef: RefObject<HTMLButtonElement | null>
  reducedMotion: boolean
}

export function AICapsule({
  isSending,
  onOpen,
  buttonRef,
  reducedMotion,
}: AICapsuleProps) {
  return (
    <BorderBeam
      active={isSending}
      className="pointer-events-none flex shrink-0"
      colorVariant="sunset"
      size="md"
      theme="auto"
    >
      {/* One element, not a pill nested in a glass shell: the shell drew a light
          ring around a dark pill, and the panel this morphs into is the same
          card surface — so the swap only reads as seamless if the button is
          that surface too. */}
      <motion.button
        aria-haspopup="dialog"
        aria-label="Open Revserp AI"
        className={cn(
          PANEL_SURFACE,
          "pointer-events-auto flex h-12 w-[13rem] max-w-[calc(100vw-2.5rem)] shrink-0 items-center justify-center gap-2 overflow-hidden px-4 text-[13px] font-medium transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        )}
        layout
        layoutId="dock-ai"
        onClick={onOpen}
        ref={buttonRef}
        style={{ borderRadius: CAPSULE_RADIUS, willChange: "transform" }}
        transition={dockTransition(reducedMotion)}
        type="button"
      >
        {isSending ? (
          <ThinkingOrb
            aria-hidden="true"
            className="shrink-0"
            size={20}
            state="solving"
            // Pinned, not "auto": the app is hard-dark (<html class="dark">),
            // so the orb must always draw light ink on this card surface.
            theme="dark"
            style={{ width: 16, height: 16 }}
          />
        ) : (
          <SparklesIcon className="size-4 shrink-0 text-primary" />
        )}
        <span>{isSending ? "Working…" : "Ask Revserp AI"}</span>
      </motion.button>
    </BorderBeam>
  )
}

type AIPanelProps = {
  chat: AIChat
  variant: "mini" | "max"
  historyOpen: boolean
  onHistoryToggle: () => void
  onHistoryClose: () => void
  onMaximize: () => void
  onRestore: () => void
  onCollapse: () => void
  cardRef: RefObject<HTMLDivElement | null>
  reducedMotion: boolean
}

export function AIPanel({
  chat,
  variant,
  historyOpen,
  onHistoryToggle,
  onHistoryClose,
  onMaximize,
  onRestore,
  onCollapse,
  cardRef,
  reducedMotion,
}: AIPanelProps) {
  const {
    prompt,
    setPrompt,
    messages,
    isSending,
    errorMessage,
    conversations,
    activeConversationId,
    isLoadingConversation,
    canSend,
    handleSubmit,
    stopSending,
    loadConversation,
    startNewChat,
    deleteConversation,
  } = chat

  const isMax = variant === "max"
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  return (
    <BorderBeam
      // Never beam the maximized panel. An active beam writes 18 registered
      // `@property … { inherits: true }` custom properties onto this wrapper
      // every frame at 30fps; an inherited registered property invalidates
      // style for the whole subtree, and maximized that subtree is the entire
      // conversation — so the recalc cost scales with message count. It also
      // animates `filter: blur(8px) hue-rotate(…)` on inset-0 pseudo-elements,
      // which at this size is a full-viewport filter pass per frame. Costs
      // nothing to lose: the header already shows a "Working…" indicator.
      active={isSending && !isMax}
      className={cn(
        "pointer-events-none flex min-w-0",
        isMax ? "h-full w-full max-w-[100rem]" : "shrink-0"
      )}
      colorVariant="sunset"
      size="pulse-outside"
      theme="auto"
    >
      <motion.div
        aria-label="Revserp AI"
        aria-modal={isMax ? "true" : undefined}
        className={cn(
          isMax ? PANEL_SURFACE_OPAQUE : PANEL_SURFACE,
          "pointer-events-auto flex min-w-0 flex-col overflow-hidden",
          isMax
            ? "h-full w-full"
            : "h-[min(560px,72vh)] w-[27rem] max-w-[calc(100vw-1.5rem)]"
        )}
        layout
        layoutId="dock-ai"
        ref={cardRef}
        role="dialog"
        style={{
          borderRadius: CAPSULE_RADIUS,
          // Pinned only while small. A permanent `will-change: transform` on a
          // near-fullscreen element forces the compositor to keep a viewport-
          // sized layer alive for the whole time the panel is open; motion adds
          // its own will-change during the layout projection anyway.
          willChange: isMax ? undefined : "transform",
        }}
        transition={dockTransition(reducedMotion)}
      >
        <motion.div
          className="flex min-h-0 flex-1 flex-col"
          {...panelContentMotion(reducedMotion)}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
            {isMax ? (
              <Button
                aria-label={historyOpen ? "Hide history" : "Show history"}
                aria-expanded={historyOpen}
                className="size-7"
                onClick={onHistoryToggle}
                size="icon"
                variant="ghost"
              >
                <PanelLeftIcon className="size-4" />
              </Button>
            ) : null}
            <SparklesIcon className="size-4 shrink-0 text-primary" />
            <span className="flex-1 truncate text-sm font-medium">
              Revserp AI
            </span>
            {isSending ? (
              <span className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex size-2 animate-pulse rounded-full bg-primary" />
                Working…
              </span>
            ) : null}
            {isMax ? (
              <Button
                aria-label="Restore"
                className="size-7"
                onClick={onRestore}
                size="icon"
                variant="ghost"
              >
                <Minimize2Icon className="size-4" />
              </Button>
            ) : (
              <Button
                aria-label="Maximize"
                className="size-7"
                onClick={onMaximize}
                size="icon"
                variant="ghost"
              >
                <Maximize2Icon className="size-4" />
              </Button>
            )}
            <Button
              aria-label="Collapse"
              className="size-7"
              onClick={onCollapse}
              size="icon"
              variant="ghost"
            >
              <MinusIcon className="size-4" />
            </Button>
          </header>

          <div className="flex min-h-0 min-w-0 flex-1">
            {isMax && historyOpen ? (
              <aside className="hidden w-64 shrink-0 border-r border-border/60 sm:block">
                <ConversationHistory
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelect={(id) => {
                    void loadConversation(id)
                    onHistoryClose()
                  }}
                  onNewChat={() => {
                    startNewChat()
                    onHistoryClose()
                  }}
                  onDelete={(id) => void deleteConversation(id)}
                />
              </aside>
            ) : null}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {isMax ? null : (
                <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-1.5">
                  <span className="truncate text-xs text-muted-foreground">
                    {conversations.find((c) => c.id === activeConversationId)
                      ?.title ?? "New chat"}
                  </span>
                  <Button
                    className="h-6 px-2 text-xs"
                    onClick={startNewChat}
                    size="sm"
                    variant="ghost"
                  >
                    New
                  </Button>
                </div>
              )}

              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div
                  className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto [&::-webkit-scrollbar]:hidden"
                  ref={scrollContainerRef}
                >
                  <AIMessageList
                    messages={messages}
                    isLoadingConversation={isLoadingConversation}
                    emptyHint={EMPTY_HINT}
                  />
                </div>
                {isMax ? (
                  <ConversationMinimap
                    messages={messages}
                    scrollContainerRef={scrollContainerRef}
                  />
                ) : null}
              </div>

              <AIComposer
                prompt={prompt}
                canSend={canSend}
                isSending={isSending}
                errorMessage={errorMessage}
                onPromptChange={setPrompt}
                onSubmit={() => void handleSubmit()}
                onStop={stopSending}
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </BorderBeam>
  )
}
