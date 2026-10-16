/**
 * Shared contract for replaying a published release announcement.
 * The updates history page dispatches; the announcement controller
 * (profile menu / dialog host) listens and reopens the same carousel.
 */
export const ANNOUNCEMENT_REPLAY_EVENT = "revserp:announcement-replay";

export type AnnouncementReplayDetail = {
  announcementId: string | undefined
};

export function requestAnnouncementReplay(announcementId?: string): void {
  window.dispatchEvent(
    new CustomEvent<AnnouncementReplayDetail>(ANNOUNCEMENT_REPLAY_EVENT, {
      detail: { announcementId },
    }),
  );
}
