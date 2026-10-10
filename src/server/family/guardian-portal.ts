import "server-only";

import { getAnnouncementRecipient } from "@/lib/announcement-data";
import { announcementRecipientWhere } from "@/lib/announcements";
import { getEffectiveCapabilities } from "@/lib/authorization";
import { db } from "@/lib/db";
import { CLOSE_VERBS, deadlineLabel } from "@/lib/deadline";
import { courseAverage, type AveragePeriod } from "@/lib/gradebook-calc";
import { canViewGuardianArea, type GuardianArea } from "@/lib/guardianship-policy";
import { chargeBalances } from "@/server/finance/charges";
import { formatWhen, safeTimezone } from "@/server/student-home";
import type { EdukanaRole } from "@/types/next-auth";

/**
 * Portal del tutor: todo es lectura y todo pasa por `authorizeChildren`.
 *
 * Regla única: un tutor ve datos de un estudiante solo si hay un vínculo ACTIVE entre ambos en
 * la misma institución, las dos cuentas están activas, su rol conserva el permiso del área y ese
 * vínculo concreto la autoriza. Ninguna consulta de este archivo recibe un estudiante que no
 * haya salido de esa función.
 */

export type GuardianActor = { id: string; institutionId: string; role: EdukanaRole };
export type ChildPermissions = Record<GuardianArea, boolean>;
export type ChildAccess = { student: { id: string; name: string }; relationship: string; permissions: ChildPermissions };

/** Por debajo de este porcentaje de asistencia se avisa al tutor. */
export const ATTENDANCE_ALERT_BELOW = 80;
/** Ventana de «Próximas clases». */
export const UPCOMING_CLASS_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
const VISIBLE_ENROLLMENTS = ["ACTIVE", "COMPLETED"] as const;
const OWED_STATUSES = ["PENDING", "PARTIAL", "OVERDUE"] as const;

/**
 * Función central de autorización. Devuelve los hijos que esta persona puede ver ahora mismo
 * (o solo `studentId` si se indica) con las áreas permitidas para cada uno; lista vacía si no
 * es tutor, si su rol perdió el acceso al portal o si no hay vínculo activo.
 */
export async function authorizeChildren(actor: GuardianActor, studentId?: string): Promise<ChildAccess[]> {
  if (!actor?.id || !actor.institutionId || actor.role !== "PARENT") return [];
  if (studentId !== undefined && (typeof studentId !== "string" || !studentId)) return [];
  const capabilities = await getEffectiveCapabilities(actor.institutionId, actor.role);
  if (!capabilities.has("child.portal.view")) return [];
  const links = await db.guardianship.findMany({
    where: {
      institutionId: actor.institutionId,
      parentId: actor.id,
      ...(studentId !== undefined ? { studentId } : {}),
      status: "ACTIVE",
      parent: { institutionId: actor.institutionId, role: "PARENT", status: "ACTIVE" },
      student: { institutionId: actor.institutionId, role: "STUDENT", status: "ACTIVE" },
    },
    select: {
      id: true,
      institutionId: true,
      parentId: true,
      studentId: true,
      status: true,
      relationship: true,
      canViewAcademics: true,
      canViewAttendance: true,
      canViewSchedule: true,
      canViewAnnouncements: true,
      canViewFinance: true,
      student: { select: { id: true, name: true } },
    },
    orderBy: [{ student: { name: "asc" } }, { id: "asc" }],
  });
  return links.map((link) => ({
    student: link.student,
    relationship: link.relationship,
    permissions: {
      academics: canViewGuardianArea(link, capabilities, "academics"),
      attendance: canViewGuardianArea(link, capabilities, "attendance"),
      schedule: canViewGuardianArea(link, capabilities, "schedule"),
      announcements: canViewGuardianArea(link, capabilities, "announcements"),
      finance: canViewGuardianArea(link, capabilities, "finance"),
    },
  }));
}

