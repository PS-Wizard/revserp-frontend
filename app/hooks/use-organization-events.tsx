"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { clientApiSSE } from "~/lib/api"
import type { OrganizationEventFrame } from "~/lib/api.types"

// Server closes the stream around five minutes; reconnect quietly.
const RECONNECT_DELAY_MS = 1500

type OrganizationEventListener = (event: OrganizationEventFrame) => void

const OrganizationEventsContext = createContext<{
  subscribe: (listener: OrganizationEventListener) => () => void
} | null>(null)

/**
 * Subscribe to the single organization events connection. The listener is kept
 * in a ref so a handler defined in render scope is always the one invoked.
 */
export function useOrganizationEventsListener(
  listener: OrganizationEventListener
) {
  const context = useContext(OrganizationEventsContext)
  const listenerRef = useRef(listener)
  listenerRef.current = listener

  useEffect(() => {
    if (!context) return
    return context.subscribe((event) => listenerRef.current(event))
  }, [context])
}

function parseOrganizationEvent(
  name: string,
  data: unknown
): OrganizationEventFrame | null {
  if (!data || typeof data !== "object") return null
  const record = data as Record<string, unknown>
  const payload =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : {}
  return {
    type: name,
    organization_id:
      typeof record.organization_id === "string" ? record.organization_id : "",
    project_id:
      typeof record.project_id === "string" ? record.project_id : null,
    resource_id:
      typeof record.resource_id === "string" ? record.resource_id : null,
    payload,
    created_at: typeof record.created_at === "string" ? record.created_at : "",
  }
}

const DECIMAL_CURSOR_RE = /^\d+$/

// Cursors are opaque decimal strings; keep them as strings so large ids never
// round through an unsafe JS number.
function toDecimalCursor(value: unknown): string | null {
  if (typeof value === "string") {
    return DECIMAL_CURSOR_RE.test(value) ? value : null
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value)
  }
  return null
}

function readCursor(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  return toDecimalCursor((data as { cursor?: unknown }).cursor)
}

// Monotonic compare for non-negative decimal strings (no leading-zero
// normalization needed beyond stripping, then length + lexicographic).
function compareDecimal(a: string, b: string): number {
  const left = a.replace(/^0+(?=\d)/, "")
  const right = b.replace(/^0+(?=\d)/, "")
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  if (left === right) return 0
  return left < right ? -1 : 1
}

