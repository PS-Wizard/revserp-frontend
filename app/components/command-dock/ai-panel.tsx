"use client"

import type { RefObject } from "react"
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
import { ConversationHistory } from "~/components/ai-dock/conversation-history"
import type { useAIChat } from "~/components/ai-dock/use-ai-chat"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

import {
  CAPSULE_RADIUS,
  CAPSULE_SHELL,
  PILL_BASE,
  PILL_RADIUS,
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
      <motion.div
        className={cn(
          CAPSULE_SHELL,
          "pointer-events-auto flex h-14 shrink-0 items-center overflow-hidden"
        )}
        layout
        layoutId="dock-ai"
        style={{ borderRadius: CAPSULE_RADIUS, willChange: "transform" }}
        transition={dockTransition(reducedMotion)}
      >
        <motion.button
          aria-haspopup="dialog"
          aria-label="Open Revserp AI"
          className={cn(
            PILL_BASE,
            "w-full justify-center gap-1.5 bg-foreground px-3.5 text-background hover:bg-foreground/90"
          )}
          onClick={onOpen}
          ref={buttonRef}
          style={{ borderRadius: PILL_RADIUS }}
          type="button"
          {...panelContentMotion(reducedMotion)}
        >
          {isSending ? (
            <ThinkingOrb
              aria-hidden="true"
              className="shrink-0"
              size={20}
              state="solving"
              theme="light"
              style={{ width: 16, height: 16 }}
            />
          ) : (
            <SparklesIcon className="size-4 shrink-0" />
          )}
          <span>{isSending ? "Working…" : "Ask AI"}</span>
        </motion.button>
      </motion.div>
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
  messageScrollRef: RefObject<HTMLDivElement | null>
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
  messageScrollRef,
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

  return (
    <BorderBeam
      active={isSending}
      className={cn(
        "pointer-events-none flex min-w-0",
        isMax ? "h-full w-full max-w-[100rem]" : "w-full flex-1"
      )}
      colorVariant="sunset"
      size="pulse-outside"
      theme="auto"
    >
      <motion.div
        aria-label="Revserp AI"
        aria-modal={isMax ? "true" : undefined}
        className={cn(
          "pointer-events-auto flex min-w-0 flex-col overflow-hidden border border-border/70 bg-card/95 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl",
          isMax ? "h-full w-full" : "h-[min(560px,72vh)] w-full flex-1"
        )}
        layout
        layoutId="dock-ai"
        ref={cardRef}
        role="dialog"
        style={{ borderRadius: CAPSULE_RADIUS, willChange: "transform" }}
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

              <div
                ref={messageScrollRef}
                className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
              >
                <AIMessageList
                  messages={messages}
                  isLoadingConversation={isLoadingConversation}
                  emptyHint={EMPTY_HINT}
                />
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