export type ChildCourse = {
  courseId: string;
  name: string;
  teacherName: string;
  completed: boolean;
  progressPercent: number;
  lessonsDone: number;
  lessonsTotal: number;
  finalGrade: number | null;
};
export type ChildTask = {
  id: string;
  title: string;
  courseName: string;
  dueAt: Date | null;
  dueText: string | null;
  state: "pending" | "overdue" | "submitted" | "graded";
  maxScore: number;
  /** Solo cuando la nota está publicada. */
  score: number | null;
  feedback: string | null;
};
export type ChildGradeItem = { id: string; title: string; maxScore: number; score: number | null; isExcused: boolean; feedback: string | null };
export type ChildCourseGrades = { courseId: string; courseName: string; average: number | null; items: ChildGradeItem[] };
export type ChildAttendance = {
  /** Null cuando todavía no hay clases que cuenten. */
  percent: number | null;
  incidents: Array<{ id: string; date: Date; status: "ABSENT" | "LATE" | "EXCUSED"; courseName: string }>;
};
/** Sin enlace de entrada: el tutor no entra a la clase. */
export type ChildLiveClass = { id: string; title: string; courseName: string; startsAt: Date; when: string; durationMinutes: number };
export type ChildDeadline = { key: string; kind: "Tarea" | "Examen"; title: string; courseName: string; dueAt: Date; dueText: string };
export type ChildWeeklySlot = { id: string; courseName: string; weekday: number; startMinutes: number; endMinutes: number; classroom: string };
export type ChildEvent = { id: string; title: string; startDate: Date };
export type ChildAccount = {
  /** Un total por moneda, en centavos enteros. */
  totals: Array<{ currency: string; owedCents: number; overdueCents: number }>;
  /** Cargos con saldo. `amountCents` es lo que falta pagar de ese cargo (descontados los pagos no anulados). */
  charges: Array<{ id: string; concept: string; amountCents: number; currency: string; dueDate: Date | null; status: string; overdue: boolean }>;
};
export type ChildAlert = { kind: "overdue" | "attendance"; text: string };

type ChildData = {
  courses: ChildCourse[];
  tasks: ChildTask[];
  grades: ChildCourseGrades[];
  attendance: ChildAttendance | null;
  liveClasses: ChildLiveClass[];
  deadlines: ChildDeadline[];
  weekly: ChildWeeklySlot[];
  events: ChildEvent[];
  alerts: ChildAlert[];
};

