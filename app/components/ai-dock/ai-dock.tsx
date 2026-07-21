"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PanelLeftIcon,
  SparklesIcon,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { AIComposer } from "./ai-composer"
import { AIMessageList } from "./ai-message-list"
import { ConversationHistory } from "./conversation-history"
import { useAIChat } from "./use-ai-chat"
import type {
  AIExportAction,
  AINavigationDestination,
} from "./use-ai-chat"
import type { PanelState } from "./panel-map"

const EMPTY_HINT =
  "Ask about your audit issues, scores, or pages — I can also navigate, run crawls, and export reports for you."

const CARD_TRANSITION = {
  type: "spring" as const,
  stiffness: 380,
  damping: 34,
  mass: 0.9,
}

export type AIDockProps = {
  orgId: string
  projectId?: string
  crawlId?: string
  projectIds: string[]
  trackCrawl: (id: string) => void
  onNavigate: (destination: AINavigationDestination) => void
  onProjectSwitched: (projectId: string) => void
  onExport: (action: AIExportAction) => void
  onAutoCrawlConfigured: () => void
  externalOpen: { prompt: string; token: number } | null
}

export function AIDock({
  orgId,
  projectId,
  crawlId,
  projectIds,
  trackCrawl,
  onNavigate,
  onProjectSwitched,
  onExport,
  onAutoCrawlConfigured,
  externalOpen,
}: AIDockProps) {
  const [panelState, setPanelState] = useState<PanelState>("collapsed")
  // Conversation-history sidebar (maximized view only), collapsed by default.
  const [historyOpen, setHistoryOpen] = useState(false)

  const chat = useAIChat({
    orgId,
    projectId,
    crawlId,
    projectIds,
    trackCrawl,
    onNavigate,
    onProjectSwitched,
    onExport,
    onAutoCrawlConfigured,
    setPanelState,
  })

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

  // Seed a fresh chat from an external request (e.g. issue-explorer's
  // "Recommend Fixes"): maximize, start a new conversation, and auto-send the
  // seeded prompt so the model fetches the relevant issues via its tools. The
  // deterministic panel map keeps the dock maximized on those tool calls.
  // Token-gated so repeat requests refire; forceNew makes it immune to the
  // stale-closure timing of startNewChat's state resets.
  const lastOpenTokenRef = useRef(0)
  useEffect(() => {
    if (!externalOpen || externalOpen.token === lastOpenTokenRef.current) return
    lastOpenTokenRef.current = externalOpen.token
    setPanelState("maximized")
    startNewChat()
    void handleSubmit(externalOpen.prompt, { forceNew: true })
    // handleSubmit/startNewChat are re-created each render but this effect only
    // fires when externalOpen changes, capturing the current (fresh) closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalOpen])

  const messageScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (panelState === "collapsed") return
    messageScrollRef.current?.scrollTo({
      top: messageScrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, isLoadingConversation, panelState])

  // Clicking outside the card steps the dock down one level. Maximized is
  // handled by its backdrop (-> mini); mini has no backdrop, so watch the
  // document and collapse when the click lands outside the card.
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (panelState !== "mini") return
    const handlePointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setPanelState("collapsed")
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [panelState])

  const cardSizeClass =
    panelState === "collapsed"
      ? "h-11 rounded-full"
      : panelState === "mini"
        ? "h-[30rem] w-[23rem] max-w-[calc(100vw-2rem)] rounded-2xl"
        : "h-full w-full max-w-[100rem] rounded-2xl"

  return (
    <>
      <AnimatePresence>
        {panelState === "maximized" ? (
          <motion.div
            key="ai-dock-backdrop"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setPanelState("mini")}
          />
        ) : null}
      </AnimatePresence>

      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-50 flex justify-center",
          panelState === "maximized"
            ? "items-stretch p-4 sm:p-6"
            : "items-end pb-6"
        )}
      >
        <motion.div
          ref={cardRef}
          layout
          layoutId="ai-dock-card"
          transition={CARD_TRANSITION}
          className={cn(
            "pointer-events-auto flex flex-col overflow-hidden border border-border bg-card shadow-2xl shadow-black/40",
            cardSizeClass
          )}
        >
          {panelState === "collapsed" ? (
            <button
              type="button"
              onClick={() => setPanelState("mini")}
              className="flex h-full items-center gap-2 px-4 text-sm font-medium text-foreground"
            >
              <span className="relative flex size-2.5 items-center justify-center">
                <span
                  className={cn(
                    "absolute inline-flex size-full rounded-full",
                    isSending
                      ? "animate-ping bg-primary/70"
                      : "bg-emerald-500/60"
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex size-2 rounded-full",
                    isSending ? "bg-primary" : "bg-emerald-500"
                  )}
                />
              </span>
              <SparklesIcon className="size-4" />
              <span>{isSending ? "Working…" : "Revserp AI"}</span>
            </button>
          ) : (
            <>
              <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
                {panelState === "maximized" ? (
                  <Button
                    aria-label={historyOpen ? "Hide history" : "Show history"}
                    className="size-7"
                    onClick={() => setHistoryOpen((open) => !open)}
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
                {panelState === "mini" ? (
                  <Button
                    aria-label="Maximize"
                    className="size-7"
                    onClick={() => setPanelState("maximized")}
                    size="icon"
                    variant="ghost"
                  >
                    <Maximize2Icon className="size-4" />
                  </Button>
                ) : (
                  <Button
                    aria-label="Restore"
                    className="size-7"
                    onClick={() => setPanelState("mini")}
                    size="icon"
                    variant="ghost"
                  >
                    <Minimize2Icon className="size-4" />
                  </Button>
                )}
                <Button
                  aria-label="Collapse"
                  className="size-7"
                  onClick={() => setPanelState("collapsed")}
                  size="icon"
                  variant="ghost"
                >
                  <MinusIcon className="size-4" />
                </Button>
              </header>

              <div className="flex min-h-0 min-w-0 flex-1">
                {panelState === "maximized" && historyOpen ? (
                  <aside className="hidden w-64 shrink-0 border-r border-border/60 sm:block">
                    <ConversationHistory
                      conversations={conversations}
                      activeConversationId={activeConversationId}
                      onSelect={(id) => {
                        void loadConversation(id)
                        setHistoryOpen(false)
                      }}
                      onNewChat={() => {
                        startNewChat()
                        setHistoryOpen(false)
                      }}
                      onDelete={(id) => void deleteConversation(id)}
                    />
                  </aside>
                ) : null}

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {panelState === "mini" ? (
                    <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-1.5">
                      <span className="truncate text-xs text-muted-foreground">
                        {conversations.find(
                          (c) => c.id === activeConversationId
                        )?.title ?? "New chat"}
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
                  ) : null}

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
            </>
          )}
        </motion.div>
      </div>
    </>
  )
}
