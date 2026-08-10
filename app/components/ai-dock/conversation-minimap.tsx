import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"

import type { RevserpAIMessage } from "~/lib/ai-conversation"

type ConversationMinimapProps = {
  messages: RevserpAIMessage[]
  scrollContainerRef: RefObject<HTMLDivElement | null>
}

type Marker = {
  messageIndex: number
  position: number
}

function messageLabel(content: string) {
  return content.replace(/\s+/g, " ").trim() || "Empty message"
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth"
}

export function ConversationMinimap({
  messages,
  scrollContainerRef,
}: ConversationMinimapProps) {
  const userMessagesKey = messages
    .flatMap((message, messageIndex) =>
      message.role === "user"
        ? [`${messageIndex}\u0000${message.id ?? ""}\u0000${message.content}`]
        : []
    )
    .join("\u0000")
  const userMessages = useMemo(
    () =>
      messages.flatMap((message, messageIndex) =>
        message.role === "user" ? [{ message, messageIndex }] : []
      ),
    // Assistant streaming does not rebuild observers for unchanged user turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userMessagesKey]
  )
  const markersRef = useRef<Marker[]>([])
  const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(
    null
  )

  const updateActive = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const targetPosition = container.scrollTop + container.clientHeight
    let nextActiveMessageIndex = markersRef.current[0]?.messageIndex ?? null
    for (const marker of markersRef.current) {
      if (marker.position > targetPosition) break
      nextActiveMessageIndex = marker.messageIndex
    }
    setActiveMessageIndex((current) =>
      current === nextActiveMessageIndex ? current : nextActiveMessageIndex
    )
  }, [scrollContainerRef])

  const measure = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const nextMarkers: Marker[] = []

    for (const { messageIndex } of userMessages) {
      const element = container.querySelector<HTMLElement>(
        `[data-message-role="user"][data-message-index="${messageIndex}"]`
      )
      if (!element) continue

      const elementRect = element.getBoundingClientRect()
      const position = elementRect.top - containerRect.top + container.scrollTop
      nextMarkers.push({ messageIndex, position })
    }

    markersRef.current = nextMarkers
    updateActive()
  }, [scrollContainerRef, updateActive, userMessages])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    let frame = 0
    const schedule = (task: () => void) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(task)
    }
    const scheduleMeasure = () => schedule(measure)
    const scheduleActive = () => schedule(updateActive)
    const resizeObserver = new ResizeObserver(scheduleMeasure)
    const content = container.firstElementChild

    container.addEventListener("scroll", scheduleActive, { passive: true })
    resizeObserver.observe(container)
    if (content) resizeObserver.observe(content)
    scheduleMeasure()

    return () => {
      cancelAnimationFrame(frame)
      container.removeEventListener("scroll", scheduleActive)
      resizeObserver.disconnect()
    }
  }, [measure, scrollContainerRef, updateActive])

  const scrollToMessage = useCallback(
    (messageIndex: number) => {
      const container = scrollContainerRef.current
      const element = container?.querySelector<HTMLElement>(
        `[data-message-role="user"][data-message-index="${messageIndex}"]`
      )
      if (!container || !element) return

      container.scrollTo({
        top:
          element.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop,
        behavior: scrollBehavior(),
      })
    },
    [scrollContainerRef]
  )

  if (userMessages.length === 0) return null

  return (
    <div className="group pointer-events-none absolute inset-y-0 right-0 z-20 hidden w-[min(23rem,calc(100%-0.5rem))] sm:block">
      <nav
        aria-label="Conversation turns"
        className="pointer-events-auto absolute top-1/2 right-2 flex max-h-[calc(100%-2rem)] w-6 -translate-y-1/2 flex-col items-end justify-between"
        style={{ height: Math.min(userMessages.length * 12, 560) }}
      >
        {userMessages.map(({ message, messageIndex }, markerIndex) => {
          const isActive = messageIndex === activeMessageIndex
          const label = messageLabel(message.content)

          return (
            <button
              aria-current={isActive ? "true" : undefined}
              aria-label={`Jump to message ${markerIndex + 1}: ${label}`}
              className="flex h-2 w-6 shrink-0 items-center justify-end rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              key={messageIndex}
              onClick={() => scrollToMessage(messageIndex)}
              type="button"
            >
              <span
                className={
                  isActive
                    ? "h-0.5 w-6 rounded-full bg-foreground shadow-[0_0_8px_rgba(255,255,255,0.35)] transition-[width,background-color] motion-reduce:transition-none"
                    : "h-0.5 w-4 rounded-full bg-muted-foreground/60 transition-[width,background-color] group-hover:bg-muted-foreground motion-reduce:transition-none"
                }
              />
            </button>
          )
        })}
      </nav>

      <nav
        aria-label="Conversation messages"
        className="pointer-events-none absolute top-1/2 right-8 max-h-[min(22rem,calc(100%-2rem))] w-[min(18rem,calc(100%-2.5rem))] translate-x-1 -translate-y-1/2 opacity-0 transition-[opacity,transform] duration-150 ease-out group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:translate-x-0 motion-reduce:transition-none"
      >
        <div className="max-h-full overflow-y-auto rounded-xl border border-border/70 bg-card/95 p-1.5 shadow-2xl backdrop-blur-sm">
          {userMessages.map(({ message, messageIndex }, messageNumber) => {
            const label = messageLabel(message.content)
            return (
              <button
                aria-label={`Go to message ${messageNumber + 1}: ${label}`}
                className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none motion-reduce:transition-none"
                key={messageIndex}
                onClick={() => scrollToMessage(messageIndex)}
                title={label}
                type="button"
              >
                {label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
