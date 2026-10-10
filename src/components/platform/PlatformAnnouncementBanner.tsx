import { getDashboardPlatformAnnouncements } from "@/server/platform/announcements";
import type { EdukanaRole } from "@/types/next-auth";
import { DismissiblePlatformAnnouncement } from "./DismissiblePlatformAnnouncement";

export async function PlatformAnnouncementBanner(props: { institutionId: string; userId: string; role: EdukanaRole }) {
  const { personId, announcements } = await getDashboardPlatformAnnouncements(props);
  return <div className="space-y-2">{announcements.map((announcement) => (
    <DismissiblePlatformAnnouncement key={`${personId}:${announcement.id}`} personId={personId}
      announcement={{ ...announcement, endsAt: announcement.endsAt?.toISOString() ?? null }} />
  ))}</div>;
}