function errorDescription(event: OrganizationEventFrame) {
  const error = event.payload.error
  return typeof error === "string" && error.trim() ? error.trim() : undefined
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

/**
 * Owns the single organization-level SSE connection mounted once in the
 * dashboard route. Crawl frames are delegated to the crawl tracker; prompt
 * generation frames are left to subscribers; every other frame invalidates
 * authoritative queries, revalidates loader data, or drives its lifecycle toast.
 */
export function OrganizationEventsProvider({
  orgId,
  onReady,
  onCrawlEvent,
  onViewVisibility,
  revalidate,
  children,
}: {
  orgId: string
  onReady: () => void
  onCrawlEvent: (event: OrganizationEventFrame) => void
  onViewVisibility: (projectId: string | null) => void
  revalidate: () => void
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const listenersRef = useRef(new Set<OrganizationEventListener>())
  // Infinite loading toasts this provider owns; dismissed on org switch/unmount.
  const activeLoadingToastsRef = useRef(new Set<string>())

  const subscribe = useCallback((listener: OrganizationEventListener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const contextValue = useMemo(() => ({ subscribe }), [subscribe])

  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onCrawlEventRef = useRef(onCrawlEvent)
  onCrawlEventRef.current = onCrawlEvent
  const onViewVisibilityRef = useRef(onViewVisibility)
  onViewVisibilityRef.current = onViewVisibility
  const revalidateRef = useRef(revalidate)
  revalidateRef.current = revalidate

  const dispatchEvent = useCallback(
    (event: OrganizationEventFrame) => {
      for (const listener of [...listenersRef.current]) listener(event)

      const type = event.type

      if (type.startsWith("crawl.")) {
        onCrawlEventRef.current(event)
        // Competitor crawl progress/terminal frames replace the removed
        // competitor poll: the crawl toast is handled by the tracker, but the
        // competitor cards read authoritative query data.
        if (event.payload.source === "competitor" && event.project_id) {
          void queryClient.invalidateQueries({
            queryKey: ["project-competitors", event.project_id],
          })
        }
        return
      }

      // Prompt generation keeps its own click-owned toast lifecycle.
      if (type.startsWith("prompt_generation.")) return

      if (type.startsWith("ai_audit.")) {
        const auditId = event.resource_id
        const toastId = auditId ? `ai-audit-${auditId}` : undefined
        const action = {
          label: "View",
          onClick: () => onViewVisibilityRef.current(event.project_id),
        }
        if (
          type.startsWith("ai_audit.completed") ||
          type === "ai_audit.failed"
        ) {
          if (event.project_id) {
            void queryClient.invalidateQueries({
              queryKey: ["ai-audits-list", event.project_id],
            })
          }
          if (auditId) {
            void queryClient.invalidateQueries({
              queryKey: ["ai-audit", auditId],
            })
          }
          if (!toastId) return
          activeLoadingToastsRef.current.delete(toastId)
          if (type === "ai_audit.completed") {
            toast.success("Visibility test complete", {
              description: "Open the results to review your rankings.",
              id: toastId,
              action,
            })
          } else if (type === "ai_audit.completed_with_failures") {
            toast.warning("Visibility test finished with issues", {
              description:
                "Some questions could not be answered. Review the results for details.",
              id: toastId,
              action,
            })
          } else if (type === "ai_audit.failed") {
            toast.error("Visibility test failed", {
              description: errorDescription(event),
              id: toastId,
              action,
            })
          }
          return
        }
        // queued/started/progress: refresh the audit so the live UI advances
        // without the old refetchInterval, and keep one loading toast.
        if (
          (type === "ai_audit.queued" || type === "ai_audit.started") &&
          event.project_id
        ) {
          void queryClient.invalidateQueries({
            queryKey: ["ai-audits-list", event.project_id],
          })
        }
        if (auditId) {
          void queryClient.invalidateQueries({
            queryKey: ["ai-audit", auditId],
          })
        }
        if (toastId) {
          toast.loading(
            <span className="shimmer text-muted-foreground">
              Running visibility test…
            </span>,
            {
              description: "Checking your brand across AI models.",
              duration: Infinity,
              id: toastId,
              action,
            }
          )
          activeLoadingToastsRef.current.add(toastId)
        }
        return
      }

      if (type.startsWith("maps_visibility.")) {
        const runId = event.resource_id
        const toastId = `maps-visibility-${runId ?? event.project_id ?? "run"}`
        if (event.project_id) {
          void queryClient.invalidateQueries({
            queryKey: ["maps-visibility", event.project_id],
          })
        }
        if (
          type === "maps_visibility.queued" ||
          type === "maps_visibility.started"
        ) {
          toast.loading(
            <span className="shimmer text-muted-foreground">
              Checking Maps rankings…
            </span>,
            { duration: Infinity, id: toastId }
          )
          activeLoadingToastsRef.current.add(toastId)
          return
        }
        if (type === "maps_visibility.completed") {
          activeLoadingToastsRef.current.delete(toastId)
          toast.success("Maps visibility ready", {
            description: "Your local rankings are up to date.",
            id: toastId,
          })
        } else if (type === "maps_visibility.failed") {
          activeLoadingToastsRef.current.delete(toastId)
          toast.error("Maps visibility check failed", {
            description: errorDescription(event),
            id: toastId,
          })
        }
        return
      }

      if (type === "business_profile.updated") {
        if (event.project_id) {
          void queryClient.invalidateQueries({
            queryKey: ["business-profile", event.project_id],
          })
          void queryClient.invalidateQueries({
            queryKey: ["project-keywords", event.project_id],
          })
        }
        return
      }

      if (type.startsWith("project_competitor.")) {
        if (event.project_id) {
          void queryClient.invalidateQueries({
            queryKey: ["project-competitors", event.project_id],
          })
        }
        return
      }

      // Setup progress is backend-owned: refresh the setup row on every frame
      // and pull fresh loader data once the setup finishes. No polling and no
      // second EventSource.
      if (type.startsWith("project_setup.")) {
        if (event.project_id) {
          void queryClient.invalidateQueries({
            queryKey: ["project-setup", event.project_id],
          })
        }
        if (type === "project_setup.completed") {
          // Completion is the first moment every setup-fed view can have
          // data. Refresh them all, then pull fresh loader data so the audit
          // view swaps in even if a granular event was missed mid-reconnect.
          if (event.project_id) {
            void queryClient.invalidateQueries({
              queryKey: ["bucket-trends", event.project_id],
            })
            void queryClient.invalidateQueries({
              queryKey: ["business-profile", event.project_id],
            })
            void queryClient.invalidateQueries({
              queryKey: ["project-keywords", event.project_id],
            })
            void queryClient.invalidateQueries({
              queryKey: ["ai-audits-list", event.project_id],
            })
          }
          revalidateRef.current()
        }
        return
      }

      if (type.startsWith("project.")) {
        revalidateRef.current()
      }
    },
    [queryClient]
  )

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    // `hasCursor` flips true on the first ready frame: from then on every
    // reconnect replays with ?after=<cursor>, including after=0, so an event
    // that lands during the reconnect gap is never skipped.
    let cursor: string | null = null
    let hasCursor = false
    const advanceCursor = (next: string | null) => {
      if (next === null) return
      if (cursor === null || compareDecimal(next, cursor) > 0) cursor = next
    }
    const controller = new AbortController()

    const connect = async () => {
      while (!cancelled && !controller.signal.aborted) {
        try {
          const query = hasCursor && cursor !== null ? `?after=${cursor}` : ""
          await clientApiSSE(`/organizations/${orgId}/events${query}`, {
            signal: controller.signal,
            onEvent: (name, payload, eventId) => {
              if (cancelled || controller.signal.aborted) return
              advanceCursor(toDecimalCursor(eventId))
              if (name === "ready") {
                advanceCursor(readCursor(payload))
                hasCursor = true
                // Fresh (and reconnected) connections resync active crawls so a
                // page that loads mid-crawl still finds it. One-shot, not polling.
                onReadyRef.current()
                return
              }
              const event = parseOrganizationEvent(name, payload)
              if (event) dispatchEvent(event)
            },
          })
        } catch (error) {
          if (cancelled || controller.signal.aborted) return
          console.error("Organization events stream failed:", error)
        }
        if (cancelled || controller.signal.aborted) return
        await delay(RECONNECT_DELAY_MS, controller.signal)
      }
    }

    void connect()

    return () => {
      cancelled = true
      controller.abort()
      for (const id of activeLoadingToastsRef.current) toast.dismiss(id)
      activeLoadingToastsRef.current.clear()
    }
  }, [orgId, dispatchEvent])

  return (
    <OrganizationEventsContext.Provider value={contextValue}>
      {children}
    </OrganizationEventsContext.Provider>
  )
}