export type ChildCard = {
  studentId: string;
  name: string;
  permissions: ChildPermissions;
  /** Null cuando el vínculo no permite ver lo académico. */
  activeCourses: number | null;
  averageProgress: number | null;
  nextClass: ChildLiveClass | null;
  alerts: ChildAlert[];
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const unique = <T,>(values: T[]) => [...new Set(values)];

function findAnnouncements(actor: GuardianActor, where: ReturnType<typeof announcementRecipientWhere>) {
  return db.announcement.findMany({
    where,
    select: {
      id: true,
      title: true,
      content: true,
      externalUrl: true,
      publishedAt: true,
      isPinned: true,
      mentions: { select: { userId: true } },
      relatedCourses: { where: { institutionId: actor.institutionId, course: { institutionId: actor.institutionId } }, select: { course: { select: { id: true, name: true } } } },
      assets: { where: { confirmedAt: { not: null } }, select: { id: true, originalName: true, mimeType: true } },
    },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take: 20,
  });
}
export type ChildAnnouncement = Awaited<ReturnType<typeof findAnnouncements>>[number];

export type ChildOverview = ChildData & {
  child: { id: string; name: string };
  relationship: string;
  timezone: string;
  permissions: ChildPermissions;
  announcements: ChildAnnouncement[];
  account: ChildAccount | null;
};

/**
 * Datos académicos, de asistencia y de horario de los hijos ya autorizados, en dos rondas de
 * consultas en paralelo sin importar cuántos hijos, cursos o tareas haya. Cada consulta se
 * limita a los estudiantes cuyo vínculo permite esa área.
 */
async function collect(institutionId: string, accesses: ChildAccess[], now: Date, detailed: boolean) {
  const idsWith = (area: GuardianArea) => accesses.filter((access) => access.permissions[area]).map((access) => access.student.id);
  const academicIds = new Set(idsWith("academics"));
  const scheduleIds = new Set(idsWith("schedule"));
  const attendanceIds = idsWith("attendance");
  const courseStudentIds = unique([...academicIds, ...scheduleIds]);

  const [institution, enrollments, attendanceRows] = await Promise.all([
    db.institution.findUnique({ where: { id: institutionId }, select: { timezone: true } }),
    courseStudentIds.length
      ? db.enrollment.findMany({
          where: {
            studentId: { in: courseStudentIds },
            status: { in: [...VISIBLE_ENROLLMENTS] },
            course: { institutionId, isPublished: true, archivedAt: null },
          },
          select: {
            id: true,
            studentId: true,
            status: true,
            progressPercent: true,
            finalGrade: true,
            course: { select: { id: true, name: true, teacher: { select: { name: true } } } },
          },
          orderBy: [{ enrolledAt: "desc" }, { id: "asc" }],
        })
      : [],
    attendanceIds.length
      ? db.attendance.findMany({
          where: { institutionId, course: { institutionId }, enrollment: { studentId: { in: attendanceIds } } },
          select: { id: true, date: true, status: true, course: { select: { name: true } }, enrollment: { select: { studentId: true } } },
          orderBy: [{ date: "desc" }, { id: "asc" }],
          take: 3000,
        })
      : [],
  ]);
  const timezone = safeTimezone(institution?.timezone);

  const academicEnrollments = enrollments.filter((row) => academicIds.has(row.studentId));
  const academicCourseIds = unique(academicEnrollments.map((row) => row.course.id));
  const academicEnrollmentIds = academicEnrollments.map((row) => row.id);
  const academicStudentIds = unique(academicEnrollments.map((row) => row.studentId));
  const scheduleCourseIds = unique(enrollments.filter((row) => scheduleIds.has(row.studentId) && row.status === "ACTIVE").map((row) => row.course.id));
  const hasAcademics = academicCourseIds.length > 0;
  const hasSchedule = scheduleCourseIds.length > 0;

  const [lessons, progress, assignments, periods, exams, liveRows, slots, events] = await Promise.all([
    hasAcademics
      ? db.lesson.findMany({
          where: { institutionId, courseId: { in: academicCourseIds }, isPublished: true, section: { isPublished: true } },
          select: { id: true, courseId: true },
        })
      : [],
    hasAcademics
      ? db.lessonProgress.findMany({
          where: { institutionId, enrollmentId: { in: academicEnrollmentIds }, completed: true },
          select: { lessonId: true, enrollmentId: true },
        })
      : [],
    hasAcademics
      ? db.assignment.findMany({
          where: { courseId: { in: academicCourseIds }, course: { institutionId }, isPublished: true },
          select: {
            id: true,
            title: true,
            dueDate: true,
            maxScore: true,
            courseId: true,
            gradeItem: { select: { isPublished: true } },
            submissions: {
              where: { studentId: { in: academicStudentIds }, status: { not: "DRAFT" } },
              select: { studentId: true, status: true, score: true, feedback: true },
            },
          },
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
          take: 500,
        })
      : [],
    hasAcademics
      ? db.gradingPeriod.findMany({
          where: { institutionId, courseId: { in: academicCourseIds } },
          orderBy: [{ startDate: "asc" }, { name: "asc" }],
          select: {
            courseId: true,
            weight: true,
            categories: {
              orderBy: { name: "asc" },
              select: {
                weight: true,
                dropLowest: true,
                items: {
                  // Solo actividades con notas publicadas: es lo mismo que ve el propio estudiante.
                  where: { isPublished: true },
                  orderBy: [{ dueDate: "asc" }, { title: "asc" }],
                  select: {
                    id: true,
                    title: true,
                    maxScore: true,
                    weight: true,
                    entries: { where: { enrollmentId: { in: academicEnrollmentIds } }, select: { enrollmentId: true, score: true, isExcused: true, feedback: true } },
                  },
                },
              },
            },
          },
        })
      : [],
    hasAcademics && detailed
      ? db.exam.findMany({
          where: { institutionId, courseId: { in: academicCourseIds }, isPublished: true, closesAt: { gt: now }, questions: { some: {} } },
          select: { id: true, title: true, closesAt: true, courseId: true },
          orderBy: { closesAt: "asc" },
          take: 100,
        })
      : [],
    hasSchedule
      ? db.liveClass.findMany({
          where: {
            institutionId,
            courseId: { in: scheduleCourseIds },
            startsAt: { gte: new Date(now.getTime() - DAY_MS), lte: new Date(now.getTime() + UPCOMING_CLASS_DAYS * DAY_MS) },
          },
          // Nunca se selecciona el enlace de entrada.
          select: { id: true, title: true, startsAt: true, durationMinutes: true, courseId: true, course: { select: { name: true } } },
          orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          take: 200,
        })
      : [],
    hasSchedule && detailed
      ? db.scheduleSlot.findMany({
          where: { institutionId, courseId: { in: scheduleCourseIds }, course: { institutionId } },
          select: { id: true, weekday: true, startMinutes: true, endMinutes: true, classroom: true, courseId: true, course: { select: { name: true } } },
          orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }],
        })
      : [],
    scheduleIds.size > 0 && detailed
      ? db.calendarEvent.findMany({
          where: { institutionId, startDate: { gte: new Date(now.getTime() - DAY_MS) } },
          select: { id: true, title: true, startDate: true },
          orderBy: { startDate: "asc" },
          take: 10,
        })
      : [],
  ]);

  const publishedLessons = new Map<string, Set<string>>();
  for (const lesson of lessons) {
    if (!publishedLessons.has(lesson.courseId)) publishedLessons.set(lesson.courseId, new Set());
    publishedLessons.get(lesson.courseId)!.add(lesson.id);
  }
  const doneByEnrollment = new Map<string, string[]>();
  for (const row of progress) doneByEnrollment.set(row.enrollmentId, [...(doneByEnrollment.get(row.enrollmentId) ?? []), row.lessonId]);
  const liveClasses = liveRows
    .filter((row) => row.startsAt.getTime() + row.durationMinutes * 60_000 > now.getTime())
    .map((row) => ({ id: row.id, title: row.title, courseId: row.courseId, courseName: row.course.name, startsAt: row.startsAt, when: formatWhen(row.startsAt, now, timezone), durationMinutes: row.durationMinutes }));

  const byStudent = new Map<string, ChildData>();
  for (const access of accesses) {
    const studentId = access.student.id;
    const own = enrollments.filter((row) => row.studentId === studentId);
    const academic = access.permissions.academics ? own : [];
    const activeCourseIds = new Set(own.filter((row) => row.status === "ACTIVE").map((row) => row.course.id));

    const courses: ChildCourse[] = academic.map((row) => {
      const published = publishedLessons.get(row.course.id) ?? new Set<string>();
      return {
        courseId: row.course.id,
        name: row.course.name,
        teacherName: row.course.teacher.name,
        completed: row.status === "COMPLETED",
        progressPercent: clampPercent(row.progressPercent),
        lessonsDone: (doneByEnrollment.get(row.id) ?? []).filter((lessonId) => published.has(lessonId)).length,
        lessonsTotal: published.size,
        finalGrade: row.status === "COMPLETED" ? row.finalGrade : null,
      };
    });

    const tasks: ChildTask[] = [];
    let overdueCount = 0;
    for (const row of academic) {
      for (const assignment of assignments) {
        if (assignment.courseId !== row.course.id) continue;
        const submission = assignment.submissions.find((item) => item.studentId === studentId);
        // La nota de una tarea solo se muestra si su actividad en el libro de notas está publicada.
        const gradeVisible = submission?.status === "GRADED" && (assignment.gradeItem ? assignment.gradeItem.isPublished : true);
        const overdue = !submission && assignment.dueDate !== null && assignment.dueDate < now;
        if (overdue && row.status === "ACTIVE") overdueCount += 1;
        tasks.push({
          id: assignment.id,
          title: assignment.title,
          courseName: row.course.name,
          dueAt: assignment.dueDate,
          dueText: assignment.dueDate ? deadlineLabel(assignment.dueDate, now, timezone) : null,
          state: gradeVisible ? "graded" : submission ? "submitted" : overdue ? "overdue" : "pending",
          maxScore: assignment.maxScore,
          score: gradeVisible ? (submission?.score ?? null) : null,
          feedback: gradeVisible ? (submission?.feedback ?? null) : null,
        });
      }
    }

    const grades: ChildCourseGrades[] = academic.map((row) => {
      const items: ChildGradeItem[] = [];
      const average: AveragePeriod[] = periods
        .filter((period) => period.courseId === row.course.id)
        .map((period) => ({
          weight: period.weight,
          categories: period.categories.map((category) => ({
            weight: category.weight,
            dropLowest: category.dropLowest,
            scores: category.items.map((item) => {
              const entry = item.entries.find((candidate) => candidate.enrollmentId === row.id);
              const score = entry?.score ?? null;
              const isExcused = entry?.isExcused ?? false;
              items.push({ id: item.id, title: item.title, maxScore: item.maxScore, score, isExcused, feedback: entry?.feedback ?? null });
              return { score, maxScore: item.maxScore, itemWeight: item.weight, excused: isExcused };
            }),
          })),
        }));
      return { courseId: row.course.id, courseName: row.course.name, average: courseAverage(average), items };
    });

    let attendance: ChildAttendance | null = null;
    if (access.permissions.attendance) {
      const rows = attendanceRows.filter((row) => row.enrollment.studentId === studentId);
      const counted = rows.filter((row) => row.status !== "EXCUSED");
      const attended = counted.filter((row) => row.status === "PRESENT" || row.status === "LATE").length;
      attendance = {
        percent: counted.length ? Math.round((attended / counted.length) * 100) : null,
        incidents: rows
          .flatMap((row) => (row.status === "PRESENT" ? [] : [{ id: row.id, date: row.date, status: row.status, courseName: row.course.name }]))
          .slice(0, 30),
      };
    }

    const canSchedule = access.permissions.schedule;
    const deadlines: ChildDeadline[] = [
      ...tasks.flatMap((task) => (task.state === "pending" && task.dueAt && task.dueText ? [{ key: `t-${task.id}`, kind: "Tarea" as const, title: task.title, courseName: task.courseName, dueAt: task.dueAt, dueText: task.dueText }] : [])),
      ...exams.flatMap((exam) => {
        const course = academic.find((row) => row.course.id === exam.courseId && row.status === "ACTIVE");
        return course && exam.closesAt
          ? [{ key: `e-${exam.id}`, kind: "Examen" as const, title: exam.title, courseName: course.course.name, dueAt: exam.closesAt, dueText: deadlineLabel(exam.closesAt, now, timezone, { verbs: CLOSE_VERBS }) }]
          : [];
      }),
    ].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

    const alerts: ChildAlert[] = [];
    if (overdueCount > 0) alerts.push({ kind: "overdue", text: overdueCount === 1 ? "1 tarea vencida sin entregar" : `${overdueCount} tareas vencidas sin entregar` });
    if (attendance && attendance.percent !== null && attendance.percent < ATTENDANCE_ALERT_BELOW) alerts.push({ kind: "attendance", text: `Asistencia baja: ${attendance.percent} %` });

    byStudent.set(studentId, {
      courses,
      tasks,
      grades,
      attendance,
      liveClasses: canSchedule ? liveClasses.filter((item) => activeCourseIds.has(item.courseId)).map((item) => ({ id: item.id, title: item.title, courseName: item.courseName, startsAt: item.startsAt, when: item.when, durationMinutes: item.durationMinutes })) : [],
      deadlines,
      weekly: canSchedule ? slots.filter((slot) => activeCourseIds.has(slot.courseId)).map((slot) => ({ id: slot.id, courseName: slot.course.name, weekday: slot.weekday, startMinutes: slot.startMinutes, endMinutes: slot.endMinutes, classroom: slot.classroom })) : [],
      events: canSchedule ? events : [],
      alerts,
    });
  }
  return { timezone, byStudent };
}

