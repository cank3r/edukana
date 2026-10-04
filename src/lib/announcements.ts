import type { Prisma, Role } from "@prisma/client";
import type { Capability } from "@/lib/capabilities";
import { z } from "zod";

export const announcementRoles = ["SUPER_ADMIN", "ADMIN", "COORDINATOR", "TEACHER", "STUDENT", "PARENT"] as const satisfies readonly Role[];

export const externalAnnouncementUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      return ["https:", "mailto:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "El enlace debe usar https o mailto.");

export const announcementContentSchema = z
  .string()
  .trim()
  .min(10, "El comunicado debe tener al menos 10 caracteres")
  .max(20000, "El comunicado no puede superar 20,000 caracteres");

export function safeAnnouncementHref(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "mailto:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

const ANNOUNCEMENT_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ANNOUNCEMENT_VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

export function validateAnnouncementUpload(file: { name: string; type: string; size: number }) {
  if (!file.name || file.name.length > 180) return "Nombre de archivo inválido.";
  const image = ANNOUNCEMENT_IMAGE_MIMES.has(file.type);
  const video = ANNOUNCEMENT_VIDEO_MIMES.has(file.type);
  if (!image && !video) return `Formato ${file.type || "desconocido"} no permitido.`;
  const max = video ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size <= 0 || file.size > max) return `El archivo excede el límite de ${video ? "100 MB" : "10 MB"}.`;
  return null;
}

export type AnnouncementRecipient = {
  institutionId: string;
  userIds: string[];
  roles: Role[];
  courseIds: string[];
  unitIds: string[];
};

export function announcementRecipientWhere(recipient: AnnouncementRecipient): Prisma.AnnouncementWhereInput {
  const userIds = [...new Set(recipient.userIds)];
  const roles = [...new Set(recipient.roles)];
  const courseIds = [...new Set(recipient.courseIds)];
  const unitIds = [...new Set(recipient.unitIds)];
  const filters: Prisma.AnnouncementWhereInput[] = [{ audienceInstitution: true }, { audience: "ALL" }];
  if (roles.length) filters.push(
    { roleTargets: { some: { role: { in: roles } } } },
    { audience: "ROLE", audienceId: { in: roles } },
  );
  if (courseIds.length) filters.push(
    { courseTargets: { some: { courseId: { in: courseIds } } } },
    { audience: "COURSE", audienceId: { in: courseIds } },
  );
  if (userIds.length) filters.push({ userTargets: { some: { userId: { in: userIds } } } });
  if (unitIds.length) filters.push({ unitTargets: { some: { unitId: { in: unitIds } } } });
  return { institutionId: recipient.institutionId, OR: filters };
}

export function isMentionInsideAudience(
  mentioned: { id: string; role: Role; courseIds: string[]; unitIds: string[] },
  audience: { institution: boolean; roles: Role[]; courseIds: string[]; userIds: string[]; unitIds: string[] },
) {
  return audience.institution
    || audience.userIds.includes(mentioned.id)
    || audience.roles.includes(mentioned.role)
    || mentioned.courseIds.some((id) => audience.courseIds.includes(id))
    || mentioned.unitIds.some((id) => audience.unitIds.includes(id));
}


export function announcementVisibilityWhere(
  recipient: AnnouncementRecipient,
  actorId: string,
  access: { canManage: boolean; canPublish: boolean },
): Prisma.AnnouncementWhereInput {
  if (access.canManage) return { institutionId: recipient.institutionId };
  const recipientWhere = announcementRecipientWhere(recipient);
  if (!access.canPublish) return recipientWhere;
  return {
    institutionId: recipient.institutionId,
    OR: [
      { authorId: actorId },
      { AND: [recipientWhere] },
    ],
  };
}

export function canSeeAnnouncementAudienceDetails(viewer: { id: string; canManage: boolean }, authorId: string) {
  return viewer.canManage || viewer.id === authorId;
}

export function announcementAudienceLabel(labels: readonly string[], canSeeDetails: boolean) {
  if (!canSeeDetails) return "Para ti";
  return labels.length ? labels.join(" · ") : "Audiencia heredada";
}

export function canTargetAnnouncementPeople(capabilities: ReadonlySet<Capability>) {
  return capabilities.has("announcement.publish") && capabilities.has("people.view");
}


export function recipientCourseIds(people: readonly {
  enrollments: readonly { courseId: string }[];
  taughtCourses: readonly { id: string }[];
}[]) {
  return [...new Set(people.flatMap((person) => [
    ...person.enrollments.map((item) => item.courseId),
    ...person.taughtCourses.map((course) => course.id),
  ]))];
}

export function canOpenRelatedCourse(role: Role, readableCourseIds: ReadonlySet<string>, courseId: string) {
  return role !== "PARENT" && readableCourseIds.has(courseId);
}
