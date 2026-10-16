import { clientApiFetch } from "~/lib/api"
import type { OnboardingStatus } from "~/lib/onboarding-state"

export type AnnouncementSeenEntry = {
  announcement_id: string
  seen_at: string
}

/** GET /me/announcements/seen response; user_created_at gates auto display. */
export type AnnouncementSeenResponse = {
  seen_announcements: AnnouncementSeenEntry[]
  user_created_at: string
}

export function announcementSeenQueryKey(userId: string) {
  return ["announcement-seen", userId] as const
}

/** Fetch seen announcements; throws on 404 so auto display stays quiet. */
export function fetchAnnouncementSeen() {
  return clientApiFetch<AnnouncementSeenResponse>("/me/announcements/seen")
}

/** Idempotent acknowledgement; repeated writes preserve the first-seen time. */
export function markAnnouncementSeen(announcementId: string) {
  return clientApiFetch<{ ok: true }>(
    `/me/announcements/${encodeURIComponent(announcementId)}/seen`,
    { method: "PUT" },
  )
}

export function isAnnouncementOnboardingComplete(
  status: OnboardingStatus | null | undefined,
) {
  return status === "completed" || status === "skipped"
}

/** Brand-new accounts never auto-open; invalid dates fail closed. */
export function isUserCreatedBeforeAnnouncement(
  userCreatedAt: string | null | undefined,
  publishedAt: string,
) {
  if (!userCreatedAt) return false
  const created = Date.parse(userCreatedAt)
  const published = Date.parse(publishedAt)
  if (Number.isNaN(created) || Number.isNaN(published)) return false
  return created < published
}

export function hasSeenAnnouncement(
  seenIds: Set<string> | readonly string[],
  announcementId: string,
): boolean {
  if (seenIds instanceof Set) return seenIds.has(announcementId)
  return seenIds.includes(announcementId)
}

/** Eligible baseline for automatic display; manual opens bypass this. */
export function shouldAutoShowAnnouncement({
  seenSuccess,
  userCreatedAt,
  publishedAt,
  announcementId,
  seenIds,
  onboardingStatus,
}: {
  seenSuccess: boolean
  userCreatedAt: string | null | undefined
  publishedAt: string
  announcementId: string
  seenIds: Set<string> | readonly string[]
  onboardingStatus: OnboardingStatus | null | undefined
}) {
  if (!seenSuccess) return false
  if (!isAnnouncementOnboardingComplete(onboardingStatus)) return false
  if (!isUserCreatedBeforeAnnouncement(userCreatedAt, publishedAt)) return false
  if (hasSeenAnnouncement(seenIds, announcementId)) return false
  return true
}
