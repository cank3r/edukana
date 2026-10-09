import "server-only";

import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { announcementVisibilityWhere, recipientCourseIds, type AnnouncementRecipient } from "@/lib/announcements";

type Identity = { id: string; institutionId: string; role: Role };

export async function getAnnouncementRecipient(identity: Identity, linkedStudentIds: string[] = []): Promise<AnnouncementRecipient> {
  const requestedIds = [...new Set([identity.id, ...linkedStudentIds])];
  const people = await db.user.findMany({
    where: { institutionId: identity.institutionId, id: { in: requestedIds }, status: "ACTIVE" },
    select: {
      id: true,
      role: true,
      enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] }, course: { institutionId: identity.institutionId } }, select: { courseId: true } },
      taughtCourses: { where: { institutionId: identity.institutionId }, select: { id: true } },
      organizationalMemberships: { where: { institutionId: identity.institutionId }, select: { unitId: true } },
    },
  });
  return {
    institutionId: identity.institutionId,
    userIds: people.map((person) => person.id),
    roles: [...new Set(people.map((person) => person.role))],
    courseIds: recipientCourseIds(people),
    unitIds: [...new Set(people.flatMap((person) => person.organizationalMemberships.map((item) => item.unitId)))],
  };
}

export async function getCommunityAnnouncementWhere(identity: Identity, access: { canManage: boolean; canPublish: boolean }) {
  const linkedStudentIds = identity.role === "PARENT"
    ? (await db.guardianship.findMany({
        where: { institutionId: identity.institutionId, parentId: identity.id, status: "ACTIVE", canViewAnnouncements: true, parent: { institutionId: identity.institutionId, role: "PARENT", status: "ACTIVE" }, student: { institutionId: identity.institutionId, role: "STUDENT", status: "ACTIVE" } },
        select: { studentId: true },
      })).map((item) => item.studentId)
    : [];
  if (identity.role === "PARENT" && !linkedStudentIds.length && !access.canManage && !access.canPublish) return { institutionId: identity.institutionId, id: "__restricted__" } as const;
  const recipient = await getAnnouncementRecipient(identity, linkedStudentIds);
  return announcementVisibilityWhere(recipient, identity.id, access);
}
