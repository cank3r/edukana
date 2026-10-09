import "server-only";

import { getAnnouncementRecipient } from "@/lib/announcement-data";
import { announcementRecipientWhere } from "@/lib/announcements";
import { db } from "@/lib/db";
import { canViewGuardianArea, type GuardianLink } from "@/lib/guardianship-policy";
import type { Capability } from "@/lib/capabilities";
import type { EdukanaRole } from "@/types/next-auth";

type ParentIdentity = { id: string; institutionId: string; role: EdukanaRole };

const linkSelect = {
  id: true,
  institutionId: true,
  parentId: true,
  studentId: true,
  status: true,
  canViewAcademics: true,
  canViewAttendance: true,
  canViewSchedule: true,
  canViewAnnouncements: true,
  canViewFinance: true,
} as const;

export async function getLinkedChildren(parent: ParentIdentity, capabilities: ReadonlySet<Capability>) {
  if (parent.role !== "PARENT" || !capabilities.has("child.portal.view")) return [];
  return db.guardianship.findMany({
    where: { institutionId: parent.institutionId, parentId: parent.id, status: "ACTIVE", parent: { institutionId: parent.institutionId, role: "PARENT", status: "ACTIVE" }, student: { institutionId: parent.institutionId, role: "STUDENT", status: "ACTIVE" } },
    select: { ...linkSelect, relationship: true, student: { select: { id: true, name: true } } },
    orderBy: { student: { name: "asc" } },
  });
}

export async function getParentChildView(parent: ParentIdentity, capabilities: ReadonlySet<Capability>, studentId: string) {
  if (parent.role !== "PARENT" || !capabilities.has("child.portal.view")) return null;
  const guardianship = await db.guardianship.findFirst({
    where: {
      institutionId: parent.institutionId,
      parentId: parent.id,
      studentId,
      status: "ACTIVE",
      parent: { institutionId: parent.institutionId, role: "PARENT", status: "ACTIVE" },
      student: { institutionId: parent.institutionId, role: "STUDENT", status: "ACTIVE" },
    },
    select: { ...linkSelect, relationship: true, student: { select: { id: true, name: true } } },
  });
  if (!guardianship) return null;
  const link = guardianship as GuardianLink;
  const academicsAllowed = canViewGuardianArea(link, capabilities, "academics");
  const attendanceAllowed = canViewGuardianArea(link, capabilities, "attendance");
  const scheduleAllowed = canViewGuardianArea(link, capabilities, "schedule");
  const announcementsAllowed = canViewGuardianArea(link, capabilities, "announcements");
  const financeAllowed = canViewGuardianArea(link, capabilities, "finance");

  const enrollments = academicsAllowed ? await db.enrollment.findMany({
    where: { studentId, status: { in: ["ACTIVE", "COMPLETED"] }, course: { institutionId: parent.institutionId } },
    select: {
      id: true,
      status: true,
      progressPercent: true,
      course: {
        select: {
          id: true,
          name: true,
          code: true,
          assignments: { where: { isPublished: true }, select: { id: true, title: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 10 },
        },
      },
      gradeEntries: {
        where: { gradeItem: { isPublished: true, gradingPeriod: { isPublished: true } } },
        select: { score: true, isExcused: true, gradeItem: { select: { title: true, maxScore: true } } },
      },
    },
    orderBy: { enrolledAt: "desc" },
  }) : [];

  const attendance = attendanceAllowed ? await db.attendance.findMany({
    where: { institutionId: parent.institutionId, enrollment: { studentId }, course: { institutionId: parent.institutionId } },
    select: { id: true, date: true, status: true, course: { select: { name: true, code: true } } },
    orderBy: { date: "desc" },
    take: 50,
  }) : [];

  const schedule = scheduleAllowed ? await db.scheduleSlot.findMany({
    where: { institutionId: parent.institutionId, course: { institutionId: parent.institutionId, enrollments: { some: { studentId, status: { in: ["ACTIVE", "COMPLETED"] } } } } },
    select: { id: true, weekday: true, startMinutes: true, endMinutes: true, classroom: true, course: { select: { name: true, code: true } } },
    orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }],
  }) : [];

  const events = scheduleAllowed ? await db.calendarEvent.findMany({
    where: { institutionId: parent.institutionId },
    select: { id: true, title: true, startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
    take: 20,
  }) : [];

  const announcementRecipient = announcementsAllowed ? await getAnnouncementRecipient(parent, [studentId]) : null;
  const announcements = announcementsAllowed && announcementRecipient ? await db.announcement.findMany({
    where: announcementRecipientWhere(announcementRecipient),
    select: {
      id: true,
      title: true,
      content: true,
      externalUrl: true,
      publishedAt: true,
      isPinned: true,
      mentions: { select: { userId: true } },
      relatedCourses: { where: { institutionId: parent.institutionId, course: { institutionId: parent.institutionId } }, select: { course: { select: { id: true, name: true, code: true } } } },
      assets: { where: { confirmedAt: { not: null } }, select: { id: true, originalName: true, mimeType: true } },
    },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take: 20,
  }) : [];

  const finances = financeAllowed ? await db.paymentConcept.findMany({
    where: { institutionId: parent.institutionId, studentId },
    select: { id: true, concept: true, amount: true, currency: true, dueDate: true, status: true },
    orderBy: { dueDate: "asc" },
    take: 20,
  }) : [];

  return {
    child: guardianship.student,
    relationship: guardianship.relationship,
    permissions: { academics: academicsAllowed, attendance: attendanceAllowed, schedule: scheduleAllowed, announcements: announcementsAllowed, finance: financeAllowed },
    courses: enrollments,
    attendance,
    schedule,
    events,
    announcements,
    finances,
  };
}