/** Tarjetas de los hijos vinculados a quien consulta. Vacío para cualquiera que no sea su tutor. */
export async function listMyChildren(actor: GuardianActor, now = new Date()): Promise<ChildCard[]> {
  const accesses = await authorizeChildren(actor);
  if (accesses.length === 0) return [];
  const { byStudent } = await collect(actor.institutionId, accesses, now, false);
  return accesses.map((access) => {
    const data = byStudent.get(access.student.id)!;
    const active = data.courses.filter((course) => !course.completed);
    return {
      studentId: access.student.id,
      name: access.student.name,
      permissions: access.permissions,
      activeCourses: access.permissions.academics ? active.length : null,
      averageProgress: active.length ? Math.round(active.reduce((sum, course) => sum + course.progressPercent, 0) / active.length) : null,
      nextClass: data.liveClasses[0] ?? null,
      alerts: data.alerts,
    };
  });
}

/**
 * Resumen de un hijo. Null si quien consulta no es su tutor con vínculo activo. Las secciones
 * que el vínculo no permite llegan vacías (o null) y `permissions` dice cuáles mostrar.
 */
export async function getChildOverview(actor: GuardianActor, studentId: string, now = new Date()): Promise<ChildOverview | null> {
  const [access] = await authorizeChildren(actor, studentId);
  if (!access || access.student.id !== studentId) return null;
  const institutionId = actor.institutionId;

  const [{ timezone, byStudent }, announcements, charges] = await Promise.all([
    collect(institutionId, [access], now, true),
    access.permissions.announcements
      ? getAnnouncementRecipient(actor, [access.student.id]).then((recipient) => findAnnouncements(actor, announcementRecipientWhere(recipient)))
      : [],
    access.permissions.finance
      ? db.paymentConcept.findMany({
          where: { institutionId, studentId: access.student.id, status: { not: "CANCELLED" } },
          select: { id: true, concept: true, dueDate: true },
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
          take: 100,
        })
      : [],
  ]);

  let account: ChildAccount | null = null;
  if (access.permissions.finance) {
    // Lo que se debe sale de los pagos reales (no anulados), no del estado guardado.
    const balances = await chargeBalances(institutionId, charges.map((charge) => charge.id), now);
    const totals = new Map<string, { currency: string; owedCents: number; overdueCents: number }>();
    const items = charges.flatMap((charge) => {
      const balance = balances.get(charge.id);
      if (!balance || balance.balanceCents <= 0 || !OWED_STATUSES.includes(balance.status as (typeof OWED_STATUSES)[number])) return [];
      const amountCents = balance.balanceCents;
      const overdue = balance.shownStatus === "OVERDUE" || (charge.dueDate !== null && charge.dueDate < now);
      const total = totals.get(balance.currency) ?? { currency: balance.currency, owedCents: 0, overdueCents: 0 };
      total.owedCents += amountCents;
      if (overdue) total.overdueCents += amountCents;
      totals.set(balance.currency, total);
      return [{ id: charge.id, concept: charge.concept, amountCents, currency: balance.currency, dueDate: charge.dueDate, status: balance.status, overdue }];
    });
    account = { totals: [...totals.values()], charges: items };
  }

  const data = byStudent.get(access.student.id)!;
  return { child: access.student, relationship: access.relationship, timezone, permissions: access.permissions, ...data, announcements, account };
}
