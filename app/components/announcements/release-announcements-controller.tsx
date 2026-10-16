"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocation, useNavigate } from "react-router"

import { ReleaseAnnouncementDialog } from "~/components/announcements/release-announcement-dialog"
import { useOnboardingUi } from "~/components/onboarding/onboarding-ui"
import {
  ANNOUNCEMENT_REPLAY_EVENT,
  type AnnouncementReplayDetail,
} from "~/lib/announcement-events"
import {
  announcementSeenQueryKey,
  fetchAnnouncementSeen,
  hasSeenAnnouncement,
  markAnnouncementSeen,
  shouldAutoShowAnnouncement,
} from "~/lib/announcement-seen-api"
import type { OnboardingStatus } from "~/lib/onboarding-state"
import { getPublishedReleaseAnnouncements } from "~/lib/release-announcements"
import type { ReleaseAnnouncement } from "~/lib/release-announcements"

type PendingAnnouncement = {
  release: ReleaseAnnouncement
  manual: boolean
}

/** Small controller for release announcements; auto shows only the latest release. */
export function ReleaseAnnouncementsController({
  userId,
  onboardingStatus,
  setupPanelVisible,
  setupRunning,
}: {
  userId: string
  onboardingStatus: OnboardingStatus | null | undefined
  setupPanelVisible: boolean
  setupRunning: boolean
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const onboardingUi = useOnboardingUi()
  const [selected, setSelected] = useState<ReleaseAnnouncement | null>(null)
  const [open, setOpen] = useState(false)
  const dismissedRef = useRef<Set<string>>(new Set())
  const pendingRef = useRef<PendingAnnouncement | null>(null)
  const observerRef = useRef<MutationObserver | null>(null)

  useEffect(() => {
    dismissedRef.current = new Set()
    pendingRef.current = null
    setSelected(null)
    setOpen(false)
  }, [userId])

  const seenQuery = useQuery({
    queryKey: announcementSeenQueryKey(userId),
    queryFn: fetchAnnouncementSeen,
    enabled: userId !== "",
    staleTime: 60_000,
    retry: 1,
  })

  const seenIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entry of seenQuery.data?.seen_announcements ?? []) {
      ids.add(entry.announcement_id)
    }
    return ids
  }, [seenQuery.data])

  const latest = useMemo(
    () => getPublishedReleaseAnnouncements()[0] ?? null,
    [],
  )

  const stopObserver = useCallback(() => {
    observerRef.current?.disconnect()
    observerRef.current = null
  }, [])

  useEffect(() => stopObserver, [stopObserver, userId])

  const isModalBlocked = useCallback(() => {
    if (typeof document === "undefined") return false
    if (onboardingUi?.isCreateProjectOpen) return true
    if (onboardingUi?.isBusinessProfileOpen) return true
    if (document.querySelector(".driver-overlay, .driver-popover")) return true
    if (!open) {
      const dialogs = document.querySelectorAll('[role="dialog"]:not([aria-label="Revbot"])')
      for (const dialog of dialogs) {
        if (!dialog.closest('[aria-hidden="true"], [inert]')) return true
      }
    }
    return false
  }, [onboardingUi?.isBusinessProfileOpen, onboardingUi?.isCreateProjectOpen, open])

  const isAutoBlocked = useCallback(() => {
    if (location.pathname.startsWith("/app/updates")) return true
    if (setupPanelVisible || setupRunning) return true
    return isModalBlocked()
  }, [isModalBlocked, location.pathname, setupPanelVisible, setupRunning])

  const isBlockedFor = useCallback(
    (manual: boolean) => (manual ? false : isAutoBlocked()),
    [isAutoBlocked],
  )

  const latestPendingAnnouncementOpener = useRef<() => boolean>(() => false)
  latestPendingAnnouncementOpener.current = () => {
    const pending = pendingRef.current
    if (!pending || open) return false
    if (!pending.manual && dismissedRef.current.has(pending.release.id)) {
      pendingRef.current = null
      return false
    }
    if (isBlockedFor(pending.manual)) return false
    pendingRef.current = null
    stopObserver()
    setSelected(pending.release)
    setOpen(true)
    return true
  }

  const ensureObserver = useCallback(() => {
    if (observerRef.current) return
    if (typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(() => {
      if (!pendingRef.current) {
        stopObserver()
        return
      }
      latestPendingAnnouncementOpener.current()
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    })
    observerRef.current = observer
  }, [stopObserver])

  const requestOpen = useCallback(
    (release: ReleaseAnnouncement, manual: boolean) => {
      if (!manual && dismissedRef.current.has(release.id)) return
      pendingRef.current = { release, manual }
      if (latestPendingAnnouncementOpener.current()) return
      ensureObserver()
    },
    [ensureObserver],
  )

  useEffect(() => {
    if (pendingRef.current) latestPendingAnnouncementOpener.current()
  })

  useEffect(() => {
    const onReplay = (event: Event) => {
      const detail = (event as CustomEvent<AnnouncementReplayDetail>).detail
      const published = getPublishedReleaseAnnouncements()
      if (detail?.announcementId) {
        const match = published.find(
          (release) => release.id === detail.announcementId,
        )
        if (!match) return
        requestOpen(match, true)
        return
      }
      const newest = published[0] ?? null
      if (newest) requestOpen(newest, true)
    }
    window.addEventListener(ANNOUNCEMENT_REPLAY_EVENT, onReplay)
    return () => window.removeEventListener(ANNOUNCEMENT_REPLAY_EVENT, onReplay)
  }, [requestOpen])

  useEffect(() => {
    if (open || !latest) return
    if (!seenQuery.isSuccess || !seenQuery.data) return
    const eligible = shouldAutoShowAnnouncement({
      seenSuccess: seenQuery.isSuccess,
      userCreatedAt: seenQuery.data.user_created_at,
      publishedAt: latest.publishedAt,
      announcementId: latest.id,
      seenIds,
      onboardingStatus,
    })
    if (!eligible) return
    requestOpen(latest, false)
  }, [
    latest,
    onboardingStatus,
    open,
    requestOpen,
    seenIds,
    seenQuery.data,
    seenQuery.isSuccess,
  ])

  const dismissRelease = useCallback(
    (release: ReleaseAnnouncement) => {
      dismissedRef.current.add(release.id)
      if (pendingRef.current?.release.id === release.id) {
        pendingRef.current = null
      }
      stopObserver()
      setOpen(false)
      if (hasSeenAnnouncement(seenIds, release.id)) return
      void markAnnouncementSeen(release.id).then(
        () => {
          void queryClient.invalidateQueries({
            queryKey: announcementSeenQueryKey(userId),
          })
        },
        () => {
        },
      )
    },
    [queryClient, seenIds, stopObserver, userId],
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && selected) {
        dismissRelease(selected)
        return
      }
      setOpen(nextOpen)
    },
    [dismissRelease, selected],
  )

  const handleViewAll = useCallback(() => {
    if (selected) dismissRelease(selected)
    const params = new URLSearchParams(location.search)
    const next = new URLSearchParams()
    for (const key of ["project", "crawl"] as const) {
      const value = params.get(key)
      if (value) next.set(key, value)
    }
    const suffix = next.toString()
    void navigate(`/app/updates${suffix ? `?${suffix}` : ""}`)
  }, [dismissRelease, location.search, navigate, selected])

  if (!selected) return null
  return (
    <ReleaseAnnouncementDialog
      release={selected}
      open={open}
      onOpenChange={handleOpenChange}
      onViewAll={handleViewAll}
    />
  )
}
