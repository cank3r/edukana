import { z } from "zod";
import type { EdukanaRole } from "@/types/next-auth";

export const platformAnnouncementSchema = z.object({
  title: z.string().trim().min(3, "Escribe un título de al menos 3 letras.").max(160),
  body: z.string().trim().min(1, "Escribe el mensaje.").max(4000),
  level: z.enum(["INFO", "WARNING"]),
  audience: z.enum(["ALL", "ADMINS", "INDEPENDENT"]),
  startsAt: z.preprocess((value) => value == null || value === "" ? undefined : value, z.coerce.date()),
  endsAt: z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.date().nullable()),
}).refine((data) => !data.endsAt || data.endsAt > data.startsAt, {
  message: "La fecha de fin debe ser posterior al inicio.", path: ["endsAt"],
});

export type AnnouncementAudience = "ALL" | "ADMINS" | "INDEPENDENT";
export function announcementAudiences(role: EdukanaRole, independent: boolean): AnnouncementAudience[] {
  const audiences: AnnouncementAudience[] = ["ALL"];
  if (role === "ADMIN" || role === "SUPER_ADMIN") audiences.push("ADMINS");
  // Independent messages target the owner/teacher, not students buying their courses.
  if (independent && (role === "ADMIN" || role === "SUPER_ADMIN" || role === "TEACHER")) audiences.push("INDEPENDENT");
  return audiences;
}
export function announcementIsCurrent(announcement: { startsAt: Date; endsAt: Date | null }, now: Date) {
  return announcement.startsAt <= now && (!announcement.endsAt || announcement.endsAt > now);
}
export function announcementDismissalKey(personId: string, announcementId: string) {
  return `edukana:platform-announcement:${encodeURIComponent(personId)}:${encodeURIComponent(announcementId)}`;
}
